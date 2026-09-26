import { lockedPdf } from '../test/fixtures.ts'
import { enterPassword, expect, pickFile, screen, test, waitForServiceWorker } from './test.ts'

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
