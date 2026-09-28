/**
 * The Remarks column and the input line. docs/visual.md section 10 and
 * docs/voice.md section 10. The narrator's text arrives as if typed, at the
 * frame's narrator rate, buffered: a fast stream still types at that rate, a
 * slow one waits with the caret. A click in the column completes the current
 * message. A silent answer types one em dash on its own line.
 *
 * The panel subscribes to the bus and applies src/narrator/policy.ts. The app
 * shell supplies context through options.getContext.
 */
import type { EventBus } from '../contracts/events'
import type { NarratorEventKind, NarratorRequest, NarratorStreamEvent } from '../contracts/narrator'
import type { NarratorPanel, NarratorPanelOptions } from '../contracts/narrator-panel'
import { NARRATOR_MS_PER_CHAR, createCaret, createRule, pauseAfter, typewrite } from '../frame'
import { getSessionId, resetNarratorSession, streamNarrator } from './client'
import { createPolicy, type Policy } from './policy'

/** The column head, as the page has it. */
export const REMARKS_HEAD = 'REMARKS'
/** The line beneath the head, from the bible: "of any length, provided it is true". */
export const REMARKS_SUB = 'Of any length, provided it is true.'

/** Injection points for tests. Not part of the contract. */
export interface PanelInternals {
  stream?: (request: NarratorRequest, signal: AbortSignal) => AsyncIterable<NarratorStreamEvent>
  reset?: (sessionId: string) => Promise<boolean>
  sessionId?: string
  policy?: Policy
}

type Speaker = 'narrator' | 'visitor'

/**
 * Types one message into one line, from a buffer that a stream fills. Keeps
 * a caret while waiting for more. `complete` prints what is buffered at once
 * and everything that follows.
 */
class Typist {
  readonly done: Promise<void>
  private resolveDone: () => void = () => undefined
  private buffer = ''
  private ended = false
  private running = false
  private instant = false
  private controller: AbortController | null = null
  private wake: (() => void) | null = null
  private waitingCaret: HTMLElement | null = null
  private typed = ''

  constructor(
    private readonly el: HTMLElement,
    private readonly onProgress: () => void,
  ) {
    this.done = new Promise<void>((resolve) => {
      this.resolveDone = resolve
    })
    this.showWaitingCaret()
    void this.run()
  }

  get text(): string {
    return this.typed
  }

  get hasText(): boolean {
    return this.typed.length > 0 || this.buffer.length > 0
  }

  push(text: string): void {
    if (this.ended || !text) return
    this.buffer += text
    this.wake?.()
  }

  end(): void {
    this.ended = true
    this.wake?.()
  }

  /** Print the rest at once. */
  complete(): void {
    this.instant = true
    this.controller?.abort()
    this.wake?.()
  }

  private showWaitingCaret(): void {
    if (this.waitingCaret) return
    this.waitingCaret = createCaret(this.el.ownerDocument)
    this.el.appendChild(this.waitingCaret)
  }

  private hideWaitingCaret(): void {
    this.waitingCaret?.remove()
    this.waitingCaret = null
  }

  private pause(ms: number): Promise<void> {
    if (ms <= 0 || this.instant) return Promise.resolve()
    return new Promise((resolve) => {
      const t = setTimeout(() => {
        this.wake = null
        resolve()
      }, ms)
      this.wake = () => {
        clearTimeout(t)
        this.wake = null
        resolve()
      }
    })
  }

  private async run(): Promise<void> {
    if (this.running) return
    this.running = true
    for (;;) {
      if (this.buffer.length === 0) {
        if (this.ended) break
        this.showWaitingCaret()
        await new Promise<void>((resolve) => {
          this.wake = () => {
            this.wake = null
            resolve()
          }
        })
        continue
      }
      this.hideWaitingCaret()
      const chunk = this.buffer
      this.buffer = ''
      const controller = new AbortController()
      this.controller = controller
      if (this.instant) controller.abort()
      await typewrite(this.el, chunk, { msPerChar: NARRATOR_MS_PER_CHAR, faintE: true, append: true, signal: controller.signal })
      this.typed += chunk
      this.controller = null
      this.onProgress()
      // typewrite ends on the last character; a chunk ending on a stop or
      // comma still owes its pause before the next chunk arrives.
      await this.pause(pauseAfter(chunk[chunk.length - 1] ?? ''))
    }
    this.hideWaitingCaret()
    this.running = false
    this.resolveDone()
  }
}

export function createNarratorPanel(container: HTMLElement, options: NarratorPanelOptions, bus: EventBus, internals: PanelInternals = {}): NarratorPanel {
  const doc = container.ownerDocument
  const stream = internals.stream ?? ((request: NarratorRequest, signal: AbortSignal) => streamNarrator(request, { signal }))
  const resetRemote = internals.reset ?? ((sessionId: string) => resetNarratorSession(sessionId))
  const sessionId = internals.sessionId ?? getSessionId()
  const policy = internals.policy ?? createPolicy()

  // ---- DOM --------------------------------------------------------------

  const root = doc.createElement('section')
  root.className = 'narrator'
  root.setAttribute('data-narrator', '')
  root.setAttribute('aria-label', `${capitalize(REMARKS_HEAD)}. ${options.name}.`)

  const head = doc.createElement('header')
  head.className = 'narrator-head'
  const h = doc.createElement('h2')
  h.className = 't-page-head'
  h.setAttribute('data-narrator-head', '')
  h.textContent = REMARKS_HEAD
  const sub = doc.createElement('p')
  sub.className = 't-remarks-sub'
  sub.setAttribute('data-narrator-sub', '')
  sub.textContent = REMARKS_SUB
  head.append(h, sub, createRule())

  const column = doc.createElement('div')
  column.className = 'narrator-column'
  column.setAttribute('data-narrator-column', '')
  column.setAttribute('role', 'log')
  column.setAttribute('aria-live', 'polite')
  column.setAttribute('aria-label', `${capitalize(REMARKS_HEAD)}. ${options.name}.`)

  const inputLine = doc.createElement('form')
  inputLine.className = 'narrator-input-line'
  inputLine.setAttribute('data-narrator-input-line', '')
  inputLine.setAttribute('aria-label', options.visitorLabel)
  const label = doc.createElement('label')
  label.className = 'narrator-input-label t-visitor'
  label.setAttribute('data-narrator-input-label', '')
  label.textContent = options.visitorLabel
  const fieldWrap = doc.createElement('div')
  fieldWrap.className = 'narrator-field-wrap'
  fieldWrap.setAttribute('data-narrator-field', '')
  const mirror = doc.createElement('div')
  mirror.className = 'narrator-mirror t-narrator'
  mirror.setAttribute('aria-hidden', 'true')
  const mirrorText = doc.createTextNode('')
  const blockCaret = doc.createElement('span')
  blockCaret.className = 'narrator-block-caret'
  blockCaret.setAttribute('data-narrator-caret', '')
  mirror.append(mirrorText, blockCaret)
  const placeholder = doc.createElement('span')
  placeholder.className = 'narrator-placeholder t-narrator placeholder-tint'
  placeholder.setAttribute('data-narrator-placeholder', '')
  placeholder.setAttribute('aria-hidden', 'true')
  placeholder.textContent = options.placeholder
  const input = doc.createElement('textarea')
  input.className = 'narrator-input t-narrator'
  input.setAttribute('data-narrator-input', '')
  input.rows = 1
  input.setAttribute('aria-label', `${options.visitorLabel} ${options.placeholder}`)
  input.setAttribute('autocomplete', 'off')
  input.setAttribute('autocapitalize', 'off')
  input.setAttribute('spellcheck', 'false')
  input.setAttribute('enterkeyhint', 'send')
  const inputId = `narrator-input-${Math.random().toString(36).slice(2, 8)}`
  input.id = inputId
  label.setAttribute('for', inputId)
  fieldWrap.append(mirror, placeholder, input)
  inputLine.append(label, fieldWrap)

  root.append(head, column, inputLine, createRule())
  container.appendChild(root)

  // ---- scrolling: newest at the bottom unless the reader has wheeled back ----

  let pinned = true
  const scrollToEnd = (): void => {
    if (pinned) column.scrollTop = column.scrollHeight
  }
  column.addEventListener('wheel', (e) => {
    if (e.deltaY < 0) pinned = false
  })
  column.addEventListener('scroll', () => {
    if (column.scrollTop + column.clientHeight >= column.scrollHeight - 2) pinned = true
  })

  // ---- lines -------------------------------------------------------------

  function addLine(speaker: Speaker): HTMLElement {
    const p = doc.createElement('p')
    p.className = 'narrator-line'
    if (speaker === 'narrator') p.classList.add('t-narrator')
    p.setAttribute('data-narrator-line', '')
    p.setAttribute('data-narrator-speaker', speaker)
    column.appendChild(p)
    pinned = true
    scrollToEnd()
    return p
  }

  function addVisitorLine(text: string): void {
    const p = addLine('visitor')
    const who = doc.createElement('span')
    who.className = 't-visitor'
    who.setAttribute('data-narrator-visitor-label', '')
    who.textContent = options.visitorLabel
    const words = doc.createElement('span')
    words.className = 't-player'
    words.setAttribute('data-narrator-visitor-text', '')
    words.textContent = text
    p.append(who, doc.createTextNode(' '), words)
    scrollToEnd()
  }

  // ---- the request queue: one stream at a time, in order ----------------

  let current: Typist | null = null
  let currentAbort: AbortController | null = null
  let queue: Promise<void> = Promise.resolve()
  let destroyed = false

  column.addEventListener('click', () => {
    current?.complete()
  })

  function enqueue(request: NarratorRequest): Promise<void> {
    const run = queue.then(() => (destroyed ? undefined : perform(request)))
    queue = run.catch(() => undefined)
    return run
  }

  async function perform(request: NarratorRequest): Promise<void> {
    bus.emit({ type: 'narrator:status', status: 'thinking' })
    const line = addLine('narrator')
    const typist = new Typist(line, scrollToEnd)
    current = typist
    const abort = new AbortController()
    currentAbort = abort

    let silent = false
    let failed: string | null = null
    let finalText: string | null = null
    let spoke = false
    try {
      for await (const ev of stream(request, abort.signal)) {
        if (abort.signal.aborted) break
        if (ev.type === 'delta') {
          if (!spoke) {
            spoke = true
            bus.emit({ type: 'narrator:status', status: 'speaking' })
          }
          typist.push(ev.text)
        } else if (ev.type === 'done') {
          silent = ev.silent
          finalText = ev.text
          break
        } else {
          failed = ev.message
          break
        }
      }
    } catch (err) {
      failed = err instanceof Error ? err.message : 'stream failed'
    }

    if (abort.signal.aborted) {
      typist.complete()
      typist.end()
      await typist.done
      return
    }

    if (failed !== null) {
      // docs/voice.md gives no line for a failure, so the column shows the dash.
      if (!typist.hasText) {
        line.setAttribute('data-narrator-silent', '')
        typist.push(options.silenceMark)
      }
      bus.emit({ type: 'narrator:status', status: 'error', detail: failed })
    } else if (silent || (!typist.hasText && (finalText ?? '') === '')) {
      silent = true
      line.setAttribute('data-narrator-silent', '')
      typist.push(options.silenceMark)
      bus.emit({ type: 'narrator:status', status: 'silent' })
    }
    typist.end()
    await typist.done
    if (current === typist) {
      current = null
      currentAbort = null
    }
    const said = silent ? options.silenceMark : (finalText ?? typist.text)
    const inReplyTo = request.kind === 'ask' ? request.text : request.event
    bus.emit({ type: 'narrator:said', text: said, ...(inReplyTo ? { inReplyTo } : {}) })
    bus.emit({ type: 'narrator:status', status: 'idle' })
  }

  function makeRequest(base: { kind: 'ask'; text: string } | { kind: 'event'; event: NarratorEventKind }): NarratorRequest {
    const context = options.getContext()
    return base.kind === 'ask' ? { sessionId, kind: 'ask', text: base.text, context } : { sessionId, kind: 'event', event: base.event, context }
  }

  function ask(text: string): Promise<void> {
    if (destroyed || !text.trim()) return Promise.resolve()
    addVisitorLine(text)
    bus.emit({ type: 'player:asked', text })
    return enqueue(makeRequest({ kind: 'ask', text }))
  }

  function send(event: NarratorEventKind): Promise<void> {
    if (destroyed) return Promise.resolve()
    return enqueue(makeRequest({ kind: 'event', event }))
  }

  function notify(event: NarratorEventKind): Promise<void> {
    if (!policy.allowsKind(event)) return Promise.resolve()
    return send(event)
  }

  // ---- input -------------------------------------------------------------

  function syncField(): void {
    const value = input.value
    if (value) fieldWrap.setAttribute('data-filled', '')
    else fieldWrap.removeAttribute('data-filled')
    const end = input.selectionEnd ?? value.length
    let before = value.slice(0, end)
    if (before.endsWith('\n')) before += '​'
    mirrorText.data = before
    input.style.height = 'auto'
    const h = input.scrollHeight
    if (h > 0) input.style.height = `${h}px`
  }
  for (const type of ['input', 'keyup', 'click', 'select']) input.addEventListener(type, syncField)
  input.addEventListener('focus', () => {
    fieldWrap.setAttribute('data-focused', '')
    syncField()
  })
  input.addEventListener('blur', () => {
    fieldWrap.removeAttribute('data-focused')
    syncField()
  })
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return
    e.preventDefault()
    submit()
  })
  inputLine.addEventListener('submit', (e) => {
    e.preventDefault()
    submit()
  })
  function submit(): void {
    const text = input.value
    if (!text.trim()) return
    input.value = ''
    syncField()
    void ask(text)
  }
  syncField()

  // ---- the bus -----------------------------------------------------------

  const unsubscribes: (() => void)[] = []
  let dwellTimer: ReturnType<typeof setTimeout> | null = null
  let dwellObject: string | null = null
  let launched = false

  function clearDwell(): void {
    if (dwellTimer !== null) clearTimeout(dwellTimer)
    dwellTimer = null
    dwellObject = null
  }

  unsubscribes.push(
    bus.on('room:enter', () => {
      if (launched || !policy.allowsKind('first-launch')) return
      launched = true
      void send('first-launch')
    }),
    bus.on('object:inspect', (e) => {
      if (e.objectId === dwellObject) return
      clearDwell()
      const decision = policy.decide(e)
      if (!decision || !e.objectId) return
      dwellObject = e.objectId
      dwellTimer = setTimeout(() => {
        dwellTimer = null
        dwellObject = null
        decision.commit?.()
        void send(decision.kind)
      }, decision.delayMs ?? 0)
    }),
    bus.onAny((e) => {
      if (e.type === 'object:inspect' || e.type === 'room:enter') return
      const decision = policy.decide(e)
      if (!decision) return
      decision.commit?.()
      void send(decision.kind)
    }),
  )

  // ---- the contract ------------------------------------------------------

  return {
    el: root,
    ask,
    notify,
    async reset() {
      clearDwell()
      currentAbort?.abort()
      current?.complete()
      await queue
      column.replaceChildren()
      policy.reset()
      await resetRemote(sessionId)
    },
    destroy() {
      destroyed = true
      clearDwell()
      for (const off of unsubscribes) off()
      currentAbort?.abort()
      current?.complete()
      root.remove()
    },
  }
}

function capitalize(word: string): string {
  const lower = word.toLowerCase()
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}
