/**
 * Silence. docs/voice.md section 10: the model's entire output for a silent
 * turn is one em dash. The server is lenient about the shape: empty, or only
 * dashes (em, en, hyphen) and whitespace, is silence. A leading dash on its
 * own line before text is dropped, so a hesitant model does not print two
 * marks.
 */
import { SILENCE_TOKEN } from '../../src/contracts/narrator'

export { SILENCE_TOKEN }

const DASHES = '—–-'
const ONLY_DASHES = new RegExp(`^[${DASHES}\\s]*$`)
const LEADING_DASH_LINE = new RegExp(`^\\s*[${DASHES}]+[ \\t]*\\r?\\n\\s*`)

/** Whether a reply is silence: nothing, or nothing but dashes and whitespace. */
export function isSilence(text: string): boolean {
  return ONLY_DASHES.test(text)
}

/** Removes a leading dash line ("—\n") when text follows it. Otherwise returns the text unchanged. */
export function stripLeadingDash(text: string): string {
  const m = LEADING_DASH_LINE.exec(text)
  if (!m) return text
  const rest = text.slice(m[0].length)
  return rest.length > 0 ? rest : text
}

/** The reply as the browser should receive it: trimmed text, or empty text with `silent`. */
export function normalizeReply(raw: string): { text: string; silent: boolean } {
  if (isSilence(raw)) return { text: '', silent: true }
  return { text: stripLeadingDash(raw).trim(), silent: false }
}

/**
 * Decides, while a stream is still arriving, whether the text seen so far may
 * yet turn out to be silence. While true, deltas are held back.
 */
export function mayStillBeSilence(sofar: string): boolean {
  return isSilence(sofar)
}
