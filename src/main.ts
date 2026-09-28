// Boot (docs/ARCHITECTURE.md "main.ts (boot, revised)"): fonts → palette check → stage → the world →
// the board → the UI → the season, the chapters, the roll, the chair, the Second, the expedition → the
// camera and the navigator → the plate on the wall. main.ts is the only module that wires actions between
// the scene, the UI and the station layer; everything else talks through the bus.
import * as THREE from 'three'
import type { CameraStation, CharacterDef, MoveInput, Transition, UiMode } from './types'
import { bus } from './core/bus'
import { clock } from './core/clock'
import { store } from './core/store'
import { loadFonts } from './core/fonts'
import { assertPalette, ui as uiTokens } from './content/palette'
import { copy, isletHover } from './content/copy'
import { characters, findCharacter, SECOND_ID } from './content/characters'
import { orders, ORDERS_TITLE } from './content/orders'
import { continueLine, dateText, FIRST_CARD } from './content/station'
import { isletName } from './content/survey'
import { watchStartLabel } from './content/watches'
import { BOARD_FRAME, FILM_GAUGE, frameById, frames, layout, START_FRAME } from './content/frames/index'
import { Stage } from './scene/renderer'
import { CameraRig, durationOf } from './scene/camera'
import { BoardView } from './scene/boardView'
import { buildAll, builders, setActiveFrame, stationOf, type FrameBuilder } from './world/frames'
import { buildPlaceholder } from './world/builders/_placeholder'
import { Navigator } from './world/navigator'
import { UI } from './ui/overlay'
import { audio } from './audio/index'
import { converse } from './api/second'
import { Engine } from './chess/engine'
import { Game } from './chess/game'
import { Position } from './chess/rules'
import { SeasonClock } from './station/season'
import { ChapterEngine } from './station/chapters'
import { LedgerRoll } from './station/ledger'
import { isAboutThePosition, SecondService } from './station/second'
import { Expedition } from './station/expedition'

/** The frame's aspect: the stage is this shape inside the surround; the UI's matte narrows it further on the grid. */
const FRAME_ASPECT = 1.85
/** The board's centre at the lacquer surface in the Board Room frame (§5.9). */
const BOARD_CENTRE = new THREE.Vector3(0, 0.729, 0)
/** The room station ↔ Table dolly (§5.9): 900 ms linear. */
const SIT_MS = 900
/** Near plane: the Table station sits 0.40 m behind the near rim. */
const CAMERA_NEAR = 0.05
/** The id the tutorial card is remembered under, so it is shown once. */
const TUTORIAL_ID = 'boardroom/order11'

/** The three views at the board, and the HUD's names for them. */
type BoardViewName = 'table' | 'chart' | 'profile'
const HUD_VIEW: Record<BoardViewName, 'seated' | 'overhead' | 'side'> = { table: 'seated', chart: 'overhead', profile: 'side' }
const VIEW_OF_HUD: Record<'seated' | 'overhead' | 'side', BoardViewName> = { seated: 'table', overhead: 'chart', side: 'profile' }

/** How the camera moves between the board's views: lifts to and from the Chart, whips to and from the Profile. */
function viewTransition(from: BoardViewName, to: BoardViewName): Transition {
  if (to === 'chart') return 'lift-up'
  if (from === 'chart') return 'lift-down'
  return to === 'profile' ? 'whip-left' : 'whip-right'
}

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || (target instanceof HTMLElement && target.isContentEditable)
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => window.setTimeout(r, ms))
}

/** Sizes the stage's container to the frame's aspect, centred in the window; the rest is the surround. */
function fitFrame(app: HTMLElement): void {
  const fit = (): void => {
    const W = window.innerWidth
    const H = window.innerHeight
    let w = W
    let h = Math.round(W / FRAME_ASPECT)
    if (h > H) { h = H; w = Math.round(H * FRAME_ASPECT) }
    Object.assign(app.style, {
      position: 'absolute', width: `${w}px`, height: `${h}px`,
      left: `${Math.round((W - w) / 2)}px`, top: `${Math.round((H - h) / 2)}px`, overflow: 'hidden',
    })
  }
  fit()
  window.addEventListener('resize', fit)
}

/**
 * Guards the builders before the house is built. A room whose builder fails stands as the placeholder room
 * rather than taking the house down with it (reported once as a warning). A frame with no builder of its own
 * whose origin is another frame's (the Section is the house itself, seen from 26 m) builds nothing, so no
 * placeholder room is ever stood inside a real one.
 */
function guardBuilders(): void {
  for (const [id, build] of Array.from(builders.entries())) {
    const guarded: FrameBuilder = (ctx) => {
      try {
        return build(ctx)
      } catch (err) {
        console.warn(`[main] the ${id} builder failed; the room stands as a placeholder`, err)
        return buildPlaceholder(ctx)
      }
    }
    builders.set(id, guarded)
  }
  const key = (id: string): string => (layout[id] ?? [0, 0, 0]).join(',')
  for (const def of frames) {
    if (builders.has(def.id)) continue
    if (!frames.some((other) => other.id !== def.id && key(other.id) === key(def.id))) continue
    builders.set(def.id, (ctx) => ({ id: ctx.def.id, group: new THREE.Group(), hotspots: new Map() }))
  }
}

async function boot(): Promise<void> {
  await loadFonts()
  if (import.meta.env.DEV) assertPalette()
  const app = document.getElementById('app')
  if (!app) throw new Error('no #app')
  document.documentElement.style.background = uiTokens.surround
  document.body.style.background = uiTokens.surround
  fitFrame(app)

  // ── The stage and the world ──
  const stage = new Stage(app)
  stage.camera.filmGauge = FILM_GAUGE
  stage.camera.near = CAMERA_NEAR
  stage.camera.updateProjectionMatrix()
  stage.setGrain(store.settings.grain)
  guardBuilders()
  const built = buildAll(stage.scene, frames, layout)
  const boardroom = built.get(BOARD_FRAME)
  if (!boardroom) throw new Error('no board room')
  const boardView = new BoardView(stage, boardroom.group, BOARD_CENTRE, 'w')

  // ── The overlay and the sound ──
  const ui = new UI(app)
  const wake = (): void => audio.init()
  window.addEventListener('pointerdown', wake)
  window.addEventListener('keydown', wake)

  // ── The station ──
  const season = new SeasonClock()
  season.start()
  const chapters = new ChapterEngine(season)
  const ledger = new LedgerRoll({ onChange: (rows) => ui.hud.setRows(rows) })
  ledger.listen()
  ui.hud.setRows(ledger.rows)
  const chairEngine = new Engine({ name: 'chair' })
  const soundings = new Engine({ name: 'soundings' })
  const game = new Game(chairEngine)
  const second = new SecondService(game, season, { soundings, converse, ledger })
  const rig = new CameraRig(stage.camera, stage)
  const nav = new Navigator(stage, rig, frames, layout, built)

  let mode: UiMode = 'title'
  let seated = false
  let moving = false
  let boardViewName: BoardViewName = 'table'
  const roomStation = (): CameraStation => stationOf(frameById(BOARD_FRAME) ?? frames[0], layout)

  const expedition = new Expedition(game, boardView, season, ledger, second, ui, {
    chapters,
    audio,
    canvas: stage.renderer.domElement,
    onLeave: () => { void stand() },
  })

  bus.on('ui:mode', ({ mode: m }) => {
    mode = m
    nav.enable(m === 'world' && !seated && !moving)
  })
  bus.on('settings:change', (s) => stage.setGrain(s.grain))

  // ── Conversation ──
  const brace = findCharacter(SECOND_ID) as CharacterDef

  /** The Second's packet for the question just asked (the card pushes it into the history before asking). */
  const packetProvider = async (): Promise<string | undefined> => {
    const history = store.conversation(SECOND_ID)
    const last = history[history.length - 1]
    const question = last?.role === 'user' ? last.content : undefined
    return second.packet(question && isAboutThePosition(question) ? 'FEEDBACK' : 'DISCUSSION', question)
  }

  /** A short world context for a resident: date, watch, tide, chapter, games, the frame. */
  const worldContext = async (): Promise<string | undefined> => {
    const s = season.season
    const g = store.ledger.games
    const tide = season.crossable() ? 'low water; the causeway is dry' : 'the causeway is covered'
    return [
      `STATION.  ${dateText(s.date)}.  Station time ${season.clockLabel()} (the watch that began at ${watchStartLabel(s.watch)}).`,
      `Tide: ${tide}.  Chapter ${chapters.current()} of the log.`,
      `Games finished this season: ${g.played} (${g.won}-${g.lost}-${g.drawn}).  Expeditions entered: ${s.expeditions}.`,
      `The visitor is in ${nav.current.title}.`,
    ].join('\n')
  }

  /** Opens the Second's card with the packet as context: CONSULT, key S, the plate on the rim. */
  const consult = (): void => {
    if (ui.converse.isOpen) return
    ui.converse.open(brace, packetProvider)
    bus.emit('ui:mode', { mode: 'converse' })
  }

  /** A resident is addressed: the card opens and the resident is marked as spoken to. */
  const openResident = (id: string): void => {
    const persona = findCharacter(id)
    if (!persona) return
    if (!season.season.spokenTo.includes(id)) { season.season.spokenTo.push(id); store.save() }
    ui.converse.open(persona, worldContext)
    chapters.check()
  }

  // ── The board: sitting, the views, standing ──
  const controls = {
    onView: (v: 'overhead' | 'seated' | 'side') => { void view(VIEW_OF_HUD[v]) },
    onSecond: () => consult(),
    onResign: () => { void expedition.resign() },
    onDraw: () => { void expedition.offerDraw() },
    onUndo: () => expedition.takeBack(),
    onStandUp: () => expedition.adjourn(),
    onAdjourn: () => expedition.adjourn(),
  }

  /** Sits down: the 900 ms dolly to the Table, the board mode, the controls; the expedition begins or resumes. */
  async function sit(): Promise<void> {
    if (seated || moving) return
    moving = true
    nav.enable(false)
    ui.hoverLabel(null)
    try {
      await rig.goTo(boardView.stations.table, 'push-in', SIT_MS)
    } finally {
      moving = false
    }
    seated = true
    boardViewName = 'table'
    bus.emit('ui:mode', { mode: 'board' })
    ui.boardControls.show(controls)
    ui.boardControls.setView(HUD_VIEW.table)
    boardView.setInteractive(true)
    if (expedition.adjourned && expedition.inProgress()) expedition.resumeAtBoard()
    else if (!expedition.active) {
      const saved = store.ledger.savedGame
      await expedition.begin(saved ? { pgn: saved.pgn, clocks: saved.clocks } : {})
    }
    expedition.holdInput(500)
  }

  /** Stands up: the dolly back to the room station; the navigator takes the pointer again. */
  async function stand(): Promise<void> {
    if (!seated || moving) return
    moving = true
    boardView.setInteractive(false)
    boardView.highlight(null, [])
    ui.boardControls.hide()
    ui.hoverLabel(null)
    if (ui.converse.isOpen) ui.converse.close()
    seated = false
    bus.emit('ui:mode', { mode: 'world' })
    const via: Transition = boardViewName === 'chart' ? 'lift-down' : 'pull-out'
    try {
      await rig.goTo(roomStation(), via, SIT_MS)
    } finally {
      moving = false
    }
    nav.enable(mode === 'world')
    chapters.check()
  }

  /** Table, Chart or Profile (keys 1, 2, 3; the camera plate). */
  async function view(name: BoardViewName): Promise<void> {
    if (!seated || moving || name === boardViewName) return
    const via = viewTransition(boardViewName, name)
    boardViewName = name
    ui.boardControls.setView(HUD_VIEW[name])
    moving = true
    try {
      await rig.goTo(boardView.stations[name], via)
    } finally {
      moving = false
    }
    expedition.holdInput(500)
  }

  boardView.onHover((sq) => {
    if (seated) ui.hoverLabel(sq ? isletHover(sq, isletName(sq)) : null)
  })

  // ── The navigator ──
  nav.callbacks = {
    onHover: (label, x, y) => ui.hoverLabel(label, x, y),
    onBoard: () => { void sit() },
    onResident: (id) => openResident(id),
    onAspect: (aspect) => ui.letterbox(aspect),
  }
  bus.on('world:inspect', ({ hotspot }) => {
    if (hotspot.action === 'consult') consult()
  })
  bus.on('world:enter', () => { if (mode === 'world') chapters.check() })

  // ── Keys ──
  window.addEventListener('keydown', (e) => {
    if (isTyping(e.target) || e.repeat) return
    const cardOpen = document.querySelector('.cc-cards .cc-card:not(.is-out)') !== null
    if (e.key === 'Escape') {
      // The card layer closes its own card; the converse card its own; otherwise Escape stands up.
      if (cardOpen || ui.converse.isOpen || mode === 'menu' || mode === 'title') return
      if (seated) { e.preventDefault(); expedition.adjourn() }
      return
    }
    if (!seated || mode !== 'board') return
    if (e.key === '1') void view('table')
    else if (e.key === '2') void view('chart')
    else if (e.key === '3') void view('profile')
    else if (e.key === 's' || e.key === 'S') { e.preventDefault(); consult() }
    else boardView.skip()
  }, true)

  // ── The render loop: the active frame's own motion, then the frame ──
  clock.onTick((dt) => {
    const tick = built.get(nav.current.id)?.group.userData.tick as ((dt: number) => void) | undefined
    tick?.(dt)
    stage.render()
  })
  clock.start()

  // ── What stands in the scene: the house when the camera is in the house, one tableau outside ──
  // Only the house's rooms share a frame (the dollies and the Section see them together); an outside or
  // beyond tableau stands alone, so its sea and sky never cross into a room. During a transition both ends stand.
  const HOUSE_REGIONS = new Set(['boardroom', 'house'])
  const standing = (id: string): string[] => {
    const def = frameById(id)
    return def && HOUSE_REGIONS.has(def.region) ? frames.filter((f) => HOUSE_REGIONS.has(f.region)).map((f) => f.id) : [id]
  }
  let staging = 0
  const stageFrames = (ids: string[]): void => {
    const on = new Set(ids)
    for (const [id, frame] of built) frame.group.visible = on.has(id)
  }
  bus.on('world:enter', ({ frame, from, via }) => {
    const gen = ++staging
    stageFrames([...standing(frame), ...(from ? standing(from) : [])])
    void clock.wait(durationOf(via) + 100).then(() => { if (gen === staging) stageFrames(standing(frame)) })
  })

  // Behind the plate: the Board Room, lit, from its room station.
  stageFrames(standing(START_FRAME))
  setActiveFrame(START_FRAME)
  rig.jump(roomStation())
  try { stage.renderer.compile(boardroom.group, stage.camera, stage.scene) } catch (err) { console.warn('[main] compile', err) }

  // ── The plate, and the ways from it ──
  const typedCard = (title: string, lines: string[], onClose: () => void): void => {
    ui.card({ kind: 'typed', title, body: lines.join('\n') }, onClose)
  }

  function openMenu(): void {
    bus.emit('ui:mode', { mode: 'menu' })
    const saved = store.ledger.savedGame
    const n = ledger.currentExpedition() ?? season.season.expeditions
    const items = [
      { id: 'begin', label: copy.menu.items.begin },
      ...(saved ? [{ id: 'continue', label: continueLine(season.season.date, n) }] : []),
      { id: 'ledger', label: copy.menu.items.ledger },
      { id: 'roster', label: copy.menu.items.roster },
      { id: 'orders', label: copy.menu.items.orders },
    ]
    ui.menu.open({ items, onPick: (id) => { void pick(id) } })
  }

  async function pick(id: string): Promise<void> {
    switch (id) {
      case 'begin': await enterSeason(false); return
      case 'continue': await enterSeason(true); return
      case 'ledger': {
        ui.menu.close()
        const rows = ledger.rows.filter((r) => r.kind !== 'volume').slice(-48)
        typedCard(copy.screens.ledger, rows.map((r) => r.text.replace(/\s+$/, '')), openMenu)
        return
      }
      case 'roster': {
        ui.menu.close()
        const lines = characters.map((c) => `${c.name}. ${c.role}${c.age ? `, ${c.age}` : ''}.`)
        typedCard(copy.screens.roster, [...lines, '', copy.screens.rosterFooter], openMenu)
        return
      }
      case 'orders': {
        ui.menu.close()
        typedCard(ORDERS_TITLE, orders.map((o) => `${o.number}. ${o.text}`), openMenu)
        return
      }
    }
  }

  /** BEGIN THE SEASON (or CONTINUE): the Chapter One card when the log is new, the Board Room, the Order 11 card once. */
  async function enterSeason(resume: boolean): Promise<void> {
    ui.menu.close()
    bus.emit('ui:mode', { mode: 'title' })
    let unlocked = false
    const off = bus.once('chapter:unlock', () => { unlocked = true })
    chapters.check()
    off()
    if (unlocked) await sleep(copy.chapterCard.holdMs + 120)
    await nav.goto(START_FRAME, 'cut')
    if (!resume && store.mark('inspected', TUTORIAL_ID)) {
      await ui.title({ kind: 'typed', title: FIRST_CARD, lines: [FIRST_CARD] })
    }
    bus.emit('ui:mode', { mode: 'world' })
    if (resume) await sit()
  }

  openMenu()

  // ── For scripted sessions ──
  const cc = {
    goto: (id: string, via: Transition = 'cut') => nav.goto(id, via),
    sit,
    stand,
    /** Plays a SAN for the Visitor through the expedition (as a click would). */
    move: async (san: string): Promise<boolean> => {
      const pos = game.position
      const input = pos.legalMoves().find((m: MoveInput) => {
        const probe = new Position(pos.fen())
        return probe.move(m)?.san === san
      })
      if (!input) return false
      await expedition.playerMove(input)
      return true
    },
    view: (name: BoardViewName) => view(name),
    consult,
    get mode(): UiMode { return mode },
    game, ui, nav, season, chapters,
    grid: null,
    expedition, boardView, ledger, second, stage, rig,
    ready: true,
  }
  ;(window as unknown as { __cc: typeof cc }).__cc = cc
}

void boot().catch((err) => { console.error('[main] boot failed', err) })
