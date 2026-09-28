// The season clock under node: wall time is injected, the bus is listened to, nothing is rendered.
// store.ts reaches for window.setTimeout in save() and localStorage on load, so both are shimmed before it is imported.
import { test } from 'node:test'
import assert from 'node:assert/strict'

const memory = new Map<string, string>()
;(globalThis as unknown as { window: unknown }).window = { setTimeout, clearTimeout }
;(globalThis as unknown as { localStorage: unknown }).localStorage = {
  getItem: (k: string) => memory.get(k) ?? null,
  setItem: (k: string, v: string) => { memory.set(k, v) },
  removeItem: (k: string) => { memory.delete(k) },
}

const { bus } = await import('../src/core/bus')
const { store, blankSeason } = await import('../src/core/store')
const { crateLine, readingText } = await import('../src/content/station')
const { CROSSABLE_SECONDS, TIDE_PERIOD_SECONDS, WATCH_SECONDS } = await import('../src/content/watches')
const { BELL_GAP_MS, CRATE_ORDER, SAVE_EVERY_MS, SLOW_MOTION_REASONS, SLOW_MOTION_SCALE, SeasonClock, tidePhaseAt } = await import('../src/station/season')
type Events = import('../src/types').Events

/** A hand on wall time: `ms` is what `now()` returns; `run(seconds)` ticks the clock in frames of 100 ms. */
function harness(patch: Partial<import('../src/types').Season> = {}, dev = true) {
  Object.assign(store.ledger.season, blankSeason(), patch)
  const wall = { ms: 1000 }
  const slowCalls: [number, number][] = []
  const season = new SeasonClock({
    now: () => wall.ms,
    slowMotion: async (scale, holdMs) => { slowCalls.push([scale, holdMs]) },
    dev,
  })
  const run = (seconds: number) => {
    let left = Math.round(seconds * 1000)
    while (left > 0) {
      const step = Math.min(100, left)
      wall.ms += step
      left -= step
      season.tick()
    }
  }
  return { season, wall, run, slowCalls }
}

/** Collects payloads of one event until `off()`. */
function collect<K extends keyof Events>(event: K): { got: Events[K][]; off: () => void } {
  const got: Events[K][] = []
  const off = bus.on(event, (p) => { got.push(structuredClone(p)) })
  return { got, off }
}

const near = (a: number, b: number, eps = 1e-6): boolean => Math.abs(a - b) < eps

test('the season is the store\'s live object', () => {
  const { season } = harness()
  assert.equal(season.season, store.ledger.season)
})

test('watches advance at 250 s and six of them turn the date', () => {
  const { season, run } = harness()
  assert.equal(season.season.watch, 0)
  run(249.8)
  assert.equal(season.season.watch, 0)
  run(0.3)
  assert.equal(season.season.watch, 1)
  assert.ok(near(season.season.watchElapsed, 0.1, 1e-6))
  run(WATCH_SECONDS * 5)
  assert.equal(season.season.date, 2)
  assert.equal(season.season.watch, 0)
  assert.ok(near(season.season.watchElapsed, 0.1, 1e-6))
})

test('a tick advances at most a tenth of a second, so a hidden tab cannot skip a watch', () => {
  const { season, wall } = harness()
  wall.ms += 60_000
  season.tick()
  assert.ok(near(season.season.watchElapsed, 0.1))
})

test('clockLabel runs at 57.6× from the watch\'s start', () => {
  const { season, run } = harness()
  assert.equal(season.clockLabel(), '04:00')
  run(84)
  assert.equal(season.clockLabel(), '05:20')
  Object.assign(season.season, { watch: 3, watchElapsed: 115 })
  assert.equal(season.clockLabel(), '17:50')
  assert.equal(season.isDusk(), true)
  Object.assign(season.season, { watch: 5, watchElapsed: 0 })
  assert.equal(season.clockLabel(), '00:00')
  assert.equal(season.isDusk(), false)
  Object.assign(season.season, { watch: 2, watchElapsed: 250 })
  assert.equal(season.clockLabel(), '16:00')
})

test('the readings fire once each: 05:20 at +83 s of watch 0, 17:50 at +115 s of watch 3', () => {
  const { season, run } = harness({ date: 14 })
  const readings = collect('reading')
  run(82.9)
  assert.equal(readings.got.length, 0)
  run(0.2)
  assert.equal(readings.got.length, 1)
  assert.deepEqual(readings.got[0], { text: readingText(14, 0), watch: 0 })
  run(WATCH_SECONDS * 6)
  readings.off()
  assert.equal(readings.got.length, 3)
  assert.deepEqual(readings.got[1], { text: readingText(14, 3), watch: 3 })
  assert.equal(readings.got[2].watch, 0)
  assert.equal(readings.got[2].text, readingText(15, 0))
  assert.equal(season.season.date, 15)
})

test('a save loaded past the reading time does not give the reading again', () => {
  const { run } = harness({ watch: 0, watchElapsed: 100 })
  const readings = collect('reading')
  run(30)
  readings.off()
  assert.equal(readings.got.length, 0)
})

test('the tide is low at 16:12 on the 30th and continuous across the turn of the day', () => {
  assert.ok(near(tidePhaseAt(30, 3, 12.5), 0, 1e-9))
  const endOfDay = tidePhaseAt(9, 5, WATCH_SECONDS)
  const startOfNext = tidePhaseAt(10, 0, 0)
  assert.ok(near(endOfDay, startOfNext, 1e-9))
  const { season } = harness({ date: 30, watch: 3, watchElapsed: 12.5 })
  assert.ok(near(season.tideHeight(), 0, 1e-9))
  assert.equal(season.crossable(), true)
  assert.ok(near(season.secondsToWindowChange(), CROSSABLE_SECONDS, 1e-6))
})

test('tide window math at high water, half a period after the last low water', () => {
  const { season, run } = harness({ date: 30, watch: 3, watchElapsed: 12.5 })
  run(TIDE_PERIOD_SECONDS / 2)
  assert.equal(season.season.date, 31)
  assert.equal(season.season.watch, 0)
  assert.ok(near(season.season.tide, 0.5, 1e-9))
  assert.ok(near(season.tideHeight(), 1, 1e-9))
  assert.equal(season.crossable(), false)
  assert.ok(near(season.secondsToWindowChange(), TIDE_PERIOD_SECONDS / 2 - CROSSABLE_SECONDS, 1e-6))
})

test('crossable() at the edges of the window: ±240 s in, 241 s out', () => {
  const low = 12.5
  const at = (offset: number) => {
    const { season } = harness({ date: 30, watch: 3, watchElapsed: low + offset })
    return season
  }
  assert.equal(at(-CROSSABLE_SECONDS + 0.01).crossable(), true)
  assert.equal(at(-CROSSABLE_SECONDS - 1).crossable(), false)
  assert.equal(at(CROSSABLE_SECONDS - 0.01).crossable(), true)
  assert.equal(at(CROSSABLE_SECONDS + 1).crossable(), false)
  assert.ok(near(at(-CROSSABLE_SECONDS - 1).secondsToWindowChange(), 1, 1e-6))
})

test('tide:window flips and the three bells 90 s before the window closes, 900 ms apart', () => {
  const { season, run, wall } = harness({ date: 30, watch: 3, watchElapsed: 12.5 + 100 })
  const windows = collect('tide:window')
  const sfx = collect('audio:sfx')
  const bellTimes: number[] = []
  const offBell = bus.on('audio:sfx', (p) => { if (p.name === 'tidebell') bellTimes.push(wall.ms) })
  run(49.9)
  assert.equal(sfx.got.length, 0)
  run(0.2)
  assert.equal(sfx.got.filter((s) => s.name === 'tidebell').length, 1)
  run(2)
  assert.equal(sfx.got.filter((s) => s.name === 'tidebell').length, 3)
  assert.ok(near(bellTimes[1] - bellTimes[0], BELL_GAP_MS))
  assert.ok(near(bellTimes[2] - bellTimes[1], BELL_GAP_MS))
  assert.equal(windows.got.length, 0)
  run(90)
  assert.equal(windows.got.length, 1)
  assert.equal(windows.got[0].crossable, false)
  assert.ok(windows.got[0].secondsToChange > TIDE_PERIOD_SECONDS - 2 * CROSSABLE_SECONDS - 1)
  assert.equal(season.crossable(), false)
  run(TIDE_PERIOD_SECONDS - 2 * CROSSABLE_SECONDS)
  assert.equal(windows.got.length, 2)
  assert.equal(windows.got[1].crossable, true)
  assert.equal(sfx.got.filter((s) => s.name === 'tidebell').length, 3)
  windows.off(); sfx.off(); offBell()
})

test('a save loaded inside the last 90 s does not strike stale bells', () => {
  const { run } = harness({ date: 30, watch: 3, watchElapsed: 12.5 + 200 })
  const sfx = collect('audio:sfx')
  run(5)
  sfx.off()
  assert.equal(sfx.got.length, 0)
})

test('advanceDay turns the date, sets the first watch, and emits season:change', () => {
  const { season } = harness({ date: 3, watch: 4, watchElapsed: 77, chapter: 2 })
  const changes = collect('season:change')
  const lines = collect('ledger:line')
  season.advanceDay()
  changes.off(); lines.off()
  assert.equal(season.season.date, 4)
  assert.equal(season.season.watch, 0)
  assert.equal(season.season.watchElapsed, 0)
  assert.equal(season.clockLabel(), '04:00')
  assert.equal(changes.got.length, 1)
  assert.equal(changes.got[0].date, 4)
  assert.equal(lines.got.length, 0)
  assert.deepEqual(season.season.crated, [])
  assert.ok(near(season.season.tide, tidePhaseAt(4, 0, 0), 1e-12))
})

test('in Chapter Seven each day crates one object, the galley dresser first, entered on the roll', () => {
  const { season } = harness({ date: 20, chapter: 7 })
  const lines = collect('ledger:line')
  season.advanceDay()
  assert.deepEqual(season.season.crated, ['galley.tins'])
  assert.equal(lines.got[0].text, 'CRATE 1.  THE GALLEY DRESSER, LEFT.  CRATED 21 SEPT 1965.  B.L.')
  assert.equal(lines.got[0].text, crateLine(1, CRATE_ORDER[0].name, 21))
  for (let i = 0; i < 12; i++) season.advanceDay()
  lines.off()
  assert.equal(CRATE_ORDER.length, 9)
  assert.deepEqual(season.season.crated, CRATE_ORDER.map((c) => c.id))
  assert.equal(lines.got.length, 9)
  assert.equal(lines.got[8].text, crateLine(9, CRATE_ORDER[8].name, 29))
  assert.equal(new Set(CRATE_ORDER.map((c) => c.id.split('.')[0])).size, 9)
  assert.ok(!CRATE_ORDER.some((c) => c.id.startsWith('boardroom.') && /board$|davit|chair/.test(c.id)))
})

test('the natural turn of the day also crates in Chapter Seven', () => {
  const { season, run } = harness({ date: 22, watch: 5, watchElapsed: 249.95, chapter: 7 })
  const lines = collect('ledger:line')
  run(0.1)
  lines.off()
  assert.equal(season.season.date, 23)
  assert.deepEqual(season.season.crated, ['galley.tins'])
  assert.equal(lines.got[0].text, crateLine(1, 'The galley dresser, left', 23))
})

test('slow motion is spent for exactly four reasons at 0.4×', async () => {
  const { season, slowCalls } = harness({}, true)
  for (const reason of SLOW_MOTION_REASONS) await season.spendSlowMotion(reason, 2000)
  assert.deepEqual(slowCalls, SLOW_MOTION_REASONS.map(() => [SLOW_MOTION_SCALE, 2000]))
  assert.equal(SLOW_MOTION_SCALE, 0.4)
  const bad = 'resignation' as unknown as 'checkmate'
  await assert.rejects(() => season.spendSlowMotion(bad, 500), /not one of the four reasons/)
  assert.equal(slowCalls.length, 4)
  const prod = harness({}, false)
  await prod.season.spendSlowMotion(bad, 500)
  assert.equal(prod.slowCalls.length, 0)
  await prod.season.spendSlowMotion('crating', 2000)
  assert.deepEqual(prod.slowCalls, [[0.4, 2000]])
})

test('season:change at most once a second, the save at most every 10 s, and at once on advanceDay', () => {
  const saves: number[] = []
  const original = store.save
  store.save = () => { saves.push(1) }
  try {
    const { season, run } = harness()
    const changes = collect('season:change')
    run(0.9)
    assert.equal(changes.got.length, 0)
    run(0.1)
    assert.equal(changes.got.length, 1)
    run(30)
    assert.equal(changes.got.length, 31)
    assert.equal(saves.length, Math.floor(31_000 / SAVE_EVERY_MS))
    season.advanceDay()
    assert.equal(changes.got.length, 32)
    assert.equal(saves.length, 4)
    run(9.9)
    assert.equal(saves.length, 4)
    run(0.1)
    assert.equal(saves.length, 5)
    changes.off()
  } finally {
    store.save = original
  }
})
