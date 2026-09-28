/**
 * The opponent (docs/bible.md section 6), the narrator (section 5 and
 * docs/visual.md section 10), and the page-head controls
 * (docs/architecture.md, decisions 2).
 */
import type { Strength } from '../../contracts/chess'
import type { World } from '../../contracts/world'
import { DASH } from './page'

/**
 * The hours card, item 1-17, in Mr Halm's hand. Strength runs 1 (gentle) to
 * 8. At six he plays quickly and from memory, so 18.00 is the gentlest; after
 * ten he plays as he plays, so After is the strongest. The two hours between
 * are spaced so each step is felt: 1, 3, 6, 8.
 */
export const HOURS: readonly { label: string; strength: Strength }[] = [
  { label: '18.00', strength: 1 },
  { label: '20.00', strength: 3 },
  { label: '22.00', strength: 6 },
  { label: 'After', strength: 8 },
]

/**
 * The clocks read 21.20 and 21.08; the 20.00 hour is the one in force when
 * the visitor sits down, so it is the default until an hour is named.
 */
export const DEFAULT_HOUR = 1

/**
 * His words, as the ledger enters them. The bible gives "Please." and
 * "Thank you." and says that, having lost, he says thank you first in
 * Helder. The Helder word is not in the bible. The Confederation is a
 * federation of cantons across the Lisk with its own stamps and its own
 * time; "Dank u." is Germanic without being German, and it is two words,
 * which is his length. Recorded as a deviation from canon.
 */
export const OPPONENT: World['opponent'] = {
  name: 'Mr Halm',
  hours: HOURS,
  defaultHour: DEFAULT_HOUR,
  lines: {
    please: 'Please.',
    thankYou: 'Thank you.',
    thankYouHelder: 'Dank u.',
    positionKeeps: 'The position keeps.',
  },
}

export const NARRATOR: World['narrator'] = {
  name: 'Edmund Prell',
  silenceMark: DASH,
  placeholder: 'Ask.',
  visitorLabel: 'Visitor (1).',
}

/**
 * Page-head controls, typed words in the house's register, no boxes. The
 * stamp toggle shows its state the way the header shows a field.
 */
export const CONTROLS: World['controls'] = {
  resign: 'Resign.',
  takeBlack: 'Take black.',
  takeWhite: 'Take white.',
  soundOn: 'Stamp: on.',
  soundOff: 'Stamp: off.',
}
