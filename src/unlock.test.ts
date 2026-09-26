import { describe, expect, it, vi } from 'vitest'
import { brokenPdf, lockedPdf, notPdf, plainPdf, realWorld, restrictedPdf } from '../test/fixtures'
import { createQpdf, isLocked, qpdf } from '../test/qpdf'
import { lock, open, unlock, type Outcome, type Prompt } from './unlock'

const openFile = (pdf: Uint8Array, onRestricted?: () => void) => open(createQpdf, pdf, onRestricted)
const tryPassword = (pdf: Uint8Array, password: string) => unlock(createQpdf, pdf, password)

// An unlocked copy must open with no password and pass qpdf's structural check.
async function expectUnlockedCopy(result: Outcome | Prompt, hadPassword: boolean) {
  expect(result).toMatchObject({ type: 'unlocked', hadPassword })
  const { pdf } = result as Extract<Outcome, { type: 'unlocked' }>
  expect(await isLocked(pdf)).toBe(false)
  expect((await qpdf(pdf, ['--check', '/in.pdf'])).code).toBe(0)
}

describe('opening a file', () => {
  it('ends not locked for a PDF with no open password and no restrictions', async () => {
    expect(await openFile(plainPdf())).toEqual({ type: 'not-locked' })
  })

  it('pauses at the password prompt for a PDF with an open password', async () => {
    expect(await openFile(await lockedPdf({ openPassword: 'secret' }))).toEqual({ type: 'needs-password' })
  })

  it('unlocks a restricted PDF with no password prompt', async () => {
    const onRestricted = vi.fn()
    await expectUnlockedCopy(await openFile(await restrictedPdf(), onRestricted), false)
    expect(onRestricted).toHaveBeenCalledOnce()
  })

  it('ends unreadable for a file that is not a PDF', async () => {
    expect(await openFile(notPdf())).toEqual({
      type: 'unreadable',
      message: expect.stringMatching(/^This file could not be read as a PDF \(.+\)\.$/),
    })
  })

  it('ends unreadable for a PDF cut off partway', async () => {
    expect(await openFile(await brokenPdf())).toMatchObject({ type: 'unreadable' })
  })
})

describe('trying an open password', () => {
  it('unlocks with the right open password', async () => {
    await expectUnlockedCopy(await tryPassword(await lockedPdf({ openPassword: 'secret' }), 'secret'), true)
  })

  it('marks the password prompt wrong for a wrong password', async () => {
    expect(await tryPassword(await lockedPdf({ openPassword: 'secret' }), 'nope')).toEqual({ type: 'wrong-password' })
  })

  it('treats open passwords as case-sensitive', async () => {
    expect(await tryPassword(await lockedPdf({ openPassword: 'Secret' }), 'secret')).toEqual({ type: 'wrong-password' })
  })

  it('also unlocks with the owner password', async () => {
    const pdf = await lockedPdf({ openPassword: 'secret', ownerPassword: 'boss' })
    await expectUnlockedCopy(await tryPassword(pdf, 'boss'), true)
  })

  it.each([
    ['non-ASCII letters', 'pässwörd-ñ'],
    ['spaces and quotes', `a "b" 'c' d`],
    ['shell and flag characters', '--decrypt;$HOME&|'],
  ])('unlocks with an open password that has %s', async (_, password) => {
    await expectUnlockedCopy(await tryPassword(await lockedPdf({ openPassword: password }), password), true)
  })

  it.each([40, 128, 256] as const)('unlocks a %i-bit locked PDF', async (bits) => {
    const pdf = await lockedPdf({ openPassword: 'secret', bits })
    expect(await openFile(pdf)).toEqual({ type: 'needs-password' })
    await expectUnlockedCopy(await tryPassword(pdf, 'secret'), true)
  })
})

describe('real-world locked PDFs', () => {
  it.each(['quartz-open-password.pdf', 'pypdf-rc4-40.pdf'])('unlocks %s with its open password', async (name) => {
    const pdf = realWorld(name)
    expect(await openFile(pdf)).toEqual({ type: 'needs-password' })
    expect(await tryPassword(pdf, 'wrong')).toEqual({ type: 'wrong-password' })
    await expectUnlockedCopy(await tryPassword(pdf, 'sphynx'), true)
  })

  it('unlocks the Quartz restricted PDF with no password prompt', async () => {
    await expectUnlockedCopy(await openFile(realWorld('quartz-restricted.pdf')), false)
  })
})

it('leaves console.error as it found it', async () => {
  const before = console.error
  await openFile(notPdf())
  expect(console.error).toBe(before)
})

describe('locking the unlocked copy with an own password', () => {
  const lockedCopy = () => lock(createQpdf, plainPdf(), 'hunter2')

  it('makes a locked copy that pauses at the password prompt', async () => {
    expect(await openFile(await lockedCopy())).toEqual({ type: 'needs-password' })
  })

  it('unlocks the locked copy with the own password', async () => {
    await expectUnlockedCopy(await tryPassword(await lockedCopy(), 'hunter2'), true)
  })

  it('uses AES-256 and adds no restrictions', async () => {
    const { stdout } = await qpdf(await lockedCopy(), ['--password=hunter2', '--show-encryption', '/in.pdf'])
    expect(stdout).toContain('R = 6')
    const permissions = stdout.filter((line) => /^(extract|print|modify)\b/.test(line))
    expect(permissions).toHaveLength(9)
    for (const line of permissions) expect(line).toMatch(/: allowed$/)
  })

  it('marks the password prompt wrong for anything but the own password', async () => {
    expect(await tryPassword(await lockedCopy(), 'other')).toEqual({ type: 'wrong-password' })
  })

  it('locks and reopens with an own password of 127 UTF-8 bytes, the most AES-256 takes', async () => {
    const password = 'x'.repeat(127)
    await expectUnlockedCopy(await tryPassword(await lock(createQpdf, plainPdf(), password), password), true)
  })

  it.each([
    ['128 ASCII letters', 'x'.repeat(128)],
    ['64 two-byte letters (128 bytes)', 'é'.repeat(64)],
  ])('refuses an own password over 127 UTF-8 bytes without loading qpdf: %s', async (_, password) => {
    const create = vi.fn(createQpdf)
    await expect(lock(create, plainPdf(), password)).rejects.toThrow()
    expect(create).not.toHaveBeenCalled()
  })

  it('refuses an empty own password without loading qpdf', async () => {
    const create = vi.fn(createQpdf)
    await expect(lock(create, plainPdf(), '')).rejects.toThrow()
    expect(create).not.toHaveBeenCalled()
  })
})
