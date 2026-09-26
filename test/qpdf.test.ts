import { expect, it } from 'vitest'
import { lockedPdf, plainPdf, restrictedPdf } from './fixtures'
import { isLocked } from './qpdf'

it('isLocked tells a locked PDF, with an open password or only restrictions, from one with no lock', async () => {
  expect(await isLocked(await lockedPdf({ openPassword: 'secret' }))).toBe(true)
  expect(await isLocked(await restrictedPdf())).toBe(true)
  expect(await isLocked(plainPdf())).toBe(false)
})
