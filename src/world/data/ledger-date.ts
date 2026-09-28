/**
 * The ledger's date: day, month in roman numerals, two-digit year, as the
 * DETAINED stamp's date band carries it: "14 III 90". docs/visual.md section 9.
 * The year is the game's, 1990, whatever the visitor's calendar says.
 */

export const YEAR = 1990

const ROMAN_MONTHS: readonly string[] = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII']

export function romanMonth(monthIndex: number): string {
  return ROMAN_MONTHS[((monthIndex % 12) + 12) % 12] ?? 'I'
}

/** Day and month from the date given; the year is always the game's. */
export function ledgerDate(date: Date, year: number = YEAR): string {
  const yy = String(year % 100).padStart(2, '0')
  return `${date.getDate()} ${romanMonth(date.getMonth())} ${yy}`
}
