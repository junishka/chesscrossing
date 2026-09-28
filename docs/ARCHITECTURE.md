# Architecture

Chesscrossing is a single-page Three.js application (TypeScript, Vite) with a tiny local Node
server that lets the game talk to Claude through the Claude CLI on the player's machine.

Everything visual and audible is procedural: geometry from primitives, lathes and extrudes;
textures painted onto canvases at runtime; sound synthesized with Web Audio. The only bundled
assets are two typefaces (Jost, Courier Prime) from npm.

The world is ONE scene: a cross-section house with rooms laid out on a grid, the outside and
the strange world placed further away in the same coordinate space. The camera never walks;
it moves between fixed, composed stations (tableaux) with whip pans, lateral dollies and
vertical lifts. The chess board lives in the board room, and "sitting down" is a camera move.

```
src/
  main.ts            boot: fonts → stage → content → world → ui → game; exposes window.__cc for tests
  types.ts           shared contracts (chess, world, conversation, events). No imports.
  core/              bus (typed events), store (the Ledger, localStorage), clock (rAF, tweens, slow motion), fonts
  chess/             rules (chess.js wrapper), engine.worker (own 0x88 engine), engine (worker client), analysis (PositionBrief), game (controller + clocks)
  scene/             renderer (Stage + film post-pass), materials (procedural textures/materials), text3d (placards, tags, spines), lights, camera (CameraRig), board, pieces, boardView
  world/             frames (registry, BuildContext), navigator (hotspots, transitions), props (furniture library), builders/<frameId>.ts (one tableau each)
  audio/             synth (instruments, sfx), music (sequencer, themes), index (facade)
  ui/                overlay (root + layers), titleCards, hud (clocks, ledger, status), cards (index cards / tags / letters), converse (chat panel), menu, cursor, styles.css
  content/           palette, laws, copy, chapters, eggs, characters (pure data, imported by the server too), frames/index (FrameDef[] + layout), frames/<id>.ts
  api/second.ts      fetch client for the server (SSE)
server/
  index.ts           http server: GET /api/health, POST /api/converse (SSE), serves dist/ in production
  claude.ts          spawns `claude -p`, parses stream-json, timeouts, budget
test/                node --test (via tsx): chess perft/rules, analysis, server parser
scripts/shot.mjs     headless screenshot of a built frame (Playwright + swiftshader)
```

## Rules for every module

- Import shared types from `src/types.ts`. Do not redefine them.
- Modules talk through `bus` (`src/core/bus.ts`) using the `Events` map. UI never imports scene; scene never imports UI. `main.ts` wires actions.
- All animation goes through `clock.tween` / `clock.onTick` so slow motion applies to everything.
- Colors come from `content/palette.ts` tokens. No hex literals in scene/world/ui code, except inside `materials.ts` noise helpers.
- Text on 3D surfaces is drawn with `labelTexture` (Jost for signage, Courier Prime for typed cards). Letterspaced caps for signage.
- Every canvas texture: `colorSpace = SRGBColorSpace`, `anisotropy = 4`, power-of-two size ≤ 1024 unless it holds a paragraph.
- Geometry budget: a frame ≤ 60k triangles; reuse geometries and materials (cache by key). Dispose nothing at runtime; frames are built once.
- No `Math.random()` in builders: use `seeded(seedString)` from `materials.ts` so every player sees the same house.
- Never block the main thread > 16ms in an event handler. Engine runs in a Worker.
- Do not touch `package.json` or files outside your ownership. If you need a dependency, say so in your report.

## Module contracts

### core (written)

`bus.on/once/emit`, `store.ledger / mark / has / setSettings / conversation / save`, `clock.tween(ms, fn, easing, delay) / wait / onTick / slowMotion(scale, holdMs)`, `ease.*`, `loadFonts()`, `FONT_SANS`, `FONT_MONO`.

### chess/rules.ts

```ts
export const START_FEN: string
export const PIECE_VALUES: Record<PieceType, number>   // p1 n3 b3 r5 q9 k0
export const FILES: File[]; export const RANKS: Rank[]
export function squareToXY(sq: Square): { file: number; rank: number }   // 0..7, a1 = (0,0)
export function xyToSquare(file: number, rank: number): Square
export class Position {
  constructor(fen?: string)
  fen(): string; pgn(): string; turn(): Color; ply(): number; moveNumber(): number
  board(): PieceAt[]; get(sq: Square): PieceAt | null; kingSquare(c: Color): Square
  legalMoves(from?: Square): MoveInput[]     // includes promotion variants
  legalTargets(from: Square): Square[]
  move(input: MoveInput): MoveRecord | null  // null when illegal; fills every MoveRecord field
  undo(): MoveRecord | null
  history(): MoveRecord[]
  status(): GameStatus; inCheck(): boolean
  isAttacked(sq: Square, by: Color): boolean
  loadPgn(pgn: string): boolean
  clone(): Position
  phase(): GamePhase
}
```

### chess/engine.worker.ts + engine.ts

Own engine, no chess.js in the worker. 0x88 or mailbox board with its own move generator (validated by perft), negamax alpha-beta with iterative deepening, quiescence search, MVV-LVA ordering, killer moves, transposition table (Zobrist), tapered piece-square evaluation (PeSTO style), time management. Protocol is `EngineRequest` → `EngineMessage` via `postMessage`.

Levels: 1 → depth 1 with a random pick among moves within 150cp of best; 2 → depth 2 with randomness within 60cp; 3 → 400ms; 4 → 1200ms; 5 → the requested time (default 3000ms). Always answer within `timeMs + 100`.

```ts
export class Engine {
  constructor()                                   // new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' })
  search(fen: string, opts: { timeMs: number; maxDepth?: number; level?: EngineLevel }): Promise<Extract<EngineMessage, { type: 'result' }>>
  evaluate(fen: string, timeMs: number): Promise<Extract<EngineMessage, { type: 'eval' }>>
  perft(fen: string, depth: number): Promise<number>
  stop(): void; dispose(): void
}
```

### chess/analysis.ts

```ts
export function describeMove(move: MoveRecord): string        // "White's knight takes the bishop on f7. Check."
export function material(p: Position): PositionBrief['material']
export function hanging(p: Position): PositionBrief['hanging']  // pieces attacked and undefended (or attacked by lower value)
export function brief(p: Position, opts: { playerColor: Color; evalResult?: { scoreCp: number; mateIn?: number; pv: string[] }; clocks?: ClockState }): PositionBrief
export function briefToText(b: PositionBrief): string          // what is appended to the Second's system prompt
```

### chess/game.ts

```ts
export class Game {
  readonly position: Position; readonly engine: Engine
  settings: GameSettings; clocks: ClockState; state: 'idle' | 'playing' | 'over'
  start(settings: GameSettings, pgn?: string, clocks?: ClockState): void   // emits game:new, game:clock; engine moves first if it is White
  playerMove(input: MoveInput): Promise<MoveRecord | null>                 // validates, emits game:move (byPlayer true), then engine replies (game:thinking, game:move byPlayer false)
  resign(): void; offerDraw(): boolean; undo(): void; pause(): void; resume(): void
  brief(): Promise<PositionBrief>                                          // with a fresh 600ms eval
  save(): SavedGame | undefined
}
```
Clocks tick on `clock.onTick` (unscaled, wall-time) and emit `game:clock` at most 5×/s; flag fall emits `game:over` with reason `timeout`. After every move emit `game:brief` asynchronously (eval ≤ 600ms) unless the game is over.

### scene/renderer.ts

```ts
export class Stage {
  renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera
  constructor(container: HTMLElement)
  setGrain(on: boolean): void; setVignette(amount: number): void
  setMotionBlur(amount: number, dirX: number, dirY: number): void   // used by CameraRig during whip pans
  render(): void; resize(): void
  pick(clientX: number, clientY: number, objects: THREE.Object3D[]): THREE.Intersection[]
}
```
sRGB output, ACES filmic tone mapping (exposure 1.0), PCF soft shadows (2048 map on the key light). Post pass: fullscreen quad with a small GLSL shader doing grain (animated, luminance-weighted, subtle), vignette, and directional blur; render to an RGBA half-float target when available.

### scene/materials.ts

```ts
export function seeded(seed: string): () => number                 // mulberry32
export function labelTexture(o: { text?: string; lines?: string[]; font?: 'sans' | 'mono'; size?: number; weight?: number; color: string; bg: string; width?: number; height?: number; padding?: number; align?: 'left' | 'center' | 'right'; letterSpacing?: number; uppercase?: boolean; lineHeight?: number; border?: string }): THREE.CanvasTexture
export function woodTexture(o: { base: string; grain: string; scale?: number; seed?: string; size?: number }): THREE.CanvasTexture
export function feltTexture(color: string, seed?: string): THREE.CanvasTexture
export function paperTexture(color: string, seed?: string): THREE.CanvasTexture
export function plasterTexture(color: string, seed?: string): THREE.CanvasTexture
export function wallpaperTexture(o: { pattern: 'stripe' | 'lattice' | 'dots' | 'damask' | 'chevron' | 'fleur' | 'plain'; bg: string; fg: string; scale?: number; repeat?: [number, number] }): THREE.CanvasTexture
export function tileTexture(o: { a: string; b: string; grout: string; repeat?: [number, number] }): THREE.CanvasTexture
export const mat: {
  wood(o: { base: string; grain: string; seed?: string; repeat?: [number, number] }): THREE.MeshStandardMaterial
  felt(color: string): THREE.MeshStandardMaterial
  lacquer(color: string): THREE.MeshPhysicalMaterial      // clearcoat, low roughness
  brass(): THREE.MeshStandardMaterial; steel(): THREE.MeshStandardMaterial
  paper(color: string): THREE.MeshStandardMaterial
  plaster(color: string): THREE.MeshStandardMaterial
  wallpaper(o: Parameters<typeof wallpaperTexture>[0]): THREE.MeshStandardMaterial
  velvet(color: string): THREE.MeshStandardMaterial
  glass(tint?: string): THREE.MeshPhysicalMaterial
  flat(color: string): THREE.MeshStandardMaterial          // matte painted
  enamel(color: string): THREE.MeshStandardMaterial
}
```
All are memoized by argument key.

### scene/text3d.ts

```ts
export function placard(o: { lines: string[]; width: number; height: number; bg: string; color: string; font?: 'sans' | 'mono'; border?: string; size?: number }): THREE.Mesh   // plane, double sided, name 'placard'
export function tag(text: string, o?: { color?: string; ink?: string }): THREE.Group   // luggage tag with brass eyelet and string
export function bookSpine(title: string, o: { color: string; ink: string; height: number; thickness: number; depth: number }): THREE.Mesh
export function sign(o: { text: string; width: number; bg: string; color: string; depth?: number }): THREE.Group   // painted board sign
```

### scene/lights.ts

`export function lightRig(region: RegionId, center: THREE.Vector3): THREE.Group` — key (warm, shadows), fill, hemisphere; per-region temperature from palette.

### scene/camera.ts

```ts
export class CameraRig {
  constructor(camera: THREE.PerspectiveCamera, stage: Stage)
  current: CameraStation
  jump(st: CameraStation): void
  goTo(st: CameraStation, via: Transition, ms?: number): Promise<void>
}
```
Defaults: whip 420ms (`ease.whip`, motion blur peaks mid-way, camera yaws through the transition and lands exactly on the station), dolly 900ms (`ease.inOutCubic`, straight line), lift 1100ms, push-in/pull-out 800ms, cut 0ms. Emits `audio:sfx` whip/dolly/lift.

### scene/board.ts, pieces.ts, boardView.ts

Board in world units: square 1.0, board 8×8 centered at the origin passed in, frame 0.6 wide, thickness 0.18, brass corner plates, engraved brass plate on the near frame edge (labelTexture), file/rank letters engraved on the frame, felt underside. Two felt-lined trays for captured pieces (left of White, right of Black from the seated view), each a 2×4 grid of slots.

Pieces: `buildPiece(type, color)` returns a Group named `piece` with `userData = { type, color }`. Lathe profiles per piece (tall, slightly narrower than Staunton), felt base disc, a painted band (society colour) at the collar. Knight: lathe base + a head built from a few extruded/boxed segments (silhouette matters more than detail). King: cross of two thin boxes. Queen: coronet of small spheres.

```ts
export class BoardView {
  constructor(stage: Stage, parent: THREE.Object3D, origin: THREE.Vector3, playerColor: Color)
  stations: { overhead: CameraStation; seated: CameraStation; side: CameraStation }
  sync(position: Position): void
  animateMove(move: MoveRecord): Promise<void>
  highlight(selected: Square | null, legal: Square[], lastMove?: { from: Square; to: Square }, check?: Square | null): void
  setInteractive(on: boolean): void
  onSquare(handler: (sq: Square) => void): void
  hoverSquare(clientX: number, clientY: number): Square | null
  setPlayerColor(c: Color): void
  dispose(): void
}
```
Move choreography (all via `clock.tween`): lift 140ms (outCubic, 0.35 up), travel (slide 260ms for sliders; knight arcs over, 340ms), settle 120ms (outBack, a 0.02 dip) with `audio:sfx place`. Capture: captured piece lifts, travels to the next free tray slot (500ms), receives a paper tag with its name ("BISHOP, BLACK — c8"). Castling: king then rook, rook starts 80ms after the king. Promotion: pawn sinks into the square while the new piece rises. Check: a single soft bell. Checkmate: `clock.slowMotion(0.25, 1200)` while the mated king tips over 90° onto its side (600ms).

### world/frames.ts

```ts
export interface BuiltFrame { id: string; group: THREE.Group; hotspots: Map<string, THREE.Object3D>; residentAnchor?: THREE.Object3D }
export interface BuildContext { def: FrameDef; origin: THREE.Vector3; region: RegionPalette; rnd: () => number }
export type FrameBuilder = (ctx: BuildContext) => BuiltFrame
export const builders: Map<string, FrameBuilder>            // populated by world/builders/index.ts
export function buildAll(scene: THREE.Scene, frames: FrameDef[], layout: Record<string, [number, number, number]>): Map<string, BuiltFrame>
export function stationOf(def: FrameDef, layout): CameraStation   // camera relative to origin → world
```
Hotspot meshes: any Object3D with `userData.hotspot = <id>`; the builder registers it in `hotspots`. A hotspot should be the object itself (the telescope, the door) so the hover outline reads correctly.

### world/navigator.ts

```ts
export class Navigator {
  constructor(stage: Stage, rig: CameraRig, frames: FrameDef[], layout, built: Map<string, BuiltFrame>)
  current: FrameDef
  goto(frameId: string, via?: Transition): Promise<void>   // ui:title on first visit (from def.card), world:enter, audio:music, letterbox
  enable(on: boolean): void                                // pointer handling: hover label + cursor; click → world:inspect / goto / ui:mode converse / ui:mode board
}
```

### world/props.ts

Furniture library. Every prop is `(o: Options) => THREE.Group`, dimensions in meters, origin at the floor centre, `castShadow`/`receiveShadow` set, materials from `mat.*`, colors from options (never hard-coded). At least: `floor, wall, wainscot, cornice, doorway, door, window (with a lit pane), radiator, rug, table, desk, diningTable, chair, armchair, stool, bench, bed, bookshelf(titles), book, lampFloor, lampTable, sconce, chandelier, pictureFrame(painted abstract: mountain / sea / portrait silhouette), mirror, plant, trunk(monogram), suitcaseStack, telephone, typewriter, telescope, globe, recordPlayer, wallClock, mantelClock, fireplace, staircase, ladder, curtain, tile, sign, lamppost, fence, tree, hedge, snowGround, funicularCar, stationClock, letterbox, bicycle, boat, tent, flagpole, cabinet, drawers, teaSet, chessTableSmall`.

### audio

```ts
export const audio: {
  init(): void                          // on first user gesture; safe to call repeatedly
  sfx(name: SfxName, velocity?: number): void
  music(theme: string | null): void     // crossfade 1.2s
  setEnabled(o: { sound?: boolean; music?: boolean }): void
}
```
Subscribes to `audio:sfx`, `audio:music`, `settings:change`, `time:scale` (music slows with slow motion). Instruments: music box (sine + 3rd/5th partials, 1.8s decay, slight detune), plucked string (Karplus-Strong), harpsichord (bright saw through lowpass, 0.4s), soft bass, brushed noise, vibraphone. Themes: `title, boardroom, house, outside, beyond, mate`. Sfx synthesized: wood clicks are filtered noise bursts + short sine thump; slide is bandpassed noise with a swell; bell is a struck FM tone; typewriter is a click pair; whip is a fast noise sweep.

### ui

```ts
export class UI {
  constructor(root: HTMLElement)
  title(o: { chapter?: string; title: string; subtitle?: string; holdMs?: number }): Promise<void>
  card(card: CardDef | null): void
  hoverLabel(text: string | null, x?: number, y?: number): void
  toast(text: string): void
  letterbox(aspect?: number): void
  mode(mode: UiMode): void
  hud: { setClocks(c: ClockState): void; setLedger(moves: MoveRecord[]): void; setStatus(text: string): void; setThinking(on: boolean): void; setCaptured(byWhite: PieceType[], byBlack: PieceType[]): void }
  converse: { open(persona: CharacterDef, contextProvider: () => Promise<string | undefined>): void; close(): void; isOpen: boolean }
  menu: { open(o: { items: { id: string; label: string; hint?: string; disabled?: boolean }[]; title?: string; onPick(id: string): void }): void; close(): void }
  boardControls: { show(o: { onView(v: 'overhead' | 'seated' | 'side'): void; onSecond(): void; onResign(): void; onDraw(): void; onUndo(): void; onStandUp(): void }): void; hide(): void }
}
```
The UI subscribes to `ui:*`, `game:*`, `world:*`, `chapter:unlock`, `settings:change`. The conversation panel streams via `api/second.ts` and keeps history in `store.conversation(personaId)`. Error states use in-world copy from `content/copy.ts`.

DOM only, CSS in `src/ui/styles.css`, typeface Jost for everything except typed cards (Courier Prime). Everything centred and symmetric; letterspaced small caps for labels; rules (hairlines) rather than boxes; no drop shadows except the paper cards' single hard offset shadow.

### api/second.ts

```ts
export async function health(): Promise<Health>
export async function converse(req: ConverseRequest, onDelta: (text: string) => void, signal?: AbortSignal): Promise<{ text: string; costUsd?: number }>
```
POST `/api/converse` with JSON, read the SSE body (`data: <ConverseEvent JSON>\n\n`).

### server

`GET /api/health` → `Health` (probe `claude --version` once, cache 60s; `cli:false` with a reason when missing). `POST /api/converse` → SSE of `ConverseEvent`. Spawn:

```
claude -p <prompt> --model <model> --output-format stream-json --include-partial-messages --verbose
       --system-prompt <persona.systemPrompt + "\n\n" + context> --tools "" --no-session-persistence
       --max-budget-usd 1.00 --permission-mode dontAsk
```
Pass the prompt on stdin (not argv) to avoid length limits. The prompt is the transcript: last 24 messages formatted as `Player: …` / `<Name>: …`, ending with the newest player line and `\n<Name>:`. Parse each stdout line as JSON; forward `stream_event.content_block_delta.text_delta.text` as `delta`; the final line with `total_cost_usd` → `done`. Kill after 120s. Strip `CLAUDECODE`, `CLAUDE_CODE_ENTRYPOINT` from the child env. Personas come from `src/content/characters.ts` (pure data). In production (`NODE_ENV=production`) also serve `dist/` with correct MIME types and SPA fallback.

### content

`palette.ts` exports `RegionPalette` (`ground, wall, wallAlt, trim, accent, accent2, ink, paper, brass, felt, wood, woodGrain, light`) per `RegionId` plus `ui` tokens; `laws.ts` (`Law[]`), `copy.ts` (every UI string), `chapters.ts` (`ChapterDef[]`), `eggs.ts` (`EggDef[]`), `characters.ts` (`CharacterDef[]`, includes the Second with id `second`), `frames/index.ts` (`frames: FrameDef[]`, `layout: Record<string, [number, number, number]>`, `START_FRAME`, `BOARD_FRAME`).

Camera stations in `FrameDef` are relative to the frame origin in `layout`. House rooms are 7 wide × 4.2 high × 6 deep (interior), on a grid with 7.4m pitch horizontally and 4.6m vertically, open toward +z (the camera side). Outside and beyond frames sit at z ≤ -30 or x ≥ 40 so they never appear behind the house.

### main.ts

Boot order: `loadFonts()` → `new Stage()` → `buildAll()` → `new BoardView()` at the board frame's table position → `new UI()` → `new Game()` → `audio.init()` on first pointerdown → title card → menu. Wires: hotspot kind `board` → push-in to the seated station, `ui:mode board`; "stand up" → back to the room station; resident → `ui.converse.open` with a context provider giving the position brief when the persona is the Second, else the current frame + discoveries. Exposes `window.__cc = { goto, mode, game, ui, nav, ready }` for scripted screenshots.

---

## Bible supersedes (numbers that changed after docs/BIBLE.md landed)

- Whip pan 350 ms (easeInQuart to 60 %, hard stop, 100 ms blur, silent). Dolly 900 ms linear with 40 ms in / 60 ms out. Lift 1100 ms linear with 60 ms each end. Section 1400 ms. Table → Chart 1100 ms with a focal ramp 22 → 80 mm.
- Frame budget 150k triangles and 300 draw calls; one shadow-casting light, fitted to the active room; none outdoors.
- Hover moves nothing (Law of hover, bible §11): no lift, scale, glow or outline on hover. The rim words warm; the card appears at the bottom of the frame. Doors and objects show their label only.
- Lenses are focal lengths at `camera.filmGauge = 35`: room 40, table 22, chart 80, profile 35, telescope 135, section 40. `FrameDef.lens` and `CameraStation` stations carry them; the CameraRig ramps focal length during a transition when the destination differs.
- Letterbox 1.85:1 in the house and outside, 2.40:1 on the grid; matte `#141412`, surround `#1A1917`; the matte closes over 900 ms.
- Slow motion is spent through `spendSlowMotion(reason)` in `src/station/season.ts`, reasons `checkmate | photograph | lasttide | crating` only.
- Music obeys the inventory rule (bible §10): harmonium, ship's bell, the Olivetti, the Predictor's pulleys, the clock, Record 4. Themes: `survey` (once), `emptychair`, `slackwater` (held fifth while the gauge is level), `path` (no cue: shell underfoot, wind, Record 4 faint), `grid` (wind and channel), `house` (room tone only). No other instruments.

## Station layer (`src/station/`)

The station layer turns the modules into the game. It owns the season, the chapters, the grid, the Second, the ledger and the expedition controller. It talks to the scene and the UI through the bus and through the facades passed to it by `main.ts`.

### station/season.ts

```ts
export class SeasonClock {
  constructor()                                  // reads store.ledger.season
  season: Season                                 // live object (same reference as store.ledger.season)
  start(): void                                  // ticks on clock.onTick with wall time
  clockLabel(): string                           // 'HH:MM' station time at 57.6×
  isDusk(): boolean                              // watch 3 (16:00–20:00)
  tideHeight(): number                           // 0..1
  crossable(): boolean
  secondsToWindowChange(): number
  advanceDay(): void                             // after a finished game: date + 1, watch 0, emits season:change and, in Chapter Seven, crates one object
  spendSlowMotion(reason: 'checkmate' | 'photograph' | 'lasttide' | 'crating', ms: number): Promise<void>   // 0.4×; throws on any other reason in dev
}
```
Emits `season:change` at most once a second, `tide:window` when the crossable state flips (and 90 s before it closes: three bell strikes via `audio:sfx bell` ×3, 900 ms apart, from the house), `reading` when 05:20 or 17:50 passes (text from `content/station.ts`). Persists via `store.save()` every 10 s.

### station/chapters.ts

```ts
export class ChapterEngine {
  constructor(season: SeasonClock)
  current(): number
  isFrameOpen(frameId: string): boolean          // lockedUntilChapter and chapter unlock lists
  requirementMet(r?: Requirement): boolean       // chapter, warrant, lowWater, watches, gamesFinished
  check(): void                                  // evaluates every chapter's triggers (games finished, frames visited, residents spoken, date, grid square reached, card carried); unlocks in order, one per call
  unlock(n: number): Promise<void>               // ui:title with the Recorder's card (chapter, title, sentence), audio survey theme, store.mark('chapters')
}
```
Chapter One unlocks at start (its card is the first thing seen after the menu). Nothing is gated by winning.

### station/grid.ts

```ts
export class GridWalk {
  constructor(season: SeasonClock)
  square: Square | null
  warrants(): Warrant[]
  legalIslets(): Square[]                        // king: one islet any direction; rook: straight lines; bishop: diagonals (union over granted warrants); h-file closed before Chapter Eight
  moveTo(sq: Square): Promise<void>              // chart cut, pin travel 0.5 s per islet, cut to the islet stage; emits grid:move; marks visited; heron/eider/cinder are their own frames
  readPlate(): void                              // marks platesRead, ledger:line "Cairn c4 (Cinder Reach) read.", SURVEYOR badge at 16
  dressing(sq: Square): { flaw: number; object: number }   // hash(square) mod 4 / mod 6; fixed for a1, c6, e4, h8
  cairnTags(sq: Square): CairnTag[]
  tideCameIn(): Promise<void>                    // the return in the dinghy, ledger line, back to the jetty
}
```

### station/second.ts

```ts
export class SecondService {
  constructor(game: Game, season: SeasonClock)
  packet(mode: SecondMode, question?: string): Promise<string>   // bible §5.11: STATION REPORT block from analysis.brief + season + book + rating; runs a 600 ms eval on the soundings engine and, when time allows, a 2-line multi-PV
  ask(question: string, onDelta): Promise<string>                // mode DISCUSSION or FEEDBACK by heuristics (a question about the position → FEEDBACK)
  onMove(move, brief): void                                      // trigger policy: player's move with a swing > 1.5 pawns, the first non-book move, a queen capture, game end → REMARK into the ledger (ledger:remark) or POST-MORTEM at game end; never during the chair's move; ≤ 1 spawn per 10 plies
  remarkNow(): Promise<void>
}
```
Persona id `brace`. The packet is passed as `ConverseRequest.context`; the server appends it after the persona. The mode line and the question are the last two lines of the packet.

### station/ledger.ts

```ts
export interface LedgerRow { kind: 'header' | 'move' | 'line' | 'crate' | 'result' | 'leader'; ply?: number; text: string; islet?: string; remark?: string; san?: string; color?: Color; moveNumber?: number }
export class LedgerRoll {
  rows: LedgerRow[]                              // persisted in store.ledger.rows (add the field) with the leader lines fixed at the top
  startExpedition(n: number, watch: WatchId, seaState: SeaState, date: string): void
  move(move: MoveRecord, thinkMs?: number): void // adds the islet and rule remarks ("first return", "flag U hoisted", "the chair thought for 1.9 s")
  remark(ply: number, text: string): void
  line(text: string): void
  result(text: string): void
  pgnOfExpedition(n: number): string
}
```
The HUD renders rows (extend `hud.setLedger` to accept `LedgerRow[]`; the UI's move-list renderer stays for the SAN columns).

### station/expedition.ts

```ts
export class Expedition {
  constructor(game: Game, boardView: BoardView, season: SeasonClock, ledger: LedgerRoll, second: SecondService, ui: UI)
  begin(o?: { pgn?: string; clocks?: ClockState; houseGame?: boolean }): Promise<void>   // sea state → level/time via content/seaStates; watch → minutes/increment via content/watches; player is the light side unless houseGame (Black, sea state 5)
  playerMove(input: MoveInput): Promise<void>    // pins, glide, then the chair's move by davit with chairBudgetMs; clocks stop on clamp; inserts through ui
  resign(): Promise<void>; offerDraw(): Promise<void>; adjourn(): void   // adjourn = save (the log is the save file) and leave the board
  end(status): Promise<void>                     // flags, ledger result, rating update, season.advanceDay(), cairn tags from captures, game counts in store, Chapter checks
}
```
Rules of the room: after a transition the board accepts input only after 500 ms; after mate or resignation 2400 ms. The chair never moves while a piece is gliding. The player's own moves never get slow motion.

### main.ts (boot, revised)

`loadFonts()` → `assertPalette()` → `new Stage()` → `buildAll(frames, layout)` → `new BoardView(stage, boardroomGroup, boardCentreWorld, 'w')` → `new UI(root)` → `audio.init()` on first pointerdown → `new SeasonClock()`, `ChapterEngine`, `GridWalk`, `LedgerRoll`, `Game`, `SecondService`, `Expedition`, `Navigator` → `renderer.compile()` behind the title → menu (BEGIN THE SEASON / CONTINUE … / THE LEDGER / THE ROSTER / THE STANDING ORDERS) → Chapter One card → the Board Room station. Keys: 1/2/3 table/chart/profile; 0 section (from the landing); S consult; Escape closes cards; arrows follow doors. `window.__cc = { goto, mode, game, ui, nav, season, chapters, grid, expedition, ready }`.
