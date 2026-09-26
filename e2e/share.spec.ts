import type { Page } from '@playwright/test'
import { lockedPdf } from '../test/fixtures.ts'
import { isLocked } from '../test/qpdf.ts'
import { enterPassword, expect, pickFile, screen, test, waitForServiceWorker } from './test.ts'

// Android's share sheet (manifest share_target): the browser POSTs the file to /share-target,
// the service worker parks it and redirects to /?shared, and the page takes it from there.
test.describe('share target', () => {
  test.beforeEach(async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Web Share Target is Chromium only')
    await page.goto('/')
    await waitForServiceWorker(page)
  })

  // Stands in for the browser's share POST; a form cannot do it, since the CSP sets form-action 'none'.
  async function share(page: Page, file?: { name: string; bytes: number[] }) {
    const fromServiceWorker = await page.evaluate(async (file) => {
      const form = new FormData()
      if (file) form.append('file', new File([new Uint8Array(file.bytes)], file.name, { type: 'application/pdf' }))
      const response = await fetch('/share-target', { method: 'POST', body: form, redirect: 'manual' })
      return response.type === 'opaqueredirect'
    }, file)
    expect(fromServiceWorker, 'the service worker answers the share with a redirect').toBe(true)
    await page.goto('/?shared')
  }

  test('a shared locked PDF opens at the password prompt', async ({ page }) => {
    await share(page, { name: 'shared.pdf', bytes: [...(await lockedPdf({ openPassword: 'secret' }))] })
    await expect(screen(page, 'unlock')).toBeVisible()
    await expect(page.locator('#unlock-name')).toHaveText('shared.pdf')
    await expect(page).toHaveURL('/')
  })

  test('a share with no file says so', async ({ page }) => {
    await share(page)
    await expect(screen(page, 'stop')).toBeVisible()
    await expect(page.locator('#stop-text')).toHaveText('Your browser did not pass the shared file to the app. Use Choose a PDF instead.')
  })

  test('reaching the share URL as a page says the file did not come through', async ({ page }) => {
    await page.goto('/share-target?title=x')
    await expect(page.locator('#stop-text')).toHaveText('The share opened without its file (?title=x). Use Choose a PDF instead.')
    await expect(page).toHaveURL('/')
  })
})

test.describe('iPhone share sheet', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'iphone', 'the iPhone device profile only')
    // Playwright's iPhone profile still reports a Mac platform and has no Web Share.
    await page.addInitScript(() => {
      const shared: File[][] = ((window as unknown as { shared: File[][] }).shared = [])
      const stub = (name: string, value: unknown) => Object.defineProperty(Navigator.prototype, name, { get: () => value, configurable: true })
      stub('platform', 'iPhone')
      stub('canShare', () => true)
      stub('share', async (data: ShareData) => void shared.push(data.files ?? []))
    })
    await page.goto('/')
  })

  async function sharedFiles(page: Page) {
    return page.evaluate(() =>
      Promise.all(
        (window as unknown as { shared: File[][] }).shared.map((files) =>
          Promise.all(files.map(async (file) => ({ name: file.name, bytes: [...new Uint8Array(await file.arrayBuffer())] }))),
        ),
      ),
    )
  }

  test('a batch of two: the end screen offers Save or share all, not Save all, and it shares both unlocked copies', async ({ page }) => {
    const pdf = await lockedPdf({ openPassword: 'secret' })
    await page.locator('#file').setInputFiles([
      { name: 'march.pdf', mimeType: 'application/pdf', buffer: Buffer.from(pdf) },
      { name: 'april.pdf', mimeType: 'application/pdf', buffer: Buffer.from(pdf) },
    ])
    await enterPassword(page, 'secret')
    await expect(page.locator('#batch-done-title')).toHaveText('2 of 2 unlocked.')

    const saveOrShareAll = page.getByRole('button', { name: 'Save or share all' })
    await expect(saveOrShareAll).toBeVisible()
    await expect(page.getByRole('button', { name: 'Save all' })).toBeHidden()
    await saveOrShareAll.tap()

    await expect.poll(() => sharedFiles(page).then((calls) => calls.length)).toBe(1)
    const [files] = await sharedFiles(page)
    expect(files.map((file) => file.name)).toEqual(['march-unlocked.pdf', 'april-unlocked.pdf'])
    for (const file of files) expect(await isLocked(new Uint8Array(file.bytes)), `${file.name} still has a lock`).toBe(false)
  })

  test('one file: Done offers Save or share, and no Save to device', async ({ page }) => {
    await pickFile(page, 'statement.pdf', await lockedPdf({ openPassword: 'secret' }))
    await enterPassword(page, 'secret')
    await expect(screen(page, 'done')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Save or share', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Save to device' })).toBeHidden()
  })
})
