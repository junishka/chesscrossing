// UI demo: mounts the overlay over a plain background and exposes window.__demo hooks that show each state
// (the chapter card, the HUD with a twelve-ply roll, the cards, the brass plate, the Second's card streaming,
// the offline card, an insert, the reading strip). The sidecar is mocked by patching fetch.
import { loadFonts } from '../src/core/fonts'
import { clock } from '../src/core/clock'
import { bus } from '../src/core/bus'
import { palette } from '../src/content/palette'
import { copy, fmt } from '../src/content/copy'
import { isletName } from '../src/content/survey'
import { UI } from '../src/ui/overlay'
import type { CardDef, CharacterDef, ClockState, Color, LedgerRow, MoveRecord, PieceType, Square } from '../src/types'

const app = document.getElementById('app')!
app.style.background = `linear-gradient(180deg, ${palette.boardroom.wall} 0 62%, ${palette.boardroom.ground} 62% 100%)`

// ── the expedition ───────────────────────────────────────────────────────────
const PLIES: { san: string; to: Square; captured?: PieceType }[] = [
  { san: 'e4', to: 'e4' }, { san: 'c5', to: 'c5' }, { san: 'Nf3', to: 'f3' }, { san: 'd6', to: 'd6' },
  { san: 'd4', to: 'd4' }, { san: 'cxd4', to: 'd4', captured: 'p' }, { san: 'Nxd4', to: 'd4', captured: 'p' }, { san: 'Nf6', to: 'f6' },
  { san: 'Nc3', to: 'c3' }, { san: 'a6', to: 'a6' }, { san: 'Bg5', to: 'g5' }, { san: 'e6', to: 'e6' },
  { san: 'f4', to: 'f4' }, { san: 'Be7', to: 'e7' }, { san: 'Qf3', to: 'f3' }, { san: 'Qc7', to: 'c7' },
  { san: 'O-O-O', to: 'c1' }, { san: 'Nbd7', to: 'd7' }, { san: 'g4', to: 'g4' }, { san: 'b5', to: 'b5' },
  { san: 'Bxf6', to: 'f6', captured: 'n' }, { san: 'Nxf6', to: 'f6', captured: 'b' }, { san: 'g5', to: 'g5' }, { san: 'Nd7', to: 'd7' },
]

function move(i: number): MoveRecord {
  const p = PLIES[i]
  const color: Color = i % 2 === 0 ? 'w' : 'b'
  return {
    from: 'e2', to: p.to, san: p.san, lan: `e2${p.to}`, color, piece: 'p', captured: p.captured, isCheck: p.san.endsWith('+'), isMate: false,
    isCapture: !!p.captured, isCastleKing: p.san === 'O-O', isCastleQueen: p.san === 'O-O-O', isEnPassant: false, isPromotion: false,
    fenBefore: '', fenAfter: `fen-${i}`, ply: i + 1, moveNumber: Math.floor(i / 2) + 1,
  }
}

const moves = PLIES.map((_, i) => move(i))
const clocks: ClockState = { w: 21 * 60_000 + 14_000, b: 24 * 60_000 + 2_000, running: 'w', incrementMs: 0 }

/** The roll as the station layer would send it: the leader, the header, twelve plies with islets, remarks. */
function roll(): LedgerRow[] {
  const rows: LedgerRow[] = [
    { kind: 'volume', text: 'VOL. XII.  1964.  EXPEDITIONS 940 TO 999.' },
    ...copy.ledger.leader.map((text): LedgerRow => ({ kind: 'leader', text })),
    { kind: 'header', text: fmt(copy.ledger.header, { n: 3, watch: copy.watches.long, sea: 4, date: '14 SEPT 1965' }), expedition: 3 },
  ]
  let returned = false
  for (const m of moves.slice(0, 12)) {
    let remark: string | undefined
    if (m.isCapture && !returned) { returned = true; remark = copy.ledger.remarks.firstReturn }
    rows.push({ kind: 'move', text: m.san, ply: m.ply, moveNumber: m.moveNumber, color: m.color, san: m.san, islet: isletName(m.to), remark, fen: m.fenAfter })
    if (m.ply === 7) rows.push({ kind: 'remark', text: fmt(copy.ledger.remarks.chairThought, { seconds: '1.9' }), ply: 7 })
    if (m.ply === 12) rows.push({ kind: 'remark', text: 'the soundings prefer the knight to f5 and so do i', ply: 12 })
  }
  return rows
}

const brace: CharacterDef = {
  id: 'brace', name: 'Constance Brace', role: 'Navigator', voice: '', sample: [],
  greeting: 'The guest has the first move. Order 11. You have it.', systemPrompt: '',
}

const cards: Record<string, CardDef> = {
  index: {
    kind: 'index', tag: 'HS-0002', title: 'CHRONOMETER PAIR', material: 'walnut, brass · 1934',
    body: 'They disagree by a beat. They have since 1934.',
  },
  tag: { kind: 'tag', title: 'VISITOR', body: 'GUEST CHAIR\nWANTED ON VOYAGE', footnote: 'PROVISIONAL  ·  1 SEPTEMBER 1965' },
  placard: { kind: 'placard', title: '', body: copy.placards.gauge },
  letter: {
    kind: 'letter', title: 'HALYARD ISLAND HYDROGRAPHIC STATION',
    body: 'Sir,\n\nThe Society has counted and the count does not add up. The station closes on Thursday 30 September 1965. Standing Order 12 is added: the season will be closed properly.\n\nThe board is never left unset.\n\nFor the Society,\nKettle, 14 June 1965',
  },
  telegram: {
    kind: 'telegram', title: 'TELEGRAM',
    body: 'KITTIWAKE NOT AT KETTLE STOP NO SIGHTING STOP READINGS CONTINUE STOP',
    footnote: 'Kettle, 12 June 1965.',
  },
  typed: { kind: 'typed', title: '', body: copy.cards.firstCard },
  error: { kind: 'typed', title: copy.errors.predictor.title, body: copy.errors.predictor.lines.join('\n') },
}

// ── the mocked sidecar ───────────────────────────────────────────────────────
const REPLY = 'Your bishop is not badly placed. It is early. c4 (Cinder Reach) wants a hand on it before anything else.\nThe gauge is level. I would look at the knight; f5 is a bearing worth taking.'
let online = true

const realFetch = window.fetch.bind(window)
window.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  if (url.endsWith('/api/health')) {
    return new Response(JSON.stringify({ ok: true, cli: online, version: '2.1.0', model: 'claude-opus-5-5', reason: online ? undefined : 'claude not found on PATH (ENOENT)' }), { headers: { 'content-type': 'application/json' } })
  }
  if (url.endsWith('/api/converse')) {
    const enc = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      async start(c) {
        await new Promise((r) => setTimeout(r, 600))
        for (const chunk of REPLY.match(/.{1,9}/gs) ?? []) {
          c.enqueue(enc.encode(`data: ${JSON.stringify({ type: 'delta', text: chunk })}\n\n`))
          await new Promise((r) => setTimeout(r, 30))
        }
        c.enqueue(enc.encode(`data: ${JSON.stringify({ type: 'done', costUsd: 0.012 })}\n\n`))
        c.close()
      },
    })
    return new Response(stream, { headers: { 'content-type': 'text/event-stream' } })
  }
  return realFetch(input, init)
}

// ── boot ─────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  await loadFonts()
  clock.start()
  const ui = new UI(app)
  bus.on('audio:sfx', ({ name }) => { if (name !== 'key') console.log('[sfx]', name) })
  bus.on('audio:music', ({ theme }) => console.log('[music]', theme))

  let live: ClockState = { ...clocks }
  clock.onTick((dt) => {
    if (live.running) live = { ...live, [live.running]: Math.max(0, live[live.running] - dt * 1000) }
  })
  let tickCount = 0
  clock.onTick(() => { if (ui.el.dataset.mode === 'board' && ++tickCount % 12 === 0) ui.hud.setClocks(live) })

  const board = (opts: { flag?: boolean; thinking?: boolean; rows?: boolean } = {}) => {
    ui.mode('board')
    ui.letterbox(1.85)
    ui.hud.setPlayerColor('w')
    live = opts.flag ? { ...clocks, w: 0, running: null } : { ...clocks }
    ui.hud.setClocks(live)
    if (opts.rows === false) ui.hud.setLedger(moves.slice(0, 12))
    else ui.hud.setRows(roll())
    ui.hud.setCaptured(['p', 'n'], ['p', 'b'])
    ui.hud.onRowClick((ply) => ui.toast(`Rewound to ply ${ply}.`))
    ui.hud.setStatus(opts.flag ? '0-1 ON TIME.' : copy.status.visitorToMove)
    ui.hud.setThinking(!!opts.thinking)
    if (opts.thinking) ui.hud.setStatus(copy.status.thinking)
    ui.boardControls.show({
      onView: (v) => console.log('view', v), onSecond: () => demo.converse(), onResign: () => ui.hud.setStatus('0-1 BY RESIGNATION.  FLAG P.'),
      onDraw: () => ui.toast(copy.toasts.drawDeclined), onUndo: () => bus.emit('game:undo', { fen: 'fen-21' }), onStandUp: () => ui.mode('world'),
    })
  }

  const demo = {
    ui,
    title: () => { void ui.title({ chapter: 'CHAPTER ONE', title: 'THE BOARD ROOM', subtitle: 'The visitor came on Wednesday. The guest chair was given.', date: '1 September 1965' }) },
    typedCard: () => { void ui.title({ kind: 'typed', title: copy.cards.firstCard }) },
    hud: board,
    card: (kind: keyof typeof cards = 'index') => ui.card(cards[kind]),
    error: (key: 'missing' | 'unauthenticated' | 'unreachable' | 'slow' | 'empty' | 'predictor' | 'nosave' = 'nosave') => ui.error(key),
    menu: () => {
      ui.mode('menu')
      ui.menu.open({
        items: [
          { id: 'begin', label: copy.menu.items.begin },
          { id: 'continue', label: fmt(copy.menu.items.continue, { date: '14 SEPTEMBER 1965', n: 4 }) },
          { id: 'ledger', label: copy.menu.items.ledger },
          { id: 'roster', label: copy.menu.items.roster },
          { id: 'orders', label: copy.menu.items.orders },
        ],
        onPick: (id) => { ui.toast(`${id} chosen.`); ui.menu.close(); ui.mode('world') },
      })
    },
    converse: (o: { offline?: boolean; send?: boolean } = {}) => {
      online = !o.offline
      if (ui.el.dataset.mode !== 'board') board()
      ui.mode('converse')
      ui.converse.open(brace, async () => 'STATION REPORT.  EXPEDITION 3.  MOVE 7.')
      if (o.send) {
        const input = ui.el.querySelector<HTMLInputElement>('.cc-converse-input')!
        input.value = 'Is my bishop badly placed'
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      }
    },
    insert: (kind = 'returned') => {
      const specs: Record<string, Parameters<typeof ui.insert>[0]> = {
        returned: { kind: 'returned', title: 'B-B1', lines: ['RETURNED  MOVE 11  GANNET SOUND'] },
        photo: { kind: 'photo', title: copy.inserts.photographCaption, holdMs: 4000 },
        page: { kind: 'page', title: 'SHEET 9.', lines: [copy.inserts.sheetNineLast], holdMs: 4000 },
        sheet: { kind: 'sheet', title: 'SHEET 9  ·  THE SIXTY-FOUR  ·  1931, CORRECTED 1965', lines: [copy.inserts.sheetNineLast], holdMs: 4000 },
        books: { kind: 'books', title: 'BOOKS, 11', lines: ['The Tide Book of Kettle Harbour', 'A Girl of the Skerries', 'Marion and the Lighthouse Boys', 'The Weather Ship', 'Signals for Beginners', 'The Seventh Form at Crail', 'Under Nine Lamps', 'Pony Island', 'The Latin Prize', 'Elizabeth of the Point', 'Field Notes of a Junior Hydrographer'], holdMs: 4000 },
        postcards: { kind: 'postcards', title: 'POSTCARDS, 79', lines: ['38. Rf3   A.H.', '39. Rc3   A.H.', '40. Rc8   your move, then. A.H.'], holdMs: 4000 },
      }
      return ui.insert(specs[kind] ?? specs.returned)
    },
    reading: () => bus.emit('reading', { text: 'Halyard. South-west, four. Sea moderate. Rain later. Good, becoming moderate. High water 11:04, low water 17:20. That is the reading.', watch: 3 }),
    world: () => { ui.mode('world'); ui.letterbox(2.4); ui.hoverLabel('TO THE CHART ROOM') },
    islet: () => { ui.mode('world'); ui.letterbox(2.4); ui.hoverLabel('e4  ·  EIDER REACH') },
    toast: (t = 'Cairn c4 (Cinder Reach) read.') => ui.toast(t),
    undoTo: (i: number) => bus.emit('game:undo', { fen: `fen-${i}` }),
    move: (i: number) => bus.emit('game:move', { move: moves[i], status: { fen: '', turn: i % 2 ? 'w' : 'b', ply: i + 1, inCheck: PLIES[i].san.endsWith('+'), isGameOver: false }, byPlayer: i % 2 === 0 }),
  }
  ;(window as unknown as { __demo: typeof demo }).__demo = demo
  ;(window as unknown as { __ready: boolean }).__ready = true
}

void main()
