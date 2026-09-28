/**
 * The mock backend. No network. Its lines are read from docs/voice.md at
 * startup: the forty tagged lines of section 6, keyed by trigger and cycled,
 * and the example answers of sections 3, 4 and 5 for a question. Nothing is
 * invented here; the file is canon for what the narrator may say.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT } from '../../config'
import type { NarratorHealth } from '../../../src/contracts/narrator'
import { SILENCE_TOKEN } from '../../../src/contracts/narrator'
import { STATE_HEADING } from '../prompt'
import type { Backend, BackendInput } from './types'

export const VOICE_FILE = join(ROOT, 'docs', 'voice.md')

export interface VoiceLine {
  tag: string
  text: string
}

export interface VoiceBank {
  /** Section 6, forty lines, tagged. */
  lines: VoiceLine[]
  /** Section 3, the good chess examples. */
  chess: string[]
  /** Section 4, world-talk examples, with the question they answer. */
  world: { question: string; answer: string }[]
  /** Section 5, philosophy, with the question they answer. */
  philosophy: { question: string; answer: string }[]
}

function section(text: string, heading: string): string {
  const start = text.indexOf(`\n## ${heading}`)
  if (start < 0) return ''
  const rest = text.slice(start + 1)
  const end = rest.indexOf('\n## ', 1)
  return end < 0 ? rest : rest.slice(0, end)
}

/** Parses docs/voice.md into the bank. Exported for tests. */
export function parseVoice(text: string): VoiceBank {
  const lines: VoiceLine[] = []
  const tagged = /^\d+\. `\[(.+?)\]` "(.+)"\s*$/gm
  for (const m of section(text, '6. Forty lines').matchAll(tagged)) {
    lines.push({ tag: m[1] as string, text: m[2] as string })
  }

  const chess: string[] = []
  const chessSection = section(text, '3. Chess talk')
  const good = chessSection.indexOf('**Good.**')
  const bad = chessSection.indexOf('**Bad.**')
  const goodBlock = good >= 0 ? chessSection.slice(good, bad > good ? bad : undefined) : ''
  for (const m of goodBlock.matchAll(/^\d+\. "(.+)"\s*$/gm)) chess.push(m[1] as string)

  const qa = /^\d+\. \*(.+?)\* "(.+)"\s*$/gm
  const world = [...section(text, '4. World talk').matchAll(qa)].map((m) => ({ question: m[1] as string, answer: m[2] as string }))
  const philosophy = [...section(text, '5. Philosophy').matchAll(qa)].map((m) => ({ question: m[1] as string, answer: m[2] as string }))

  return { lines, chess, world, philosophy }
}

let cachedBank: VoiceBank | null = null

export function loadVoiceBank(file: string = VOICE_FILE): VoiceBank {
  if (cachedBank && file === VOICE_FILE) return cachedBank
  const bank = parseVoice(readFileSync(file, 'utf8'))
  if (file === VOICE_FILE) cachedBank = bank
  return bank
}

/** The Event line of the state block in the last user turn, and the words before the block. */
export function readTurn(content: string): { event: string; words: string } {
  const at = content.indexOf(STATE_HEADING)
  const words = (at >= 0 ? content.slice(0, at) : content).trim()
  const block = at >= 0 ? content.slice(at) : ''
  const m = /^Event: (.*)$/m.exec(block)
  return { event: m ? (m[1] as string).trim() : 'none', words }
}

/** Tags in the bank that answer an Event value. Order matters for cycling. */
export function tagsForEvent(event: string, isFirstTurn: boolean): string[] {
  if (event.startsWith('hover ')) {
    const item = event.slice(6)
    const number = /\b(\d-\d\d[a-z]?)\b/.exec(item)?.[1]
    const word = item.toLowerCase()
    return [`hover:${number ?? ''}:${word}`]
  }
  switch (event) {
    case 'none':
      return isFirstTurn ? ['session start, evening', 'session start, morning'] : []
    case 'game start':
      return ['game start', 'game start, hour 18.00', 'game start, hour After']
    case 'capture':
      return ['player captures', 'Halm captures']
    case 'check':
      return ['check against player', 'check by player']
    case 'checkmate':
      return ['mate for player', 'mate against player']
    case 'stalemate':
      return ['stalemate']
    case 'draw':
      return ['draw by repetition']
    case 'promotion':
      return ['promotion']
    case 'resignation':
      return ['player resigns']
    case 'leave':
      return ['player leaves mid-game']
    case 'return':
      return ['player returns mid-game']
    default:
      return []
  }
}

function findHoverLine(bank: VoiceBank, key: string): string | null {
  const [, number, word] = key.split(':')
  const hovers = bank.lines.filter((l) => l.tag.startsWith('hover '))
  if (number) {
    const byNumber = hovers.find((l) => l.tag.includes(number))
    if (byNumber) return byNumber.text
  }
  if (word) {
    const byWord = hovers.find((l) => word.split(/\W+/).some((w) => w.length > 3 && l.tag.toLowerCase().includes(w)))
    if (byWord) return byWord.text
  }
  return null
}

/** Picks a line for a question by its subject. Exported for tests. */
export function answerFor(bank: VoiceBank, words: string, cycle: (key: string, n: number) => number): string {
  const q = words.toLowerCase()
  const tagged = (tag: string): string | null => bank.lines.find((l) => l.tag === tag)?.text ?? null
  const has = (...res: RegExp[]): boolean => res.some((r) => r.test(q))

  if (has(/\b(ai|a\.i\.|language model|computer|program|software|robot|bot)\b/)) return tagged('asked if he is an AI') ?? SILENCE_TOKEN
  if (has(/who are you|your name|who is speaking|what are you/)) return tagged('asked who he is') ?? SILENCE_TOKEN
  if (has(/\bhint\b|what should i|should i play|what would you play|best move|advise|advice/)) return tagged('asked for a hint during play') ?? SILENCE_TOKEN
  if (has(/what did you see|what you saw|did you notice|what did you notice/)) return tagged('asked after game what he saw') ?? SILENCE_TOKEN
  if (has(/^(thanks|thank you)\b|\bthank you\b|good night|goodnight/)) return tagged('player says thank you, end of session') ?? SILENCE_TOKEN
  if (has(/\bok\b|^hm+$|one moment|^yes\.?$|^no\.?$/) && q.length < 12) return SILENCE_TOKEN

  const world = (i: number): string => bank.world[i]?.answer ?? SILENCE_TOKEN
  const phil = (i: number): string => bank.philosophy[i]?.answer ?? SILENCE_TOKEN
  if (has(/vacat|keeper.*(leave|left|go|went|happen)|happened to the keeper/)) return world(0)
  if (has(/drawer 4|drawer four|fourth drawer|correspondence/)) return world(1)
  if (has(/teodor/)) return world(2)
  if (has(/pantry|hands?\b.*book|book.*hands?\b/)) return world(3)
  if (has(/rent|why (do you|did you) (live|stay)|why are you here/)) return world(4)
  if (has(/across the river|far bank|other side|helder|beyond/)) return world(5)
  if (has(/why play|play at all|the point of|point in playing/)) return phil(0)
  if (has(/when we die|after we die|happens when we|afterwards|what happens to us/)) return phil(1)
  if (has(/mean anything|meaning|mean\b/)) return phil(2)
  if (has(/alone|by yourself|company|two of you/)) return phil(3)

  if (has(/bishop|knight|rook|queen|king|pawn|castl|check|mate|move|opening|position|square|\b[a-h][1-8]\b|stone \d|the lamp|ferry|tower|seal\b|inkstand/)) {
    const i = cycle('chess', bank.chess.length)
    return bank.chess[i] ?? SILENCE_TOKEN
  }
  if (has(/who|what|where|when|why|how|which|\?/)) {
    const i = cycle('world', bank.world.length)
    return world(i)
  }
  return SILENCE_TOKEN
}

export interface MockBackendOptions {
  model?: string
  file?: string
}

export function createMockBackend(options: MockBackendOptions = {}): Backend {
  const model = options.model ?? 'mock'
  const bank = loadVoiceBank(options.file)
  const counters = new Map<string, number>()
  const cycle = (key: string, n: number): number => {
    if (n <= 0) return 0
    const c = counters.get(key) ?? 0
    counters.set(key, c + 1)
    return c % n
  }

  function lineFor(input: BackendInput): string {
    const last = input.messages[input.messages.length - 1]
    if (!last || last.role !== 'user') return SILENCE_TOKEN
    const { event, words } = readTurn(last.content)
    if (event === 'question' || (words && !/^Visitor \(1\), admitted/.test(words))) {
      return answerFor(bank, words, cycle)
    }
    const isFirstTurn = input.messages.length === 1
    const tags = tagsForEvent(event, isFirstTurn)
    if (tags.length === 0) return SILENCE_TOKEN
    const first = tags[0] as string
    if (first.startsWith('hover:')) return findHoverLine(bank, first) ?? SILENCE_TOKEN
    const tag = tags[cycle(event, tags.length)] as string
    return bank.lines.find((l) => l.tag === tag)?.text ?? SILENCE_TOKEN
  }

  return {
    name: 'mock',
    async health(): Promise<NarratorHealth> {
      return { ok: bank.lines.length > 0, backend: 'mock', model, detail: `${bank.lines.length} lines from docs/voice.md` }
    },
    async *stream(input: BackendInput): AsyncIterable<string> {
      const line = lineFor(input)
      // Delivered in a few pieces so the route's buffering is exercised as with a real stream.
      const words = line.split(/(?<= )/)
      for (const w of words) {
        if (input.signal.aborted) return
        yield w
      }
    },
  }
}
