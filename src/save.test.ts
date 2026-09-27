import { describe, expect, it } from 'vitest'
import { doneText, saveAllChoice, saveChoice, zipFailed } from './save'

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

  it.each([
    [['print'], 'The print limit is gone too.'],
    [['print', 'copy'], 'The print and copy limits are gone too.'],
    [['print', 'copy', 'edit'], 'The print, copy and edit limits are gone too.'],
  ] as const)('names the restrictions %j removed along with the open password', (removed, sentence) => {
    expect(doneText('statement.pdf', true, 0, { removed: [...removed] })).toBe(`This copy opens anywhere, no password needed. ${sentence}`)
  })

  it.each([
    [['print'], 'printing'],
    [['copy', 'edit'], 'copying and editing'],
    [['print', 'copy'], 'printing and copying'],
    [['print', 'copy', 'edit'], 'printing, copying and editing'],
  ] as const)('names the restrictions %j it removed from a restricted PDF', (removed, list) => {
    expect(doneText('form.pdf', false, 0, { removed: [...removed] })).toBe(
      `form.pdf had no open password, only limits on ${list}. This copy has none.`,
    )
  })

  it('says only restrictions for a restricted PDF with none it names', () => {
    expect(doneText('form.pdf', false)).toBe('form.pdf had no open password, only restrictions. This copy has none.')
  })

  it('names the saving from the repack after the restrictions removed along with the open password', () => {
    expect(doneText('statement.pdf', true, 2_200_000, { removed: ['print', 'copy'] })).toBe(
      'This copy opens anywhere, no password needed. The print and copy limits are gone too. It’s also 2.2 MB smaller.',
    )
  })

  it('names the restrictions, then the saving, then the date form', () => {
    expect(doneText('statement.pdf', true, 2_200_000, { removed: ['edit'], password: '900805', form: 'YYMMDD' })).toBe(
      'This copy opens anywhere, no password needed. The edit limit is gone too. It’s also 2.2 MB smaller. Your password worked written as 900805 (year-month-day, short year).',
    )
  })

  it('adds the saving from the repack when there was an open password', () => {
    expect(doneText('statement.pdf', true, 2_200_000)).toBe(
      'This copy opens anywhere, no password needed. It’s also 2.2 MB smaller.',
    )
  })

  it('adds the saving from the repack to the restrictions it removed', () => {
    expect(doneText('form.pdf', false, 2_200_000, { removed: ['print', 'copy', 'edit'] })).toBe(
      'form.pdf had no open password, only limits on printing, copying and editing. This copy has none, and is 2.2 MB smaller.',
    )
  })

  it.each([
    ['under 50 KB', 49_999, { of: 100_000 }],
    ['under 5% of the input', 2_200_000, { of: 44_000_001 }],
  ])('leaves the saving out when it is %s', (_, saved, options) => {
    expect(doneText('statement.pdf', true, saved, options)).toBe('This copy opens anywhere, no password needed.')
    expect(doneText('form.pdf', false, saved, options)).toBe(
      'form.pdf had no open password, only restrictions. This copy has none.',
    )
  })

  it('names the date form the open password worked written as', () => {
    expect(doneText('statement.pdf', true, 0, { password: '05081990', form: 'DDMMYYYY' })).toMatch(
      /Your password worked written as 05081990 \(day-month-year\)\.$/,
    )
  })

  it('names the date form after the saving from the repack', () => {
    expect(doneText('statement.pdf', true, 2_200_000, { password: '900805', form: 'YYMMDD' })).toBe(
      'This copy opens anywhere, no password needed. It’s also 2.2 MB smaller. Your password worked written as 900805 (year-month-day, short year).',
    )
  })

  it('names no date form when the exact text worked', () => {
    expect(doneText('statement.pdf', true, 0, { password: '05081990', form: null })).toBe(
      'This copy opens anywhere, no password needed.',
    )
  })

  it('says a locked copy opens only with the own password', () => {
    expect(doneText('locked')).toBe('Opens only with the password you set. Printing and copying stay allowed.')
  })

  it('says the unlocked copy is still here when its lock failed', () => {
    expect(doneText('lock-failed')).toBe('The password couldn’t be added on this device. Your unlocked copy is still here.')
  })

  it('mentions a saving of exactly 50 KB and 5% of the input', () => {
    expect(doneText('statement.pdf', true, 50_000, { of: 1_000_000 })).toBe(
      'This copy opens anywhere, no password needed. It’s also 50 KB smaller.',
    )
  })
})

describe('saveAllChoice', () => {
  it('offers Save all on desktop, where sharing files does not work', () => {
    expect(saveAllChoice(2, false, false)).toEqual({ share: false, download: true, shareLabel: 'Share all', primary: 'download' })
  })

  it('offers Share all first and Save all second on Android', () => {
    expect(saveAllChoice(2, true, false)).toEqual({ share: true, download: true, shareLabel: 'Share all', primary: 'share' })
  })

  it('offers only Save or share all on iPhone', () => {
    expect(saveAllChoice(2, true, true)).toEqual({ share: true, download: false, shareLabel: 'Save or share all', primary: 'share' })
  })

  it('offers neither when nothing was unlocked', () => {
    expect(saveAllChoice(0, true, false)).toMatchObject({ share: false, download: false })
  })
})

describe('zipFailed', () => {
  it('says Save all’s zip is too big for 4 s when the zip step throws its RangeError', () => {
    expect(zipFailed(new RangeError('Too many or too large files for one zip.'))).toEqual({
      text: 'Too big for one zip. Save them one by one.',
      ms: 4000,
    })
  })

  it('says nothing for any other error', () => {
    expect(zipFailed(new TypeError('Failed to fetch'))).toBeNull()
  })
})
