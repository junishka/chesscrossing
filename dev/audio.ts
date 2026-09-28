// Sound department demo: renders every effect and six seconds of every theme offline, draws the
// waveforms on index cards, and plays them live on click (the context starts on the first gesture).
// The station's controls are here too: the gauge for Slack Water, the distance for Record 4, the
// glide, the chair's check, and Record 4 itself.
import { loadFonts, FONT_MONO, FONT_SANS } from '../src/core/fonts'
import { ui as inkPalette } from '../src/content/palette'
import { SFX_NAMES, createGlide, createRig, getRig, initSynth, playRecord, playSfx, type Glide } from '../src/audio/synth'
import { type ThemeId, Sequencer, emptyChair, renderRecord4, renderTheme, themes } from '../src/audio/music'
import type { SfxName } from '../src/types'

const SR = 44100
const SFX_SECONDS = 4.4
const THEME_SECONDS = 6

declare global { interface Window { __audioDemo: { ready: Promise<void>; play(id: string): void; sfx(name: SfxName): void } } }

async function renderSfx(name: SfxName): Promise<AudioBuffer> {
  const off = new OfflineAudioContext(1, SR * SFX_SECONDS, SR)
  playSfx(createRig(off), name, 1, 0.02)
  return off.startRendering()
}

async function renderThemeBuffer(id: ThemeId, record4: AudioBuffer | null): Promise<AudioBuffer> {
  const off = new OfflineAudioContext(1, SR * THEME_SECONDS, SR)
  renderTheme(createRig(off), id, THEME_SECONDS, record4)
  return off.startRendering()
}

function waveform(canvas: HTMLCanvasElement, buf: AudioBuffer, color: string): number {
  const ctx = canvas.getContext('2d')
  if (!ctx) return 0
  const w = canvas.width, h = canvas.height
  const data = buf.getChannelData(0)
  let peak = 0
  for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]))
  ctx.clearRect(0, 0, w, h)
  ctx.strokeStyle = inkPalette.hairline
  ctx.beginPath(); ctx.moveTo(0, h / 2 + 0.5); ctx.lineTo(w, h / 2 + 0.5); ctx.stroke()
  ctx.fillStyle = color
  const per = Math.floor(data.length / w)
  const norm = peak > 0 ? 1 / peak : 1
  for (let x = 0; x < w; x++) {
    let lo = 0, hi = 0
    for (let i = x * per; i < (x + 1) * per; i++) { const v = data[i]; if (v < lo) lo = v; if (v > hi) hi = v }
    const y1 = h / 2 - hi * norm * (h / 2 - 4), y2 = h / 2 - lo * norm * (h / 2 - 4)
    ctx.fillRect(x, y1, 1, Math.max(1, y2 - y1))
  }
  return peak
}

function dbfs(peak: number): string {
  return peak > 0 ? `${(20 * Math.log10(peak)).toFixed(1)} dBFS` : 'silent'
}

function card(label: string, sub: string, color: string, onClick: () => void): { root: HTMLElement; canvas: HTMLCanvasElement; meta: HTMLElement } {
  const root = document.createElement('button')
  root.className = 'card'
  root.onclick = onClick
  const canvas = document.createElement('canvas')
  canvas.width = 196; canvas.height = 64
  const name = document.createElement('div')
  name.className = 'label'; name.textContent = label
  const meta = document.createElement('div')
  meta.className = 'meta'; meta.textContent = sub
  root.append(canvas, name, meta)
  root.style.setProperty('--wave', color)
  return { root, canvas, meta }
}

function control(label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button')
  b.className = 'control'
  b.textContent = label
  b.onclick = onClick
  return b
}

function style(): void {
  const s = document.createElement('style')
  s.textContent = `
    html, body { margin: 0; background: ${inkPalette.bg}; color: ${inkPalette.ink}; font-family: ${FONT_SANS}, sans-serif; }
    #app { min-height: 100vh; display: grid; place-items: center; }
    .sheet { width: 1360px; background: ${inkPalette.paper}; padding: 26px 40px 30px; box-sizing: border-box; box-shadow: 6px 6px 0 rgba(0,0,0,0.35); }
    .head { text-align: center; border-bottom: 1px solid ${inkPalette.hairline}; padding-bottom: 12px; margin-bottom: 14px; }
    .head h1 { margin: 0; font-weight: 500; font-size: 20px; letter-spacing: 0.32em; text-transform: uppercase; }
    .head p { margin: 4px 0 0; font-size: 11px; letter-spacing: 0.22em; text-transform: uppercase; opacity: 0.7; }
    .section { text-align: center; font-size: 10px; letter-spacing: 0.3em; text-transform: uppercase; margin: 12px 0 8px; opacity: 0.75; }
    .grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 10px 12px; }
    .row { display: flex; justify-content: center; gap: 8px; flex-wrap: wrap; }
    .card { appearance: none; border: 1px solid ${inkPalette.hairline}; background: ${inkPalette.paperDark}; padding: 8px 8px 6px; text-align: center; cursor: pointer; font-family: inherit; color: inherit; }
    .card:hover { background: ${inkPalette.paper}; }
    .card canvas { display: block; width: 100%; height: 64px; background: ${inkPalette.paper}; border: 1px solid ${inkPalette.hairline}; }
    .card .label { margin-top: 6px; font-size: 11px; letter-spacing: 0.26em; text-transform: uppercase; font-weight: 500; }
    .card .meta { font-family: ${FONT_MONO}, monospace; font-size: 10px; opacity: 0.7; margin-top: 2px; }
    .control { appearance: none; border: 1px solid ${inkPalette.hairline}; background: ${inkPalette.paperDark}; color: inherit; font-family: inherit; font-size: 10px; letter-spacing: 0.22em; text-transform: uppercase; padding: 8px 12px; cursor: pointer; }
    .control:hover { background: ${inkPalette.paper}; }
    .foot { text-align: center; font-family: ${FONT_MONO}, monospace; font-size: 10px; margin-top: 14px; opacity: 0.6; }
  `
  document.head.append(s)
}

const THEME_NOTES: Record<ThemeId, string> = {
  survey: 'harmonium · once',
  emptychair: 'harmonium · 15 s loop',
  slackwater: 'board room · the fifth gated',
  house: 'room tone',
  galley: '400 Hz · the range',
  path: 'shell · wind · record 4',
  grid: 'wind · the channel',
  none: 'silence',
}

async function main(): Promise<void> {
  await loadFonts()
  style()
  const app = document.getElementById('app')!
  const sheet = document.createElement('div')
  sheet.className = 'sheet'
  sheet.innerHTML = `<div class="head"><h1>Sound Department</h1><p>The harmonium, the ship's bell, the Olivetti, the pulleys, the clock and Record 4. Nothing else.</p></div>`
  const sfxHead = document.createElement('div'); sfxHead.className = 'section'; sfxHead.textContent = 'Effects'
  const sfxGrid = document.createElement('div'); sfxGrid.className = 'grid'
  const themeHead = document.createElement('div'); themeHead.className = 'section'; themeHead.textContent = 'Themes, first six seconds'
  const themeGrid = document.createElement('div'); themeGrid.className = 'grid'
  const ctlHead = document.createElement('div'); ctlHead.className = 'section'; ctlHead.textContent = 'The station'
  const ctlRow = document.createElement('div'); ctlRow.className = 'row'
  const foot = document.createElement('div'); foot.className = 'foot'; foot.textContent = 'click a card to hear it'
  sheet.append(sfxHead, sfxGrid, themeHead, themeGrid, ctlHead, ctlRow, foot)
  app.append(sheet)

  const sequencer = new Sequencer()
  let glide: Glide | null = null
  let record4: AudioBuffer | null = null
  const live = (): void => {
    const rig = initSynth()
    if (!rig) return
    sequencer.attach(rig)
    if (!glide) glide = createGlide(rig)
    if (record4) sequencer.setRecord4(record4)
  }
  document.addEventListener('pointerdown', live, { once: true })

  let rate = 1
  const sfx = (name: SfxName): void => { const rig = getRig(); if (rig) playSfx(rig, name, 1, undefined, rate) }

  const jobs: Promise<void>[] = []
  for (const name of SFX_NAMES) {
    const c = card(name, '…', inkPalette.ink, () => sfx(name))
    sfxGrid.append(c.root)
    jobs.push(renderSfx(name).then((buf) => { const peak = waveform(c.canvas, buf, inkPalette.ink); c.meta.textContent = `peak ${dbfs(peak)}` }))
  }

  const recordJob = renderRecord4(SR).then((buf) => { record4 = buf; if (getRig()) sequencer.setRecord4(buf) })
  for (const id of Object.keys(themes) as ThemeId[]) {
    const c = card(id, THEME_NOTES[id], inkPalette.accent, () => sequencer.play(id))
    themeGrid.append(c.root)
    jobs.push(recordJob.then(() => renderThemeBuffer(id, record4)).then((buf) => { const peak = waveform(c.canvas, buf, inkPalette.accent); c.meta.textContent = `${THEME_NOTES[id]} · ${dbfs(peak)}` }))
  }

  let level = true
  let metres = 4
  let gliding = false
  const gauge = control('gauge · level', () => { level = !level; sequencer.setGauge(level ? 0 : 150); gauge.textContent = level ? 'gauge · level' : 'gauge · +1.5 pawns' })
  const distance = control('record · 4 m', () => { metres = metres >= 32 ? 4 : metres * 2; sequencer.setRecordDistance(metres); distance.textContent = `record · ${metres} m` })
  const glideBtn = control('glide · off', () => { gliding = !gliding; glide?.set(gliding, 220); glideBtn.textContent = gliding ? 'glide · 220 mm/s' : 'glide · off' })
  const chair = control('the chair gives check', () => sequencer.playOnce('emptychair', 0, emptyChair.gainDb - 12))
  const record = control('record 4 · needle', () => {
    const rig = getRig()
    if (!rig) return
    playSfx(rig, 'record')
    if (record4) playRecord(rig.ctx, rig.sfxBus, record4, rig.ctx.currentTime + 0.9, -12, false)
  })
  // Slow motion is the effects' playback rate; the harmonium and the bell ignore it, as in the game.
  const slow = control('slow motion · 1.0', () => {
    rate = rate === 1 ? 0.4 : 1
    slow.textContent = `slow motion · ${rate.toFixed(1)}`
  })
  ctlRow.append(gauge, distance, glideBtn, chair, record, slow)

  const ready = Promise.all(jobs).then(() => undefined)
  window.__audioDemo = { ready, play: (id) => sequencer.play(id), sfx }
  await ready
  foot.textContent = 'all rendered · click a card to hear it'
}

main().catch((err: unknown) => {
  console.error(err)
  const foot = document.querySelector('.foot')
  if (foot) foot.textContent = 'the render did not finish · see the console'
})
