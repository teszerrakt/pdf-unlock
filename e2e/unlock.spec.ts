import { bloatedPdf, brokenPdf, lockedPdf, notPdf, plainPdf, restrictedPdf } from '../test/fixtures.ts'
import { isLocked, qpdf } from '../test/qpdf.ts'
import { downloadCopy, downloadUnlockedCopy, enterPassword, expect, pickFile, screen, test } from './test.ts'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

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
    await page.goto('/')
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
  await expect(page.locator('#done-text')).toHaveText('form.pdf had no open password, only print or copy limits. This copy has none.')
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

test.describe('own password', () => {
  test.beforeEach(async ({ page }) => {
    await pickFile(page, 'statement.pdf', await lockedPdf({ openPassword: 'secret' }))
    await enterPassword(page, 'secret')
    await expect(screen(page, 'done')).toBeVisible()
    await page.getByRole('button', { name: 'Add password', exact: true }).click()
  })

  const ownPassword = (page: import('@playwright/test').Page) => page.getByLabel('New password', { exact: true })

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
    await expect(page.locator('#done-info')).toHaveText(/^\d+ KB · Your password$/)
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
