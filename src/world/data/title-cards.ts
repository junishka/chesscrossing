/**
 * The title sequence, docs/visual.md section 4; text from docs/bible.md
 * section 1, verbatim. An empty string is the 0.8rem block gap. Card 3 is the
 * chapter card of Room 1 and is produced by chapterCard(room), so the app
 * shell's loop over titleCards followed by the chapter card shows three.
 */

export const CARD_1: readonly string[] = [
  'REPUBLIC OF VARDENNE',
  'MINISTRY OF WAYS AND FRONTIERS. FRONTIER PROPERTY DIVISION',
  '',
  'FORM F.P. 22. SCHEDULE OF CONTENTS',
  'Taken under Regulation 40 on the vacation of a hereditary post, before the property is let, sold or demolished.',
]

export const CARD_2: readonly string[] = [
  'Property: Frontier Post No. 7 (Marle-on-Lisk), known locally as the Crossing.',
  'Post vacated: 2 March 1977.',
  'Schedule taken: 11 to 14 March 1977.',
  'Taken by: E. Prell, Inspector of Frontier Property, Grade II.',
  'Present: M. Ostrow, for the Household, reading item numbers. W. Halm, Customs Officer Second Class, Helder Confederation Frontier Guard, by invitation of the Household. Mrs I. Ostrow, Sallenau, written to. Did not attend.',
  'Rooms scheduled: 11, in the order the form requires, cellar excepted. Items: 611.',
  'Schedule B (Bonded Store): not located.',
  'Supplementary Schedule (S-1 onward): open.',
  'Disposition of property: Pending. Let from 15 March 1977 to E. Prell under Regulation 44.',
]

/** Card 3 as the visual document prints it. chapterCard(room1) must equal this. */
export const CARD_3: readonly string[] = [
  'I.',
  'ROOM 1',
  'THE DECLARATIONS ROOM',
  '',
  'Goods were declared here until 1961; chess has been played here since 1949. The board sits on the desk across the declarations line.',
]

export const TITLE_CARDS: string[][] = [[...CARD_1], [...CARD_2]]
