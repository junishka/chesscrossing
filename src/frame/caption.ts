/**
 * A caption element in the frame's caption style: Jost 400, 0.7rem, as typed,
 * left and ragged, no tracking, no rule above (docs/visual.md section 8).
 * The text is the caller's, verbatim from the bible through the world.
 */
export function createCaption(text: string): HTMLElement {
  const p = document.createElement('p')
  p.className = 'caption t-caption'
  p.setAttribute('data-caption', '')
  p.textContent = text
  return p
}
