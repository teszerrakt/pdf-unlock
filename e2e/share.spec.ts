// Android's share sheet (manifest share_target): the browser POSTs the file to /share-target,
// the service worker parks it and redirects to /?shared, and the page takes it from there.
import { lockedPdf } from '../test/fixtures.ts'
import { expect, screen, test, waitForServiceWorker } from './test.ts'

test.beforeEach(async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Web Share Target is Chromium only')
  await page.goto('/')
  await waitForServiceWorker(page)
})

// Stands in for the browser's share POST; a form cannot do it, since the CSP sets form-action 'none'.
async function share(page: import('@playwright/test').Page, file?: { name: string; bytes: number[] }) {
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
