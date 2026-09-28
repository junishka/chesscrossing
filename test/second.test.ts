// The Second under node: a fake soundings worker, a fake bridge, a game driven by hand. Nothing is rendered.
// store.ts reaches for window.setTimeout in save() and localStorage on load, so both are shimmed before it is imported.
import { test } from 'node:test'
import assert from 'node:assert/strict'

const memory = new Map<string, string>()
;(globalThis as unknown as { window: unknown }).window = { setTimeout, clearTimeout }
;(globalThis as unknown as { localStorage: unknown }).localStorage = {
  getItem: (k: string) => memory.get(k) ?? null,
  setItem: (k: string, v: string) => { memory.set(k, v) },
  removeItem: (k: string) => { memory.delete(k) },
}

const { store, blankSeason } = await import('../src/core/store')
const { Game } = await import('../src/chess/game')
const { brief } = await import('../src/chess/analysis')
const { SeasonClock } = await import('../src/station/season')
const {
  SecondService, cleanRemark, cleanRemarkLines, isAboutThePosition, movetext, nullMoveFen, SPAWN_EVERY_PLIES, PERSONA_ID,
} = await import('../src/station/second')
type ConverseRequest = import('../src/types').ConverseRequest
type MoveRecord = import('../src/types').MoveRecord
type Engine = import('../src/chess/engine').Engine
type Soundings = import('../src/station/second').Soundings

/** A soundings worker that answers at once with what the test set. */
function fakeSoundings(o: Partial<{
  eval: { scoreCp: number; mateIn?: number; pv: string[] }
  lines: Awaited<ReturnType<Soundings['search']>>
  pass: Awaited<ReturnType<Soundings['search']>>
}> = {}) {
  const calls: { kind: 'evaluate' | 'search'; fen: string; opts?: unknown }[] = []
  const soundings: Soundings = {
    async evaluate(fen, timeMs) { calls.push({ kind: 'evaluate', fen, opts: timeMs }); return o.eval ?? { scoreCp: 0, pv: [] } },
    async search(fen, opts) {
      calls.push({ kind: 'search', fen, opts })
      const isPass = fen !== calls.find((c) => c.kind === 'evaluate')?.fen
      if (isPass && o.pass) return o.pass
      return o.lines ?? { move: null, scoreCp: 0, pv: [] }
    },
  }
  return { soundings, calls }
}

/** A bridge that records every request and answers from a queue of replies (the last one repeats). */
function fakeConverse(replies: string[]) {
  const requests: ConverseRequest[] = []
  const converse = async (req: ConverseRequest, onDelta: (t: string) => void) => {
    requests.push(structuredClone(req))
    const text = replies.length > 1 ? replies.shift()! : replies[0] ?? ''
    if (text) onDelta(text)
    return { text }
  }
  return { requests, converse: converse as unknown as typeof import('../src/api/second').converse }
}

/** The engine the game is given; it is never asked to move here. */
const chair = {
  async evaluate() { return { scoreCp: 0, depth: 1, nodes: 0, pv: [], timeMs: 0 } },
  async search() { return { move: null, scoreCp: 0, depth: 1, nodes: 0, pv: [], timeMs: 0 } },
  stop() {},
  dispose() {},
} as unknown as Engine

/** A game the test moves by hand, a season set as asked, a Second with fakes. */
function harness(o: {
  eval?: { scoreCp: number; mateIn?: number; pv: string[] }
  lines?: Awaited<ReturnType<Soundings['search']>>
  pass?: Awaited<ReturnType<Soundings['search']>>
  replies?: string[]
  season?: Partial<import('../src/types').Season>
  playerColor?: 'w' | 'b'
  minutes?: number
} = {}) {
  store.reset()
  Object.assign(store.ledger.season, blankSeason(), o.season ?? {})
  const game = new Game(chair)
  game.start({ playerColor: o.playerColor ?? 'w', opponent: { kind: 'engine', level: 5, name: 'The Predictor' }, minutes: 0, incrementSec: 0 })
  if (o.minutes) {
    game.settings.minutes = o.minutes
    game.clocks = { w: o.minutes * 60_000, b: o.minutes * 60_000, running: null, incrementMs: 0 }
  }
  const season = new SeasonClock({ now: () => 1000, slowMotion: async () => {}, dev: true })
  const { soundings, calls } = fakeSoundings(o)
  const bridge = fakeConverse(o.replies ?? ['-'])
  const remarks: { ply: number; text: string }[] = []
  const deltas: string[] = []
  const second = new SecondService(game, season, {
    soundings, converse: bridge.converse, ledger: { remark: (ply, text) => { remarks.push({ ply, text }) } }, onDelta: (_m, t) => { deltas.push(t) },
  })
  /** Plays SAN by hand and returns the record. */
  const play = (san: string): MoveRecord => {
    const p = game.position
    const legal = p.legalMoves().find((m) => {
      const q = p.clone()
      const r = q.move(m)
      return r?.san === san
    })
    assert.ok(legal, `${san} is legal`)
    const rec = p.move(legal!)
    assert.ok(rec)
    return rec!
  }
  /** A brief of the position as it stands, with the sounding given (from White's side). */
  const briefAt = (evalCp?: number, mateIn?: number) => brief(game.position, { playerColor: game.settings.playerColor, evalResult: evalCp === undefined ? undefined : { scoreCp: evalCp, mateIn, pv: [] } })
  return { game, season, second, calls, requests: bridge.requests, remarks, deltas, play, briefAt }
}

/** Lets the void promises behind onMove run to their end. */
async function settle(): Promise<void> {
  for (let i = 0; i < 20; i++) await new Promise<void>((r) => setImmediate(r))
}

const QGD = ['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6', 'Nf3', 'Be7']

// ───────────────────────────── the packet ─────────────────────────────

test('the packet has the bible\'s lines in order, the mode and the question last', async () => {
  const h = harness({
    season: { expeditions: 3, date: 14, seaState: 4, timeControl: 'long', rating: 1450.4 },
    minutes: 30,
    eval: { scoreCp: 35, pv: ['c4d5', 'e6d5', 'f1d3'] },
    lines: { move: { from: 'c4', to: 'd5' }, scoreCp: 35, pv: ['c4d5', 'e6d5', 'f1d3'], lines: [
      { move: { from: 'f1', to: 'd3' }, scoreCp: 10, pv: ['f1d3'] },
      { move: { from: 'a2', to: 'a3' }, scoreCp: 5, pv: ['a2a3'] },
    ] },
    pass: { move: { from: 'd5', to: 'c4' }, scoreCp: -60, pv: ['d5c4'] },
  })
  store.ledger.games = { played: 2, won: 1, lost: 1, drawn: 0 }
  for (const san of [...QGD, 'e3', 'O-O']) h.play(san)
  h.game.clocks.w = 21 * 60_000 + 14_000
  h.game.clocks.b = 24 * 60_000 + 2_000

  const text = await h.second.packet('FEEDBACK', 'Is my bishop badly placed?')
  const lines = text.split('\n')
  assert.equal(lines[0], 'STATION REPORT.  EXPEDITION 3.  MOVE 6.  14 SEPT 1965.  SEA STATE 4.  LONG WATCH.')
  assert.equal(lines[1], `FEN: ${h.game.position.fen()}`)
  assert.equal(lines[2], 'PGN so far: 1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Nf3 Be7 5. e3 O-O')
  assert.equal(lines[3], 'Last six plies with islets: 3. Nc3 (Cinder Flat) 3...Nf6 (Fennel Holm) 4. Nf3 (Fennel Flat) 4...Be7 (Eider Skerry) 5. e3 (Eider Flat) 5...O-O (Gannet Head)')
  assert.equal(lines[4], 'Player: the Visitor, light side, to move.  Clocks: Visitor 21:14, chair 24:02.')
  assert.equal(lines[5], 'Soundings (600 ms, level 5): +0.35 for the Visitor.  Best: 6. cxd5 exd5 7. Bd3.  Second: 6. Bd3 (+0.10).  Third: 6. a3 (+0.05).')
  assert.equal(lines[6], "If the Visitor passed, the chair's best reply: ...dxc4 winning a pawn.")
  assert.equal(lines[7], 'Material 39 v 39.  Returned: none.  Hanging: none.  Attacked more than defended: none.')
  assert.equal(lines[8], "Phase: opening; book left at move 5 (Queen's Gambit Declined, D37).")
  assert.equal(lines[9], "Visitor's last three moves and sounding change: 5. e3 (no sounding), 4. Nf3 (no sounding), 3. Nc3 (no sounding)")
  assert.equal(lines[10], "Visitor's station rating: 1450.  Games this season: 2 (1-1-0).")
  assert.equal(lines[11], 'Game state: in progress.  Mode: FEEDBACK')
  assert.equal(lines[12], 'Question, if any: "Is my bishop badly placed?"')
  assert.equal(lines.length, 13)

  // The soundings worker was asked for the 600 ms gauge, the three lines, and the null-move reply.
  const search = h.calls.filter((c) => c.kind === 'search')
  assert.deepEqual(h.calls.find((c) => c.kind === 'evaluate')?.opts, 600)
  assert.deepEqual(search[0].opts, { timeMs: 600, level: 5, multiPv: 3 })
  assert.equal(search[1].fen, nullMoveFen(h.game.position.fen()))
  assert.equal(h.second.lastEval?.scoreCp, 35)
  assert.deepEqual(h.second.evalHistory, [{ ply: 10, scoreCp: 35 }])
})

test('the packet before the first move, untimed, with no question', async () => {
  const h = harness({ eval: { scoreCp: 20, pv: ['e2e4'] } })
  const lines = (await h.second.packet('DISCUSSION')).split('\n')
  assert.equal(lines[0], 'STATION REPORT.  EXPEDITION 0.  MOVE 1.  1 SEPT 1965.  SEA STATE 4.  NO WATCH.')
  assert.equal(lines[2], 'PGN so far: none')
  assert.equal(lines[3], 'Last six plies with islets: none')
  assert.equal(lines[4], 'Player: the Visitor, light side, to move.')
  assert.equal(lines[8], 'Phase: opening; not yet begun.')
  assert.equal(lines[9], "Visitor's last three moves and sounding change: none")
  assert.equal(lines[lines.length - 2], 'Game state: in progress.  Mode: DISCUSSION')
  assert.equal(lines[lines.length - 1], 'Question, if any: none')
})

test('the packet names the loose pieces, the returned, and the chair to move', async () => {
  const h = harness({ eval: { scoreCp: -80, pv: [] } })
  for (const san of ['e4', 'd5', 'exd5', 'Qxd5', 'Nc3']) h.play(san)
  const lines = (await h.second.packet('FEEDBACK')).split('\n')
  assert.equal(lines[4], 'Player: the Visitor, light side; the chair to move.')
  assert.match(lines[5], /^Soundings \(600 ms, level 5\): -0\.80 for the Visitor\.$/)
  assert.ok(!lines.some((l) => l.startsWith('If the Visitor passed')), 'no pass line when the chair is to move')
  assert.equal(lines[6], "Material 38 v 38.  Returned: the chair's pawn; the Visitor's pawn.  Hanging: none.  Attacked more than defended: none.")
  assert.equal(lines[7], 'Phase: opening; book left at move 1.')
})

test('the finished game: no soundings, the result in the ledger\'s words', async () => {
  const h = harness({ eval: { scoreCp: 0, pv: [] } })
  for (const san of ['f3', 'e5', 'g4', 'Qh4#']) h.play(san)
  const lines = (await h.second.packet('POST-MORTEM')).split('\n')
  assert.equal(lines[5], 'Soundings (600 ms, level 5): none; the game is finished.')
  assert.equal(lines[4], 'Player: the Visitor, light side.')
  assert.equal(lines[lines.length - 2], 'Game state: finished, 0-1.  Mode: POST-MORTEM')
  assert.equal(h.calls.length, 0, 'the soundings worker is not asked about a finished game')
})

test('the player on the dark side reads the soundings from their own side', async () => {
  const h = harness({ playerColor: 'b', eval: { scoreCp: 35, mateIn: undefined, pv: [] } })
  h.play('e4')
  const lines = (await h.second.packet('FEEDBACK')).split('\n')
  assert.equal(lines[4], 'Player: the Visitor, dark side, to move.')
  assert.match(lines[5], /^Soundings \(600 ms, level 5\): -0\.35 for the Visitor\./)
})

// ───────────────────────────── the book ─────────────────────────────

test('book detection: in book, left at move 5, never entered', async () => {
  const h = harness({ eval: { scoreCp: 0, pv: [] } })
  const phase = async (s: InstanceType<typeof SecondService>) => (await s.packet('FEEDBACK')).split('\n').find((l) => l.startsWith('Phase:'))
  for (const san of QGD) h.play(san)
  assert.equal(await phase(h.second), "Phase: opening; in book (Queen's Gambit Declined, D37).")
  h.play('e3')
  assert.equal(await phase(h.second), "Phase: opening; book left at move 5 (Queen's Gambit Declined, D37).")

  const g = harness({ eval: { scoreCp: 0, pv: [] } })
  g.play('a4')
  assert.equal(await phase(g.second), 'Phase: opening; book left at move 1.')
  for (const san of ['a5', 'e4']) g.play(san)
  assert.equal(await phase(g.second), 'Phase: opening; book left at move 1.')

  const k = harness({ eval: { scoreCp: 0, pv: [] } })
  for (const san of ['d4', 'd5', 'e3']) k.play(san)
  assert.equal(await phase(k.second), "Phase: opening; book left at move 2 (Queen's Gambit Declined, D37).")
})

// ───────────────────────────── ask ─────────────────────────────

test('ask picks FEEDBACK for the position and DISCUSSION for the world, and keeps the exchange', async () => {
  const h = harness({ eval: { scoreCp: 10, pv: [] }, replies: ['Your bishop is not badly placed. It is early.'] })
  const deltas: string[] = []
  const text = await h.second.ask('Is my bishop badly placed?', (d) => deltas.push(d))
  assert.equal(text, 'Your bishop is not badly placed. It is early.')
  assert.deepEqual(deltas, [text])
  assert.equal(h.requests[0].personaId, PERSONA_ID)
  assert.equal(h.requests[0].mode, 'FEEDBACK')
  assert.deepEqual(h.requests[0].messages, [{ role: 'user', content: 'Is my bishop badly placed?' }])
  const ctx = h.requests[0].context!.split('\n')
  assert.equal(ctx[ctx.length - 2], 'Game state: in progress.  Mode: FEEDBACK')
  assert.equal(ctx[ctx.length - 1], 'Question, if any: "Is my bishop badly placed?"')

  await h.second.ask('Tell me about the time Botvinnik lost his title and what the station made of it', () => {})
  assert.equal(h.requests[1].mode, 'DISCUSSION')
  assert.equal(h.requests[1].messages.length, 3, 'the earlier exchange travels with the question')
  assert.equal(store.conversation(PERSONA_ID).length, 4)

  assert.equal(isAboutThePosition('What would you play?'), true)
  assert.equal(isAboutThePosition('Should the knight go to f5 or stay where it is for now?'), true)
  assert.equal(isAboutThePosition('Where did the Station Master go and why does nobody here speak of it?'), false)
  assert.equal(isAboutThePosition('Tell me about the Standing Orders, all of them, and what they mean for the survey'), false)
})

// ───────────────────────────── the trigger policy ─────────────────────────────

test('a swing of more than 1.5 pawns after the player\'s move spawns a REMARK into the ledger', async () => {
  const h = harness({ eval: { scoreCp: 0, pv: [] }, replies: ['The soundings prefer the knight to f5 and so do I.'] })
  const m1 = h.play('e4'); h.second.onMove(m1, h.briefAt(20))
  const m2 = h.play('e5'); h.second.onMove(m2, h.briefAt(10))
  await settle()
  assert.equal(h.requests.length, 0, 'in book, small swings: nothing')
  const m3 = h.play('Nf3'); h.second.onMove(m3, h.briefAt(-160))
  await settle()
  assert.equal(h.requests.length, 1)
  assert.equal(h.requests[0].mode, 'REMARK')
  assert.equal(h.second.lastTrigger, 'swing')
  assert.deepEqual(h.remarks, [{ ply: 3, text: 'The soundings prefer the knight to f5 and so do I' }])
  assert.deepEqual(h.second.evalHistory.map((s) => s.scoreCp), [20, 10, -160])
})

test('the chair\'s swing does not spawn; a swing exactly at 1.5 pawns does not spawn', async () => {
  const h = harness({ eval: { scoreCp: 0, pv: [] }, replies: ['line'] })
  const m1 = h.play('e4'); h.second.onMove(m1, h.briefAt(0))
  const m2 = h.play('e5'); h.second.onMove(m2, h.briefAt(300))
  await settle()
  assert.equal(h.requests.length, 0, 'the chair\'s move is not the player\'s')
  const m3 = h.play('Nf3'); h.second.onMove(m3, h.briefAt(150))
  await settle()
  assert.equal(h.requests.length, 0, '150 is not more than 150')
})

test('the first non-book move spawns, once', async () => {
  const h = harness({ eval: { scoreCp: 0, pv: [] }, replies: ['off the chart at move one'] })
  const m1 = h.play('a4'); h.second.onMove(m1, h.briefAt(-10))
  await settle()
  assert.equal(h.requests.length, 1)
  assert.equal(h.second.lastTrigger, 'book')
  assert.deepEqual(h.remarks, [{ ply: 1, text: 'off the chart at move one' }])
  h.second.lastSpawnPly = -Infinity
  const m2 = h.play('a5'); h.second.onMove(m2, h.briefAt(-10))
  await settle()
  assert.equal(h.requests.length, 1, 'the book is left once')
})

test('a queen capture spawns whoever takes', async () => {
  const h = harness({ eval: { scoreCp: 0, pv: [] }, replies: ['a return'] })
  for (const san of ['e4', 'd5', 'exd5']) h.second.onMove(h.play(san), h.briefAt(0))
  await settle()
  assert.equal(h.requests.length, 1, 'e4 d5 left the book at move 1')
  h.second.lastSpawnPly = -Infinity
  h.second.onMove(h.play('Qxd5'), h.briefAt(0))
  await settle()
  assert.equal(h.requests.length, 1, 'a pawn is not a queen')
  h.second.onMove(h.play('Nc3'), h.briefAt(0))
  h.second.onMove(h.play('Qe5+'), h.briefAt(0))
  h.second.onMove(h.play('Qe2'), h.briefAt(0))
  h.second.lastSpawnPly = -Infinity
  h.second.onMove(h.play('Qxe2+'), h.briefAt(0))
  await settle()
  assert.equal(h.second.lastTrigger, 'queen')
  assert.equal(h.requests.length, 2)
  assert.deepEqual(h.remarks, [{ ply: 2, text: 'a return' }, { ply: 8, text: 'a return' }])
})

test('game end: two remark lines to the ledger, then the post-mortem into the conversation', async () => {
  const h = harness({ eval: { scoreCp: 0, pv: [] }, replies: ['-', '0-1. the queen came to h4 (Heron Reach).\n-\nthe game turned on 2. g4.', 'The turning point was move two.'] })
  for (const san of ['f3', 'e5', 'g4', 'Qh4#']) h.second.onMove(h.play(san), h.briefAt(0))
  h.game.resign()
  await settle()
  // Three spawns: the first non-book move (1. f3, answered with a dash), then the end's REMARK and POST-MORTEM in that order.
  assert.deepEqual(h.requests.map((r) => r.mode), ['REMARK', 'REMARK', 'POST-MORTEM'])
  assert.equal(h.second.lastTrigger, 'end')
  assert.deepEqual(h.remarks, [
    { ply: 4, text: '0-1. the queen came to h4 (Heron Reach)' },
    { ply: 4, text: 'the game turned on 2. g4' },
  ])
  assert.equal(h.requests[1].messages[0].content, 'REMARK: two lines, the result plainly, then the move the game turned on.')
  const kept = store.conversation(PERSONA_ID)
  assert.equal(kept.length, 2)
  assert.equal(kept[0].role, 'user')
  assert.equal(kept[1].content, 'The turning point was move two.')
  assert.deepEqual(h.deltas, ['The turning point was move two.'])
  const ctx = h.requests[2].context!.split('\n')
  assert.equal(ctx[ctx.length - 2], 'Game state: finished, 0-1.  Mode: POST-MORTEM')
  // The end is said once.
  h.second.onMove(h.game.position.history()[3], h.briefAt(0))
  await settle()
  assert.equal(h.requests.length, 3)
})

test('the Second never interrupts the chair\'s move', async () => {
  const h = harness({ eval: { scoreCp: 0, pv: [] }, replies: ['line'] })
  h.second.onMove(h.play('a4'), h.briefAt(0), 'chair')
  await settle()
  assert.equal(h.requests.length, 0)
  assert.equal(h.second.evalHistory.length, 1, 'the sounding is still kept')
})

test('at most one spawn in ten plies', async () => {
  const h = harness({ eval: { scoreCp: 0, pv: [] }, replies: ['line'] })
  const sans = ['a4', 'a5', 'b4', 'b5', 'c4', 'c5', 'd4', 'd5', 'e4', 'e5', 'f4', 'f5', 'g4', 'g5', 'h4', 'h5']
  const evals = [0, 0, 300, 300, 0, 0, 300, 300, 0, 0, 300, 300, 0, 0, 300, 300]
  for (let i = 0; i < sans.length; i++) {
    h.second.onMove(h.play(sans[i]), h.briefAt(evals[i]))
    await settle()
  }
  // Ply 1 spawns (book left at move 1); plies 3, 7 swing but fall inside ten plies; ply 11 is the next.
  assert.deepEqual(h.remarks.map((r) => r.ply), [1, 11])
  assert.equal(SPAWN_EVERY_PLIES, 10)
})

test('a new game starts the history afresh', async () => {
  const h = harness({ eval: { scoreCp: 0, pv: [] }, replies: ['line'] })
  h.second.onMove(h.play('a4'), h.briefAt(0))
  await settle()
  assert.equal(h.remarks.length, 1)
  h.game.start({ playerColor: 'w', opponent: { kind: 'engine', level: 5, name: 'The Predictor' }, minutes: 0, incrementSec: 0 })
  h.second.onMove(h.play('a4'), h.briefAt(0))
  await settle()
  assert.equal(h.remarks.length, 2, 'the first non-book move of the new game spawns again')
  assert.deepEqual(h.second.evalHistory, [{ ply: 1, scoreCp: 0 }])
})

// ───────────────────────────── the remark cleanup ─────────────────────────────

test('remark cleanup: trailing full stop stripped, a dash is nothing to say, 140 characters at most', () => {
  assert.equal(cleanRemark('the soundings prefer the knight to f5 and so do i.'), 'the soundings prefer the knight to f5 and so do i')
  assert.equal(cleanRemark('  a return. \n'), 'a return')
  assert.equal(cleanRemark('-'), null)
  assert.equal(cleanRemark(' — '), null)
  assert.equal(cleanRemark(''), null)
  assert.equal(cleanRemark('\n\n'), null)
  assert.equal(cleanRemark('\nfirst line\nsecond line'), 'first line')
  const long = 'x'.repeat(200)
  assert.equal(cleanRemark(long)?.length, 140)
  assert.deepEqual(cleanRemarkLines('1-0.\nthe game turned on 23. Nf5 (Fennel Sound).\na third line'), ['1-0', 'the game turned on 23. Nf5 (Fennel Sound)'])
  assert.deepEqual(cleanRemarkLines('-'), [])
})

test('a dash writes no row', async () => {
  const h = harness({ eval: { scoreCp: 0, pv: [] }, replies: ['-'] })
  h.second.onMove(h.play('a4'), h.briefAt(0))
  await settle()
  assert.equal(h.requests.length, 1)
  assert.deepEqual(h.remarks, [])
})

test('remarkNow writes a remark for the position as it stands', async () => {
  const h = harness({ eval: { scoreCp: 0, pv: [] }, replies: ['level, and dull.'] })
  for (const san of ['e4', 'e5']) h.play(san)
  await h.second.remarkNow()
  assert.deepEqual(h.remarks, [{ ply: 2, text: 'level, and dull' }])
  assert.equal(h.requests[0].mode, 'REMARK')
})

test('movetext drops the tags and the result marker', () => {
  assert.equal(movetext('[Event "?"]\n[Result "*"]\n\n1. e4 e5 2. Nf3 *'), '1. e4 e5 2. Nf3')
  assert.equal(movetext('[Event "?"]\n[Result "0-1"]\n\n1. f3 e5 2. g4 Qh4# 0-1'), '1. f3 e5 2. g4 Qh4#')
  assert.equal(movetext('[Event "?"]\n\n'), '')
})

test('the null-move FEN passes the move and clears the en passant square', () => {
  assert.equal(nullMoveFen('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1'), 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1')
})
