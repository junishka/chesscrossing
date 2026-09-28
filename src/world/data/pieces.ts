/**
 * The twelve dossiers, item 6-09, docs/bible.md section 7, verbatim. The
 * title is the bible's bold line; the body is split into the two lines of the
 * roster card so that a pencil addition ("In pencil: ...") stands on its own
 * line and the frame can set it in pencil. Where the bible writes the pencil
 * figure inline ("340 in pencil") the sentence is kept as typed.
 */
import type { PieceKey } from '../../contracts/chess'
import type { PieceDossier } from '../../contracts/world'

export const PIECES: Record<PieceKey, PieceDossier> = {
  wK: {
    key: 'wK',
    name: 'White King, e1. "The Lamp."',
    lines: ['Boxwood, 96 mm. Has not left this house since 1939.', 'Mated 211 times as of this card; 340 in pencil.'],
  },
  wQ: {
    key: 'wQ',
    name: 'White Queen, d1. "Inkstand."',
    lines: ['Boxwood, 88 mm. The lid is carved shut.', 'Exchanged for her opposite number 402 times as of this card; 617 in pencil.'],
  },
  wR: {
    key: 'wR',
    name: 'White Rooks, a1 and h1. "Home Tower."',
    lines: ['Boxwood, 70 mm. Modelled on this house.', 'The window faces the bridge on both.'],
  },
  wB: {
    key: 'wB',
    name: 'White Bishops, c1 and f1. "Seal."',
    lines: ['Boxwood, 78 mm. The die slot on the king\'s bishop is cut 2 mm deeper. Nobody knows why.', 'In pencil: the maker did.'],
  },
  wN: {
    key: 'wN',
    name: 'White Knights, b1 and g1. "Ferry."',
    lines: [
      'Boxwood, 74 mm; and pearwood, 1972, carved by A. Ostrow to the original pattern.',
      'Does not match its partner. The original is on loan.',
    ],
  },
  wP: {
    key: 'wP',
    name: 'White Pawns, a2 to h2. "Stone 1" to "Stone 8."',
    lines: [
      'Boxwood, 48 mm, marked V. Stone 4 is the most frequently moved piece in the house.',
      'Promoted twice, 1957 and 1971, both times by Mr Halm\'s opponent.',
    ],
  },
  bK: {
    key: 'bK',
    name: 'Black King, e8. "Lamp, East."',
    lines: ['Ebony, 96 mm. Modelled on the Helder desk lamp, which had a tin shade.', 'Mated 198 times as of this card; 331 in pencil.'],
  },
  bQ: {
    key: 'bQ',
    name: 'Black Queen, d8. "Inkstand, East."',
    lines: ['Ebony, 88 mm. The lid is carved open.', 'In pencil: Mr Halm says it was.'],
  },
  bR: {
    key: 'bR',
    name: 'Black Rooks, a8 and h8. "East Tower."',
    lines: ['Ebony, 70 mm. Modelled on the Helder post.', 'In pencil: now the only record of its roofline.'],
  },
  bB: {
    key: 'bB',
    name: 'Black Bishops, c8 and f8. "Seal, Helder."',
    lines: ['Ebony, 78 mm. The Helder die was square.', 'The slot is square.'],
  },
  bN: {
    key: 'bN',
    name: 'Black Knights, b8 and g8. "Ferry."',
    lines: ['Ebony, 74 mm. The same horse as white, from the same ferry.', 'It carried both ways.'],
  },
  bP: {
    key: 'bP',
    name: 'Black Pawns, a7 to h7. "Stone 1" to "Stone 8."',
    lines: ['Ebony, 48 mm, marked H. Stone 7 has a chip in the cap, 1952.', 'Mr Halm dropped it. It is recorded.'],
  },
}

/** The first card number of each piece type in the roster of thirty-two, in the bible's order. */
const FIRST_CARD: Record<PieceKey, number> = {
  wK: 1,
  wQ: 2,
  wR: 3,
  wB: 5,
  wN: 7,
  wP: 9,
  bK: 17,
  bQ: 18,
  bR: 19,
  bB: 21,
  bN: 23,
  bP: 25,
}

/**
 * Which of the thirty-two cards a piece carries. Pairs count a-side first
 * (a1 before h1, c1 before f1, b1 before g1); pawns by file, a to h. Without
 * a square the type's first card is given.
 */
export function cardNumber(key: PieceKey, square?: string): number {
  const first = FIRST_CARD[key]
  const type = key.charAt(1)
  const file = square ? square.charCodeAt(0) - 'a'.charCodeAt(0) : -1
  if (file < 0 || file > 7) return first
  if (type === 'P') return first + file
  if (type === 'R') return first + (file >= 4 ? 1 : 0)
  if (type === 'B') return first + (file >= 4 ? 1 : 0)
  if (type === 'N') return first + (file >= 4 ? 1 : 0)
  return first
}

/** Dossier names by key, for aria labels on the board. */
export function pieceNames(): Record<PieceKey, string> {
  const out = {} as Record<PieceKey, string>
  for (const key of Object.keys(PIECES) as PieceKey[]) out[key] = PIECES[key].name
  return out
}
