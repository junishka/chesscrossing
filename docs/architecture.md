# Architecture

Chess Crossing is a single web application with a small local server. The browser holds the frame, the board, the engine, the world, and the narrator panel. The server holds only the narrator's connection to the language model and its conversation memory.

## Layout

```
index.html                 The single page. The frame module owns the <head> fonts block.
src/main.ts                The app shell. Wires modules together. Owns the game loop.
src/contracts/             Shared types and the event bus. The only cross-module imports allowed.
src/frame/                 Stage, palette, typography, cards, captions, dossiers, motion.
src/board/                 chess.js game state, SVG board and figurines, input, ledger, tray, promotion.
src/engine/                Stockfish 19 lite in a Web Worker. Best move and evaluation.
src/narrator/              The narrator panel. Text reveal, input, SSE client, event policy.
src/world/                 The inventory (rooms, objects, doors, the set, the household) and the room scene renderer.
server/index.ts            Node http server. Vite middleware in development, dist/ in production.
server/router.ts           A small router, JSON body reader, server-sent events helper.
server/config.ts           Environment and .env.
server/narrator/           Language model adapter (Anthropic SDK, Claude CLI, mock), prompt assembly, session memory, routes.
public/engine/             Stockfish files copied on postinstall. Gitignored.
docs/                      brief, bible, voice, system-prompt, visual, architecture.
```

## Rules of the codebase

1. Modules import only from `src/contracts` and from their own directory, with two exceptions: `src/board`, `src/world`, and `src/narrator` may import from `src/frame` (the design system), and `src/main.ts` imports everything.
2. Modules communicate through the event bus (`src/contracts/events.ts`). A module emits what happened. It does not call another module to make something happen. The app shell holds the few pieces of policy that need more than one module (the game loop, when to consult the engine, what context to hand the narrator).
3. Every visual constant comes from the frame's CSS custom properties, which are set per room from the room's palette. No module hard-codes a color.
4. Everything the player reads comes from `docs/bible.md` through `src/world/data`. No module invents a caption.
5. The narrator never plays moves. The server never receives a move to make. The engine never speaks.

## The game loop (app shell)

1. The stage shows the title cards, then the chapter card for room one, then whip-pans into the room.
2. The world renders the room scene and exposes slots. The board mounts into `board`, `ledger`, `tray`. The narrator panel mounts into `narrator`.
3. `game:new` starts a game. If the player is Black, the app asks the engine for a move.
4. On `game:move` by the player, the app asks the engine to evaluate the new position (to classify the move) and then for the opponent's best move at the chosen strength, and applies it with `board.applyMove(uci, 'opponent')`.
5. On `game:move` by the opponent, the app evaluates again and emits `game:eval`.
6. The narrator panel listens to the bus and decides, through its policy, which events deserve a word. Most do not.
7. `game:over` locks the board. The narrator is told which ending it was.
8. `door:tried` on a locked door tells the narrator. `player:leave-room` is reserved for later chapters.

## Evaluation and classification

The engine reports centipawns from White's point of view. The app converts the change caused by the last move into the mover's point of view and classifies it. Thresholds live in `src/main.ts` and are deliberately generous at low strengths: the point is a narrator with something to say about a real blunder, not a coach.

| swing (mover's view) | classification |
| --- | --- |
| below -300 cp, or a lost forced mate | blunder |
| -300 to -120 | mistake |
| -120 to -50 | inaccuracy |
| -50 to +50 | good |
| better than the engine's own choice by margin, or a found mate | excellent |

## Narrator protocol

`POST /api/narrator/stream` with a `NarratorRequest` body opens a server-sent events stream of `NarratorStreamEvent`. The server keeps conversation history per `sessionId` in memory, trimmed to the last N turns. The system prompt is `docs/system-prompt.md` with the world facts; the current state (FEN, last moves, room, what is being inspected) is appended to each user turn under a "Current state" heading, so it is never cached as part of the prefix and never stale.

The model may answer an event with the silence token (`src/contracts/narrator.ts`). The server converts that to `{ type: 'done', text: '', silent: true }` and the panel shows the silence mark from the world.

Backends:

- `anthropic`. `@anthropic-ai/sdk`, streaming, model from config (default `claude-opus-5-5`), effort from config (default `low`). Server-side refusal fallbacks enabled by default. Prompt caching on the system prompt.
- `cli`. Spawns `claude -p --output-format stream-json --include-partial-messages --tools "" --no-session-persistence --model ... --effort ... --system-prompt ...` and forwards text deltas. History is replayed by the server, not by the CLI's own session store, so the two backends behave the same.
- `mock`. Picks lines from `docs/voice.md` by trigger. No network.

## Engine

`public/engine/stockfish-19-lite-single.js` is loaded as a classic Worker. It finds its `.wasm` next to itself, accepts UCI command strings through `postMessage`, and posts output lines back. Strength maps to `Skill Level` and think time. Evaluation uses a short fixed-depth search and parses the last `info ... score cp|mate` line.

## Building and running

```
npm install          # also copies the engine into public/engine
npm run dev          # http://localhost:3000, Vite HMR through the Node server
npm run typecheck
npm test
npm run build && npm start
```

Copy `.env.example` to `.env` to choose a narrator backend. Without credentials, use `NARRATOR_BACKEND=mock`.
