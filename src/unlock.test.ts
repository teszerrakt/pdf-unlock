import { describe, expect, it, vi } from 'vitest'
import { bloatedPdf, bloatedPngPdf, brokenPdf, lockedPdf, notPdf, plainPdf, pngImagePdf, realWorld, restrictedPdf } from '../test/fixtures'
import { createQpdf, isLocked, qpdf } from '../test/qpdf'
import { dateForms } from './dates'
import { open, unlock, type CreateQpdf, type Outcome, type Prompt } from './unlock'

const openFile = (pdf: Uint8Array, onRestricted?: () => void) => open(createQpdf, pdf, onRestricted)
// The exact text alone, with no date forms.
const typed = (password: string) => [{ password, form: null }]
const tryPassword = (pdf: Uint8Array, password: string) => unlock(createQpdf, pdf, typed(password))

// An unlocked copy must open with no password and pass qpdf's structural check.
async function expectUnlockedCopy(result: Outcome | Prompt, hadPassword: boolean) {
  expect(result).toMatchObject({ type: 'unlocked', hadPassword })
  const { pdf } = result as Extract<Outcome, { type: 'unlocked' }>
  expect(await isLocked(pdf)).toBe(false)
  expect((await qpdf(pdf, ['--check', '/in.pdf'])).code).toBe(0)
  return pdf
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

describe('repacking the unlocked copy', () => {
  it('makes the unlocked copy of a bloated PDF smaller than the input, and smaller than a plain decrypt', async () => {
    const pdf = await bloatedPdf({ openPassword: 'secret' })
    const copy = await expectUnlockedCopy(await tryPassword(pdf, 'secret'), true)
    expect(copy.length).toBeLessThan(pdf.length)
    // qpdf compresses uncompressed streams on any rewrite, so the repack has to beat that too.
    const plain = await qpdf(pdf, ['--password=secret', '--decrypt', '/in.pdf', '/out.pdf'])
    expect(copy.length).toBeLessThan(plain.output!.length)
  })

  it.each([
    ['a PNG image', pngImagePdf],
    ['uncompressed text beside a PNG image', bloatedPngPdf],
  ])('never makes the unlocked copy bigger than a plain decrypt, for %s', async (_, fixture) => {
    const pdf = await fixture({ openPassword: 'secret' })
    const copy = await expectUnlockedCopy(await tryPassword(pdf, 'secret'), true)
    const plain = await qpdf(pdf, ['--password=secret', '--decrypt', '/in.pdf', '/out.pdf'])
    expect(copy.length).toBeLessThanOrEqual(plain.output!.length)
  })

  it('keeps the repacked copy when the plain decrypt after it runs out of memory', async () => {
    let runs = 0
    const outOfMemoryAfterOne: CreateQpdf = async () => {
      if (++runs > 1) throw new RangeError('WebAssembly.Memory(): could not allocate memory')
      return createQpdf()
    }
    await expectUnlockedCopy(await unlock(outOfMemoryAfterOne, await pngImagePdf({ openPassword: 'secret' }), typed('secret')), true)
    expect(runs).toBe(2)
  })

  it('still unlocks, with a plain decrypt, when the repack run aborts out of memory', async () => {
    const abortingRepack: CreateQpdf = async () => {
      const q = await createQpdf()
      const callMain = q.callMain.bind(q)
      q.callMain = (args) => {
        if (args.includes('--object-streams=generate')) throw new WebAssembly.RuntimeError('Aborted(OOM)')
        return callMain(args)
      }
      return q
    }
    await expectUnlockedCopy(await unlock(abortingRepack, await lockedPdf({ openPassword: 'secret' }), typed('secret')), true)
  })

  it('still unlocks, with a plain decrypt, when the repack run fails', async () => {
    const calls: string[][] = []
    const failingRepack: CreateQpdf = async () => {
      const q = await createQpdf()
      const callMain = q.callMain.bind(q)
      q.callMain = (args) => {
        calls.push(args)
        return args.includes('--object-streams=generate') ? 2 : callMain(args)
      }
      return q
    }
    const result = await unlock(failingRepack, await lockedPdf({ openPassword: 'secret' }), typed('secret'))
    await expectUnlockedCopy(result, true)
    expect(calls).toHaveLength(2)
    expect(calls[1]).not.toEqual(expect.arrayContaining([expect.stringMatching(/object-streams|recompress-flate|compression-level/)]))
  })
})

describe('trying the date forms of a typed password', () => {
  const today = new Date(2026, 8, 26)

  // Records the password of every qpdf run. A successful unlock runs qpdf twice with the password
  // that worked: the repack run, then the plain decrypt it is compared with.
  function recordingPasswords() {
    const ran: string[] = []
    const create: CreateQpdf = async () => {
      const q = await createQpdf()
      const callMain = q.callMain.bind(q)
      q.callMain = (args) => {
        ran.push(args.find((arg) => arg.startsWith('--password='))!.slice('--password='.length))
        return callMain(args)
      }
      return q
    }
    return { ran, create }
  }

  it('unlocks with the date form that worked, trying the candidates in order and stopping there', async () => {
    const { ran, create } = recordingPasswords()
    const result = await unlock(create, await lockedPdf({ openPassword: '05081990' }), dateForms('900805', today))
    expect(result).toMatchObject({ type: 'unlocked', form: 'DDMMYYYY', password: '05081990' })
    expect(ran).toEqual(['900805', '05081990', '05081990'])
  })

  it('unlocks with form null when the exact text worked, running no date form', async () => {
    const { ran, create } = recordingPasswords()
    const result = await unlock(create, await lockedPdf({ openPassword: '05081990' }), dateForms('05081990', today))
    expect(result).toMatchObject({ type: 'unlocked', form: null, password: '05081990' })
    expect(ran).toEqual(['05081990', '05081990'])
  })

  it('marks the password wrong after running every candidate once', async () => {
    const { ran, create } = recordingPasswords()
    const candidates = dateForms('060890', today)
    const onTry = vi.fn()
    const result = await unlock(create, await lockedPdf({ openPassword: '05081990' }), candidates, onTry)
    expect(result).toEqual({ type: 'wrong-password' })
    expect(ran).toEqual(candidates.map(({ password }) => password))
    expect(onTry.mock.calls).toEqual(candidates.slice(1).map((_, i) => [i + 2, candidates.length]))
  })
})

it('leaves console.error as it found it', async () => {
  const before = console.error
  await openFile(notPdf())
  expect(console.error).toBe(before)
})
