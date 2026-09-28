# Chess Crossing. Design brief

Repository: /home/user/chesscrossing (empty, branch main). Project name chosen by the owner: "Chess Crossing" (repo `chesscrossing`). Interpret the name; do not treat it as decoration.

## What we are making

A high-end, aesthetic chess game that is a little more than chess. Two modes, one world.

1. Chess. You play a beautiful, correct game of chess against an in-world opponent (engine-driven moves, Stockfish). A narrator (an LLM, Claude Opus 5.5) watches, comments when asked, discusses the position, and talks with you.
2. Exploration. When you tire of the game, you leave the chess room and explore the house, then the grounds, then a strange small world. Every room is a chapter. Every object has a caption. You can talk with the narrator about anything in the world, including philosophy.

The whole thing is governed by the laws of Wes Anderson's work. Not his props. His convictions.

## The rule that matters most: essence, not caricature

Caricature is the "Accidentally Wes Anderson" look: pastel facades, symmetry as a filter, quirk with nothing underneath, a Zissou beanie, a Mendl's box, a character saying something whimsical. We refuse all of it.

Essence is the set of convictions that generate his surfaces:

- Composition as a moral position. His characters arrange the frame because they cannot arrange their lives. Symmetry is control against grief. Planimetric staging (camera at 90 degrees to the wall), centered subjects, lateral tracking, whip pans, overhead insert shots of hands and objects, cross-section dollhouse views (the Belafonte, the Darjeeling train, 111 Archer Avenue).
- Everything has a caption. Inventories, labels, chapter cards, dossiers, maps, badges, monograms, filing systems. Taxonomy is how his people love things. The list is a form of tenderness.
- Melancholy under the order. Absent or failed fathers, precocious children, estranged siblings, a death nobody discusses directly, a mentor who is a little bit of a fraud and knows it. The whimsy is armor. Nothing is stated as tragedy. The sadness is in the inventory.
- Deadpan. Short declarative sentences. Precise, slightly formal vocabulary. Feelings stated flatly and briefly rather than performed. Politeness as a form of desperation. Silence is allowed.
- Nested frames. A story inside a book inside a memorial (Grand Budapest). A play inside a broadcast (Asteroid City). A magazine (French Dispatch). The work announces that it is a made thing.
- Handmade artifice, acknowledged. Miniatures, matte paintings, stop motion, paper. Analog technology: typewriters, telegrams, record players, binoculars, filing cabinets, Polaroids, hand-drawn maps.
- Institutions with rituals and rules. Khaki Scouts, the Society of the Crossed Keys, Rushmore's clubs, Team Zissou. Uniforms, oaths, handbooks, ranks.
- Fictional geographies with real texture. Zubrowka, New Penzance, Ennui-sur-Blasé, Asteroid City. Invented places with plausible bureaucracy and history.
- One disciplined palette per film, not "pastel". Grand Budapest is plum, pink, red, and a cold blue; Moonrise is khaki, mustard, and forest green; Tenenbaums is pink, red, and mustard against dark wood; Life Aquatic is red and blue against pale teal; Fantastic Mr Fox is autumnal ochre. Choose one palette per room, five or six colors, and hold it.
- Typography as staging. Futura (we use Jost as the free substitute), tracked out, centered, in title cards, chapter numbers, intertitles, captions, and the occasional Archer or Didot-like serif for a book or letter. Handwritten letters and notes.
- His sources, which are the better place for easter eggs than his films: Truffaut, Godard, Satyajit Ray, Louis Malle, Hal Ashby, Ozu (planimetric), Kubrick (symmetry), Hitchcock, Buñuel, Hergé's clear line, Schulz's Peanuts, Stefan Zweig, Roald Dahl, Jacques Cousteau, J. D. Salinger, The New Yorker, Eric Chase Anderson's illustrations, British Invasion and French pop records.

An easter egg that is a prop from a film is a caricature. An easter egg that is a structural or tonal echo (a chapter card in the right rhythm, a letter read aloud in voiceover, an inventory that hides a grief, a father's coat that still hangs by the door, a book by Zweig on the shelf) is essence. Film references are permitted only when disguised, structural, or so specific that only a devotee would notice, and even then they should be a minority.

## Chess in this world

Chess is already Andersonian. Symmetrical, rule-bound, catalogued, played by people who state their feelings flatly. Do not turn the pieces into costumed characters from his films. Pieces are handmade figurines. Each may have a name and a two-line dossier (like a Khaki Scout roster). The move list is a typewritten ledger. Captured pieces go into a labelled tray. The opponent is a resident of the house whose moves are Stockfish and whose few words are the LLM.

The narrator never plays moves. It talks.

## The narrator

One persona, fixed. The biggest pastiche risk in the entire project is this voice. It must be deadpan, precise, past-tense-capable in the way of the Tenenbaums narrator ("He played the knight to f3. It was, by all accounts, reasonable."), never whimsical, never gushing, never using quirky adjectives, never winking. It can be gently sad. It can be funny by being exact. It knows the house, the family, the game.

## Technical constraints (fixed, do not redesign)

- Web app, TypeScript, Vite, strictly 2D, DOM and SVG. Planimetric frames only. No perspective, no 3D.
- Jost (Google Fonts) as Futura substitute. One serif permitted for letters and books.
- chess.js for rules, Stockfish 19 WASM in a Web Worker for the opponent, selectable strength.
- LLM through a small local Node server. Backend adapter: Anthropic SDK (default) or the Claude CLI in print mode. Model claude-opus-5-5. Streaming to the browser.
- Phase one scope: title card sequence, then the chess room only. Board, opponent, ledger, tray, dossiers, a handful of objects in the room with captions, the narrator panel, doors to other rooms visible but locked with a caption. The narrator answers questions about the game and the world.
- Later phases: the rest of the house (cross-section), the grounds, the strange world beyond.

## What good looks like

If a person who loves the films plays phase one for ten minutes, they should feel the films without being able to point at a single borrowed object. They should notice the sadness by minute eight. They should want to open the locked doors.
