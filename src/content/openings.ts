// The book: twelve lines of eight plies with their ECO names, docs/BIBLE.md §5.3. Pure data.

/** One book line: ECO code, name, eight plies in SAN. */
export interface BookLine {
  eco: string
  name: string
  sanMoves: string[]
}

/** Splits `1. e4 e5 2. Nf3 ...` into SAN plies. */
function plies(line: string): string[] {
  return line.replace(/\d+\.\s*/g, ' ').trim().split(/\s+/)
}

/** The twelve lines, in the bible's order. */
export const openings: BookLine[] = [
  { eco: 'C65', name: 'Ruy Lopez, Berlin', sanMoves: plies('1. e4 e5 2. Nf3 Nc6 3. Bb5 Nf6 4. O-O Nxe4') },
  { eco: 'C50', name: 'Giuoco Piano', sanMoves: plies('1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Nf6') },
  { eco: 'C45', name: 'Scotch', sanMoves: plies('1. e4 e5 2. Nf3 Nc6 3. d4 exd4 4. Nxd4 Bc5') },
  { eco: 'B90', name: 'Sicilian, Najdorf', sanMoves: plies('1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6') },
  { eco: 'B22', name: 'Sicilian, Alapin', sanMoves: plies('1. e4 c5 2. c3 d5 3. exd5 Qxd5 4. d4 Nf6') },
  { eco: 'C02', name: 'French, Advance', sanMoves: plies('1. e4 e6 2. d4 d5 3. e5 c5 4. c3 Nc6') },
  { eco: 'B12', name: 'Caro-Kann, Advance', sanMoves: plies('1. e4 c6 2. d4 d5 3. e5 Bf5 4. Nf3 e6') },
  { eco: 'D37', name: "Queen's Gambit Declined", sanMoves: plies('1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Nf3 Be7') },
  { eco: 'D10', name: 'Slav', sanMoves: plies('1. d4 d5 2. c4 c6 3. Nf3 Nf6 4. Nc3 dxc4') },
  { eco: 'E60', name: "King's Indian", sanMoves: plies('1. d4 Nf6 2. c4 g6 3. Nc3 Bg7 4. e4 d6') },
  { eco: 'E20', name: 'Nimzo-Indian', sanMoves: plies('1. d4 Nf6 2. c4 e6 3. Nc3 Bb4 4. e3 O-O') },
  { eco: 'A10', name: 'English', sanMoves: plies('1. c4 e5 2. Nc3 Nf6 3. g3 d5 4. cxd5 Nxd5') },
]

/** The book's depth in plies. */
export const BOOK_PLIES = 8

/** What the packet says about the book. */
export interface BookMatch {
  /** ECO of the line followed longest; empty when no line was entered. */
  eco: string
  /** Name of that line; empty when no line was entered. */
  name: string
  /** True while every ply played so far is in some line. */
  inBook: boolean
  /** The 1-based ply of the first non-book move, when the game has left the book. */
  leftAtPly?: number
  /** The move number of the first non-book move, when the game has left the book. */
  leftAtMove?: number
}

/** Strips check and mate marks so `Bxf7+` matches `Bxf7`. */
function bare(san: string): string {
  return san.replace(/[+#]/g, '')
}

/**
 * Finds the book line the game followed longest. The first ply off any line is the first
 * non-book move; a game that never enters the book leaves it at ply 1 (move 1).
 */
export function findBook(sanMoves: string[]): BookMatch {
  let best: BookLine | undefined
  let bestLen = 0
  for (const line of openings) {
    let n = 0
    while (n < line.sanMoves.length && n < sanMoves.length && bare(sanMoves[n]) === line.sanMoves[n]) n++
    if (n > bestLen) { bestLen = n; best = line }
  }
  const inBook = bestLen === sanMoves.length && (sanMoves.length === 0 || best !== undefined)
  if (inBook) return { eco: best?.eco ?? '', name: best?.name ?? '', inBook: true }
  const leftAtPly = bestLen + 1
  return { eco: best?.eco ?? '', name: best?.name ?? '', inBook: false, leftAtPly, leftAtMove: Math.ceil(leftAtPly / 2) }
}
