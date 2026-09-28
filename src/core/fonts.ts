import '@fontsource/jost/300.css'
import '@fontsource/jost/400.css'
import '@fontsource/jost/500.css'
import '@fontsource/jost/600.css'
import '@fontsource/courier-prime/400.css'
import '@fontsource/courier-prime/700.css'

export const FONT_SANS = 'Jost'
export const FONT_MONO = '"Courier Prime"'

/** Resolves once both faces are usable on canvas and in the DOM. */
export async function loadFonts(): Promise<void> {
  const specs = ['300 16px Jost', '400 16px Jost', '500 16px Jost', '600 16px Jost', '400 16px "Courier Prime"', '700 16px "Courier Prime"']
  try {
    await Promise.all(specs.map((s) => document.fonts.load(s)))
    await document.fonts.ready
  } catch { /* fall back to system fonts */ }
}
