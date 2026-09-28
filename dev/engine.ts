// Dev page: exercises the Engine worker client in a real browser and prints a typed card of results.
import '@fontsource/jost/400.css'
import '@fontsource/jost/500.css'
import '@fontsource/courier-prime/400.css'
import { Engine } from '../src/chess/engine'

const app = document.getElementById('app')!
document.body.style.cssText = 'margin:0;background:#c9b48a;font-family:"Courier Prime",monospace;color:#2b2420;'
app.style.cssText = 'min-height:100vh;display:flex;align-items:center;justify-content:center;'
const card = document.createElement('div')
card.style.cssText = 'width:760px;background:#f1e6cf;padding:40px 48px;box-shadow:0 18px 40px rgba(40,30,20,.35), inset 0 0 0 1px rgba(60,40,20,.15);'
const title = document.createElement('div')
title.textContent = 'ENGINE ROOM — WORKER REPORT'
title.style.cssText = 'font-family:Jost,sans-serif;font-weight:500;letter-spacing:.32em;text-align:center;font-size:14px;margin-bottom:28px;'
const pre = document.createElement('pre')
pre.style.cssText = 'margin:0;font-size:14px;line-height:1.6;white-space:pre-wrap;'
card.append(title, pre)
app.append(card)

const lines: string[] = []
const log = (s: string) => { lines.push(s); pre.textContent = lines.join('\n') }

const KIWIPETE = 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1'
const engine = new Engine()

async function run(): Promise<void> {
  const t0 = performance.now()
  const p3 = await engine.perft(KIWIPETE, 3)
  log(`perft kiwipete d3      ${p3}  ${p3 === 97862 ? 'OK' : 'MISMATCH'}`)
  const mate = await engine.search('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1', { timeMs: 500 })
  log(`mate in one            ${mate.move?.from}${mate.move?.to}  mateIn ${mate.mateIn}  ${mate.move?.to === 'a8' ? 'OK' : 'WRONG'}`)
  const s = await engine.search(KIWIPETE, { timeMs: 1500, level: 5 })
  log(`level 5, 1500ms        depth ${s.depth}  ${s.nodes} nodes  ${s.timeMs}ms  ${Math.round(s.nodes / s.timeMs * 1000)} n/s`)
  log(`  pv                   ${s.pv.join(' ')}`)
  const l3 = await engine.search(KIWIPETE, { timeMs: 5000, level: 3 })
  log(`level 3 (400ms cap)    ${l3.timeMs}ms  depth ${l3.depth}  ${l3.timeMs <= 500 ? 'OK' : 'SLOW'}`)
  const l1 = await engine.search(KIWIPETE, { timeMs: 500, level: 1 })
  log(`level 1                ${l1.move?.from}${l1.move?.to}  score ${l1.scoreCp}`)
  const ev = await engine.evaluate(KIWIPETE, 300)
  log(`evaluate 300ms         ${ev.scoreCp}cp  depth ${ev.depth}`)
  try { await engine.perft('not a fen', 1); log('bad fen                no error (WRONG)') }
  catch (err) { log(`bad fen                rejected: ${(err as Error).message}`) }
  log(`total                  ${Math.round(performance.now() - t0)}ms`)
  ;(window as unknown as { __engineDone: boolean }).__engineDone = true
}
run().catch((err) => log(`FAILED ${String(err)}`))
