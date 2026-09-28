// Headless screenshot of the built app. Usage: node scripts/shot.mjs [url] [out.png] [hashRoute]
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'

const url = process.argv[2] || 'http://127.0.0.1:4173/'
const out = process.argv[3] || 'shots/shot.png'
const wait = Number(process.env.SHOT_WAIT || 2500)
mkdirSync('shots', { recursive: true })

let preview = null
if (!process.env.SHOT_NO_SERVER) {
  preview = spawn('npx', ['vite', 'preview', '--port', '4173', '--strictPort'], { stdio: 'ignore' })
  await sleep(1500)
}
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'],
})
const page = await browser.newPage({ viewport: { width: 1440, height: 810 }, deviceScaleFactor: 1 })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
await page.goto(url, { waitUntil: 'load' })
if (process.env.SHOT_ACTIONS) {
  // JS snippet evaluated in the page before the shot (e.g. "window.__cc.goto('board')")
  await page.evaluate(process.env.SHOT_ACTIONS)
}
await sleep(wait)
await page.screenshot({ path: out })
console.log('wrote', out)
if (errors.length) { console.log('PAGE ERRORS:\n' + errors.join('\n')) }
await browser.close()
preview?.kill()
process.exit(errors.length ? 2 : 0)
