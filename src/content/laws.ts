// The fifteen Laws of the World, transcribed verbatim from docs/BIBLE.md §1. Pure data.

/** One Law: its numeral, its title sentence, its text, and the one line of it that binds an implementer. */
export interface Law {
  numeral: string
  title: string
  text: string
  /** A sentence of the Law's own text, chosen as its operative rule. */
  consequence: string
}

/** The Laws, in order. */
export const laws: Law[] = [
  {
    numeral: 'I',
    title: 'The camera does not wander.',
    text: 'Every location is a fixed tableau with an authored camera. Movement is one of three verbs: whip pan, lateral dolly, vertical lift. No free camera, orbit or mouse-look. Cuts are only for inserts and chapter cards.',
    consequence: 'No free camera, orbit or mouse-look.',
  },
  {
    numeral: 'II',
    title: 'Everything faces the camera at ninety degrees or is seen from directly above.',
    text: 'Rooms are boxes with the fourth wall removed and the camera on its normal. Furniture is parallel or perpendicular to the wall. The Chart view is seen from directly above through a long lens (80 mm, parallax under 4 percent), which is as orthographic as a perspective camera can be interpolated to. Cards, letters and charts are shown flat.',
    consequence: 'Cards, letters and charts are shown flat.',
  },
  {
    numeral: 'III',
    title: 'Symmetry is the default and every frame has exactly one flaw.',
    text: 'Each tableau is composed about a vertical centre line and declares one asymmetry in its frame data (`flaw`). Nothing else breaks the line. The flaw is never pointed at, never corrected, and never becomes a mechanic.',
    consequence: 'The flaw is never pointed at, never corrected, and never becomes a mechanic.',
  },
  {
    numeral: 'IV',
    title: 'Everything has a name, a number and a place.',
    text: 'Every interactive object carries an inventory tag `HS-####` painted into its texture; hover shows its card: tag, name, material, year, one sentence. A card says what a person at the station in 1965 could know and would write; it does not annotate the flaw, finish the player\'s inference, or carry a developer\'s number. The move list and the object inventory are one ledger, typed on one roll by one typist; after a result the next line may be a crate.',
    consequence: 'A card says what a person at the station in 1965 could know and would write; it does not annotate the flaw, finish the player\'s inference, or carry a developer\'s number.',
  },
  {
    numeral: 'V',
    title: 'Nothing is explained twice, and most things are not explained once.',
    text: 'One typed card is the tutorial. Residents answer questions; they do not give tours. Homages are never annotated. UI copy never says "click here," in any period dress.',
    consequence: 'UI copy never says "click here," in any period dress.',
  },
  {
    numeral: 'VI',
    title: 'The world is handmade and admits it.',
    text: 'Textures are painted at runtime with visible brush direction and 2 to 4 percent value noise. Creatures animate at 12 fps with held poses. Skies are flat painted planes; sea through windows is a scrolling painted plane. A wear pass runs on every material with the numbers in 3.5: grime toward wallpaper corners, tarnish on brass, sun-bleach on the upper third of window-facing walls, scuff along the walking line. The music is handmade too: it is played on the instruments in the inventory and on nothing else (section 10).',
    consequence: 'The music is handmade too: it is played on the instruments in the inventory and on nothing else (section 10).',
  },
  {
    numeral: 'VII',
    title: 'One typeface, letterspaced; one more for typing.',
    text: 'Jost for everything printed, engraved, painted or embroidered, capitals at 0.12 em. Courier Prime for anything typed. No third face, no weight above 500. A lint rule forbids `#FFFFFF`, `#000000`, and any palette hex whose HSV saturation exceeds 0.62.',
    consequence: 'A lint rule forbids `#FFFFFF`, `#000000`, and any palette hex whose HSV saturation exceeds 0.62.',
  },
  {
    numeral: 'VIII',
    title: 'Feeling is shown by restraint, and by slowing down.',
    text: 'No exclamation marks. Slow motion is spent, not used: `spendSlowMotion(reason)` accepts exactly four reasons (section 11) and throws on any other. Resignation is a decision, not a peak, and is denied it.',
    consequence: 'Slow motion is spent, not used: `spendSlowMotion(reason)` accepts exactly four reasons (section 11) and throws on any other.',
  },
  {
    numeral: 'IX',
    title: 'Colour is a place, and every colour has mud in it.',
    text: 'Four palette regions, each a fixed hex set and a post grade. No HSV saturation above 0.62; the beacon red is the one value that touches it. No pure white; paper is `#E8DFC6` at brightest.',
    consequence: 'No pure white; paper is `#E8DFC6` at brightest.',
  },
  {
    numeral: 'X',
    title: 'Societies have rules, uniforms and badges.',
    text: 'Twelve Standing Orders on the Landing, a roster with six hooks, one uniform (the Society jersey, section 11), an embroidered badge per rank. The player arrives PROVISIONAL and is backed, sewn and promoted by play or by days.',
    consequence: 'The player arrives PROVISIONAL and is backed, sewn and promoted by play or by days.',
  },
  {
    numeral: 'XI',
    title: 'Stories are told inside stories.',
    text: 'The game is the station log for September 1965, typed by the Recorder, aged twelve; her pages are the chapter cards. Inside the log: the Tide Warden\'s readings, given to the camera; the Surveyor\'s slate of older names; the Station Master\'s unfinished game by post.',
    consequence: 'The game is the station log for September 1965, typed by the Recorder, aged twelve; her pages are the chapter cards.',
  },
  {
    numeral: 'XII',
    title: 'Absence is a character, and the absent are present as objects.',
    text: 'The Station Master\'s chair is empty; the davit he geared to the Predictor moves its side. His quarters are made up. The launch\'s cradle is empty and labeled. Nobody remarks on any of this more than once, and the sentence "it still plays" exists in exactly two places: the chair\'s card and the Keeper\'s mouth, asked directly.',
    consequence: 'Nobody remarks on any of this more than once, and the sentence "it still plays" exists in exactly two places: the chair\'s card and the Keeper\'s mouth, asked directly.',
  },
  {
    numeral: 'XIII',
    title: 'Children are taken seriously; adults are precise about their failures.',
    text: 'Ida keeps the log and is never talked down to. Adults, asked what they got wrong, say it in one sentence, and the sentence names a date and a thing.',
    consequence: 'Adults, asked what they got wrong, say it in one sentence, and the sentence names a date and a thing.',
  },
  {
    numeral: 'XIV',
    title: 'Chess and the survey are one activity.',
    text: 'Squares are islets with names. The evaluation is a tide gauge. Difficulty is a sea state. Time controls are watches. The move list is the survey log. Captures are tagged on cairns.',
    consequence: 'Squares are islets with names. The evaluation is a tide gauge. Difficulty is a sea state. Time controls are watches.',
  },
  {
    numeral: 'XV',
    title: 'Nothing is cruel.',
    text: 'No fail state outside the rules of chess, no timer outside the chess clock, nothing lost by losing. Every gate opens by play or by patience; the tide comes in anyway.',
    consequence: 'Every gate opens by play or by patience; the tide comes in anyway.',
  },
]

/** Finds a Law by its Roman numeral. */
export function findLaw(numeral: string): Law | undefined {
  return laws.find((l) => l.numeral === numeral)
}
