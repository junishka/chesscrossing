/**
 * A hairline rule: 1 rpx Iron Gall, full width, no margin. docs/visual.md section 8.
 */
export function createRule(): HTMLElement {
  const hr = document.createElement('hr')
  hr.className = 'rule'
  hr.setAttribute('aria-hidden', 'true')
  hr.setAttribute('data-rule', '')
  return hr
}
