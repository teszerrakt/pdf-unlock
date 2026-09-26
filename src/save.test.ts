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
})
