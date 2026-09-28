/**
 * The app shell. docs/architecture.md, "The game loop (app shell)".
 *
 * The stage shows the title cards and the chapter card, then whip-pans into
 * Room 1. The world renders the room and exposes slots; the board mounts into
 * board, ledger and tray, the narrator panel into narrator. The engine is
 * created during the cards so it is ready when an hour is named. Everything
 * the player can do is on the hours card and in the page head, which the
 * world renders; the shell adds nothing visible.
 */
import type { BoardController } from '../contracts/board'
import type { PieceKey } from '../contracts/chess'
import { PIECE_KEYS } from '../contracts/chess'
import { createBus } from '../contracts/bus'
import type { Engine } from '../contracts/engine'
import type { EventBus } from '../contracts/events'
import type { Stage } from '../contracts/frame'
import type { NarratorPanel } from '../contracts/narrator-panel'
import type { Room, RoomScene, World } from '../contracts/world'
import { createBoard } from '../board'
import { createEngine } from '../engine'
import { createStage, type StageExtras } from '../frame'
import { createNarratorPanel, type PanelInternals } from '../narrator'
import { TRAY_ID, loadWorld, renderRoom } from '../world'
import { createContextProvider } from './context'
import { createGameLoop, type GameLoop } from './game-loop'

export interface ShellDeps {
  /** Makes the engine. Default: the Stockfish worker. Tests inject a fake. */
  createEngine?: () => Engine
  /** The world. Default: loadWorld(). */
  world?: World
  /** Test injection for the narrator panel's stream and session. */
  narratorInternals?: PanelInternals
}

export interface Shell {
  readonly bus: EventBus
  readonly stage: Stage & StageExtras
  readonly world: World
  readonly room: Room
  readonly engine: Engine
  readonly scene: RoomScene
  readonly board: BoardController
  readonly narrator: NarratorPanel
  readonly loop: GameLoop
  destroy(): void
}

/** Dossier names by key, for the board's accessibility labels. */
function pieceNames(world: World): Record<PieceKey, string> {
  const out = {} as Record<PieceKey, string>
  for (const key of PIECE_KEYS) out[key] = world.pieces[key].name
  return out
}

/**
 * Starts the game. Resolves when the room has arrived and every module is
 * mounted; the title sequence runs first.
 */
export async function startApp(root: HTMLElement, deps: ShellDeps = {}): Promise<Shell> {
  const doc = root.ownerDocument
  const bus = createBus()
  const world = deps.world ?? loadWorld()
  const room = world.rooms[0]
  if (!room) throw new Error('the world has no rooms')

  root.setAttribute('data-app-phase', 'title')
  root.setAttribute('data-app-game', 'idle')
  const offs: (() => void)[] = [
    bus.on('game:new', () => root.setAttribute('data-app-game', 'playing')),
    bus.on('game:over', () => root.setAttribute('data-app-game', 'over')),
  ]

  // The engine loads during the title sequence (decision 6).
  const engine = (deps.createEngine ?? createEngine)()
  bus.emit({ type: 'engine:status', status: 'loading' })
  engine
    .ready()
    .then(() => bus.emit({ type: 'engine:status', status: 'ready' }))
    .catch((err: unknown) => bus.emit({ type: 'engine:status', status: 'error', detail: err instanceof Error ? err.message : String(err) }))

  // The world's stored stamp setting reaches the bus before the board exists; keep it for the board.
  let soundOn = true
  offs.push(
    bus.on('settings:sound', (e) => {
      soundOn = e.on
    }),
  )

  // The tray insert stays while the tray in the scene is hovered (decision 4).
  let board: BoardController | null = null
  offs.push(
    bus.on('object:inspect', (e) => {
      board?.setTrayVisible(e.objectId === TRAY_ID)
    }),
  )

  const stage = createStage(root)

  // The narrator panel is built during the cards, in a holder, so that it
  // hears room:enter when the world mounts; it is moved into its slot then.
  const context = createContextProvider({ bus, world, room })
  const holder = doc.createElement('div')
  const narrator = createNarratorPanel(
    holder,
    {
      name: world.narrator.name,
      silenceMark: world.narrator.silenceMark,
      placeholder: world.narrator.placeholder,
      visitorLabel: world.narrator.visitorLabel,
      getContext: context.getContext,
    },
    bus,
    deps.narratorInternals,
  )

  for (const card of world.titleCards) await stage.showCard(card, { kind: 'title' })
  await stage.showCard(world.chapterCard(room), { kind: 'chapter' })

  stage.setPalette(room.palette)
  let scene: RoomScene | null = null
  await stage.whipPan('left', () => {
    scene = renderRoom(stage.content, room, bus)
    scene.slotEl('narrator').appendChild(narrator.el)
    board = createBoard(
      { board: scene.slotEl('board'), ledger: scene.slotEl('ledger'), tray: scene.slotEl('tray') },
      {
        playerColor: 'w',
        pieceNames: pieceNames(world),
        opponentLines: world.opponent.lines,
        ledgerDate: world.ledgerDate,
        soundOn,
      },
      bus,
    )
    root.setAttribute('data-app-phase', 'room')
  })
  if (!scene || !board) throw new Error('the room did not mount')
  const mountedScene: RoomScene = scene
  const mountedBoard: BoardController = board

  const defaultHour = world.opponent.hours[world.opponent.defaultHour] ?? world.opponent.hours[0]
  const loop = createGameLoop({
    bus,
    board: mountedBoard,
    engine,
    initialStrength: defaultHour?.strength ?? 1,
    initialColor: 'w',
  })

  return {
    bus,
    stage,
    world,
    room,
    engine,
    scene: mountedScene,
    board: mountedBoard,
    narrator,
    loop,
    destroy() {
      for (const off of offs) off()
      loop.destroy()
      narrator.destroy()
      mountedBoard.destroy()
      mountedScene.destroy()
      context.destroy()
      engine.dispose()
      stage.destroy()
      root.removeAttribute('data-app-phase')
      root.removeAttribute('data-app-game')
    },
  }
}
