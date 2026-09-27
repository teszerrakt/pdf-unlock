import type { Page } from '@playwright/test'
import { bloatedPdf, brokenPdf, lockedPdf, notPdf, plainPdf, restrictedPdf, scannedPdf } from '../test/fixtures.ts'
import { isLocked, qpdf } from '../test/qpdf.ts'
import { readZip } from '../test/unzip.ts'
import { downloadCopy, downloadUnlockedCopy, enterPassword, expect, pickFile, screen, test, waitForServiceWorker } from './test.ts'
import { doneIcon, pdfjsChunk, pdfjsScript, thumbnailInk } from './thumbnail.ts'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

// Loads the app again, for a test that sets something up before load. Leaving while sw.js still loads
// makes WebKit reject the registration, which the privacy guard reports as an uncaught error.
async function revisit(page: Page) {
  await waitForServiceWorker(page)
  await page.goto('/')
}

test('locked PDF with an open password: the right password gives an unlocked copy', async ({ page }) => {
  await pickFile(page, 'statement.pdf', await lockedPdf({ openPassword: 'secret' }))
  await expect(screen(page, 'unlock')).toBeVisible()
  await expect(page.locator('#unlock-name')).toHaveText('statement.pdf')

  await enterPassword(page, 'secret')
  await expect(screen(page, 'done')).toBeVisible()
  await expect(page.locator('#done-text')).toHaveText('This copy opens anywhere, no password needed.')
  const copy = await downloadUnlockedCopy(page)
  expect(copy.name).toBe('statement-unlocked.pdf')
})

test('bloated locked PDF: the Done text names the saving and the unlocked copy is smaller', async ({ page }) => {
  const pdf = await bloatedPdf({ openPassword: 'secret' })
  await pickFile(page, 'statement.pdf', pdf)
  await enterPassword(page, 'secret')
  await expect(screen(page, 'done')).toBeVisible()
  await expect(page.locator('#done-text')).toHaveText(/^This copy opens anywhere, no password needed\. It’s also \d+ KB smaller\.$/)
  expect((await downloadUnlockedCopy(page)).pdf.length).toBeLessThan(pdf.length)
})

test('12-page locked PDF on a phone: the Done card line shows the page count in full beside Add password', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await pickFile(page, 'statement.pdf', await lockedPdf({ openPassword: 'secret' }, plainPdf({ pages: 12 })))
  await enterPassword(page, 'secret')
  await expect(screen(page, 'done')).toBeVisible()
  const line = page.locator('#done-info')
  await expect(line).toHaveText(/^\d+ KB · 12 pages$/)
  await expect(page.getByRole('button', { name: 'Add password', exact: true })).toBeVisible()
  const overflow = () => line.evaluate((element) => element.scrollWidth - element.clientWidth)
  expect(await overflow(), 'the card line is cut off').toBeLessThanOrEqual(0)
  // The fixture is a few KB; a real statement's line is longer.
  await line.evaluate((element) => (element.textContent = '12.3 MB · 128 pages'))
  expect(await overflow(), 'a long card line is cut off').toBeLessThanOrEqual(0)
})

test('locked PDF with an open password and a print limit: the Done text names the print limit', async ({ page }) => {
  await pickFile(page, 'statement.pdf', await lockedPdf({ openPassword: 'secret', restrictions: ['print'] }))
  await enterPassword(page, 'secret')
  await expect(page.locator('#done-text')).toHaveText('This copy opens anywhere, no password needed. The print limit is gone too.')
})

test('wrong password: the prompt is marked wrong until the user types again', async ({ page }) => {
  await pickFile(page, 'statement.pdf', await lockedPdf({ openPassword: 'secret' }))
  await enterPassword(page, 'nope')

  const password = page.locator('#password')
  await expect(page.locator('#wrong')).toBeVisible()
  await expect(password).toHaveAttribute('aria-invalid', 'true')
  await expect(page.locator('#unlock-title')).toHaveText('Not quite.')

  await password.press('Backspace')
  await expect(page.locator('#wrong')).toBeHidden()
  await expect(password).toHaveAttribute('aria-invalid', 'false')

  await enterPassword(page, 'secret')
  await expect(screen(page, 'done')).toBeVisible()
})

test.describe('date forms', () => {
  // Every candidate is checked against today; 2026-09-26 keeps `900805` and `060890` in the past.
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date(2026, 8, 26, 12))
    await revisit(page)
  })

  test('a date typed in another form: the Done text names the date form that worked', async ({ page }) => {
    await pickFile(page, 'statement.pdf', await lockedPdf({ openPassword: '05081990' }))
    await enterPassword(page, '900805')
    await expect(screen(page, 'done')).toBeVisible()
    await expect(page.locator('#done-text')).toContainText('Your password worked written as 05081990 (day-month-year).')
    await downloadUnlockedCopy(page)
  })

  test('wrong password: the line counts the date forms tried, and only when there were some', async ({ page }) => {
    await pickFile(page, 'statement.pdf', await lockedPdf({ openPassword: '05081990' }))
    await enterPassword(page, '060890')
    await expect(page.locator('#wrong')).toHaveText('Wrong password. Tried 7 ways of writing it as a date.')
    await enterPassword(page, 'nope')
    await expect(page.locator('#wrong')).toHaveText('Wrong password. Try again.')
  })
})

test.describe('a password pasted with spaces around it', () => {
  test('" sphynx ": the Done text ends saying the password worked without the spaces around it', async ({ page }) => {
    await pickFile(page, 'statement.pdf', await lockedPdf({ openPassword: 'sphynx' }))
    await enterPassword(page, ' sphynx ')
    await expect(screen(page, 'done')).toBeVisible()
    await expect(page.locator('#done-text')).toHaveText(/ Your password worked without the spaces around it\.$/)
    await downloadUnlockedCopy(page)
  })

  test('" SPHYNX ", wrong even trimmed and not a date: the prompt says Wrong password. Try again.', async ({ page }) => {
    await pickFile(page, 'statement.pdf', await lockedPdf({ openPassword: 'sphynx' }))
    await enterPassword(page, ' SPHYNX ')
    await expect(page.locator('#wrong')).toHaveText('Wrong password. Try again.')
  })
})

test.describe('Caps Lock hint', () => {
  const press = (page: Page, capsLock: boolean) =>
    page.locator('#password').dispatchEvent('keydown', { key: 'a', modifierCapsLock: capsLock })

  test.beforeEach(async ({ page }) => {
    await pickFile(page, 'statement.pdf', await lockedPdf({ openPassword: 'secret' }))
    await expect(screen(page, 'unlock')).toBeVisible()
  })

  test('a key pressed with Caps Lock on shows the hint under the field, and one with it off hides it', async ({ page }) => {
    const hint = page.locator('#caps-lock')
    await expect(hint).toBeHidden()
    await press(page, true)
    await expect(hint).toHaveText('Caps Lock is on.')
    await expect(hint).toBeVisible()
    await press(page, false)
    await expect(hint).toBeHidden()
  })

  test('a wrong password with Caps Lock on: the hint sits below the error', async ({ page }) => {
    await press(page, true)
    await enterPassword(page, 'nope')
    const wrong = page.locator('#wrong')
    const hint = page.locator('#caps-lock')
    await expect(wrong).toBeVisible()
    await expect(hint).toBeVisible()
    // Both boxes in one frame: the prompt's entrance moves the whole field while it plays.
    const [errorBottom, hintTop] = await page.evaluate(() => [
      document.getElementById('wrong')!.getBoundingClientRect().bottom,
      document.getElementById('caps-lock')!.getBoundingClientRect().top,
    ])
    expect(hintTop).toBeGreaterThanOrEqual(errorBottom)
  })

  test('Caps Lock turned off while the field is away: the wrong-password prompt comes back with no hint', async ({ page }) => {
    await press(page, true)
    await enterPassword(page, 'nope')
    await page.locator('body').dispatchEvent('keyup', { key: 'CapsLock', modifierCapsLock: false })
    await expect(page.locator('#wrong')).toBeVisible()
    await expect(page.locator('#caps-lock')).toBeHidden()
  })

  test('a new password prompt hides the hint', async ({ page }) => {
    await press(page, true)
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()
    await pickFile(page, 'statement.pdf', await lockedPdf({ openPassword: 'secret' }))
    await expect(screen(page, 'unlock')).toBeVisible()
    await expect(page.locator('#caps-lock')).toBeHidden()
  })
})

test('the promise: uses only the password you type, and its date forms', async ({ page }) => {
  const promise = 'Uses only the password you type. If it’s a date, it also tries other ways of writing it.'
  await expect(page.locator('#pick .note')).toHaveText(promise)
  await expect(page.locator('footer span').first()).toHaveText(promise)
  await page.locator('#how').click()
  await expect(page.locator('#about .about-lede')).toHaveText(promise)
  const fact = page.locator('#about .facts li').last()
  await expect(fact.locator('strong')).toHaveText('Never guesses')
  await expect(fact.locator('span')).toHaveText(/^Never guessesOnly your password, and its date forms\.$/)
})

test('restricted PDF: unlocked with no password prompt', async ({ page }) => {
  await pickFile(page, 'form.pdf', await restrictedPdf())
  await expect(screen(page, 'done')).toBeVisible()
  await expect(page.locator('#done-text')).toHaveText(
    'form.pdf had no open password, only limits on printing, copying and editing. This copy has none.',
  )
  expect((await downloadUnlockedCopy(page)).name).toBe('form-unlocked.pdf')
})

test('not locked: nothing to unlock', async ({ page }) => {
  await pickFile(page, 'plain.pdf', plainPdf())
  await expect(screen(page, 'stop')).toBeVisible()
  await expect(page.locator('#stop-title')).toHaveText('Nothing to unlock.')
  await expect(page.locator('#stop-text')).toHaveText('plain.pdf has no password. It already opens anywhere.')
})

test('unreadable: a PDF cut off partway', async ({ page }) => {
  await pickFile(page, 'broken.pdf', await brokenPdf())
  await expect(screen(page, 'stop')).toBeVisible()
  await expect(page.locator('#stop-title')).toHaveText('That didn’t work.')
  await expect(page.locator('#stop-text')).toContainText('This file could not be read as a PDF')
})

test('dropping a file that is not a PDF', async ({ page }) => {
  const dataTransfer = await page.evaluateHandle((text) => {
    const transfer = new DataTransfer()
    transfer.items.add(new File([text], 'notes.txt', { type: 'text/plain' }))
    return transfer
  }, new TextDecoder().decode(notPdf()))
  await page.dispatchEvent('#drop', 'drop', { dataTransfer })
  await expect(page.locator('#stop-title')).toHaveText('That’s not a PDF.')
  await expect(page.locator('#stop-text')).toHaveText('notes.txt is not a PDF. Choose a PDF file.')
})

test('dropping a locked PDF opens the password prompt', async ({ page }) => {
  const bytes = [...(await lockedPdf({ openPassword: 'secret' }))]
  const dataTransfer = await page.evaluateHandle((bytes) => {
    const transfer = new DataTransfer()
    transfer.items.add(new File([new Uint8Array(bytes)], 'dropped.pdf', { type: 'application/pdf' }))
    return transfer
  }, bytes)
  await page.dispatchEvent('#drop', 'drop', { dataTransfer })
  await expect(screen(page, 'unlock')).toBeVisible()
  await expect(page.locator('#unlock-name')).toHaveText('dropped.pdf')
})

test('pasting a locked PDF opens the password prompt', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'WebKit ignores clipboardData on a synthetic paste event')
  const bytes = [...(await lockedPdf({ openPassword: 'secret' }))]
  await page.evaluate((bytes) => {
    const clipboardData = new DataTransfer()
    clipboardData.items.add(new File([new Uint8Array(bytes)], 'pasted.pdf', { type: 'application/pdf' }))
    document.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }))
  }, bytes)
  await expect(screen(page, 'unlock')).toBeVisible()
  await expect(page.locator('#unlock-name')).toHaveText('pasted.pdf')
})

test.describe('abandoning an attempt', () => {
  for (const control of ['Cancel', 'Back']) {
    test(`${control} clears the typed password and the picked file`, async ({ page }) => {
      await pickFile(page, 'statement.pdf', await lockedPdf({ openPassword: 'secret' }))
      await page.locator('#password').fill('half-typed')
      await page.getByRole('button', { name: control, exact: true }).click()

      await expect(screen(page, 'pick')).toBeVisible()
      await expect(page.locator('#password')).toHaveValue('')
      await expect(page.locator('#file')).toHaveValue('')
    })
  }
})

test('the pick screen asks for PDFs, more than one allowed', async ({ page }) => {
  await expect(page.locator('#drop .drop-title')).toHaveText('Choose PDFs')
  await expect(page.locator('#drop .drop-hint')).toHaveText('or drop them here, or paste')
  await expect(page.locator('#drop .drop-button')).toHaveText('Choose PDFs')
  await expect(page.locator('#drop .drop-keys')).toHaveText(/^or drop them here, or paste with/)
})

test.describe('batch', () => {
  async function pickFiles(page: Page, files: [string, Uint8Array][]) {
    await page.locator('#file').setInputFiles(files.map(([name, bytes]) => ({ name, mimeType: 'application/pdf', buffer: Buffer.from(bytes) })))
  }

  const rows = (page: Page) => page.locator('#batch-done .row-state')

  async function threeKinds(page: Page) {
    await pickFiles(page, [
      ['march.pdf', await lockedPdf({ openPassword: 'secret' })],
      ['form.pdf', await restrictedPdf()],
      ['plain.pdf', plainPdf()],
    ])
    await expect(screen(page, 'unlock')).toBeVisible()
    await expect(page.locator('#counter')).toHaveText('1 of 3')
    await expect(page.locator('#remember')).toBeChecked()
    await enterPassword(page, 'secret')
    await expect(page.locator('#batch-done')).toBeVisible()
  }

  test('a locked, a restricted and a not locked PDF: the open password typed once gives 2 of 3 unlocked', async ({ page }) => {
    await threeKinds(page)
    await expect(page.locator('#batch-done-title')).toHaveText('2 of 3 unlocked.')
    await expect(page.locator('#batch-done-text')).toHaveText('One file had no password to remove.')
    await expect(rows(page)).toHaveText(['Unlocked', 'Unlocked', 'Not locked'])
    await expect(page.locator('#batch-done .note')).toHaveText('Nothing was uploaded. These copies are cleared when you leave.')
    await expect(page.getByRole('button', { name: 'Unlock more' })).toBeVisible()
  })

  test('Save all downloads unlocked.zip, and no unlocked copy in it is locked', async ({ page }) => {
    await threeKinds(page)
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Save all' }).click()])
    expect(download.suggestedFilename()).toBe('unlocked.zip')
    const chunks: Buffer[] = []
    for await (const chunk of await download.createReadStream()) chunks.push(chunk as Buffer)
    const entries = readZip(new Uint8Array(Buffer.concat(chunks)))
    expect(entries.map((entry) => entry.name)).toEqual(['march-unlocked.pdf', 'form-unlocked.pdf'])
    for (const entry of entries) expect(await isLocked(entry.bytes), `${entry.name} still has a lock`).toBe(false)
  })

  test('one unlocked copy saves alone from its row', async ({ page }) => {
    await threeKinds(page)
    const row = page.locator('#batch-done li').nth(1)
    const [download] = await Promise.all([page.waitForEvent('download'), row.getByRole('link', { name: 'Save' }).click()])
    expect(download.suggestedFilename()).toBe('form-unlocked.pdf')
  })

  // Call `watchToast` before its action.
  async function watchToast(page: Page) {
    await page.evaluate(() => {
      const times: number[] = ((window as unknown as { toastTimes: number[] }).toastTimes = [])
      new MutationObserver((records) => records.forEach(() => times.push(performance.now()))).observe(document.getElementById('toast')!, {
        attributeFilter: ['hidden'],
      })
    })
  }

  async function toastTime(page: Page) {
    await expect(page.locator('#toast')).toBeHidden({ timeout: 6000 })
    const [shown, hidden] = await page.evaluate(() => (window as unknown as { toastTimes: number[] }).toastTimes)
    return hidden - shown
  }

  test('Save all that succeeds shows Download started for 1.8 s', async ({ page }) => {
    await threeKinds(page)
    await watchToast(page)
    await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Save all' }).click()])
    await expect(page.locator('#toast-text')).toHaveText('Download started')
    const shown = await toastTime(page)
    expect(shown).toBeGreaterThanOrEqual(1750)
    expect(shown).toBeLessThan(2500)
  })

  test('Save all whose zip step throws its RangeError says it is too big for one zip for 4 s, and each row’s Save still downloads', async ({ page }) => {
    await threeKinds(page)
    // A name that encodes to 4 GB trips storeZip's own size check.
    await page.evaluate(() => (TextEncoder.prototype.encode = () => ({ length: 2 ** 32 }) as never))
    await watchToast(page)
    await page.getByRole('button', { name: 'Save all' }).click()
    await expect(page.locator('#toast-text')).toHaveText('Too big for one zip. Save them one by one.')
    const shown = await toastTime(page)
    expect(shown).toBeGreaterThanOrEqual(3950)
    expect(shown).toBeLessThan(4700)

    const saves = page.locator('#batch-done li').getByRole('link', { name: 'Save' })
    for (const [i, name] of ['march-unlocked.pdf', 'form-unlocked.pdf'].entries()) {
      const [download] = await Promise.all([page.waitForEvent('download'), saves.nth(i).click()])
      expect(download.suggestedFilename()).toBe(name)
    }
  })

  test('a batch that unlocked at least one file shows the heap of open padlocks', async ({ page }) => {
    await threeKinds(page)
    await expect(page.locator('#batch-done-art')).toHaveClass(/\bcat-7\b/)
    await expect(page.locator('#batch-done-art')).not.toHaveClass(/\bcat-3\b/)
  })

  test('two locked PDFs with the same open password: typed once with the checkbox on, no second prompt', async ({ page }) => {
    const pdf = await lockedPdf({ openPassword: 'secret' })
    await pickFiles(page, [
      ['march.pdf', pdf],
      ['april.pdf', pdf],
    ])
    await enterPassword(page, 'secret')
    await expect(page.locator('#batch-done')).toBeVisible()
    await expect(rows(page)).toHaveText(['Unlocked', 'Unlocked'])
    await expect(page.locator('#batch-done-text')).toHaveText('Every copy opens anywhere, no password needed.')
  })

  test('two locked PDFs with the same open password: the checkbox off brings a second prompt, 2 of 2', async ({ page }) => {
    const pdf = await lockedPdf({ openPassword: 'secret' })
    await pickFiles(page, [
      ['march.pdf', pdf],
      ['april.pdf', pdf],
    ])
    await page.getByLabel('Use it for the rest of this batch').uncheck()
    await enterPassword(page, 'secret')
    await expect(page.locator('#counter')).toHaveText('2 of 2')
    await expect(page.locator('#unlock-name')).toHaveText('april.pdf')
    await expect(page.locator('#password')).toHaveValue('')
    await expect(page.locator('#wrong')).toBeHidden()
  })

  test('Skip this file: the batch goes on, and the skipped row offers Try again', async ({ page }) => {
    await pickFiles(page, [
      ['march.pdf', await lockedPdf({ openPassword: 'secret' })],
      ['form.pdf', await restrictedPdf()],
    ])
    await page.getByRole('button', { name: 'Skip this file' }).click()
    await expect(page.locator('#batch-done')).toBeVisible()
    await expect(page.locator('#batch-done-title')).toHaveText('1 of 2 unlocked.')
    await expect(page.locator('#batch-done-text')).toHaveText('One was skipped.')
    await expect(rows(page)).toHaveText(['Skipped', 'Unlocked'])

    await page.getByRole('button', { name: 'Try again' }).click()
    await expect(page.locator('#counter')).toHaveText('1 of 2')
    await enterPassword(page, 'secret')
    await expect(page.locator('#batch-done-title')).toHaveText('2 of 2 unlocked.')
    await expect(rows(page)).toHaveText(['Unlocked', 'Unlocked'])
  })

  test('a second Skip before the next prompt shows does not skip that file too', async ({ page }) => {
    const pdf = await lockedPdf({ openPassword: 'secret' })
    await pickFiles(page, [
      ['march.pdf', pdf],
      ['april.pdf', pdf],
      ['may.pdf', pdf],
    ])
    await expect(page.locator('#counter')).toHaveText('1 of 3')
    await page.evaluate(() => {
      const cancel = document.getElementById('cancel')!
      cancel.click()
      cancel.click()
    })
    await expect(page.locator('#counter')).toHaveText('2 of 3')
    await expect(page.locator('#unlock-name')).toHaveText('april.pdf')
  })

  test('a second Try again before the first reopens its file is ignored', async ({ page }) => {
    const pdf = await lockedPdf({ openPassword: 'secret' })
    await pickFiles(page, [
      ['march.pdf', pdf],
      ['plain.pdf', plainPdf()],
      ['may.pdf', pdf],
    ])
    await page.getByRole('button', { name: 'Skip this file' }).click()
    await expect(page.locator('#counter')).toHaveText('3 of 3')
    await page.getByRole('button', { name: 'Skip this file' }).click()
    await expect(rows(page)).toHaveText(['Skipped', 'Not locked', 'Skipped'])
    await page.evaluate(() => {
      for (const button of document.querySelectorAll<HTMLButtonElement>('#batch-done .row-action')) button.click()
    })
    await expect(page.locator('#counter')).toHaveText('1 of 3')
    await page.getByRole('button', { name: 'Skip this file' }).click()
    await expect(rows(page)).toHaveText(['Skipped', 'Not locked', 'Skipped'])
  })

  test('a wrong password in a batch marks the prompt wrong, as for one file', async ({ page }) => {
    await pickFiles(page, [
      ['march.pdf', await lockedPdf({ openPassword: 'secret' })],
      ['plain.pdf', plainPdf()],
    ])
    await enterPassword(page, 'nope')
    await expect(page.locator('#wrong')).toBeVisible()
    await expect(page.locator('#counter')).toHaveText('1 of 2')
    await enterPassword(page, 'secret')
    await expect(rows(page)).toHaveText(['Unlocked', 'Not locked'])
  })

  test('a worker that crashes marks its file unreadable, and the batch goes on', async ({ page }) => {
    await page.addInitScript(() => {
      const Native = window.Worker
      const workers: Worker[] = ((window as unknown as { workers: Worker[] }).workers = [])
      window.Worker = class extends Native {
        constructor(...args: ConstructorParameters<typeof Worker>) {
          super(...args)
          workers.push(this)
        }
      }
    })
    await revisit(page)
    const pdf = await lockedPdf({ openPassword: 'secret' })
    await pickFiles(page, [
      ['march.pdf', pdf],
      ['april.pdf', pdf],
    ])
    await expect(page.locator('#counter')).toHaveText('1 of 2')
    await page.evaluate(() => (window as unknown as { workers: Worker[] }).workers.at(-1)!.dispatchEvent(new ErrorEvent('error')))
    await expect(page.locator('#counter')).toHaveText('2 of 2')
    await expect(page.getByRole('button', { name: 'Unlock', exact: true })).toBeEnabled()
    await page.getByRole('button', { name: 'Skip this file' }).click()
    await expect(rows(page)).toHaveText(['Unreadable', 'Skipped'])
    await expect(page.locator('#batch-done-text')).toHaveText('One could not be read. One was skipped.')
    await expect(page.getByRole('button', { name: 'Save all' })).toBeHidden()
  })

  test('a single file picked never shows the batch and reaches Done as before', async ({ page }) => {
    await page.evaluate(() => {
      const batch = document.getElementById('batch')!
      new MutationObserver(() => batch.hidden || document.body.setAttribute('data-batch-shown', '')).observe(batch, { attributes: true })
    })
    await pickFiles(page, [['form.pdf', await restrictedPdf()]])
    await expect(screen(page, 'done')).toBeVisible()
    await expect(page.locator('body')).not.toHaveAttribute('data-batch-shown')
  })

  test('dropping two PDFs and a text file starts a batch of the two PDFs', async ({ page }) => {
    const dataTransfer = await page.evaluateHandle((pdf) => {
      const transfer = new DataTransfer()
      transfer.items.add(new File([new Uint8Array(pdf)], 'a.pdf', { type: 'application/pdf' }))
      transfer.items.add(new File(['notes'], 'notes.txt', { type: 'text/plain' }))
      transfer.items.add(new File([new Uint8Array(pdf)], 'b.pdf', { type: 'application/pdf' }))
      return transfer
    }, [...plainPdf()])
    await page.dispatchEvent('#drop', 'drop', { dataTransfer })
    await expect(page.locator('#batch-done-title')).toHaveText('0 of 2 unlocked.')
    await expect(page.locator('#batch-done .row-name')).toHaveText(['a.pdf', 'b.pdf'])
  })

  test('pasting two PDFs starts a batch', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'WebKit ignores clipboardData on a synthetic paste event')
    await page.evaluate((pdf) => {
      const clipboardData = new DataTransfer()
      for (const name of ['a.pdf', 'b.pdf']) clipboardData.items.add(new File([new Uint8Array(pdf)], name, { type: 'application/pdf' }))
      document.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }))
    }, [...(await restrictedPdf())])
    await expect(page.locator('#batch-done-title')).toHaveText('2 of 2 unlocked.')
  })

  test.describe('with motion on', () => {
    test.use({ reducedMotion: 'no-preference' })

    test('a Skip while a wrong password waits its turn never marks the next file’s prompt wrong', async ({ page }) => {
      const pdf = await lockedPdf({ openPassword: 'secret' })
      await pickFiles(page, [
        ['march.pdf', pdf],
        ['plain.pdf', plainPdf()],
        ['may.pdf', pdf],
      ])
      await expect(page.locator('#counter')).toHaveText('1 of 3')
      await page.evaluate(async () => {
        const log: string[] = ((window as unknown as { titleLog: string[] }).titleLog = [])
        const title = document.getElementById('unlock-title')!
        const counter = document.getElementById('counter')!
        new MutationObserver(() => log.push(`${counter.textContent} ${title.textContent}`)).observe(title, { childList: true, characterData: true, subtree: true })
        ;(document.getElementById('password') as HTMLInputElement).value = 'nope'
        document.getElementById('submit')!.click()
        // The wrong password answers in tens of ms; its prompt then waits in the row pacer.
        await new Promise((resolve) => setTimeout(resolve, 120))
        document.getElementById('cancel')!.click()
      })
      await expect(page.locator('#counter')).toHaveText('3 of 3')
      await page.waitForTimeout(800)
      await expect(page.locator('#wrong')).toBeHidden()
      const log = await page.evaluate(() => (window as unknown as { titleLog: string[] }).titleLog)
      expect(log.filter((entry) => /^[23] of 3 Not quite\.$/.test(entry))).toEqual([])
    })

    test('the rows change at least 200 ms apart while the batch works', async ({ page }) => {
      await page.evaluate(() => {
        const log: number[] = ((window as unknown as { rowLog: number[] }).rowLog = [])
        const rows = document.getElementById('batch-rows')!
        new MutationObserver(() => log.push(performance.now())).observe(rows, { subtree: true, attributeFilter: ['data-state'] })
      })
      await pickFiles(page, [
        ['a.pdf', plainPdf()],
        ['b.pdf', plainPdf()],
        ['c.pdf', plainPdf()],
      ])
      await expect(page.locator('#batch-done')).toBeVisible()
      const log = await page.evaluate(() => (window as unknown as { rowLog: number[] }).rowLog)
      const gaps = log.slice(1).map((at, i) => at - log[i])
      // One change per file reaching its outcome: the next file's row starts in the same change.
      expect(log.length, 'row changes').toBe(3)
      expect(Math.min(...gaps), 'ms between two row changes').toBeGreaterThanOrEqual(190)
    })
  })
})

test.describe('own password', () => {
  test.beforeEach(async ({ page }) => {
    await pickFile(page, 'statement.pdf', await lockedPdf({ openPassword: 'secret' }))
    await enterPassword(page, 'secret')
    await expect(screen(page, 'done')).toBeVisible()
    await page.getByRole('button', { name: 'Add password', exact: true }).click()
  })

  const ownPassword = (page: import('@playwright/test').Page) => page.getByLabel('New password', { exact: true })

  test('a lock that succeeds shows the cat with its padlock shut', async ({ page }) => {
    await ownPassword(page).fill('hunter2')
    await page.getByRole('button', { name: 'Lock it', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Locked.' })).toBeVisible()
    await expect(page.locator('#done-art')).toHaveClass(/\bcat-6\b/)
    await expect(page.locator('#done-art')).not.toHaveClass(/\bcat-3\b/)
  })

  test('one file unlocked after a locked copy: Done shows the cat with the open padlock again', async ({ page }) => {
    await ownPassword(page).fill('hunter2')
    await page.getByRole('button', { name: 'Lock it', exact: true }).click()
    await expect(page.locator('#done-art')).toHaveClass(/\bcat-6\b/)
    await page.getByRole('button', { name: 'Unlock another' }).click()
    await pickFile(page, 'march.pdf', await lockedPdf({ openPassword: 'secret' }))
    await enterPassword(page, 'secret')
    await expect(page.getByRole('heading', { name: 'Unlocked.' })).toBeVisible()
    await expect(page.locator('#done-art')).toHaveClass(/\bcat-3\b/)
    await expect(page.locator('#done-art')).not.toHaveClass(/\bcat-6\b/)
  })

  test('Add password on the unlocked copy opens the set screen, Lock it waits for a password', async ({ page }) => {
    await expect(screen(page, 'relock')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Set a new password.' })).toBeVisible()
    await expect(ownPassword(page)).toHaveAttribute('type', 'text')
    const lockIt = page.getByRole('button', { name: 'Lock it', exact: true })
    await expect(lockIt).toBeDisabled()
    await ownPassword(page).fill('h')
    await expect(lockIt).toBeEnabled()
  })

  test('Lock it gives a locked copy that opens with the own password', async ({ page }) => {
    await ownPassword(page).fill('hunter2')
    await page.getByRole('button', { name: 'Lock it', exact: true }).click()

    await expect(page.getByRole('heading', { name: 'Locked.' })).toBeVisible()
    await expect(page.locator('#done-text')).toHaveText('Opens only with the password you set. Printing and copying stay allowed.')
    await expect(page.locator('#done-name')).toHaveText('statement-locked.pdf')
    await expect(page.locator('#done-info')).toHaveText(/^\d+ KB · 1 page · Your password$/)
    await expect(page.locator('#done-badge-locked')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Add password', exact: true })).toBeHidden()
    const copy = await downloadCopy(page)
    expect(copy.name).toBe('statement-locked.pdf')
    expect(await isLocked(copy.pdf), 'the locked copy has no lock').toBe(true)
    expect((await qpdf(copy.pdf, ['--password=hunter2', '--check', '/in.pdf'])).code).toBe(0)
  })

  for (const control of ['Cancel', 'Back']) {
    test(`${control} on the set screen returns to the unlocked copy and empties the field`, async ({ page }) => {
      await ownPassword(page).fill('half-typed')
      await page.getByRole('button', { name: control, exact: true }).click()

      await expect(page.getByRole('heading', { name: 'Unlocked.' })).toBeVisible()
      expect((await downloadUnlockedCopy(page)).name).toBe('statement-unlocked.pdf')
      await page.getByRole('button', { name: 'Add password', exact: true }).click()
      await expect(ownPassword(page)).toHaveValue('')
    })
  }

  test('Cancel straight after Lock it stops the lock and keeps the unlocked copy', async ({ page }) => {
    await ownPassword(page).fill('hunter2')
    // In one task, so Cancel lands before the busy screen's 300 ms wait or the worker's answer.
    await page.evaluate(() => {
      document.getElementById('lock-submit')!.click()
      document.getElementById('relock-cancel')!.click()
    })
    await page.waitForTimeout(1000)
    await expect(page.getByRole('heading', { name: 'Unlocked.' })).toBeVisible()
    await expect(screen(page, 'busy')).toBeHidden()
    expect((await downloadUnlockedCopy(page)).name).toBe('statement-unlocked.pdf')
  })

  test('typing again while a lock runs does not start a second one', async ({ page }) => {
    await ownPassword(page).fill('hunter2')
    const disabled = await page.evaluate(() => {
      const field = document.getElementById('new-password') as HTMLInputElement
      document.getElementById('lock-submit')!.click()
      field.value = 'other'
      field.dispatchEvent(new Event('input'))
      return (document.getElementById('lock-submit') as HTMLButtonElement).disabled
    })
    expect(disabled).toBe(true)
  })

  test('dropping a file that is not a PDF while a lock runs stops the lock', async ({ page }) => {
    await ownPassword(page).fill('hunter2')
    // In one task, so the drop lands before the busy screen's 300 ms wait or the worker's answer.
    await page.evaluate(() => {
      document.getElementById('lock-submit')!.click()
      const dataTransfer = new DataTransfer()
      dataTransfer.items.add(new File(['notes'], 'notes.txt', { type: 'text/plain' }))
      document.getElementById('drop')!.dispatchEvent(new DragEvent('drop', { dataTransfer, bubbles: true, cancelable: true }))
    })
    await page.waitForTimeout(1000)
    await expect(page.locator('#stop-title')).toHaveText('That’s not a PDF.')
    await expect(screen(page, 'stop')).toBeVisible()
  })

  test('an own password over 127 UTF-8 bytes keeps Lock it disabled and says it is too long', async ({ page }) => {
    const lockIt = page.getByRole('button', { name: 'Lock it', exact: true })
    const tooLong = page.getByText('Too long. Use a shorter password.', { exact: true })
    await ownPassword(page).fill('é'.repeat(64))
    await expect(tooLong).toBeVisible()
    await expect(lockIt).toBeDisabled()
    await ownPassword(page).fill('x'.repeat(127))
    await expect(tooLong).toBeHidden()
    await expect(lockIt).toBeEnabled()
  })

  test('the eye toggle hides the own password', async ({ page }) => {
    await page.getByRole('button', { name: 'Hide password', exact: true }).click()
    await expect(ownPassword(page)).toHaveAttribute('type', 'password')
    await expect(page.locator('#new-reveal')).toHaveAttribute('aria-label', 'Show password')
  })
})

test('a lock that fails keeps the unlocked copy: Done slides back, says so, and still offers Add password', async ({ page }) => {
  // As when the device runs out of memory.
  await page.addInitScript(() => {
    const post = Worker.prototype.postMessage
    Worker.prototype.postMessage = function (this: Worker, message: { type: string }, options?: StructuredSerializeOptions) {
      if (message.type === 'lock') setTimeout(() => this.dispatchEvent(new ErrorEvent('error')))
      else post.call(this, message, options)
    } as Worker['postMessage']
  })
  await revisit(page)
  await pickFile(page, 'statement.pdf', await lockedPdf({ openPassword: 'secret' }))
  await enterPassword(page, 'secret')
  await page.getByRole('button', { name: 'Add password', exact: true }).click()
  await page.getByLabel('New password', { exact: true }).fill('hunter2')
  await page.getByRole('button', { name: 'Hide password', exact: true }).click()
  await page.getByRole('button', { name: 'Lock it', exact: true }).click()

  await expect(page.getByRole('heading', { name: 'Unlocked.' })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('data-dir', 'back')
  await expect(page.locator('#done-text')).toHaveText('The password couldn’t be added on this device. Your unlocked copy is still here.')
  await expect(page.getByRole('button', { name: 'Add password', exact: true })).toBeVisible()
  await expect(screen(page, 'stop')).toBeHidden()
  expect((await downloadUnlockedCopy(page)).name).toBe('statement-unlocked.pdf')
  // The retry starts like every other visit to the set screen: the own password shows.
  await page.getByRole('button', { name: 'Add password', exact: true }).click()
  await expect(page.getByLabel('New password', { exact: true })).toHaveAttribute('type', 'text')
})

test.describe('page 1 on the Done card', () => {
  // So page.route sees pdf.js's requests: the service worker would answer them from its cache.
  test.use({ serviceWorkers: 'block' })

  async function unlockStatement(page: Page) {
    await pickFile(page, 'statement.pdf', await lockedPdf({ openPassword: 'secret' }))
    await enterPassword(page, 'secret')
    await expect(screen(page, 'done')).toBeVisible()
  }

  test('a locked PDF unlocked: the file icon shows page 1 of the unlocked copy', async ({ page }) => {
    await unlockStatement(page)
    await expect(doneIcon(page)).toHaveClass(/\bhas-thumb\b/)
    expect(await thumbnailInk(page), 'page 1 drew nothing').toBeGreaterThan(0)
  })

  test('a scanned PDF unlocked: the file icon shows the scan on page 1', async ({ page }) => {
    await pickFile(page, 'scan.pdf', await scannedPdf({ openPassword: 'secret' }))
    await enterPassword(page, 'secret')
    await expect(doneIcon(page)).toHaveClass(/\bhas-thumb\b/)
    expect(await thumbnailInk(page), 'the scan drew nothing').toBeGreaterThan(1000)
  })

  test('no pdf.js script is requested before Done shows', async ({ page }) => {
    const requested: { url: string; done: boolean }[] = []
    await page.route(pdfjsScript, async (route) => {
      requested.push({ url: route.request().url(), done: await screen(page, 'done').isVisible() })
      await route.continue()
    })
    await pickFile(page, 'statement.pdf', await lockedPdf({ openPassword: 'secret' }))
    await expect(screen(page, 'unlock')).toBeVisible()
    expect(requested, 'pdf.js requested on the pick or unlock screen').toEqual([])

    await enterPassword(page, 'secret')
    await expect(doneIcon(page)).toHaveClass(/\bhas-thumb\b/)
    expect(requested.map(({ done }) => done)).toEqual([true, true])
  })

  test('the pdf.js chunk fails to load: Done still works and the card keeps its PDF label', async ({ page }) => {
    await page.route(pdfjsChunk, (route) => route.abort())
    const failed = page.waitForEvent('requestfailed', (request) => pdfjsChunk.test(request.url()))
    await unlockStatement(page)
    await failed
    await expect(page.locator('#done-text')).toHaveText('This copy opens anywhere, no password needed.')
    await expect(doneIcon(page)).not.toHaveClass(/\bhas-thumb\b/)
    await expect(doneIcon(page)).toContainText('PDF')
    await downloadUnlockedCopy(page)
  })

  test('page 1 drawn: the unlocked copy downloads byte-identical to before it was drawn', async ({ page }) => {
    let release = () => {}
    const held = new Promise<void>((resolve) => (release = resolve))
    await page.route(pdfjsChunk, async (route) => {
      await held
      await route.continue()
    })
    await unlockStatement(page)
    const before = await downloadUnlockedCopy(page)
    await expect(doneIcon(page)).not.toHaveClass(/\bhas-thumb\b/)

    release()
    await expect(doneIcon(page)).toHaveClass(/\bhas-thumb\b/)
    const after = await downloadUnlockedCopy(page)
    expect(after.pdf).toEqual(before.pdf)
  })

  test('Add password succeeds: Locked Done still shows page 1 of the unlocked copy', async ({ page }) => {
    await unlockStatement(page)
    await expect(doneIcon(page)).toHaveClass(/\bhas-thumb\b/)
    await page.getByRole('button', { name: 'Add password', exact: true }).click()
    await page.getByLabel('New password', { exact: true }).fill('hunter2')
    await page.getByRole('button', { name: 'Lock it', exact: true }).click()

    await expect(page.getByRole('heading', { name: 'Locked.' })).toBeVisible()
    await expect(page.locator('#done-badge-locked')).toBeVisible()
    await expect(doneIcon(page)).toHaveClass(/\bhas-thumb\b/)
    expect(await thumbnailInk(page), 'page 1 drew nothing').toBeGreaterThan(0)
  })
})
