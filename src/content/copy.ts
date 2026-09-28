// Every user-facing string, transcribed from docs/BIBLE.md §4 (the plate, the chapter card, the placards,
// the tags, the ledger, the Orders, the error states), §5.5 (results), §5.11 (the Second), §7 (the causeway
// card, the plates) and §9 (the Appendix). Where the bible gives words they are verbatim; where it does not,
// the register is the bible's: short declarative sentences, no exclamation marks, no question marks, capitals
// letterspaced for signage, a full stop after every placard sentence, every date with a year, times 24-hour,
// errors as a condition of the station ending with what continues. Pure data; `{slot}` templates use fmt().

import type { Color, GameEndReason, GameResult, PieceType, WatchId } from '../types'

/** Fills `{slot}` placeholders in a template. Unknown slots are left as written. */
export function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m))
}

/** The typed width of the Olivetti's page: 62 characters (§4 rule 3). */
export const TYPED_WIDTH = 62

/** One of the seven error-state cards of §4, keyed as the sidecar's probe selects them (§5.11). */
export type ErrorCardKey = 'missing' | 'unauthenticated' | 'unreachable' | 'slow' | 'empty' | 'predictor' | 'nosave'

/** An error-state card: the first line is its heading in capitals; the last is always what continues. */
export interface ErrorCard { title: string; lines: string[] }

export const copy = {
  /** The title and subtitle of §2. */
  brand: {
    title: 'THE HALYARD SURVEY',
    subtitle: 'A CHESS GAME AND A SURVEY OF THE SIXTY-FOUR',
    chapters: 'IN NINE CHAPTERS',
  },

  /** The main menu plate of §4: Jost, a brass plate on the pale blue wall. */
  menu: {
    title: 'THE HALYARD SURVEY',
    subtitle: ['A CHESS GAME AND A SURVEY OF THE SIXTY-FOUR', 'IN NINE CHAPTERS'],
    items: {
      begin: 'BEGIN THE SEASON',
      /** The caller fills the date and expedition: `CONTINUE  ·  14 SEPTEMBER 1965  ·  EXPEDITION 4 ADJOURNED`. */
      continue: 'CONTINUE  ·  {date}  ·  EXPEDITION {n} ADJOURNED',
      ledger: 'THE LEDGER',
      roster: 'THE ROSTER',
      orders: 'THE STANDING ORDERS',
      /** Offered after the ending (§9). */
      appendix: 'THE APPENDIX',
    },
    footer: 'HALYARD ISLAND HYDROGRAPHIC STATION.  EST. 1931.',
    /** The Appendix's one line (§9). */
    appendixCard: 'The Society can count it again.',
    /** The heading every further game is entered under after the ending. */
    appendixHeading: 'OCTOBER 1965 AND AFTER',
    /** The way back from any screen the plate opens. */
    return: 'RETURN',
  },

  /** The Recorder's typed chapter page (§4): heading, room, one past-tense sentence, sign-off, date. */
  chapterCard: {
    heading: 'CHAPTER {word}',
    words: ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE'],
    signoff: 'I. Hardy, Recorder',
    holdMs: 3200,
  },

  /** The screens the plate opens. */
  screens: {
    ledger: 'THE LEDGER',
    roster: 'THE ROSTER',
    orders: 'THE STANDING ORDERS',
    rosterFooter: 'ONE HOOK PER RANK.',
  },

  /** Engraved brass placards (§4, §7). Capitals, centred, a full stop after every sentence. */
  placards: {
    gauge: 'TIDE GAUGE.  READ FROM THE LEFT.  DO NOT ADJUST.',
    board: 'THE BOARD IS NEVER LEFT UNSET.  STANDING ORDER 4.',
    cradle: 'LAUNCH KITTIWAKE.  CRADLE.  DEPARTED 11 JUNE 1965.',
    predictor: 'THE PREDICTOR.  WOUND ON SUNDAYS.  IT HOLDS A WEEK.',
    warning: 'THE GRID IS SURVEYED. IT IS NOT SAFE. STANDING ORDER 9.',
    consult: 'CONSULT',
    returned: 'THE RETURNED',
    spares: 'SPARES',
  },

  /** The luggage tags of §4: two tags, each two columns, three lines. */
  tags: {
    stationMaster: { left: ['HARDY, A.', 'HALYARD I.', 'NOT WANTED ON VOYAGE'], right: ['STATION MASTER', 'VIA KETTLE FERRY', ''] },
    visitor: { left: ['VISITOR', 'GUEST CHAIR', 'WANTED ON VOYAGE'], right: ['PROVISIONAL', '1 SEPTEMBER 1965', ''] },
    /** The tag that slides into THE RETURNED on a capture (§5.5). */
    returned: 'RETURNED  MOVE {move}  {islet}',
    promoted: 'PROMOTED  MOVE {move}  {islet}',
    cairn: 'RETURNED  EXPEDITION {expedition}  MOVE {move}',
    counted: 'COUNTED.  B.L.',
    crated: 'CRATED',
  },

  /** The ledger roll (§4): header, column heads, the leader, crates, results. */
  ledger: {
    title: 'THE LEDGER',
    header: 'EXPEDITION {n}     {watch}     SEA STATE {sea}     {date}',
    columns: ['No.', 'VISITOR', 'THE CHAIR', 'ISLET', 'REMARK'],
    columnsLine: 'No.    VISITOR   THE CHAIR   ISLET            REMARK',
    /** Three fixed lines above the season's first row; the second is in ink and in Jost. */
    leader: [
      'VOL. XIII ENDS.',
      'EXPEDITION 1,000.  1959.  HARDY v. HARDY (I.), AGED SIX.  1-0 IN 12.  ENTERED BY A.H.',
      'VOL. XIV.  SEPTEMBER 1965.  I. HARDY, RECORDER.',
    ],
    /** The index of the leader line in the Station Master's hand. */
    leaderInkLine: 1,
    crate: 'CRATE {n}.  {object}.  CRATED {date}.  B.L.',
    remarks: {
      firstReturn: 'first return',
      flagU: 'flag U hoisted',
      chairThought: 'the chair thought for {seconds} s',
    },
    lines: {
      hold: 'Hold.',
      resignation: '0-1 by resignation.',
      onTime: 'on time.',
      adjourned: 'ADJOURNED.  SEALED MOVE.',
      cairnRead: 'Cairn {square} ({islet}) read.',
      winch: 'winch turned. nothing on the cable.',
      tideCameIn: 'The tide came in. Mr Tuck came for you in the dinghy. It is entered in the log.',
      houseGame: 'Hardy v. Voss. By post 1961–65. Concluded over the board 30 Sept 1965 by the Visitor for L. Voss. {result}',
      lastPage: 'The season is closed. The board is set. — I. Hardy, Recorder.',
    },
    tearOff: 'Tear off a copy',
    copied: 'A copy is torn off.',
    empty: 'No expedition is entered.',
  },

  /** The seven error states of §4, typed cards held until dismissed; the game continues behind them. */
  errors: {
    missing: {
      title: 'THE SECOND IS NOT AT THE STATION.',
      lines: ['The command "claude" was not found on this machine.', 'The game continues.'],
    },
    unauthenticated: {
      title: 'MISS BRACE CANNOT BE CONSULTED.',
      lines: ['The Claude tool is installed but not signed in.', 'Run "claude" once in a terminal and return.', 'The game continues.'],
    },
    unreachable: {
      title: 'PORT 4664 DOES NOT ANSWER.',
      lines: ['The station could not reach the sidecar.', 'Start it with:  npm run dev', 'The game continues.'],
    },
    slow: {
      title: 'THE SECOND IS THINKING LONGER THAN IS USEFUL.',
      lines: ['Her remark will be entered when it arrives.', 'The game continues.'],
    },
    empty: {
      title: 'THE SECOND HAS SAID NOTHING.',
      lines: ['The reply was empty.  She was asked again.', 'The game continues.'],
    },
    predictor: {
      title: 'THE PREDICTOR HAS NOT REPORTED.',
      lines: ['The chair is silent.  The move will be made at sea state 0.', 'The game continues.'],
    },
    nosave: {
      title: 'NOTHING IS SAVED.',
      lines: ['Your browser will not keep the log between visits.', 'The game continues but will not be entered.'],
    },
  } satisfies Record<ErrorCardKey, ErrorCard>,

  /** The HUD: the chronometer pair, the roll, THE RETURNED, the status line, the board controls. */
  hud: {
    visitor: 'VISITOR',
    chair: 'THE CHAIR',
    clocks: 'CHRONOMETER PAIR',
    ledger: 'THE LEDGER',
    returned: 'THE RETURNED',
    /** `TABLE · CHART · PROFILE ┃ CONSULT ┃ TAKE BACK · OFFER A DRAW · RESIGN ┃ ADJOURN`. */
    controls: {
      table: 'TABLE',
      chart: 'CHART',
      profile: 'PROFILE',
      consult: 'CONSULT',
      takeBack: 'TAKE BACK',
      draw: 'OFFER A DRAW',
      resign: 'RESIGN',
      adjourn: 'ADJOURN',
    },
    /** A statement replaces the control row; the verb is in the player's hand (§4 rule 8). */
    confirm: {
      resign: 'A RESIGNED GAME IS A FINISHED GAME.',
      draw: 'THE OFFER GOES TO THE CHAIR.',
      takeBack: 'THE MOVE IS STRUCK THROUGH.  NOT ERASED.',
      yes: 'SO ENTERED',
      no: 'RETURN',
    },
  },

  /** The status line, centred at the bottom in letterspaced capitals. */
  status: {
    visitorToMove: 'THE VISITOR TO MOVE',
    chairToMove: 'THE CHAIR TO MOVE',
    /** The clock's second hand is the only spinner: no dots. */
    thinking: 'THE CHAIR IS THINKING',
    check: 'FLAG U HOISTED',
    adjourned: 'ADJOURNED.  SEALED MOVE.',
    hold: 'HOLD.',
  },

  /** Results as the status line and the ledger type them (§5.5). */
  results: {
    checkmate: 'CHECKMATE.  FLAGS N OVER C.  {result}.',
    stalemate: '1/2-1/2.  SLACK WATER.',
    insufficient: '1/2-1/2.  NOTHING LEFT TO MOVE.',
    threefold: '1/2-1/2 BY REPETITION.',
    'fifty-move': '1/2-1/2 BY THE FIFTY-MOVE RULE.',
    resignation: '{result} BY RESIGNATION.  FLAG P.',
    timeout: '{result} ON TIME.',
    agreement: '1/2-1/2 BY AGREEMENT.  FLAGS AT HALF HEIGHT.',
  } satisfies Record<GameEndReason, string>,

  /** The draw reasons as the ledger types them after `1/2-1/2`. */
  drawReasons: {
    threefold: 'by repetition',
    'fifty-move': 'by the fifty-move rule',
    stalemate: 'slack water',
    agreement: 'by agreement',
    insufficient: 'nothing left to move',
  },

  pieces: {
    p: 'Pawn', n: 'Knight', b: 'Bishop', r: 'Rook', q: 'Queen', k: 'King',
  } satisfies Record<PieceType, string>,

  /** The watches as engraved on the chronometer plate (§5.6). */
  watches: {
    dog: 'DOG WATCH', middle: 'MIDDLE WATCH', long: 'LONG WATCH', none: 'NO WATCH',
  } satisfies Record<WatchId, string>,

  /** The Second's card and the other residents' (§5.11, §8). */
  converse: {
    placeholder: 'Write to {name}',
    /** The visitor's lines in the transcript. */
    you: 'THE VISITOR',
    /** The way back when the card was opened from the board, and from anywhere else. */
    returnToBoard: 'RETURN TO THE BOARD',
    close: 'RETURN',
  },

  /** Paper: cards, tags, placards, the reading. */
  cards: {
    close: 'RETURN',
    /** The one typed card that is the tutorial (§9). */
    firstCard: 'Standing Order 11. The guest has the first move.',
    /** The card on the board in Chapter Nine when the 41. Kf3 postcard was carried. */
    houseGameCard: 'Hardy v. Voss. Black to move. You may sit.',
    /** The travelling set in the Quarters, when moved (EE-15). */
    notYou: 'White to move. Not you.',
    /** The title of Tuck's reading strip. */
    reading: 'THE READING',
    /** The telegram form's fixed fields. */
    telegramForm: { header: 'TELEGRAM', office: 'OFFICE OF ORIGIN', received: 'RECEIVED', words: 'WORDS' },
  },

  /** God's-eye inserts (§11): the tag on felt, the photograph, a page, a sheet, the books, the postcards. */
  inserts: {
    returnedHoldMs: 500,
    holdMs: 600,
    /** The caption under the 1959 photograph (HS-0304). Nothing is written on the print. */
    photographCaption: 'Left to right: Tuck, Lisle, Brace, M. Hardy, A. Hardy, I. Hardy (6), Ferrier, and two of the unit. August 1959.',
    sheetNineLast: 'h8 Heron Head. Surveyed 14 June 1965. A.H. Sheet complete. I am going on.',
  },

  /** Hover labels for the world: doors and the compound islet name (§5.4, §6). */
  hover: {
    door: 'TO {room}',
    chartRoom: 'TO THE CHART ROOM',
    galley: 'TO THE GALLEY',
    landing: 'TO THE LANDING',
    boardRoom: 'TO THE BOARD ROOM',
    /** `e4  ·  EIDER REACH`. */
    islet: '{square}  ·  {islet}',
    sit: 'THE GUEST CHAIR',
    consult: 'CONSULT',
  },

  /** The causeway card (§7): the tide-hours and tens of minutes until the next crossable state. */
  causeway: {
    covered: 'Water over the causeway. {hours} h {minutes} min.',
    open: 'The causeway is dry. {hours} h {minutes} min.',
    title: 'CAUSEWAY',
  },

  /** Short typed lines at the bottom of the frame. */
  toasts: {
    saved: 'Entered in the log.',
    drawDeclined: 'The offer is declined.  The card is pushed back.',
    drawAccepted: 'The offer is accepted.  Flags at half height.',
    illegal: 'The pins did not rise for that.',
    copied: 'A copy is torn off.',
    nothingToUndo: 'There is nothing to strike through.',
    lineRestored: 'The line is restored.',
    chapterUnlocked: 'CHAPTER {word}  ·  {title}',
    eggFound: '{title}',
  },

  settings: {
    title: 'THE INSTRUMENTS',
    sound: 'SOUND',
    music: 'RECORD 4',
    letterbox: 'MATTE',
    grain: 'GRAIN',
    model: 'MODEL',
    playerName: 'YOUR NAME',
    on: 'ON',
    off: 'OFF',
  },

  world: {
    enter: 'ENTER',
    inspect: 'READ',
    talk: 'SPEAK',
    sit: 'SIT',
    egg: 'SOMETHING',
  },
} as const

/** The side the Visitor plays is the light side unless the lazy susan was turned; the other side is the chair. */
export function sideName(c: Color, playerColor: Color): string {
  return c === playerColor ? copy.hud.visitor : copy.hud.chair
}

/** The status line after a move: whose move it is, and whether flag U is up. */
export function toMoveText(turn: Color, inCheck: boolean, playerColor: Color = 'w'): string {
  const base = turn === playerColor ? copy.status.visitorToMove : copy.status.chairToMove
  return inCheck ? `${copy.status.check}  ·  ${base}` : base
}

/** The result string from the winner: `1-0`, `0-1` or `1/2-1/2`. */
export function resultOf(winner: Color | null): GameResult {
  return winner === 'w' ? '1-0' : winner === 'b' ? '0-1' : '1/2-1/2'
}

/** The status line at the end of a game, per §5.5. */
export function resultText(reason: GameEndReason, winner: Color | null): string {
  const template: string = copy.results[reason]
  return fmt(template, { result: resultOf(winner) })
}

/** The line the ledger types for a result: `1/2-1/2 by repetition`, `0-1 by resignation.`, `on time.`, `1-0`. */
export function ledgerResultLine(reason: GameEndReason, winner: Color | null): string {
  const result = resultOf(winner)
  switch (reason) {
    case 'threefold': case 'fifty-move': case 'stalemate': case 'agreement': case 'insufficient':
      return `1/2-1/2 ${copy.drawReasons[reason]}`
    case 'resignation': return `${result} by resignation.`
    case 'timeout': return `${result} ${copy.ledger.lines.onTime}`
    case 'checkmate': return result
  }
}

/** The chapter heading as typed: `CHAPTER ONE`. */
export function chapterHeadingText(n: number): string {
  return fmt(copy.chapterCard.heading, { word: copy.chapterCard.words[n - 1] ?? String(n) })
}

/** The error card for a key. */
export function errorCard(key: ErrorCardKey): ErrorCard {
  return copy.errors[key]
}

/** The name the transcript labels a resident's lines with: the surname in capitals. */
export function transcriptName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/)
  return (parts[parts.length - 1] ?? fullName).toUpperCase()
}

/** Sorts the seven error keys the probe can select from a free-text health reason (§5.11). */
export function errorKeyForReason(reason: string | undefined): Extract<ErrorCardKey, 'missing' | 'unauthenticated' | 'unreachable'> {
  const r = (reason ?? '').trim()
  if (r === 'missing' || r === 'unauthenticated' || r === 'unreachable') return r
  if (/log ?in|auth|credential|api key/i.test(r)) return 'unauthenticated'
  if (/ENOENT|not found|missing/i.test(r)) return 'missing'
  return 'unreachable'
}

/** The colour that is not the player's: the chair's side. */
export function chairColor(playerColor: Color): Color {
  return playerColor === 'w' ? 'b' : 'w'
}

/** The compound islet hover label: `e4  ·  EIDER REACH`. */
export function isletHover(square: string, islet: string): string {
  return fmt(copy.hover.islet, { square, islet: islet.toUpperCase() })
}

/** The causeway card's time, from real seconds until the next crossable state: tide-hours and tens of minutes. */
export function causewayText(secondsToChange: number, crossable: boolean): string {
  const tideHours = secondsToChange / 120
  const hours = Math.floor(tideHours)
  const minutes = Math.floor(((tideHours - hours) * 60) / 10) * 10
  return fmt(crossable ? copy.causeway.open : copy.causeway.covered, { hours, minutes: String(minutes).padStart(2, '0') })
}
