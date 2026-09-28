/**
 * The app shell's entry. docs/architecture.md: main.ts wires the modules
 * together and owns the game loop, which lives in src/app.
 */
import { startApp } from './app/shell'

// The classification thresholds, as the architecture places them here.
export { BLUNDER_CP, EXCELLENT_MARGIN_CP, INACCURACY_CP, MISTAKE_CP } from './app/classify'

const root = document.getElementById('app')
if (root) {
  startApp(root).catch((err: unknown) => {
    console.error('[chesscrossing] the app did not start', err)
  })
}
