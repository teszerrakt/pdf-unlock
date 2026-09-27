import { lockedPdf, scannedPdf } from '../test/fixtures.ts'
import { enterPassword, expect, pickFile, screen, test, waitForServiceWorker } from './test.ts'
import { doneIcon, thumbnailInk } from './thumbnail.ts'

test('after the first visit, the app loads and unlocks with no connection', async ({ page, context, browserName }) => {
  test.skip(browserName === 'webkit', 'Playwright cannot reload a WebKit page while emulating offline ("internal error")')
  await page.goto('/')
  await waitForServiceWorker(page)

  await context.setOffline(true)
  await page.reload()
  await expect(screen(page, 'pick')).toBeVisible()

  await pickFile(page, 'statement.pdf', await lockedPdf({ openPassword: 'secret' }))
  await enterPassword(page, 'secret')
  await expect(screen(page, 'done')).toBeVisible()
})

test('after the first visit, page 1 still shows on the Done card with no connection', async ({ page, context, browserName }) => {
  test.skip(browserName === 'webkit', 'Playwright cannot reload a WebKit page while emulating offline ("internal error")')
  await page.goto('/')
  await waitForServiceWorker(page)

  await context.setOffline(true)
  await page.reload()
  // A scan, so pdf.js's image decoders must come from the cache too.
  await pickFile(page, 'scan.pdf', await scannedPdf({ openPassword: 'secret' }))
  await enterPassword(page, 'secret')
  await expect(screen(page, 'done')).toBeVisible()
  await expect(doneIcon(page)).toHaveClass(/\bhas-thumb\b/)
  expect(await thumbnailInk(page), 'the scan drew nothing').toBeGreaterThan(1000)
})
