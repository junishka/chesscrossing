/**
 * PLACEHOLDER app shell. Replaced during integration.
 */
import { createBus } from './contracts/bus'

const bus = createBus()
bus.onAny((e) => console.debug('[event]', e.type))

const app = document.getElementById('app')
if (app) app.textContent = 'Chess Crossing'
