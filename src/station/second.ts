// The Second: Miss Constance Brace, Navigator. The packet, the trigger policy, the modes.
// docs/BIBLE.md §5.11 (the packet, the trigger policy, the modes) and §5.3 (the book, the station rating).
// No three, no DOM: the world is reached through the callbacks passed in and the store.
import type { ChatMessage, Color, GameEndReason, GameResult, MoveInput, MoveRecord, PieceType, PositionBrief, SecondMode, Square } from '../types'
import { store } from '../core/store'
import type { converse as converseFn } from '../api/second'
import type { Game } from '../chess/game'
import type { EngineSearchOptions } from '../chess/engine'
import { brief as buildBrief } from '../chess/analysis'
import { Position } from '../chess/rules'
import { findBook } from '../content/openings'
import { SOUNDINGS_MS } from '../content/seaStates'
import { ledgerDate } from '../content/station'
import { isletName } from '../content/survey'
import { watchLabel } from '../content/watches'
import type { SeasonClock } from './season'

/** The Second's persona id, as the server knows it. */
export const PERSONA_ID = 'brace'
/** The soundings search behind the packet: level 5 for 600 ms (§5.3). */
export const SOUNDINGS_LEVEL = 5
/** The packet asks the soundings worker for this many root lines: Best, Second, Third. */
export const PACKET_LINES = 3
/** Plies of the best line the packet quotes. */
export const PACKET_PV_PLIES = 4
/** An unprompted remark follows the player's move when the sounding swings by more than this (centipawns, 1.5 pawns). */
export const SWING_CP = 150
/** Unprompted spawns are at most one in this many plies (§5.11: "under one per ten plies"). */
export const SPAWN_EVERY_PLIES = 10
/** A remark for the ledger margin is at most this long (§5.11). */
export const REMARK_MAX_CHARS = 140
/** The player is "the visitor" until this many finished games, then "the guest" (§5.11). */
export const GUEST_AFTER_GAMES = 3

/** The soundings worker as the Second sees it: the gauge's evaluation and the packet's search. */
export interface Soundings {
  evaluate(fen: string, timeMs: number): Promise<{ scoreCp: number; mateIn?: number; pv: string[] }>
  search(fen: string, opts: EngineSearchOptions): Promise<{
    move: MoveInput | null
    scoreCp: number
    mateIn?: number
    pv: string[]
    lines?: { move: MoveInput; scoreCp: number; mateIn?: number; pv: string[] }[]
  }>
}

/** The margin of the ledger, as far as the Second may write on it. */
export interface RemarkLedger {
  remark(ply: number, text: string): void
}

/** What the Second is given besides the game and the season. */
export interface SecondServiceOptions {
  /** The second engine instance, named 'soundings'; a fake under test. */
  soundings: Soundings
  /** The bridge to the server; a fake under test. */
  converse: typeof converseFn
  /** The ledger's REMARK column. */
  ledger: RemarkLedger
  /** Deltas of unprompted speech (the post-mortem at game end) for the card at lower left. */
  onDelta?: (mode: SecondMode, text: string) => void
}

/** Whether the davit is at rest or moving: the Second never interrupts the chair's move. */
export type ChairPhase = 'still' | 'chair'

/** One sounding, from White's side, taken after a ply. */
export interface Sounding { ply: number; scoreCp: number; mateIn?: number }

/** Why an unprompted remark was spawned. */
export type Trigger = 'swing' | 'book' | 'queen' | 'end'

/** Turns `e7e8q` into a move. */
function lanToInput(lan: string): MoveInput | null {
  if (lan.length < 4) return null
  const from = lan.slice(0, 2) as Square
  const to = lan.slice(2, 4) as Square
  const promotion = lan.length > 4 ? (lan[4] as PieceType) : undefined
  return promotion ? { from, to, promotion } : { from, to }
}

/** The movetext of a PGN, `1. d4 Nf6 2. c4 e6`: the seven tags and the result marker dropped. */
export function movetext(pgn: string): string {
  return pgn
    .split('\n')
    .filter((l) => !/^\s*\[.*\]\s*$/.test(l))
    .join(' ')
    .replace(/\s+(1-0|0-1|1\/2-1\/2|\*)\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Centipawns from White's side as pawns from the player's side, signed: `+0.35`, `0.00`, `-0.20`. */
function pawns(cpWhite: number, player: Color): string {
  const cp = player === 'w' ? cpWhite : -cpWhite
  const v = cp / 100
  const text = Math.abs(v).toFixed(2)
  if (Math.abs(cp) < 0.5) return '0.00'
  return `${cp > 0 ? '+' : '-'}${text}`
}

/** `21:14` from milliseconds on a clock. */
function clockText(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s < 10 ? '0' : ''}${s}`
}

const PIECE_WORDS: Record<PieceType, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' }

/** `pawn c4 (Cinder Reach)`. */
function pieceOn(piece: PieceType, sq: Square): string {
  return `${PIECE_WORDS[piece]} ${sq} (${isletName(sq)})`
}

/** `pawn and knight`, `bishop`, `pawn, pawn and rook`. */
function listWords(pieces: PieceType[]): string {
  const words = pieces.map((p) => PIECE_WORDS[p])
  if (words.length <= 1) return words.join('')
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`
}

/** The game's end in the ledger's words (§5.5). */
function endWords(result: GameResult, reason: GameEndReason | undefined): string {
  switch (reason) {
    case 'stalemate': return `${result}, slack water`
    case 'insufficient': return `${result}, nothing left to move`
    case 'threefold': return `${result} by repetition`
    case 'fifty-move': return `${result} by the fifty-move rule`
    case 'agreement': return `${result} by agreement`
    case 'resignation': return `${result} by resignation`
    case 'timeout': return `${result} on time`
    default: return result
  }
}

/** True when the question is about the board rather than the world: a piece, a move, a square, the position, or short. */
export function isAboutThePosition(question: string): boolean {
  const q = question.trim()
  if (q.split(/\s+/).filter(Boolean).length <= 6) return true
  const words = /\b(position|piece|pieces|move|moves|square|squares|pawn|pawns|knight|bishop|rook|queen|king|castl\w*|check|mate|capture|return|exchange|attack|defen[cs]e|threat|plan|play|gauge|soundings?|hanging|file|rank|diagonal)\b/i
  if (words.test(q)) return true
  if (/\b[a-h][1-8]\b/.test(q)) return true
  return /\bO-O(-O)?\b/.test(q)
}

/**
 * Cleans a REMARK reply for the ledger margin: the first line that says anything, a trailing full
 * stop removed, cut to 140 characters. Null when she had nothing to say: an empty reply or a single dash.
 */
export function cleanRemark(text: string): string | null {
  for (const raw of text.split('\n')) {
    const line = raw.trim().replace(/[.\s]+$/g, '').trim()
    if (!line) continue
    if (/^[-–—]+$/.test(line)) return null
    return line.length > REMARK_MAX_CHARS ? line.slice(0, REMARK_MAX_CHARS).trimEnd() : line
  }
  return null
}

/** The two lines of a game-end REMARK, each cleaned; dashes and blanks dropped. */
export function cleanRemarkLines(text: string): string[] {
  const out: string[] = []
  for (const raw of text.split('\n')) {
    const line = cleanRemark(raw)
    if (line) out.push(line)
    if (out.length === 2) break
  }
  return out
}

/** The FEN with the side to move passed: the other side to move, no en passant square. */
export function nullMoveFen(fen: string): string {
  const parts = fen.split(' ')
  parts[1] = parts[1] === 'w' ? 'b' : 'w'
  parts[3] = '-'
  return parts.join(' ')
}

/**
 * Miss Brace at the board: builds the STATION REPORT, answers when asked, and speaks unprompted
 * only when the trigger policy says so. Persona id `brace`; the packet travels as `ConverseRequest.context`.
 */
export class SecondService {
  /** Soundings taken after each ply this game, from White's side, in the order taken. */
  evalHistory: Sounding[] = []
  /** The latest sounding, from White's side. */
  lastEval: Sounding | undefined
  /** The ply at which the last unprompted spawn happened; -Infinity before the first. */
  lastSpawnPly = -Infinity
  /** Why the last unprompted spawn happened. */
  lastTrigger: Trigger | undefined

  private readonly game: Game
  private readonly season: SeasonClock
  private readonly soundings: Soundings
  private readonly converse: typeof converseFn
  private readonly ledger: RemarkLedger
  private readonly onDelta: ((mode: SecondMode, text: string) => void) | undefined
  private busy = false
  /** Spawns in flight, so the game end follows a remark still being typed rather than being dropped. */
  private chain: Promise<void> = Promise.resolve()
  private bookNoted = false
  private endNoted = false
  private endDeferred = false
  private pos: Position | null = null

  constructor(game: Game, season: SeasonClock, o: SecondServiceOptions) {
    this.game = game
    this.season = season
    this.soundings = o.soundings
    this.converse = o.converse
    this.ledger = o.ledger
    this.onDelta = o.onDelta
  }

  /** The player's name in the packet: their name if given, `the Guest` after three finished games, else `the Visitor`. */
  playerName(): { the: string; bare: string } {
    const name = store.settings.playerName.trim()
    if (name) return { the: name, bare: name }
    if (store.ledger.games.played >= GUEST_AFTER_GAMES) return { the: 'the Guest', bare: 'Guest' }
    return { the: 'the Visitor', bare: 'Visitor' }
  }

  /**
   * The STATION REPORT (§5.11), line for line: header, FEN, PGN, the last six plies with islets,
   * the player and the clocks, the soundings with Best, Second and Third, the chair's reply to a pass,
   * material and the loose pieces, phase and book, the player's last three moves with their sounding
   * change, rating and games, then the mode line and the question, which are always the last two lines.
   */
  async packet(mode: SecondMode, question?: string): Promise<string> {
    this.watchGame()
    const p = this.game.position.clone()
    const player = this.game.settings.playerColor
    const fen = p.fen()
    const over = p.status().isGameOver
    const clocks = this.game.settings.minutes > 0 ? { ...this.game.clocks } : undefined

    let evalResult: { scoreCp: number; mateIn?: number; pv: string[] } | undefined
    let lines: Awaited<ReturnType<Soundings['search']>> | undefined
    let pass: Awaited<ReturnType<Soundings['search']>> | undefined
    if (!over) {
      const wantPass = p.turn() === player && !p.inCheck()
      const [ev, se, pa] = await Promise.all([
        this.soundings.evaluate(fen, SOUNDINGS_MS).catch(() => undefined),
        this.soundings.search(fen, { timeMs: SOUNDINGS_MS, level: SOUNDINGS_LEVEL, multiPv: PACKET_LINES }).catch(() => undefined),
        wantPass ? this.soundings.search(nullMoveFen(fen), { timeMs: SOUNDINGS_MS, level: SOUNDINGS_LEVEL }).catch(() => undefined) : Promise.resolve(undefined),
      ])
      evalResult = ev ?? (se ? { scoreCp: se.scoreCp, mateIn: se.mateIn, pv: se.pv } : undefined)
      lines = se
      pass = pa
      if (evalResult && !this.evalHistory.some((x) => x.ply === p.ply())) this.record(p.ply(), evalResult)
    }
    const b = buildBrief(p, { playerColor: player, evalResult, clocks })
    const who = this.playerName()
    const s = this.season.season

    const out: string[] = []
    out.push(`STATION REPORT.  EXPEDITION ${s.expeditions}.  MOVE ${b.moveNumber}.  ${ledgerDate(s.date)}.  SEA STATE ${s.seaState}.  ${watchLabel(s.timeControl)}.`)
    out.push(`FEN: ${b.fen}`)
    out.push(`PGN so far: ${movetext(b.pgn) || 'none'}`)
    out.push(`Last six plies with islets: ${this.lastPlies(p, b)}`)
    out.push(this.playerLine(b, who, clocks))
    out.push(this.soundingsLine(p, b, evalResult, lines, who))
    if (pass) out.push(`If ${who.the} passed, the chair's best reply: ${this.passLine(p, pass, evalResult)}`)
    out.push(this.materialLine(p, b, who))
    out.push(this.bookLine(p, b))
    out.push(`${who.bare}'s last three moves and sounding change: ${this.recentMoves(p, player)}`)
    out.push(`${who.bare}'s station rating: ${Math.round(s.rating)}.  Games this season: ${store.ledger.games.played} (${store.ledger.games.won}-${store.ledger.games.lost}-${store.ledger.games.drawn}).`)
    out.push(`Game state: ${b.status.isGameOver && b.status.result ? `finished, ${endWords(b.status.result, b.status.reason)}` : 'in progress'}.  Mode: ${mode}`)
    out.push(`Question, if any: ${question?.trim() ? `"${question.trim()}"` : 'none'}`)
    return out.join('\n')
  }

  /**
   * Asks the Second. FEEDBACK when the question is about the position, a piece, a move or a square,
   * or is short; DISCUSSION otherwise. The exchange is kept in the ledger's conversation with her.
   */
  async ask(question: string, onDelta: (text: string) => void): Promise<string> {
    const mode: SecondMode = isAboutThePosition(question) ? 'FEEDBACK' : 'DISCUSSION'
    const history = store.conversation(PERSONA_ID)
    const context = await this.packet(mode, question)
    const messages: ChatMessage[] = [...history, { role: 'user', content: question }]
    const { text } = await this.converse({ personaId: PERSONA_ID, messages, context, mode }, onDelta)
    history.push({ role: 'user', content: question }, { role: 'assistant', content: text })
    store.save()
    return text
  }

  /**
   * The trigger policy after a ply has landed. Unprompted only: after the player's move when the
   * sounding swings more than 1.5 pawns; at the first non-book move; on a queen capture; at game end
   * (a two-line REMARK to the ledger, then the POST-MORTEM into the conversation). Never while the
   * chair is moving (`phase` 'chair': the eval is kept, a game end waits for the davit to park),
   * and at most one spawn in ten plies, the game end excepted.
   */
  onMove(move: MoveRecord, brief: PositionBrief, phase: ChairPhase = 'still'): void {
    this.watchGame()
    const player = this.game.settings.playerColor
    const before = this.evalHistory.find((s) => s.ply === move.ply - 1) ?? (this.lastEval && this.lastEval.ply < move.ply ? this.lastEval : undefined)
    if (brief.evalCp !== undefined) this.record(move.ply, { scoreCp: brief.evalCp, mateIn: brief.mateIn })

    if (brief.status.isGameOver) {
      if (this.endNoted) return
      if (phase === 'chair') { this.endDeferred = true; return }
      this.endNoted = true
      this.endDeferred = false
      void this.speakAtEnd(move.ply)
      return
    }
    if (phase === 'chair') return
    if (this.endDeferred && this.game.state === 'over') {
      this.endNoted = true
      this.endDeferred = false
      void this.speakAtEnd(move.ply)
      return
    }

    let trigger: Trigger | undefined
    const book = findBook(this.game.position.history().map((m) => m.san))
    if (!book.inBook && !this.bookNoted) {
      this.bookNoted = true
      if (book.leftAtPly === move.ply) trigger = 'book'
    }
    if (move.captured === 'q') trigger = 'queen'
    if (move.color === player && before && brief.evalCp !== undefined) {
      const sign = player === 'w' ? 1 : -1
      const swing = sign * (brief.evalCp - before.scoreCp)
      if (Math.abs(swing) > SWING_CP) trigger = 'swing'
    }
    if (!trigger) return
    if (move.ply - this.lastSpawnPly < SPAWN_EVERY_PLIES) return
    if (this.busy) return
    this.lastSpawnPly = move.ply
    this.lastTrigger = trigger
    void this.remark(move.ply, false)
  }

  /** A remark on the position as it stands, into the ledger's margin; the game end's two lines when it is over. */
  async remarkNow(): Promise<void> {
    const ply = this.game.position.ply()
    if (this.busy) return
    this.lastSpawnPly = ply
    await this.remark(ply, this.game.position.status().isGameOver)
  }

  // ───────────────────────────── internals ─────────────────────────────

  /** Starts afresh when `Game.start` has replaced the position; after an undo, forgets the soundings of plies taken back. */
  private watchGame(): void {
    const pos = this.game.position
    if (this.pos !== pos) {
      this.pos = pos
      this.evalHistory = []
      this.lastEval = undefined
      this.lastSpawnPly = -Infinity
      this.lastTrigger = undefined
      this.bookNoted = false
      this.endNoted = false
      this.endDeferred = false
      return
    }
    const ply = pos.ply()
    if (this.evalHistory.length && this.evalHistory[this.evalHistory.length - 1].ply > ply) {
      this.evalHistory = this.evalHistory.filter((s) => s.ply <= ply)
      this.lastEval = this.evalHistory[this.evalHistory.length - 1]
    }
  }

  /** Keeps one sounding per ply, the latest winning. */
  private record(ply: number, ev: { scoreCp: number; mateIn?: number }): void {
    const sounding: Sounding = ev.mateIn !== undefined ? { ply, scoreCp: ev.scoreCp, mateIn: ev.mateIn } : { ply, scoreCp: ev.scoreCp }
    const i = this.evalHistory.findIndex((s) => s.ply === ply)
    if (i >= 0) this.evalHistory[i] = sounding
    else this.evalHistory.push(sounding)
    this.evalHistory.sort((a, c) => a.ply - c.ply)
    this.lastEval = sounding
  }

  /** The two-line REMARK for the ledger, then the POST-MORTEM into the conversation, after anything in flight. */
  private speakAtEnd(ply: number): Promise<void> {
    this.lastSpawnPly = ply
    this.lastTrigger = 'end'
    return this.chain.then(async () => {
      await this.remark(ply, true)
      await this.postMortem()
    })
  }

  /** One REMARK spawn; the reply cleaned and typed into the margin at `ply`. A dash writes nothing. */
  private async remark(ply: number, atEnd: boolean): Promise<void> {
    if (this.busy) return
    this.busy = true
    let release: () => void = () => {}
    this.chain = new Promise<void>((r) => { release = r })
    try {
      const context = await this.packet('REMARK')
      const content = atEnd
        ? 'REMARK: two lines, the result plainly, then the move the game turned on.'
        : 'REMARK: one line for the ledger margin, lower case, at most 140 characters, no full stop; a single dash if nothing is worth saying.'
      const { text } = await this.converse({ personaId: PERSONA_ID, messages: [{ role: 'user', content }], context, mode: 'REMARK' }, () => {})
      const lines = atEnd ? cleanRemarkLines(text) : [cleanRemark(text)].filter((l): l is string => l !== null)
      for (const line of lines) this.ledger.remark(ply, line)
    } catch (err) {
      console.error('[second] remark failed', err)
    } finally {
      this.busy = false
      release()
    }
  }

  /** The POST-MORTEM at game end, streamed to the card and kept in the conversation. */
  private async postMortem(): Promise<void> {
    if (this.busy) return
    this.busy = true
    let release: () => void = () => {}
    this.chain = new Promise<void>((r) => { release = r })
    try {
      const history = store.conversation(PERSONA_ID)
      const question = 'The game is finished. Your post-mortem.'
      const context = await this.packet('POST-MORTEM', question)
      const messages: ChatMessage[] = [...history, { role: 'user', content: question }]
      const { text } = await this.converse({ personaId: PERSONA_ID, messages, context, mode: 'POST-MORTEM' }, (d) => this.onDelta?.('POST-MORTEM', d))
      history.push({ role: 'user', content: question }, { role: 'assistant', content: text })
      store.save()
    } catch (err) {
      console.error('[second] post-mortem failed', err)
    } finally {
      this.busy = false
      release()
    }
  }

  // ───────────────────────────── packet lines ─────────────────────────────

  /** `7...O-O (Gannet Head) 8. Bd3 (Dunlin Flat) ...`, or `none` before the first move. */
  private lastPlies(p: Position, b: PositionBrief): string {
    const history = p.history().slice(-6)
    if (!history.length) return 'none'
    return b.lastMoves.map((san, i) => `${san.replace('... ', '...')} (${isletName(history[i].to)})`).join(' ')
  }

  /** `Player: the Visitor, light side, to move.  Clocks: Visitor 21:14, chair 24:02.` */
  private playerLine(b: PositionBrief, who: { the: string; bare: string }, clocks: { w: number; b: number } | undefined): string {
    const side = b.playerColor === 'w' ? 'light side' : 'dark side'
    const turn = b.status.isGameOver ? '' : b.turn === b.playerColor ? ', to move' : '; the chair to move'
    let line = `Player: ${who.the}, ${side}${turn}.`
    if (clocks) line += `  Clocks: ${who.bare} ${clockText(clocks[b.playerColor])}, chair ${clockText(clocks[b.playerColor === 'w' ? 'b' : 'w'])}.`
    return line
  }

  /** The sounding in the player's terms, then Best, Second and Third from the multi-PV search. */
  private soundingsLine(p: Position, b: PositionBrief, ev: { scoreCp: number; mateIn?: number; pv: string[] } | undefined, lines: Awaited<ReturnType<Soundings['search']>> | undefined, who: { the: string; bare: string }): string {
    const head = `Soundings (${SOUNDINGS_MS} ms, level ${SOUNDINGS_LEVEL}):`
    if (b.status.isGameOver) return `${head} none; the game is finished.`
    if (!ev) return `${head} none.`
    const player = b.playerColor
    const parts = [`${head} ${this.scoreWords(ev, player, who)}.`]
    const bestPv = lines?.pv?.length ? lines.pv : ev.pv
    const best = this.sanLine(p, bestPv, PACKET_PV_PLIES)
    if (best) parts.push(`Best: ${best}.`)
    const labels = ['Second', 'Third']
    ;(lines?.lines ?? []).slice(0, labels.length).forEach((l, i) => {
      const san = this.sanLine(p, [l.move.from + l.move.to + (l.move.promotion ?? '')], 1)
      if (san) parts.push(`${labels[i]}: ${san} (${this.scoreShort(l, player)}).`)
    })
    return parts.join('  ')
  }

  /** `+0.35 for the Visitor`, `mate in 3 for the Visitor`, `mate in 2 for the chair`. */
  private scoreWords(ev: { scoreCp: number; mateIn?: number }, player: Color, who: { the: string; bare: string }): string {
    if (ev.mateIn !== undefined && ev.mateIn !== 0) {
      const forPlayer = (ev.mateIn > 0) === (player === 'w')
      return `mate in ${Math.abs(ev.mateIn)} for ${forPlayer ? who.the : 'the chair'}`
    }
    return `${pawns(ev.scoreCp, player)} for ${who.the}`
  }

  /** `+0.10` or `mate in 2` for an alternative line. */
  private scoreShort(l: { scoreCp: number; mateIn?: number }, player: Color): string {
    if (l.mateIn !== undefined && l.mateIn !== 0) {
      const forPlayer = (l.mateIn > 0) === (player === 'w')
      return `mate in ${Math.abs(l.mateIn)}${forPlayer ? '' : ' against'}`
    }
    return pawns(l.scoreCp, player)
  }

  /** A line of LAN moves as numbered SAN from the position: `9. cxd5 exd5 10. Bd3`, `...dxc4`. */
  private sanLine(p: Position, lans: string[], max: number): string {
    const q = p.clone()
    const out: string[] = []
    for (const lan of lans.slice(0, max)) {
      const input = lanToInput(lan)
      const rec = input ? q.move(input) : null
      if (!rec) break
      if (rec.color === 'w') out.push(`${rec.moveNumber}. ${rec.san}`)
      else out.push(out.length ? rec.san : `...${rec.san}`)
    }
    return out.join(' ')
  }

  /** `...dxc4 winning a pawn`: the chair's best reply if the player passed, with what the soundings say it gains. */
  private passLine(p: Position, pass: Awaited<ReturnType<Soundings['search']>>, ev: { scoreCp: number; mateIn?: number } | undefined): string {
    const q = p.clone()
    const fen = nullMoveFen(q.fen())
    const lan = pass.pv[0] ?? (pass.move ? pass.move.from + pass.move.to + (pass.move.promotion ?? '') : '')
    const san = this.sanFromFen(fen, lan)
    if (!san) return 'none found.'
    const player = p.turn()
    const sign = player === 'w' ? 1 : -1
    if (pass.mateIn !== undefined && pass.mateIn !== 0 && (pass.mateIn > 0) !== (player === 'w')) return `${san}, mate in ${Math.abs(pass.mateIn)}.`
    const loss = ev ? sign * (ev.scoreCp - pass.scoreCp) : 0
    const gain = loss >= 500 ? ' winning the game' : loss >= 250 ? ' winning a piece' : loss >= 80 ? ' winning a pawn' : ''
    return `${san}${gain}.`
  }

  /** SAN of one LAN move from a bare FEN, numbered for the side to move; empty when illegal. */
  private sanFromFen(fen: string, lan: string): string {
    const input = lanToInput(lan)
    if (!input) return ''
    const rec = new Position(fen).move(input)
    if (!rec) return ''
    return rec.color === 'w' ? `${rec.moveNumber}. ${rec.san}` : `...${rec.san}`
  }

  /** `Material 39 v 39.  Returned: none.  Hanging: none.  Attacked more than defended: pawn c4 (Cinder Reach).` */
  private materialLine(p: Position, b: PositionBrief, who: { the: string; bare: string }): string {
    const player = b.playerColor
    const mine = player === 'w' ? b.material.w : b.material.b
    const theirs = player === 'w' ? b.material.b : b.material.w
    const chairLost = player === 'w' ? b.captured.byWhite : b.captured.byBlack
    const playerLost = player === 'w' ? b.captured.byBlack : b.captured.byWhite
    const returned: string[] = []
    if (chairLost.length) returned.push(`the chair's ${listWords(chairLost)}`)
    if (playerLost.length) returned.push(`${who.the}'s ${listWords(playerLost)}`)
    const hanging: string[] = []
    const attacked: string[] = []
    for (const h of b.hanging) (p.isAttacked(h.square, h.color) ? attacked : hanging).push(pieceOn(h.piece, h.square))
    return `Material ${mine} v ${theirs}.  Returned: ${returned.length ? returned.join('; ') : 'none'}.  Hanging: ${hanging.length ? hanging.join(', ') : 'none'}.  Attacked more than defended: ${attacked.length ? attacked.join(', ') : 'none'}.`
  }

  /** `Phase: opening; book left at move 5 (Queen's Gambit Declined, D37).` The line is named once two plies of it were followed. */
  private bookLine(p: Position, b: PositionBrief): string {
    const book = findBook(p.history().map((m) => m.san))
    const followed = book.inBook ? p.ply() : (book.leftAtPly ?? 1) - 1
    const named = book.name && followed >= 2 ? ` (${book.name}, ${book.eco})` : ''
    if (book.inBook) return `Phase: ${b.phase}; ${p.ply() === 0 ? 'not yet begun' : `in book${named}`}.`
    return `Phase: ${b.phase}; book left at move ${book.leftAtMove}${named}.`
  }

  /** `8. Bd3 (-0.20), 7. Be2 (0.00), 6. e3 (+0.05)`, newest first; `none` before the player has moved. */
  private recentMoves(p: Position, player: Color): string {
    const own = p.history().filter((m) => m.color === player).slice(-3).reverse()
    if (!own.length) return 'none'
    const at = (ply: number) => this.evalHistory.find((s) => s.ply === ply)
    return own.map((m) => {
      const after = at(m.ply)
      const before = at(m.ply - 1)
      const label = m.color === 'w' ? `${m.moveNumber}. ${m.san}` : `${m.moveNumber}...${m.san}`
      const delta = after && before ? `(${pawns(after.scoreCp - before.scoreCp, player)})` : '(no sounding)'
      return `${label} ${delta}`
    }).join(', ')
  }
}
