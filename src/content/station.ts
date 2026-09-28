// Fixed strings of the station that are not UI copy: names, dates, placards, tags, the reading, the ledger's leader.
// docs/BIBLE.md §2, §4, §6, §8.5, §12. Pure data; deterministic generators use seeded() only.
import { highWaterMinutes, hhmm, lowWaterMinutes, READING_TIMES } from './watches'

/**
 * The same generator as `seeded()` in scene/materials.ts (xmur3 hash into mulberry32), kept here
 * because content is pure data read by the server as well, and the scene module imports the fonts' CSS.
 */
function seeded(seed: string): () => number {
  let h = 1779033703 ^ seed.length
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507)
  h = Math.imul(h ^ (h >>> 13), 3266489909)
  let a = (h ^= h >>> 16) >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** The station. */
export const STATION_NAME = 'Halyard Island Hydrographic Station'
/** As painted on the lifebuoy. */
export const STATION_INITIALS = 'H.I.H.S.'
/** The society. */
export const SOCIETY_NAME = 'Coastal Survey Society of Kettle'
/** The plate's last line. */
export const STATION_PLATE_LINE = 'HALYARD ISLAND HYDROGRAPHIC STATION.  EST. 1931.'
/** Established. */
export const ESTABLISHED = 1931
/** The launch. */
export const LAUNCH_NAME = 'Kittiwake'
/** The dinghy. */
export const TENDER_NAME = 'TENDER No. 1'
/** The season's month and year. */
export const SEASON_MONTH = 'September'
export const SEASON_YEAR = 1965
/** The player arrives on Wednesday 1 September. */
export const ARRIVAL_DAY = 1
/** The station closes on Thursday 30 September. */
export const CLOSING_DAY = 30
/** The Station Master took the launch out on Friday 11 June 1965. */
export const LAUNCH_DEPARTED = '11 June 1965'
/** Sheet 9's h8 line. */
export const H_FILE_SURVEYED = '14 June 1965'
/** Ferry days. */
export const FERRY_DAYS = ['Tuesday', 'Friday'] as const
/** The Predictor is wound on Sundays; it holds a week. */
export const WINDING_DAY = 'Sunday'

/** Days of the week; 1 September 1965 was a Wednesday. */
export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const

/** The weekday of a day of the season. Days beyond 30 run into October. */
export function dayName(day: number): string {
  return DAY_NAMES[(((3 + day - 1) % 7) + 7) % 7]
}

/** True on ferry days, Tuesdays and Fridays. */
export function isFerryDay(day: number): boolean {
  const n = dayName(day)
  return n === 'Tuesday' || n === 'Friday'
}

/** True on Sundays, when everything is counted and the Predictor wound. */
export function isSunday(day: number): boolean {
  return dayName(day) === 'Sunday'
}

/** The month and day-of-month for a season day: 1..30 is September, 31 onward October and after. */
export function calendar(day: number): { day: number; month: string; monthShort: string; year: number } {
  if (day <= 30) return { day, month: 'September', monthShort: 'Sept', year: 1965 }
  const d = day - 30
  if (d <= 31) return { day: d, month: 'October', monthShort: 'Oct', year: 1965 }
  return { day: d - 31, month: 'November', monthShort: 'Nov', year: 1965 }
}

/** The date as typed on a card: `14 September 1965`. */
export function dateText(day: number): string {
  const c = calendar(day)
  return `${c.day} ${c.month} ${c.year}`
}

/** The date as typed on the ledger: `14 SEPT 1965`. */
export function ledgerDate(day: number): string {
  const c = calendar(day)
  return `${c.day} ${c.monthShort.toUpperCase()} ${c.year}`
}

/** The menu's CONTINUE line: `CONTINUE  ·  14 SEPTEMBER 1965  ·  EXPEDITION 4 ADJOURNED`. */
export function continueLine(day: number, expedition: number): string {
  return `CONTINUE  ·  ${dateText(day).toUpperCase()}  ·  EXPEDITION ${expedition} ADJOURNED`
}

// ───────────────────────────── Placards and cards ─────────────────────────────

/** Engraved brass placards. */
export const placards = {
  gauge: 'TIDE GAUGE.  READ FROM THE LEFT.  DO NOT ADJUST.',
  board: 'THE BOARD IS NEVER LEFT UNSET.  STANDING ORDER 4.',
  cradle: 'LAUNCH KITTIWAKE.  CRADLE.  DEPARTED 11 JUNE 1965.',
  predictor: 'THE PREDICTOR.  WOUND ON SUNDAYS.  IT HOLDS A WEEK.',
  warning: 'THE GRID IS SURVEYED. IT IS NOT SAFE. STANDING ORDER 9.',
  consult: 'CONSULT',
  returned: 'THE RETURNED',
  spares: 'SPARES',
} as const

/** The signposts on the Path. */
export const signposts = ['THE POINT 340 YDS.', 'THE STATION 120 YDS.', 'THE SIXTY-FOUR · LOW WATER ONLY'] as const

/** The one typed card that is the tutorial. */
export const FIRST_CARD = 'Standing Order 11. The guest has the first move.'

/** The ration card in the Galley (HS-0214). */
export const RATION_CARD = 'Visitor: one egg, four biscuits, tea without limit.'

/** The caption on the card of the 1959 group photograph (HS-0304). */
export const PHOTOGRAPH_CAPTION = 'Left to right: Tuck, Lisle, Brace, M. Hardy, A. Hardy, I. Hardy (6), Ferrier, and two of the unit. August 1959.'

/** The Quarters door before Chapter Four. */
export const QUARTERS_DOOR = { tag: 'HS-0500', title: 'QUARTERS', body: 'Made up. Standing Order 12.' } as const

/** The August page on the Olivetti. */
export const AUGUST_PAGE = 'THE VISITOR. Expected Tuesday. Arrived Wednesday.'

/** The luggage tags, as two columns of three lines. */
export const luggageTags = {
  stationMaster: ['HARDY, A.', 'HALYARD I.', 'NOT WANTED ON VOYAGE'],
  stationMasterRight: ['STATION MASTER', 'VIA KETTLE FERRY', ''],
  visitor: ['VISITOR', 'GUEST CHAIR', 'WANTED ON VOYAGE'],
  visitorRight: ['PROVISIONAL', '1 SEPTEMBER 1965', ''],
} as const

/** The roster board's card. */
export const ROSTER_LINE = 'Hardy, Brace, Ferrier, Lisle, Tuck, Hardy (I.). Visitor: provisional.'

/** The gramophone's four records. */
export const RECORDS = [
  "1 · KETTLE HARBOUR SILVER BAND · 'THE ROAD TO THE ISLES' · 1938.",
  '2 · BACH · CHORALE PRELUDES · 1951.',
  "3 · ADMIRALTY · 'SIGNALS BY WHISTLE AND BELL' · training.",
  "4 · a plain label, '4'.",
] as const

/** The eleven spines on the Recorder's shelf. */
export const BOOKS = [
  'The Tide Book of Kettle Harbour', 'A Girl of the Skerries', 'Marion and the Lighthouse Boys', 'The Weather Ship',
  'Signals for Beginners', 'The Seventh Form at Crail', 'Under Nine Lamps', 'Pony Island', 'The Latin Prize',
  'Elizabeth of the Point', 'Field Notes of a Junior Hydrographer',
] as const

/** The telescope's three pinned bearings. */
export const BEARINGS = ['The Point', 'The Holms', 'The Head'] as const

// ───────────────────────────── The ledger ─────────────────────────────

/** The ledger's header row: `EXPEDITION 3     LONG WATCH     SEA STATE 4     14 SEPT 1965`. */
export function ledgerHeader(expedition: number, watchLabel: string, seaState: number, day: number): string {
  return `EXPEDITION ${expedition}     ${watchLabel}     SEA STATE ${seaState}     ${ledgerDate(day)}`
}

/** The column heads under the header. */
export const LEDGER_COLUMNS = 'No.    VISITOR   THE CHAIR   ISLET            REMARK'

/** The roll's leader: three fixed lines above the season's first row. The second is in ink and in Jost, the only line not from the Olivetti. */
export const LEDGER_LEADER = [
  'VOL. XIII ENDS.',
  'EXPEDITION 1,000.  1959.  HARDY v. HARDY (I.), AGED SIX.  1-0 IN 12.  ENTERED BY A.H.',
  'VOL. XIV.  SEPTEMBER 1965.  I. HARDY, RECORDER.',
] as const

/** The index of the leader line written in the Station Master's hand. */
export const LEADER_INK_LINE = 1

/** Roman numerals I to XIV. */
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV'] as const

/**
 * Header lines of the earlier volumes, oldest first, ending with the bible's `VOL. XII.  1964.  EXPEDITIONS 940 TO 999.`
 * Volumes I to XI are drawn from a seeded table: each ends where the next begins; Vol. I opens in 1931 at Expedition 1.
 * They have no rows and rewind nothing.
 */
export function earlierVolumeHeaders(): string[] {
  const rnd = seeded('ledger.volumes')
  const ends: { lastExpedition: number; lastYear: number }[] = []
  let lastExpedition = 939
  let lastYear = 1963
  for (let v = 11; v >= 1; v--) {
    ends.unshift({ lastExpedition, lastYear })
    lastExpedition -= 60 + Math.floor(rnd() * 40)
    lastYear -= 2 + Math.floor(rnd() * 3)
  }
  const lines: string[] = []
  let firstExpedition = 1
  let firstYear = 1931
  for (let v = 1; v <= 11; v++) {
    const e = ends[v - 1]
    const years = firstYear === e.lastYear ? `${e.lastYear}` : `${firstYear} TO ${e.lastYear}`
    lines.push(`VOL. ${ROMAN[v - 1]}.  ${years}.  EXPEDITIONS ${firstExpedition} TO ${e.lastExpedition}.`)
    firstExpedition = e.lastExpedition + 1
    firstYear = e.lastYear + 1
  }
  lines.push('VOL. XII.  1964.  EXPEDITIONS 940 TO 999.')
  return lines
}

/** A crate row: `CRATE 6.  THE GALLEY DRESSER, LEFT.  CRATED 21 SEPT 1965.  B.L.` */
export function crateLine(n: number, objectName: string, day: number): string {
  return `CRATE ${n}.  ${objectName.toUpperCase()}.  CRATED ${ledgerDate(day)}.  B.L.`
}

/** The stamp on a crated object's card. */
export const CRATED_STAMP = 'CRATED'

/** The draw reasons as the ledger types them after `1/2-1/2`. */
export const drawReasons = {
  threefold: 'by repetition',
  'fifty-move': 'by the fifty-move rule',
  stalemate: 'slack water',
  agreement: 'by agreement',
  insufficient: 'nothing left to move',
} as const

/** Ledger lines for the other results. */
export const resultLines = {
  resignation: '0-1 by resignation.',
  timeout: 'on time.',
  hold: 'Hold.',
} as const

/** The winch's line. */
export const WINCH_LINE = 'winch turned. nothing on the cable.'

/** The remark when the chair thinks: `the chair thought for 1.9 s`. */
export function chairThoughtRemark(seconds: number): string {
  return `the chair thought for ${seconds.toFixed(1)} s`
}

/** Rule remarks. */
export const remarks = { firstReturn: 'first return', flagU: 'flag U hoisted' } as const

// ───────────────────────────── The reading ─────────────────────────────

/** Tuck's reading, as given on the jetty: `Halyard. South-west, four. Sea moderate. Rain later. Good, becoming moderate. High water 11:04, low water 17:20. That is the reading.` */
export const READING_SAMPLE = 'Halyard. South-west, four. Sea moderate. Rain later. Good, becoming moderate. High water 11:04, low water 17:20. That is the reading.'

/** The reading Tuck gave the Station Master on 11 June. */
export const READING_ELEVENTH_JUNE = 'Force 3, sea slight, visibility good.'

const WIND_DIRECTIONS = ['North', 'North-east', 'East', 'South-east', 'South', 'South-west', 'West', 'North-west'] as const
/** Beaufort force words, two to seven, with the sea each brings. */
const FORCES: { word: string; sea: string }[] = [
  { word: 'two', sea: 'smooth' },
  { word: 'three', sea: 'slight' },
  { word: 'four', sea: 'moderate' },
  { word: 'five', sea: 'moderate' },
  { word: 'six', sea: 'rough' },
  { word: 'seven', sea: 'rough' },
]
const WEATHERS = ['Fair.', 'Rain later.', 'Showers.', 'Drizzle.', 'Rain.', 'Fair, rain later.'] as const
const VISIBILITIES = ['Good.', 'Good, becoming moderate.', 'Moderate.', 'Moderate, becoming poor.', 'Poor, becoming moderate.'] as const

/** The parts of a reading, drawn from the seeded tables. */
export interface Reading {
  direction: string
  force: string
  sea: string
  weather: string
  visibility: string
  highWater: string
  lowWater: string
}

/** The day's weather, seeded on the date alone so the 17:50 reading is the same reading. */
export function readingFor(day: number): Reading {
  const rnd = seeded(`reading:${day}`)
  const f = FORCES[Math.floor(rnd() * FORCES.length)]
  return {
    direction: WIND_DIRECTIONS[Math.floor(rnd() * WIND_DIRECTIONS.length)],
    force: f.word,
    sea: f.sea,
    weather: WEATHERS[Math.floor(rnd() * WEATHERS.length)],
    visibility: VISIBILITIES[Math.floor(rnd() * VISIBILITIES.length)],
    highWater: hhmm(highWaterMinutes(day)),
    lowWater: hhmm(lowWaterMinutes(day)),
  }
}

/** The reading as Tuck gives it to the camera. The watch is given for the record; the reading is the day's. */
export function readingText(day: number, watch: number): string {
  const r = readingFor(day)
  void watch
  return `Halyard. ${r.direction}, ${r.force}. Sea ${r.sea}. ${r.weather} ${r.visibility} High water ${r.highWater}, low water ${r.lowWater}. That is the reading.`
}

/** The wireless transcript's last line, always. */
export const WIRELESS_LAST_LINE = 'Halyard: four, moderate, rain later, good'

/** The typed transcript of the Morse-rhythm bulletin for a watch with one: a heading, Kettle's line, then the fixed last line. */
export function wirelessTranscript(day: number, watch: number): string[] {
  const time = READING_TIMES[watch] ?? '05:20'
  const r = readingFor(day)
  return [
    `BULLETIN ${time}.  ${ledgerDate(day)}.`,
    `Kettle: ${r.force}, ${r.sea}, ${r.weather.toLowerCase().replace(/\.$/, '')}, ${r.visibility.toLowerCase().replace(/\.$/, '')}`,
    WIRELESS_LAST_LINE,
  ]
}

/** The tide board on the jetty, chalked at 05:20: today's water. */
export function tideBoardText(day: number): string {
  const r = readingFor(day)
  return `HIGH WATER ${r.highWater}.  LOW WATER ${r.lowWater}.`
}

/** The sealed-move line when the ledger's clasp is closed. */
export const ADJOURNED_LINE = 'ADJOURNED.  SEALED MOVE.'

/** The chair's promotion drawer and tray labels are placards; the inventory numbers under the pieces read `W-K`, `B-R2`. */
export function pieceInventoryNumber(color: 'w' | 'b', piece: 'p' | 'n' | 'b' | 'r' | 'q' | 'k', index: number): string {
  const letter = piece.toUpperCase()
  const many = piece === 'p' ? 8 : piece === 'q' || piece === 'k' ? 1 : 2
  return `${color.toUpperCase()}-${letter}${many > 1 ? index + 1 : ''}`
}
