import { describe, expect, it } from 'vitest'
import { SILENCE_TOKEN } from '../../src/contracts/narrator'
import { isSilence, mayStillBeSilence, normalizeReply, stripLeadingDash } from './silence'

describe('silence', () => {
  it('the token is the em dash', () => {
    expect(SILENCE_TOKEN).toBe('—')
  })

  it('treats nothing, or only dashes and whitespace, as silence', () => {
    expect(isSilence('')).toBe(true)
    expect(isSilence('   \n')).toBe(true)
    expect(isSilence('—')).toBe(true)
    expect(isSilence(' —\n')).toBe(true)
    expect(isSilence('–')).toBe(true)
    expect(isSilence('-')).toBe(true)
    expect(isSilence('--- —')).toBe(true)
    expect(isSilence('— The river stands at one metre forty.')).toBe(false)
    expect(isSilence('I cannot say.')).toBe(false)
  })

  it('strips a leading dash line when text follows', () => {
    expect(stripLeadingDash('—\nThe river stands.')).toBe('The river stands.')
    expect(stripLeadingDash('—\n\nThe river stands.')).toBe('The river stands.')
    expect(stripLeadingDash('- \r\nThe river stands.')).toBe('The river stands.')
    expect(stripLeadingDash('—')).toBe('—')
    expect(stripLeadingDash('— The river stands.')).toBe('— The river stands.')
    expect(stripLeadingDash('The river stands.')).toBe('The river stands.')
  })

  it('normalizes a reply', () => {
    expect(normalizeReply('—')).toEqual({ text: '', silent: true })
    expect(normalizeReply('')).toEqual({ text: '', silent: true })
    expect(normalizeReply('—\nItem 1-03.\n')).toEqual({ text: 'Item 1-03.', silent: false })
    expect(normalizeReply('  Item 1-03.  ')).toEqual({ text: 'Item 1-03.', silent: false })
  })

  it('holds deltas while the reply may still be silence', () => {
    expect(mayStillBeSilence('')).toBe(true)
    expect(mayStillBeSilence('—')).toBe(true)
    expect(mayStillBeSilence('—\n')).toBe(true)
    expect(mayStillBeSilence('—\nT')).toBe(false)
    expect(mayStillBeSilence('T')).toBe(false)
  })
})
