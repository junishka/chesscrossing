/**
 * The household, docs/bible.md section 4, verbatim. The role is the bible's
 * own words; the lines are the rest of the entry, one sentence each.
 */
import type { Household } from '../../contracts/world'

export const HOUSEHOLD: Household[] = [
  {
    name: 'Gregor Ostrow',
    role: 'Keeper 1911 to 1948',
    lines: [
      '1888–1948.',
      'Carved the set and board from crate 1931/4, without authority.',
      'Modelled white on his own desk and black on the Helder post as seen from the deck.',
      'Entered in the Schedule only as a maker.',
    ],
  },
  {
    name: 'Anselm Ostrow',
    role: 'Keeper 1948 to 1977',
    lines: [
      'Born 1919.',
      'Referred to throughout as the Keeper.',
      'Wrote "No traffic requiring declaration" in ink, in full, every day from 1961 to 1 March 1977.',
      'Carved the replacement knight, 1972.',
      'Sat with his weight to the left.',
      'Post vacated 2 March 1977.',
      'The Schedule does not say how.',
    ],
  },
  {
    name: 'Ida Ostrow',
    role: 'Married 1948',
    lines: [
      'Born 1925.',
      'Kept the pantry book in one hand until March 1964, then left for Sallenau; the book continues in a smaller hand without a gap.',
      'Written to in 1977.',
      'Did not attend.',
      'Her wardrobe in the Sickroom is walnut; contents recorded as none.',
    ],
  },
  {
    name: 'Teodor Ostrow',
    role: 'Founder member, Marle Chess Club, 1962',
    lines: [
      'Born 1950.',
      'Typed most of the cards.',
      'Height marked on the frame of Room 6 to 181 cm, 1969.',
      'Crossed the bridge on foot in October 1969 with the white knight from g1 in his pocket.',
      'His file is in Drawer 4, exempt.',
    ],
  },
  {
    name: 'Marit Ostrow',
    role: 'Kept the pantry book from March 1964, aged eleven',
    lines: [
      'Born 1953.',
      'Read out item numbers for four days in March 1977.',
      'Took a post with the Survey of the Republic.',
      'Corrected sheet 44-E in 1985: M.O.',
      'Has not visited since.',
    ],
  },
  {
    name: 'Wenzel Halm',
    role: 'Customs Officer Second Class',
    lines: [
      'Born 1921, Brise.',
      'Posted to Marle-East in 1949 and never posted anywhere else.',
      'Crossed the bridge at six each evening to play the Keeper: 3,140 recorded games.',
      'Wrote "No traffic. W. Halm." in a Vardenne ledger on 3 March 1977, with no standing to write there.',
      'Moved into the Lookout in 1978 with one suitcase, item S-1, not unpacked.',
    ],
  },
  {
    name: 'Edmund Prell',
    role: 'Inspector of Frontier Property, Grade II',
    lines: [
      'Born 1934, Sallenau.',
      'Ministry clerk from 1952.',
      'Took the Schedule over four days and applied to rent the house on the fifth.',
      'Learned chess after 1977 from the wall and the ledgers.',
      'Retired 1989.',
      'Has not opened Drawer 4.',
      'The narrator.',
    ],
  },
  {
    name: 'The Visitor',
    role: 'Admitted under Standing Order 11',
    lines: ['Sits in the Keeper\'s chair.', 'Takes white.', 'Entered on page one and nowhere else.'],
  },
  {
    name: 'Annelie',
    role: 'A name on the sleeve of item 5-11',
    lines: ['In a hand that is not Teodor\'s.', 'Nothing else is known of her in the house.'],
  },
]
