import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PIECE_KEYS } from '../../contracts/chess'
import type { Room, StageRect, WorldObject } from '../../contracts/world'
import { isSymbolId } from '../art/symbols'
import { CARD_1, CARD_2, CARD_3 } from './title-cards'
import { buildWorld } from './index'
import { ledgerDate, romanMonth } from './ledger-date'
import { cardNumber } from './pieces'
import { ROOM_1, ROOM_1_OBJECTS } from './room1'

const world = buildWorld()
const room1 = world.rooms[0] as Room

/**
 * docs/voice.md section 8, read from the document so the words are typed
 * nowhere in the code: the bible's list, then the additions, as whole words.
 */
function bannedWords(): string[] {
  const voice = readFileSync(resolve(__dirname, '../../../docs/voice.md'), 'utf8')
  const section = voice.slice(voice.indexOf('## 8. Banned vocabulary'), voice.indexOf('## 9.'))
  const lists = [/\*\*From the bible:\*\*([^\n]+)/, /\*\*Additions \(same faults\):\*\*([^\n]+)/]
  const words: string[] = []
  for (const re of lists) {
    const m = re.exec(section)
    if (!m) continue
    // The three words banned only "as sentiment" are judged by a reader, not a regex.
    const line = (m[1] as string).replace(/["\u201c]memory["\u201d].*$/, '')
    for (const raw of line.split(/[,;]/)) {
      const word = raw.replace(/["\u201c\u201d]/g, '').replace(/\s+as sentiment.*$/, '').replace(/\(.*\)/, '').trim().replace(/\.$/, '')
      if (word && !word.includes(' instead')) words.push(word)
    }
  }
  return words
}
const BANNED = bannedWords()

function strings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value)
  else if (Array.isArray(value)) for (const v of value) strings(v, out)
  else if (value && typeof value === 'object') for (const v of Object.values(value as Record<string, unknown>)) strings(v, out)
  return out
}

/** Everything the player can read, including the chapter cards and the third-hand line. */
function everyString(): string[] {
  const { chapterCard, ledgerDate: _ld, ...data } = world
  void _ld
  const out = strings(data)
  for (const room of world.rooms) out.push(...chapterCard(room))
  return out
}

/** Strict overlap; edges that touch (65.1 against 65.1 in floating point) do not count. */
function overlaps(a: StageRect, b: StageRect): boolean {
  const eps = 1e-6
  return a.x + eps < b.x + b.w && b.x + eps < a.x + a.w && a.y + eps < b.y + b.h && b.y + eps < a.y + a.h
}

describe('the world', () => {
  it('has twelve chapters, Room 1 first and the only one open', () => {
    expect(world.rooms).toHaveLength(12)
    expect(room1.id).toBe('room-1')
    expect(room1.unlocked).toBe(true)
    expect(world.rooms.slice(1).every((r) => !r.unlocked && r.objects.length === 0)).toBe(true)
    expect(world.rooms.map((r) => r.chapter)).toEqual(['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'])
  })

  it('gives every room six colours and Iron Gall as the sixth', () => {
    for (const room of world.rooms) {
      const values = Object.values(room.palette)
      expect(values).toHaveLength(6)
      for (const v of values) expect(v).toMatch(/^#[0-9A-Fa-f]{6}$/)
      expect(room.palette.ink).toBe('#202834')
    }
    expect(room1.palette).toEqual({ wall: '#6E7D69', wood: '#5A4530', light: '#D8BE8C', dark: '#2B1F19', wax: '#A0281E', ink: '#202834' })
  })

  it('shows the three title cards verbatim: two, then the chapter card of Room 1', () => {
    expect(world.titleCards).toHaveLength(2)
    expect(world.titleCards[0]).toEqual(CARD_1)
    expect(world.titleCards[1]).toEqual(CARD_2)
    expect(world.chapterCard(room1)).toEqual(CARD_3)
    expect(CARD_1[0]).toBe('REPUBLIC OF VARDENNE')
    expect(CARD_1[2]).toBe('')
    expect(CARD_3[2]).toBe('THE DECLARATIONS ROOM')
  })

  it('makes a chapter card for every later room in the same shape', () => {
    const card = world.chapterCard(world.rooms[9] as Room)
    expect(card).toEqual(['X.', 'GROUNDS 1', 'THE BRIDGE', '', 'Eleven arches, one hundred and forty metres, closed to traffic 1978, crossing grass since 1983.'])
    expect(world.chapterCard(world.rooms[11] as Room)[1]).toBe('BEYOND')
  })

  it('formats the ledger date as day, roman month, two-digit year', () => {
    expect(world.ledgerDate(new Date(1990, 2, 14))).toBe('14 III 90')
    expect(world.ledgerDate(new Date(2026, 8, 28))).toBe('28 IX 90')
    expect(world.ledgerDate(new Date(2031, 0, 1))).toBe('1 I 90')
    expect(ledgerDate(new Date(1977, 11, 31), 1977)).toBe('31 XII 77')
    expect(romanMonth(11)).toBe('XII')
    expect(world.year).toBe(1990)
  })

  it('has all twelve piece dossiers with the bible titles and two lines each', () => {
    for (const key of PIECE_KEYS) {
      const d = world.pieces[key]
      expect(d.key).toBe(key)
      expect(d.lines).toHaveLength(2)
      expect(d.name.length).toBeGreaterThan(0)
    }
    expect(world.pieces.wK.name).toBe('White King, e1. "The Lamp."')
    expect(world.pieces.bR.lines[1]).toBe('In pencil: now the only record of its roofline.')
    expect(world.pieces.wB.lines[1].startsWith('In pencil:')).toBe(true)
    expect(world.pieces.bQ.lines[1].startsWith('In pencil:')).toBe(true)
    expect(world.pieces.wN.lines[1]).toBe('Does not match its partner. The original is on loan.')
  })

  it('numbers the thirty-two roster cards', () => {
    expect(cardNumber('wK')).toBe(1)
    expect(cardNumber('wR', 'a1')).toBe(3)
    expect(cardNumber('wR', 'h1')).toBe(4)
    expect(cardNumber('wP', 'd2')).toBe(12)
    expect(cardNumber('bK')).toBe(17)
    expect(cardNumber('bP', 'h7')).toBe(32)
    expect(cardNumber('bN', 'g8')).toBe(24)
  })

  it('has the household from section 4', () => {
    const names = world.household.map((h) => h.name)
    expect(names).toEqual([
      'Gregor Ostrow', 'Anselm Ostrow', 'Ida Ostrow', 'Teodor Ostrow', 'Marit Ostrow', 'Wenzel Halm', 'Edmund Prell', 'The Visitor', 'Annelie',
    ])
    for (const h of world.household) expect(h.lines.length).toBeGreaterThan(0)
  })

  it('gives the opponent his hours, words and default', () => {
    expect(world.opponent.name).toBe('Mr Halm')
    expect(world.opponent.hours.map((h) => h.label)).toEqual(['18.00', '20.00', '22.00', 'After'])
    const strengths = world.opponent.hours.map((h) => h.strength)
    expect(strengths[0]).toBe(1)
    expect(strengths[3]).toBe(8)
    for (let i = 1; i < strengths.length; i++) expect(strengths[i] as number).toBeGreaterThan(strengths[i - 1] as number)
    expect(world.opponent.defaultHour).toBeGreaterThanOrEqual(0)
    expect(world.opponent.defaultHour).toBeLessThan(4)
    expect(world.opponent.lines).toEqual({ please: 'Please.', thankYou: 'Thank you.', thankYouHelder: 'Dank u.', positionKeeps: 'The position keeps.' })
  })

  it('gives the narrator his name, dash, placeholder and label', () => {
    expect(world.narrator).toEqual({ name: 'Edmund Prell', silenceMark: '—', placeholder: 'Ask.', visitorLabel: 'Visitor (1).' })
  })

  it('has the controls in the house register', () => {
    expect(world.controls.resign).toBe('Resign.')
    expect(world.controls.takeBlack).toBe('Take black.')
    expect(world.controls.takeWhite).toBe('Take white.')
    expect(world.controls.soundOn).not.toBe(world.controls.soundOff)
  })

  it('contains no banned word and no exclamation mark anywhere', () => {
    const all = everyString()
    expect(all.length).toBeGreaterThan(100)
    expect(BANNED.length).toBeGreaterThan(30)
    expect(BANNED).toContain('died')
    expect(BANNED).toContain('ghost')
    for (const s of all) {
      expect(s, s).not.toContain('!')
      for (const word of BANNED) {
        const re = new RegExp(`\\b${word.replace(' ', '\\s+')}\\b`, 'i')
        expect(re.test(s), `"${word}" in "${s}"`).toBe(false)
      }
    }
  })
})

describe('Room 1', () => {
  const objects = room1.objects
  const doors = objects.filter((o) => o.kind === 'door')

  it('has every object of bible section 9 and the coordinate table', () => {
    const ids = objects.map((o) => o.id)
    for (const id of ['1-01', '1-02', '1-03', '1-03a', '1-04-left', '1-04-right', '1-05', '1-06', '1-07', '1-08', '1-09', '1-10', '1-11', '1-12', '1-13', '1-14', '1-15', '1-16', '1-17', '1-18', 'S-4', 'halm']) {
      expect(ids, id).toContain(id)
    }
    expect(objects).toHaveLength(22)
    expect(ROOM_1_OBJECTS).toBe(ROOM_1.objects)
  })

  it('has unique ids and known symbols', () => {
    const ids = objects.map((o) => o.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const o of objects) expect(o.symbol && isSymbolId(o.symbol), o.id).toBe(true)
  })

  it('keeps every rect inside the stage and the scene', () => {
    for (const o of objects) {
      const r = o.rect
      expect(r.x, o.id).toBeGreaterThanOrEqual(0)
      expect(r.y, o.id).toBeGreaterThanOrEqual(0)
      expect(r.w, o.id).toBeGreaterThan(0)
      expect(r.h, o.id).toBeGreaterThan(0)
      expect(r.x + r.w, o.id).toBeLessThanOrEqual(70)
      expect(r.y + r.h, o.id).toBeLessThanOrEqual(100)
    }
  })

  it('has four doors and a trap, none overlapping, each leading to a room and locked', () => {
    expect(doors.map((d) => d.id).sort()).toEqual(['1-12', '1-13', '1-14', '1-15', '1-16'])
    for (let i = 0; i < doors.length; i++) {
      for (let j = i + 1; j < doors.length; j++) {
        expect(overlaps((doors[i] as WorldObject).rect, (doors[j] as WorldObject).rect), `${doors[i]?.id} and ${doors[j]?.id}`).toBe(false)
      }
    }
    const roomIds = new Set(world.rooms.map((r) => r.id))
    for (const d of doors) {
      expect(d.locked, d.id).toBe(true)
      expect(d.leadsTo && roomIds.has(d.leadsTo), `${d.id} leads to ${d.leadsTo}`).toBe(true)
      expect(d.lockedCaption).toBe(d.caption)
    }
  })

  it('separates the locked sentence and ends the caption with it', () => {
    for (const id of ['1-12', '1-13', '1-14', '1-15']) {
      const d = objects.find((o) => o.id === id) as WorldObject
      expect(d.entry.lockedSentence, id).toBeTruthy()
      expect(d.caption.endsWith(d.entry.lockedSentence as string), id).toBe(true)
      expect(d.entry.annotation.includes(d.entry.lockedSentence as string)).toBe(false)
    }
    const door13 = objects.find((o) => o.id === '1-13') as WorldObject
    expect(door13.caption).toBe(
      '1-13. Door to Room 3, oak. Locked. Ministry key 7/3, held at the Keys Registry, Sallenau. R. — Requested 1977 and 1979. Not located. Room 3 is typed. It is not yet annotated.',
    )
    expect(door13.entry.lockedSentence).toBe('Room 3 is typed. It is not yet annotated.')
    const trap = objects.find((o) => o.id === '1-16') as WorldObject
    expect(trap.entry.lockedSentence).toBeUndefined()
  })

  it('splits each caption into columns without changing a word', () => {
    for (const o of objects) {
      const e = o.entry
      expect(o.caption.includes(e.annotation), o.id).toBe(true)
      // Material was lifted out of the middle of the bible's line, so the check is phrase by phrase.
      for (const value of [e.item, e.description, e.material, e.condition, e.disposition]) {
        if (!value) continue
        for (const phrase of value.split(/[,;]\s*/)) {
          const core = phrase.trim().replace(/\.$/, '')
          if (core) expect(o.caption.includes(core), `${o.id}: "${core}"`).toBe(true)
        }
      }
      if (e.ownership) expect(o.caption.includes(`${e.ownership}.`), o.id).toBe(true)
      expect(['', 'R', 'H', 'D']).toContain(e.ownership)
      if (e.item) expect(o.caption.startsWith(`${e.item}. `), o.id).toBe(true)
    }
    const coat = objects.find((o) => o.id === '1-03') as WorldObject
    expect(coat.entry).toMatchObject({ material: 'wool, grey-green', ownership: 'R', disposition: 'To be returned.', annotation: 'Not returned.' })
    const set = objects.find((o) => o.id === '1-10') as WorldObject
    expect(set.entry.ownership).toBe('D')
    expect(set.entry.disposition).toBe('Pending.')
  })

  it('has the four slots, the board square and the tray 190 by 144 rpx', () => {
    const slots = room1.slots as Record<string, StageRect>
    expect(Object.keys(slots).sort()).toEqual(['board', 'ledger', 'narrator', 'tray'])
    const board = slots.board as StageRect
    expect(board).toEqual({ x: 18.125, y: 14, w: 33.75, h: 60 })
    expect((board.w / 100) * 1600).toBeCloseTo((board.h / 100) * 900, 6)
    const tray = slots.tray as StageRect
    expect((tray.w / 100) * 1600).toBeCloseTo(190, 6)
    expect((tray.h / 100) * 900).toBeCloseTo(144, 6)
    expect(slots.ledger).toEqual({ x: 71.5, y: 31, w: 27, h: 34 })
    expect(slots.narrator).toEqual({ x: 71.5, y: 66, w: 27, h: 32.5 })
    for (const r of Object.values(slots)) {
      expect(r.x + r.w).toBeLessThanOrEqual(100)
      expect(r.y + r.h).toBeLessThanOrEqual(100)
    }
  })

  it('keeps the symmetry: the greatcoat is the one asymmetry, the east hook empty', () => {
    const coat = objects.find((o) => o.id === '1-03') as WorldObject
    const hook = objects.find((o) => o.id === '1-03a') as WorldObject
    expect(coat.rect.x).toBeLessThan(35)
    expect(hook.rect.x).toBeGreaterThan(35)
    expect(hook.entry.annotation.startsWith('Empty.')).toBe(true)
  })
})
