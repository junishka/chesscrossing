// The twelve Standing Orders, framed on the Landing, transcribed verbatim from docs/BIBLE.md §4. Pure data.

/** One Standing Order. Order 12 is typed on the Olivetti, with the bent `e`; the others are printed. */
export interface StandingOrder {
  number: number
  text: string
  /** True for the one Order typed rather than printed (Order 12, added this June). */
  typed: boolean
}

/** The Orders, 1 to 12. */
export const orders: StandingOrder[] = [
  { number: 1, text: 'The station keeps station time. Ferry days are ringed in pencil.', typed: false },
  { number: 2, text: 'The lamp is lit at dusk. Two white, one red. The red is for the Sixty-Four.', typed: false },
  { number: 3, text: 'Readings are given at 05:20 and 17:50 whether or not anyone is present.', typed: false },
  { number: 4, text: 'The board is never left unset.', typed: false },
  { number: 5, text: 'A game not entered in the log did not happen.', typed: false },
  { number: 6, text: 'A resigned game is a finished game. It is entered like any other.', typed: false },
  { number: 7, text: 'The range is lit at 05:00 and out at 21:00.', typed: false },
  { number: 8, text: "The Recorder's log is corrected by nobody but the Recorder.", typed: false },
  { number: 9, text: 'The grid is surveyed. It is not safe. Nothing crosses at high water.', typed: false },
  { number: 10, text: 'Everything in the station is counted on Sundays.', typed: false },
  { number: 11, text: 'The guest has the first move.', typed: false },
  { number: 12, text: 'The season will be closed properly.', typed: true },
]

/** The title engraved above the frame. */
export const ORDERS_TITLE = 'THE STANDING ORDERS'

/** An Order as it reads on the card: `4. The board is never left unset.` */
export function orderLine(n: number): string {
  const o = orders.find((x) => x.number === n)
  return o ? `${o.number}. ${o.text}` : ''
}
