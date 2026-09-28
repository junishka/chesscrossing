// The game by post, Hardy v. Voss, 1961 to 1965, docs/BIBLE.md §7 (O5, O7) and §9. Validated by chess.js in test/content.test.ts. Pure data.

/** The game as written on the cards, one card per ply since 1961. Hardy White, Voss Black. */
export const CORRESPONDENCE_PGN = `1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Bxc6 dxc6 5. O-O Bg4 6. h3 Bxf3 7. Qxf3 Qf6
8. Qxf6 Nxf6 9. d3 Bd6 10. Nd2 O-O 11. Nc4 Nd7 12. Be3 b6 13. a4 a5 14. Rfd1 Rfe8
15. Nxd6 cxd6 16. c3 Nc5 17. Bxc5 dxc5 18. Rd2 Red8 19. Rad1 Rd7 20. Kf1 Rad8
21. g3 Kf8 22. Kg2 h5 23. d4 exd4 24. cxd4 cxd4 25. Rxd4 Rxd4 26. Rxd4 Ke7
27. Rc4 Rc8 28. b4 axb4 29. Rxb4 c5 30. Rb5 Kd6 31. a5 bxa5 32. Rxa5 Kc6
33. Ra6+ Kb5 34. Rd6 c4 35. e5 c3 36. Rd3 Rc5 37. Rxc3 Rxe5 38. Rf3 Re7
39. Rc3 Kb4 40. Rc8 g6`

/** The eighty plies in SAN, 1. e4 to 40...g6. */
export const correspondencePlies: string[] = CORRESPONDENCE_PGN.replace(/\d+\.\s*/g, ' ').trim().split(/\s+/)

/** The position after 40...g6, White to move: a level rook ending, three pawns each. */
export const CORRESPONDENCE_FEN = '2R5/4rp2/6p1/7p/1k6/6PP/5PK1/8 w - - 0 41'

/** The move typed at Heron Head and never posted. */
export const UNPOSTED_MOVE = 'Kf3'

/** The position after 41. Kf3, Black to move: the board as set for the house game in Chapter Nine. */
export const HOUSE_GAME_FEN = '2R5/4rp2/6p1/7p/1k6/5KPP/5P2/8 b - - 1 41'

/** The players. */
export const CORRESPONDENCE = {
  white: 'A. Hardy',
  black: 'L. Voss',
  /** The cards began in 1961. */
  began: 1961,
  /** Hardy's last card, 40. Rc8, dated from Kettle. */
  lastCardDate: '9 June 1965',
  /** Voss's reply, 40...g6, by Tuck's dinghy. */
  replyDate: '10 June 1965',
  /** Cards in the Surveyor's hut. */
  cardCount: 79,
  /** The move at which Hardy declined the rook trade, because he always declined. */
  declinedTradeAtMove: 37,
} as const

/** The 9 June card in the Surveyor's hut, typed in the Olivetti's bent `e`. */
export const JUNE_CARD_TEXT = '40. Rc8   your move, then. A.H.'

/** The typed card on the chart table at Heron Head. */
export const HERON_HEAD_CARD_TEXT = '41. Kf3   A.H.'

/** The last line of Sheet 9. */
export const SHEET_NINE_LAST_LINE = 'h8 Heron Head. Surveyed 14 June 1965. A.H. Sheet complete. I am going on.'

/** The travelling set in the Quarters, tried. */
export const TRAVELLING_SET_REFUSAL = 'White to move. Not you.'

/** The typed card on the Board Room table in Chapter Nine when the card was carried. */
export const HOUSE_GAME_CARD = 'Hardy v. Voss. Black to move. You may sit.'

/** Voss, given the card from Heron Head. */
export const VOSS_ON_KF3 = ['Kf3. Anyone would play it. He did.', 'It is my move and I will not make it here. Take the board. Play it for me at the house, against his chair. Any result is a result.']

/** The ledger line entered after the house game, whatever the result. */
export function houseGameLedgerLine(result: string): string {
  return `Hardy v. Voss. By post 1961–65. Concluded over the board 30 Sept 1965 by the Visitor for L. Voss. ${result}`
}
