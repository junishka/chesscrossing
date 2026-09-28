import type { Ledger, Season, Settings } from '../types'
import { bus } from './bus'

const KEY = 'chesscrossing.ledger.v1'

export const DEFAULT_SETTINGS: Settings = {
  sound: true,
  music: true,
  letterbox: true,
  grain: true,
  model: 'claude-opus-5-5',
  playerName: '',
}

export function blankSeason(): Season {
  return {
    date: 1, watch: 0, watchElapsed: 0, tide: 0.5, seaState: 4, timeControl: 'none', rating: 1400,
    expeditions: 0, warrants: ['king'], badges: ['PROVISIONAL'], platesRead: [], cairnTags: [], gridSquare: null,
    carriedCard: false, crated: [], chapter: 1, ended: false, lampLit: false, spokenTo: [],
  }
}

function blank(): Ledger {
  return {
    version: 1,
    chapters: [],
    eggs: [],
    visited: [],
    inspected: [],
    games: { played: 0, won: 0, lost: 0, drawn: 0 },
    settings: { ...DEFAULT_SETTINGS },
    conversations: {},
    season: blankSeason(),
  }
}

function load(): Ledger {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return blank()
    const parsed = JSON.parse(raw) as Partial<Ledger>
    const base = blank()
    return {
      ...base,
      ...parsed,
      version: 1,
      games: { ...base.games, ...(parsed.games ?? {}) },
      settings: { ...base.settings, ...(parsed.settings ?? {}) },
      conversations: parsed.conversations ?? {},
      season: { ...blankSeason(), ...(parsed.season ?? {}) },
    }
  } catch {
    return blank()
  }
}

/** The Ledger: everything the house remembers about the player. Persisted to localStorage. */
class Store {
  ledger: Ledger = load()
  private timer: number | null = null

  save(): void {
    if (this.timer !== null) return
    this.timer = window.setTimeout(() => {
      this.timer = null
      try { localStorage.setItem(KEY, JSON.stringify(this.ledger)) } catch { /* private mode */ }
    }, 50)
  }

  /** Adds an id to a list if missing; returns true when it was new. */
  mark(list: 'chapters' | 'eggs' | 'visited' | 'inspected', id: string): boolean {
    const arr = this.ledger[list]
    if (arr.includes(id)) return false
    arr.push(id)
    this.save()
    return true
  }

  has(list: 'chapters' | 'eggs' | 'visited' | 'inspected', id: string): boolean {
    return this.ledger[list].includes(id)
  }

  setSettings(patch: Partial<Settings>): void {
    this.ledger.settings = { ...this.ledger.settings, ...patch }
    this.save()
    bus.emit('settings:change', this.ledger.settings)
  }

  get settings(): Settings { return this.ledger.settings }

  conversation(personaId: string) {
    return (this.ledger.conversations[personaId] ??= [])
  }

  reset(): void {
    this.ledger = blank()
    try { localStorage.removeItem(KEY) } catch { /* ignore */ }
  }
}

export const store = new Store()
