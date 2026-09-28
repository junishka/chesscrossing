// The Second's card (docs/BIBLE.md §5.11): a typed card at lower left, the letterhead giving name and rank,
// the transcript typed at 40 characters per second with the Olivetti's key per character and the margin
// bell at line ends, whatever the pace of the deltas behind it. The other residents use the same card.
// The offline states are the error cards of §4, selected by the sidecar's health reason, `slow` after
// 12 s without a first delta, `empty` after one silent retry. History is kept in store.conversation(id).
import type { CardDef, CharacterDef, ChatMessage } from '../types'
import { bus } from '../core/bus'
import { clock } from '../core/clock'
import { store } from '../core/store'
import { converse, health } from '../api/second'
import { copy, errorCard, errorKeyForReason, fmt, transcriptName, TYPED_WIDTH, type ErrorCardKey } from '../content/copy'
import { h } from './overlay'
import { typed } from './titleCards'

export type ContextProvider = () => Promise<string | undefined>

const CHARS_PER_SECOND = 40
const HEALTH_TTL_MS = 30_000
const SLOW_MS = 12_000

/** Reveals queued text at the Olivetti's pace: a key per character, the margin bell at each line's end. */
class Typewriter {
  private tail: Text
  private word: HTMLElement | null = null
  private pending = ''
  private budget = 0
  private column = 0
  private stop: (() => void) | null = null
  private onDone: (() => void) | null = null
  private done = false
  private shownText = ''

  /** Text grows before `before` (the caret), so nothing is reshuffled per frame. */
  constructor(private target: HTMLElement, private before: Node, private onReveal: () => void) {
    this.tail = document.createTextNode('')
    target.insertBefore(this.tail, before)
  }

  /** Everything shown so far. */
  get shown(): string { return this.shownText }

  push(text: string): void {
    if (!text || this.done) return
    this.pending += text
    if (!this.stop) this.stop = clock.onTick((dt) => this.tick(dt))
  }

  /** Resolves once everything queued has been shown. */
  finish(): Promise<void> {
    if (!this.pending) { this.end(); return Promise.resolve() }
    return new Promise((r) => { this.onDone = r })
  }

  /** Shows whatever is pending at once and accepts nothing further. */
  flush(): void {
    this.done = true
    this.reveal(this.pending.length, false)
    this.end()
  }

  private tick(dt: number): void {
    if (!this.pending) { this.end(); return }
    this.budget += dt * CHARS_PER_SECOND
    const n = Math.min(this.pending.length, Math.floor(this.budget))
    if (n <= 0) return
    this.budget -= n
    this.reveal(n, true)
    this.onReveal()
    if (!this.pending) this.end()
  }

  /** Moves `n` characters from the queue to the page, bending each `e` as it lands; a word is kept whole across a line. */
  private reveal(n: number, sound: boolean): void {
    const chunk = this.pending.slice(0, n)
    this.pending = this.pending.slice(n)
    this.shownText += chunk
    for (const ch of chunk) {
      const space = /\s/.test(ch)
      if (space && this.word) { this.word = null; this.tail = document.createTextNode(''); this.target.insertBefore(this.tail, this.before) }
      if (!space && !this.word) {
        this.word = document.createElement('span')
        this.word.className = 'cc-word'
        this.target.insertBefore(this.word, this.before)
        this.tail = document.createTextNode('')
        this.word.appendChild(this.tail)
      }
      if (ch === 'e' && this.word) {
        const e = document.createElement('span')
        e.className = 'cc-e'
        e.textContent = 'e'
        this.word.appendChild(e)
        this.tail = document.createTextNode('')
        this.word.appendChild(this.tail)
      } else {
        this.tail.data += ch
      }
      if (ch === '\n') { this.column = 0; if (sound) bus.emit('audio:sfx', { name: 'marginbell', velocity: 0.5 }) }
      else {
        this.column++
        if (sound) bus.emit('audio:sfx', { name: 'key', velocity: 0.35 })
        if (this.column >= TYPED_WIDTH) { this.column = 0; if (sound) bus.emit('audio:sfx', { name: 'marginbell', velocity: 0.5 }) }
      }
    }
  }

  private end(): void {
    this.stop?.()
    this.stop = null
    const done = this.onDone
    this.onDone = null
    done?.()
  }
}

/** The conversation layer. */
export class ConverseLayer {
  readonly el: HTMLElement
  private name: HTMLElement
  private role: HTMLElement
  private body: HTMLElement
  private input: HTMLInputElement
  private closeButton: HTMLElement
  private persona: CharacterDef | null = null
  private context: ContextProvider = async () => undefined
  private abort: AbortController | null = null
  private cache: { at: number; cli: boolean; reason?: string } | null = null
  private onCloseRequest: () => void
  private showCard: (card: CardDef) => void

  constructor(parent: HTMLElement, onCloseRequest: () => void, showCard: (card: CardDef) => void) {
    this.onCloseRequest = onCloseRequest
    this.showCard = showCard
    this.el = h('aside', 'cc-converse cc-interactive')
    const head = h('div', 'cc-converse-head')
    this.name = h('div', 'cc-converse-name')
    this.role = h('div', 'cc-converse-role cc-caps-light')
    head.append(this.name, this.role, h('hr', 'cc-rule'), h('hr', 'cc-rule'))
    this.body = h('div', 'cc-converse-body cc-mono')
    const foot = h('div', 'cc-converse-foot')
    this.input = document.createElement('input')
    this.input.className = 'cc-converse-input'
    this.input.type = 'text'
    this.input.maxLength = 600
    this.input.autocomplete = 'off'
    this.input.spellcheck = false
    const actions = h('div', 'cc-converse-actions cc-caps-light')
    this.closeButton = h('button', '', copy.converse.close)
    this.closeButton.setAttribute('type', 'button')
    this.closeButton.addEventListener('click', () => this.onCloseRequest())
    actions.append(this.closeButton)
    foot.append(this.input, actions)
    this.el.append(head, this.body, foot)
    parent.appendChild(this.el)
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); void this.send() }
      if (e.key === 'Escape') { e.preventDefault(); this.onCloseRequest() }
      e.stopPropagation()
    })
  }

  get isOpen(): boolean { return this.el.classList.contains('is-open') }

  /** Opens the card for a resident, restoring the history from the Ledger. `fromBoard` labels the way back. */
  open(persona: CharacterDef, contextProvider: ContextProvider, fromBoard = false): void {
    this.persona = persona
    this.context = contextProvider
    this.name.textContent = persona.name.toUpperCase()
    this.role.textContent = persona.role.toUpperCase()
    this.closeButton.textContent = fromBoard ? copy.converse.returnToBoard : copy.converse.close
    this.input.placeholder = fmt(copy.converse.placeholder, { name: persona.name })
    this.input.disabled = false
    const history = store.conversation(persona.id)
    if (!history.length) { history.push({ role: 'assistant', content: persona.greeting }); store.save() }
    this.body.replaceChildren(...history.map((m) => this.message(m)))
    this.el.classList.add('is-open')
    bus.emit('audio:sfx', { name: 'paper', velocity: 0.5 })
    this.scroll()
    window.setTimeout(() => { if (this.isOpen && !this.input.disabled) this.input.focus() }, 300)
    void this.checkLine()
  }

  close(): void {
    this.abort?.abort()
    this.abort = null
    this.el.classList.remove('is-open')
    this.input.blur()
  }

  private message(m: ChatMessage): HTMLElement {
    const el = h('div', `cc-msg cc-msg-${m.role}`)
    const who = m.role === 'user' ? copy.converse.you : transcriptName(this.persona?.name ?? '')
    const text = h('div', 'cc-msg-text')
    text.appendChild(typed(m.content))
    el.append(h('div', 'cc-msg-who cc-caps-light', who), text)
    return el
  }

  /** One of the seven typed cards of §4, full frame; the game continues behind it. */
  private errorCard(key: ErrorCardKey): void {
    const card = errorCard(key)
    this.showCard({ kind: 'typed', title: card.title, body: card.lines.join('\n') })
  }

  private scroll(): void {
    this.body.scrollTop = this.body.scrollHeight
  }

  /** Probes the server once per TTL; when the Second cannot be consulted, the matching card says so. */
  private async checkLine(): Promise<boolean> {
    const now = Date.now()
    if (this.cache && now - this.cache.at < HEALTH_TTL_MS && this.cache.cli) return true
    let cli = false
    let reason: string | undefined
    try { const hlt = await health(); cli = hlt.cli; reason = hlt.reason } catch (err) { cli = false; reason = err instanceof Error ? err.message : String(err) }
    this.cache = { at: now, cli, reason }
    if (!cli && this.persona) this.errorCard(errorKeyForReason(reason))
    return cli
  }

  private async send(): Promise<void> {
    const persona = this.persona
    const text = this.input.value.trim()
    if (!persona || !text || this.abort) return
    // Busy from here: a second Enter during the health probe or the context call must not start a second turn.
    const ctl = new AbortController()
    this.abort = ctl
    this.input.disabled = true
    try {
      if (!(await this.checkLine()) || ctl.signal.aborted) return
      this.input.value = ''
      const history = store.conversation(persona.id)
      history.push({ role: 'user', content: text })
      store.save()
      this.body.appendChild(this.message({ role: 'user', content: text }))
      bus.emit('audio:sfx', { name: 'carriage', velocity: 0.4 })

      const reply = this.message({ role: 'assistant', content: '' })
      const textEl = reply.querySelector<HTMLElement>('.cc-msg-text')!
      const caret = h('span', 'cc-caret')
      textEl.appendChild(caret)
      const typer = new Typewriter(textEl, caret, () => this.scroll())
      let started = false
      let slowTimer: number | null = window.setTimeout(() => { slowTimer = null; if (!started && !ctl.signal.aborted) this.errorCard('slow') }, SLOW_MS)
      const onDelta = (delta: string) => {
        if (!started) { started = true; this.body.appendChild(reply); this.scroll() }
        typer.push(delta)
      }

      // closing the card stops the typing at once
      ctl.signal.addEventListener('abort', () => typer.flush(), { once: true })
      try {
        const context = await this.context()
        if (ctl.signal.aborted) throw new DOMException('closed', 'AbortError')
        const req = { personaId: persona.id, messages: history.slice(-24), context, model: store.settings.model }
        let res = await converse(req, onDelta, ctl.signal)
        if (!res.text) {
          // a `done` with zero characters: asked again, silently, once
          res = await converse(req, onDelta, ctl.signal)
          if (!res.text && !ctl.signal.aborted) this.errorCard('empty')
        }
        if (!started && res.text) { started = true; this.body.appendChild(reply); typer.push(res.text) }
        await typer.finish()
        if (ctl.signal.aborted) return
        if (res.text) { history.push({ role: 'assistant', content: res.text }); store.save() }
      } catch (err) {
        typer.flush()
        if (ctl.signal.aborted) return
        // keep the transcript coherent: a partial reply is kept as said; a lost one lets the visitor repeat
        if (typer.shown) history.push({ role: 'assistant', content: typer.shown })
        else if (history[history.length - 1]?.content === text) history.pop()
        store.save()
        this.cache = null
        this.errorCard(errorKeyForReason(err instanceof Error ? err.message : String(err)))
      } finally {
        if (slowTimer !== null) window.clearTimeout(slowTimer)
        caret.remove()
        if (!started) reply.remove()
      }
    } finally {
      if (this.abort === ctl) this.abort = null
      this.input.disabled = false
      if (this.isOpen && !ctl.signal.aborted) this.input.focus()
      this.scroll()
    }
  }
}
