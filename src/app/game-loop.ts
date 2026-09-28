/**
 * The game loop. docs/architecture.md, "The game loop (app shell)" and the
 * decisions section: naming an hour starts a game or changes the strength;
 * the player's colour is chosen for the next game; on the player's move the
 * engine evaluates, the move is classified, the opponent answers at the
 * current strength, and the new position is evaluated again.
 *
 * The board and the engine never meet; this module is the only place that
 * holds both.
 */
import type { BoardController } from '../contracts/board'
import type { Color, Strength } from '../contracts/chess'
import type { Engine, EngineEvaluation } from '../contracts/engine'
import type { AppEvent, AppEventOf, EventBus } from '../contracts/events'
import { EngineStoppedError } from '../engine'
import { classify, swingFor } from './classify'

export interface GameLoopDeps {
  bus: EventBus
  board: BoardController
  engine: Engine
  /** The strength in force before an hour is named: the default hour's. */
  initialStrength: Strength
  /** The colour the visitor takes for the first game. Default white. */
  initialColor?: Color
}

export interface GameLoop {
  /** The opponent's strength for his next move. */
  strength(): Strength
  /** The colour the visitor takes when the next game starts. */
  nextColor(): Color
  isPlaying(): boolean
  /** True while an hour has been named and the engine has yet to become ready. */
  isStarting(): boolean
  destroy(): void
}

interface Pending {
  fen: string
  evaluation: Promise<EngineEvaluation | null>
}

export function createGameLoop(deps: GameLoopDeps): GameLoop {
  const { bus, board, engine } = deps
  let strength: Strength = deps.initialStrength
  let nextColor: Color = deps.initialColor ?? 'w'
  let playing = false
  let starting = false
  let destroyed = false
  /** Bumped on every new game; replies from an earlier game are dropped. */
  let generation = 0
  /** Searches given to the engine and not yet answered. */
  let inFlight = 0
  /** Whether a bestMove search is among them. */
  let thinking = false
  /** The position the board is at, and its evaluation once it has arrived. */
  let currentFen = ''
  let latest: Pending | null = null

  /** Turns an engine failure into a status event. A stopped search is not a failure. */
  function fail(err: unknown): null {
    if (err instanceof EngineStoppedError) return null
    const detail = err instanceof Error ? err.message : String(err)
    bus.emit({ type: 'engine:status', status: 'error', detail })
    return null
  }

  function evaluateAt(fen: string): Promise<EngineEvaluation | null> {
    inFlight++
    const evaluation = engine
      .evaluate(fen)
      .catch(fail)
      .finally(() => {
        inFlight--
      })
    latest = { fen, evaluation }
    return evaluation
  }

  function scoreFields(ev: EngineEvaluation): Pick<AppEventOf<'game:eval'>, 'cp' | 'mate'> {
    const fields: Pick<AppEventOf<'game:eval'>, 'cp' | 'mate'> = {}
    if (ev.cp !== undefined) fields.cp = ev.cp
    if (ev.mate !== undefined) fields.mate = ev.mate
    return fields
  }

  async function opponentMove(fen: string, gen: number): Promise<void> {
    bus.emit({ type: 'engine:status', status: 'thinking' })
    inFlight++
    thinking = true
    let uci: string | null
    try {
      uci = await engine.bestMove(fen, { strength })
    } catch (err) {
      uci = fail(err)
    } finally {
      inFlight--
      thinking = false
    }
    if (destroyed || gen !== generation || !playing || uci === null) return
    bus.emit({ type: 'engine:status', status: 'ready' })
    const applied = board.applyMove(uci, 'opponent')
    if (!applied) bus.emit({ type: 'engine:status', status: 'error', detail: `the engine's move ${uci} is not legal here` })
  }

  async function start(): Promise<void> {
    if (playing || starting || destroyed) return
    starting = true
    try {
      await engine.ready()
    } catch (err) {
      starting = false
      fail(err)
      return
    }
    starting = false
    if (playing || destroyed) return
    if (inFlight > 0) engine.stop()
    bus.emit({ type: 'player:new-game', color: nextColor })
    board.setInteractive(true)
    board.newGame({ playerColor: nextColor })
  }

  function onNew(e: AppEventOf<'game:new'>): void {
    generation++
    const gen = generation
    playing = true
    const { snapshot } = e
    currentFen = snapshot.fen
    latest = null
    void evaluateAt(snapshot.fen).then((ev) => {
      if (destroyed || gen !== generation || !ev) return
      bus.emit({ type: 'game:eval', fen: snapshot.fen, ...scoreFields(ev) })
    })
    if (!snapshot.isGameOver && snapshot.turn !== snapshot.playerColor) void opponentMove(snapshot.fen, gen)
  }

  function onMove(e: AppEventOf<'game:move'>): void {
    if (!playing) return
    const gen = generation
    const { move, snapshot, by } = e
    const previousFen = currentFen
    currentFen = move.fen
    const before = latest && latest.fen === previousFen ? latest.evaluation : Promise.resolve<EngineEvaluation | null>(null)
    const after = evaluateAt(move.fen)
    void (async () => {
      const [b, a] = await Promise.all([before, after])
      if (destroyed || gen !== generation || !a) return
      const event: AppEvent = { type: 'game:eval', fen: move.fen, by, ...scoreFields(a) }
      if (b) {
        event.swing = swingFor(move.color, b, a)
        event.classification = classify(move.color, b, a)
      }
      bus.emit(event)
      if (by === 'player' && playing && !snapshot.isGameOver) await opponentMove(move.fen, gen)
    })()
  }

  function onOver(): void {
    playing = false
    board.setInteractive(false)
    if (thinking) engine.stop()
  }

  const offs: (() => void)[] = [
    bus.on('game:new', onNew),
    bus.on('game:move', onMove),
    bus.on('game:over', onOver),
    bus.on('player:hour', (e) => {
      strength = e.strength
      if (!playing) void start()
    }),
    bus.on('player:color', (e) => {
      nextColor = e.color
    }),
    bus.on('player:resign', () => {
      board.resign()
    }),
  ]

  return {
    strength: () => strength,
    nextColor: () => nextColor,
    isPlaying: () => playing,
    isStarting: () => starting,
    destroy() {
      destroyed = true
      for (const off of offs) off()
      if (inFlight > 0) engine.stop()
    },
  }
}
