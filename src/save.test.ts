import { describe, expect, it } from 'vitest'
import { doneText, saveChoice } from './save'

describe('saveChoice', () => {
  it('offers only "Save or share" on iOS, where a download opens a viewer instead of saving', () => {
    expect(saveChoice(true, true)).toEqual({ share: true, download: false, shareLabel: 'Save or share', primary: 'share' })
  })

  it('offers Share first and Download second where sharing files works', () => {
    expect(saveChoice(true, false)).toEqual({ share: true, download: true, shareLabel: 'Share', primary: 'share' })
  })

  it.each([true, false])('offers only Download where sharing files does not work (iOS: %s)', (ios) => {
    expect(saveChoice(false, ios)).toEqual({ share: false, download: true, shareLabel: 'Share', primary: 'download' })
  })
})

describe('doneText', () => {
  it('says the unlocked copy needs no password when there was an open password', () => {
    expect(doneText('statement.pdf', true)).toBe('This copy opens anywhere, no password needed.')
  })

  it('names the restrictions it removed from a restricted PDF', () => {
    expect(doneText('statement.pdf', false)).toBe(
      'statement.pdf had no open password, only print or copy limits. This copy has none.',
    )
  })

  it('adds the saving from the repack when there was an open password', () => {
    expect(doneText('statement.pdf', true, 2_200_000)).toBe(
      'This copy opens anywhere, no password needed. It’s also 2.2 MB smaller.',
    )
  })

  it('adds the saving from the repack to the restrictions it removed', () => {
    expect(doneText('form.pdf', false, 2_200_000)).toBe(
      'form.pdf had no open password, only print or copy limits. This copy has none, and is 2.2 MB smaller.',
    )
  })

  it.each([
    ['under 50 KB', 49_999, { of: 100_000 }],
    ['under 5% of the input', 2_200_000, { of: 44_000_001 }],
  ])('leaves the saving out when it is %s', (_, saved, options) => {
    expect(doneText('statement.pdf', true, saved, options)).toBe('This copy opens anywhere, no password needed.')
    expect(doneText('form.pdf', false, saved, options)).toBe(
      'form.pdf had no open password, only print or copy limits. This copy has none.',
    )
  })

  it('mentions a saving of exactly 50 KB and 5% of the input', () => {
    expect(doneText('statement.pdf', true, 50_000, { of: 1_000_000 })).toBe(
      'This copy opens anywhere, no password needed. It’s also 50 KB smaller.',
    )
  })
})
