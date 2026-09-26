// Every e2e test imports `test` from here, which runs the privacy guard around it.
// See docs/adr/0001-privacy-guard-in-tests.md: never loosen the guard to make a test pass.
import { test as base, expect, type Page } from '@playwright/test'
import { SHARE_ACTION } from '../src/share-target.ts'
import { isLocked } from '../test/qpdf.ts'

export { expect }

export const test = base.extend<{ privacyGuard: void }>({
  privacyGuard: [
    async ({ context, page, baseURL }, use) => {
      const origin = new URL(baseURL!).origin
      const leaks: string[] = []
      const violations: string[] = []
      const crashes: string[] = []
      context.on('request', (request) => {
        const url = new URL(request.url())
        if (url.protocol === 'data:' || url.protocol === 'blob:') return
        if (url.origin !== origin) leaks.push(`${request.method()} ${request.url()}`)
        // The file and password never go to the host either. The one POST is Android's share,
        // which the service worker answers on the device.
        else if (request.method() !== 'GET' && url.pathname !== SHARE_ACTION) leaks.push(`${request.method()} ${request.url()}`)
      })
      page.on('console', (message) => {
        if (/content security policy/i.test(message.text())) violations.push(message.text())
      })
      page.on('pageerror', (error) => crashes.push(error.message))
      await use()
      expect(leaks, 'requests that could carry the file or password off the device').toEqual([])
      expect(violations, 'Content-Security-Policy violations').toEqual([])
      expect(crashes, 'uncaught errors in the page').toEqual([])
    },
    { auto: true },
  ],
})

export const screen = (page: Page, id: 'pick' | 'unlock' | 'busy' | 'done' | 'stop') => page.locator(`#${id}`)

export async function pickFile(page: Page, name: string, bytes: Uint8Array) {
  await page.locator('#file').setInputFiles({ name, mimeType: 'application/pdf', buffer: Buffer.from(bytes) })
}

export async function enterPassword(page: Page, password: string) {
  await page.locator('#password').fill(password)
  await page.getByRole('button', { name: 'Unlock', exact: true }).click()
}

// Downloads the unlocked copy and checks it opens without a password.
export async function downloadUnlockedCopy(page: Page) {
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#download').click()])
  const stream = await download.createReadStream()
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(chunk as Buffer)
  const pdf = new Uint8Array(Buffer.concat(chunks))
  expect(await isLocked(pdf), 'the unlocked copy still has a lock').toBe(false)
  return { name: download.suggestedFilename(), pdf }
}

// Resolves once the service worker controls the page: offline and the share target need it.
export async function waitForServiceWorker(page: Page) {
  await page.waitForFunction(() => !!navigator.serviceWorker?.controller)
}
