// The easter egg register, docs/BIBLE.md §12 and §14.8. None is marked; none is explained. Pure data.
import type { EggDef } from '../types'

/** An egg with the register's two extra columns: what happens, and the restraint note that lets it exist. */
export interface EggEntry extends EggDef {
  what: string
  restraint: string
}

/** The thirty-two eggs, by frame id (boardroom … heron, the ids of content/frames; §14.6 gives the codes). Cards carry the bible's words where it gives them. */
export const eggEntries: EggEntry[] = [
  { id: 'EE-01', title: 'collars card', location: 'boardroom', trigger: 'hover a piece', source: "Chas's labeled everything (Tenenbaums); the tagged Belafonte",
    what: 'card: `Bishop. Lives at f1.`; a displaced piece adds `Away.`', restraint: 'a label, not a joke',
    card: { kind: 'label', title: 'Bishop.', body: 'Lives at f1.', footnote: 'Away.' } },
  { id: 'EE-02', title: 'flags U, N/C, P, half-hoist', location: 'boardroom', trigger: 'check, mate, resign, draw', source: "the Belafonte's flags; real ICS",
    what: 'U; N over C; P; half-hoist', restraint: 'real signals, correctly used, never explained, never glossed in the ledger' },
  { id: 'EE-03', title: 'the slotless spare rook', location: 'boardroom', trigger: 'open twice', source: 'the authored flaw',
    what: 'one spare rook has no slot; the card says so', restraint: 'the card is the only acknowledgment',
    card: { kind: 'index', title: 'THE SPARES DRAWER', body: 'Four of each colour. One rook has no slot and never had one.', tag: 'HS-0009', material: 'pear, felt · 1948' } },
  { id: 'EE-04', title: 'the leader line in his hand', location: 'boardroom', trigger: 'scroll up to the leader', source: 'the absent father as the one entry he made himself',
    what: '`EXPEDITION 1,000.  1959.  HARDY v. HARDY (I.), AGED SIX.  1-0 IN 12.  ENTERED BY A.H.`, the only line on the roll in his hand', restraint: 'no comment attached; it cannot be clicked',
    card: { kind: 'typed', title: 'VOL. XIII ENDS.', body: 'EXPEDITION 1,000.  1959.  HARDY v. HARDY (I.), AGED SIX.  1-0 IN 12.  ENTERED BY A.H.' } },
  { id: 'EE-05', title: 'COUNTED tag', location: 'boardroom', trigger: 'leave a piece overnight', source: "the dumbwaiter's cleaned things (Tenenbaums)",
    what: 'a second tag: `COUNTED.  B.L.`', restraint: 'functional, not decorative',
    card: { kind: 'tag', title: 'COUNTED.  B.L.', body: '' } },
  { id: 'EE-06', title: 'SHEET 9 tube', location: 'chartroom', trigger: 'hover', source: 'the missing map in every expedition',
    what: '`SHEET 9 · OUT WITH THE LAUNCH`', restraint: 'resolved only at h8',
    card: { kind: 'label', title: 'SHEET 9 · OUT WITH THE LAUNCH', body: '' } },
  { id: 'EE-07', title: "the Predictor's drum", location: 'chartroom', trigger: 'insert', source: 'the Turk with no one inside',
    what: "forty-one pulleys turn; the drum prints today's low water and the chair's last move in one column", restraint: 'honest and empty; no figure' },
  { id: 'EE-08', title: 'buttons, 31', location: 'galley', trigger: 'inspect', source: "Lisle's counting",
    what: "`Buttons, 31. One is a pawn's.`", restraint: 'a count, not a story',
    card: { kind: 'index', title: 'THE TURNED TIN', body: "Buttons, 31. One is a pawn's.", tag: 'HS-0222', material: 'tin' } },
  { id: 'EE-09', title: 'the photograph insert', location: 'landing', trigger: 'insert', source: 'the group portrait',
    what: 'nine figures as the card names them; Ida, aged six, looks off left at the operator', restraint: 'the unit is on the card and nowhere else; nothing is written on the print',
    card: { kind: 'index', title: 'GROUP PHOTOGRAPH, 1959', body: 'Left to right: Tuck, Lisle, Brace, M. Hardy, A. Hardy, I. Hardy (6), Ferrier, and two of the unit. August 1959.', tag: 'HS-0304', material: 'print' } },
  { id: 'EE-10', title: 'the moved badge', location: 'landing', trigger: 'hover the nail', source: 'badges and rosters (Moonrise; the Crossed Keys)',
    what: 'the sixth badge hangs below its hook; card: `Moved. Not removed.`', restraint: 'never explained who moved it',
    card: { kind: 'label', title: 'Moved. Not removed.', body: '' } },
  { id: 'EE-11', title: 'the Morse bulletin', location: 'landing', trigger: 'first and fourth watches', source: 'the Bishop house radio; the shipping forecast',
    what: 'Morse-rhythm bulletin, no voice; transcript ends `Halyard: four, moderate, rain later, good`', restraint: 'no voice, ever',
    card: { kind: 'typed', title: 'WIRELESS', body: 'Halyard: four, moderate, rain later, good' } },
  { id: 'EE-12', title: 'the eleven books', location: 'recorders', trigger: 'insert', source: "Suzy's invented library (Moonrise)",
    what: 'eleven spines', restraint: 'plausible novels; one may brush the theme, none names it; Ida summarises any plot seriously',
    card: { kind: 'index', title: 'BOOKS, 11', body: 'The Tide Book of Kettle Harbour · A Girl of the Skerries · Marion and the Lighthouse Boys · The Weather Ship · Signals for Beginners · The Seventh Form at Crail · Under Nine Lamps · Pony Island · The Latin Prize · Elizabeth of the Point · Field Notes of a Junior Hydrographer', tag: 'HS-0403', material: 'cloth' } },
  { id: 'EE-13', title: 'the August page', location: 'recorders', trigger: 'read the August page', source: "the narrator's foreknowledge (Grand Budapest)",
    what: '`THE VISITOR. Expected Tuesday. Arrived Wednesday.` typed before arrival', restraint: 'once; the only mention of the ferry in the game; Ida never mentions it',
    card: { kind: 'typed', title: 'THE VISITOR.', body: 'Expected Tuesday. Arrived Wednesday.' } },
  { id: 'EE-14', title: 'Record 4', location: 'recorders', trigger: 'play record 4', source: 'the wordless needle drop on the Belafonte',
    what: 'the Survey Theme on harmonium with wow and crackle; Ida types while it plays', restraint: 'the label reads `4`; no one says whose it is',
    card: { kind: 'label', title: '4', body: '' } },
  { id: 'EE-15', title: '"White to move. Not you."', location: 'quarters', trigger: 'try to move', source: 'the unfinished game as absent parent',
    what: '`White to move. Not you.`', restraint: 'one line',
    card: { kind: 'typed', title: 'White to move. Not you.', body: '' } },
  { id: 'EE-16', title: 'the mantel clock', location: 'quarters', trigger: 'hover', source: 'the stopped clocks of grief (Tenenbaums)',
    what: '`Stopped at 05:20. Not broken.`', restraint: "the time is the bulletin's; nobody connects them",
    card: { kind: 'index', title: 'MANTEL CLOCK', body: 'Stopped at 05:20. Not broken.', tag: 'HS-0508', material: 'enamel' } },
  { id: 'EE-17', title: 'the boarded pane', location: 'lamproom', trigger: 'hover', source: 'the day the unit came',
    what: 'chalk `1959`; `"A gull."`', restraint: "the only trace besides the photograph's card; nobody says the unit was here",
    card: { kind: 'index', title: 'THE BOARDED PANE', body: 'A gull.', tag: 'HS-0607', material: 'pine, paint · 1959' } },
  { id: 'EE-18', title: 'the lathe insert', location: 'workshop', trigger: 'insert', source: "Selick's stop-motion; Fantastic Mr Fox",
    what: 'a blank becomes a pawn in 6 s, 12 fps, shavings visible', restraint: 'the only 12 fps animation in the house' },
  { id: 'EE-19', title: 'THIRTY-THIRD', location: 'workshop', trigger: 'bring the float from c6', source: 'the kept mistake',
    what: 'the Keeper sets them side by side; THIRTY-THIRD is sewn and never listed', restraint: 'no fanfare; the roster does not show it; nothing else in the house changes' },
  { id: 'EE-20', title: 'the winch', location: 'boathouse', trigger: 'turn', source: 'the empty cradle',
    what: 'the cable comes in with nothing on it; ledger: `winch turned. nothing on the cable.`', restraint: 'once only',
    card: { kind: 'typed', title: 'winch turned. nothing on the cable.', body: '' } },
  { id: 'EE-21', title: 'Tuck to camera', location: 'jetty', trigger: 'first and fourth watches', source: 'the narrator (Moonrise)',
    what: 'Tuck turns to the camera and reads to "you" plural', restraint: 'he never looks at the camera otherwise; nobody says why he does' },
  { id: 'EE-22', title: 'the tent', location: 'path', trigger: 'insert', source: "Sam's camp (Moonrise)",
    what: 'a folded blanket, a tin, a chess book open at the Ruy Lopez', restraint: 'never entered',
    card: { kind: 'index', title: 'TENT, KHAKI', body: 'Voss. Not struck.', tag: 'HS-0914' } },
  { id: 'EE-23', title: 'stone S-6, 1957', location: 'path', trigger: 'stop at S-6', source: 'the authored flaw',
    what: "the stone is cut 1957 in a different hand; the other eight are 1931 in the founder's", restraint: 'no gesture, no line, no bird' },
  { id: 'EE-24', title: 'cairn tags', location: 'grid', trigger: 'look', source: "Chas's boxes; survey ribbons",
    what: '`RETURNED  EXPEDITION 3  MOVE 17`', restraint: "persists across sessions; the world's memory of the chess",
    card: { kind: 'tag', title: 'RETURNED  EXPEDITION 3  MOVE 17', body: '' } },
  { id: 'EE-25', title: 'the cracked plate', location: 'cinder', trigger: 'look at the plate', source: 'the board as chart of the place',
    what: 'cracked exactly as square c6', restraint: 'never remarked on' },
  { id: 'EE-26', title: 'the beam over the plates', location: 'grid', trigger: 'light the lamp', source: "the lighthouse sweep; Selick's lamp-lit sea",
    what: 'the red beam sweeps and the plates glint in file order, one tick each', restraint: 'light on brass; nothing glows of itself' },
  { id: 'EE-27', title: 'the slate names', location: 'eider', trigger: 'before Chapter Eight', source: 'naming as claim',
    what: "plates `NOT SURVEYED`; on Voss's slate the Kettle boats' older names (Haaf Ness, Hask Shoal, Hallan Flat, Heugh Reach, Hirst Sound, Howe Holm, Hoy Skerry, Hough Head)", restraint: 'brass wins; slate stays; nobody is honoured',
    card: { kind: 'index', title: "THE SURVEYOR'S SLATE", body: "Sixty-four names in his hand. The h-file carries the Kettle boats' names, the older ones: Haaf Ness, Hask Shoal, Hallan Flat, Heugh Reach, Hirst Sound, Howe Holm, Hoy Skerry, Hough Head.", tag: 'HS-1003' } },
  { id: 'EE-28', title: 'the bent e on the 9 June card', location: 'eider', trigger: 'insert', source: 'a story bound by a glyph (Dispatch)',
    what: "`40. Rc8   your move, then. A.H.` in the Olivetti's bent `e`", restraint: 'the card was typed at the station before he left; nobody says so; no card annotates the glyph',
    card: { kind: 'typed', title: '40. Rc8   your move, then. A.H.', body: '' } },
  { id: 'EE-29', title: '"I am going on."', location: 'heron', trigger: 'insert', source: 'the last log entry in every expedition story',
    what: '`Sheet complete. I am going on.`', restraint: 'no music until the player leaves the islet; nothing about the boat',
    card: { kind: 'typed', title: 'SHEET 9', body: 'h8 Heron Head. Surveyed 14 June 1965. A.H. Sheet complete. I am going on.' } },
  { id: 'EE-30', title: 'the photograph', location: 'jetty', trigger: 'ending', source: "the group tableau; Moonrise's final stillness",
    what: "the residents in a row; the player's badge on a post; one paper-white frame, 50 ms", restraint: 'no one looks at anyone' },
  { id: 'EE-31', title: 'Order 4 broken', location: 'boardroom', trigger: 'ending', source: 'the one rule broken at the end (Grand Budapest)',
    what: 'the board goes last; Order 4 is broken; its placard stays on the wall', restraint: 'no card names the breach' },
  { id: 'EE-32', title: "the Appendix's chair, cap and gauge", location: 'boardroom', trigger: 'return', source: 'the empty chair',
    what: 'the chair, the cap and the level gauge', restraint: 'no line, ever' },
]

/** The register in the shared shape. */
export const eggs: EggDef[] = eggEntries

/** Finds an egg by id. */
export function findEgg(id: string): EggEntry | undefined {
  return eggEntries.find((e) => e.id === id)
}

/** The eggs registered in a frame. */
export function eggsIn(frameId: string): EggEntry[] {
  return eggEntries.filter((e) => e.location === frameId)
}
