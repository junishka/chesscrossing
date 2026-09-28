# Chess Crossing

A chess game that is a little more than chess.

You play against a resident of the house. A narrator watches, and will talk if you ask. When you tire of the game, there are doors.

See `docs/brief.md` for what this is, `docs/bible.md` for the world, `docs/visual.md` for how it looks, `docs/voice.md` for how the narrator speaks, and `docs/architecture.md` for how it is built.

## Running

```
npm install
cp .env.example .env    # choose a narrator backend
npm run dev             # http://localhost:3000
```

The narrator needs either an Anthropic API key, a `claude` login (the CLI backend), or `NARRATOR_BACKEND=mock` for canned lines.

## Credits

Stockfish 19 (GPLv3) via stockfish.js by Nathan Rugg and Chess.com. chess.js by Jeff Hlywa. Jost by indestructible type*.
