# Chess Crossing

A chess game that is a little more than chess, governed by the laws in `docs/bible.md`.

## Read first

- `docs/brief.md`   what this is and the one rule that matters (essence, not caricature)
- `docs/bible.md`   the world. Canon. Every word the player reads comes from here, verbatim.
- `docs/visual.md`  how everything looks and moves. Law for anything visible.
- `docs/voice.md`   how the narrator speaks. Law for anything the narrator says. `docs/system-prompt.md` is the runtime prompt.
- `docs/architecture.md`  modules, contracts, the event bus, the game loop, the narrator protocol.

## Commands

```
npm install          copies the Stockfish engine into public/engine on postinstall
npm run dev          http://localhost:3000, Vite through the Node server
npm run typecheck    client and server
npm test             vitest; DOM tests start with // @vitest-environment happy-dom
npm run build && npm start
node scripts/fetch-fonts.mjs "Family:ital,wght@0,400"   self-host a Google Fonts family
```

Narrator backends are chosen in `.env` (see `.env.example`). `NARRATOR_BACKEND=mock` needs no credentials. The `cli` backend spawns `claude` with `CLAUDECODE` removed from its environment.

## Rules of the codebase

1. Modules (`src/frame`, `src/board`, `src/engine`, `src/world`, `src/narrator`, `server/narrator`) import only from `src/contracts` and their own directory. `board`, `world`, and `narrator` may also import from `src/frame`. Only `src/main.ts` and `src/app` import everything.
2. Modules communicate through the event bus in `src/contracts/events.ts`. Policy that spans modules lives in `src/app`.
3. No color outside `src/frame/tokens.css`. Every size in stage units (`--u`). No frameworks. DOM and SVG by hand.
4. Nothing the player reads is invented in code. It comes from `src/world/data`, which comes from the bible.
5. The narrator never plays moves. The engine never speaks.
6. No emojis. No exclamation marks in player-facing text. The words whimsical, quirky, charming, and delightful appear nowhere.
7. Never name Wes Anderson or any film inside the world (code, copy, captions, prompts). The influences are documented in `docs/brief.md` and the easter egg registry in the bible only.
8. The model for the narrator is `claude-opus-5-5`. Thinking cannot be disabled on it, so no `thinking` parameter is sent; depth is controlled with `output_config.effort`.
