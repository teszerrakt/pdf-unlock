import { brokenPdf, lockedPdf, notPdf, plainPdf, restrictedPdf } from '../test/fixtures.ts'
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

  test('the eye toggle hides the own password', async ({ page }) => {
    await page.getByRole('button', { name: 'Hide password', exact: true }).click()
    await expect(ownPassword(page)).toHaveAttribute('type', 'password')
    await expect(page.locator('#new-reveal')).toHaveAttribute('aria-label', 'Show password')
  })
})
