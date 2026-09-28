/**
 * The frame: the design system of Chess Crossing. docs/visual.md is law here.
 * Other modules import from '../frame' only.
 */
import './tokens.css'
import './base.css'

import type { FrameModule } from '../contracts/frame'
import { createCaption } from './caption'
import { createDossierCard } from './dossier'
import { createRule } from './rule'
import { createStage } from './stage'
import { typewrite } from './typewrite'

export type { CardKind, CardOptions, Palette, Stage, StageOptions } from '../contracts/frame'

/** Iron Gall: the matte, all type, every outline. */
export const INK = '#202834'
/** Form White: the Ministry's stock, title-card type. */
export const PAPER = '#F5F2EB'

export { createStage, buildCard, cardLineClass, cardLayout, STAGE_W, STAGE_H, DEFAULT_ASPECT, REM_DIVISOR } from './stage'
export type { StageExtras } from './stage'
export { createCaption } from './caption'
export {
  createDossierCard,
  isPencilLine,
  ruledLineCount,
  DOSSIER_W_RPX,
  DOSSIER_H_RPX,
  DOSSIER_HEAD_RULE_RPX,
  DOSSIER_RULE_STEP_REM,
  RPX_PER_REM,
  PENCIL_PREFIX,
} from './dossier'
export type { DossierOptions } from './dossier'
export {
  typewrite,
  createCaret,
  pauseAfter,
  resolveMsPerChar,
  LEDGER_MS_PER_CHAR,
  NARRATOR_MS_PER_CHAR,
  PAUSE_STOP_MS,
  PAUSE_COMMA_MS,
  E_FAINT_OPACITY,
} from './typewrite'
export type { TypewriteOptions } from './typewrite'
export { createRule } from './rule'
export {
  ensureGrainFilter,
  applyPaper,
  createPaper,
  GRAIN_FILTER_ID,
  GRAIN_BASE_FREQUENCY,
  GRAIN_OCTAVES,
  GRAIN_OPACITY,
} from './paper'
export {
  reducedMotion,
  motionMs,
  wait,
  FADE_MS,
  CARD_HOLD_MS,
  WHIP_MS,
  TRACK_MS,
  CARD_APPEAR_MS,
  PAN_EASING,
} from './motion'

/** The module as the contract names it. */
export const frame: FrameModule = {
  createStage,
  createCaption,
  createDossierCard,
  typewrite,
  createRule,
}
