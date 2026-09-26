// The other specs run with reduced motion. This one keeps view transitions and the busy screen's
// step ticks on, so the animated path still reaches the right screens.
import { lockedPdf, restrictedPdf } from '../test/fixtures.ts'
import { enterPassword, expect, pickFile, screen, test } from './test.ts'

test.use({ reducedMotion: 'no-preference' })

test('with motion on, an attempt still reaches the unlocked copy', async ({ page }) => {
  await page.goto('/')
  await pickFile(page, 'statement.pdf', await lockedPdf({ openPassword: 'secret' }))
  await expect(screen(page, 'unlock')).toBeVisible()
  await enterPassword(page, 'nope')
  await expect(page.locator('#wrong')).toBeVisible()
  await enterPassword(page, 'secret')
  await expect(screen(page, 'done')).toBeVisible()
  await expect(screen(page, 'unlock')).toBeHidden()

  await page.getByRole('button', { name: 'Unlock another' }).click()
  await expect(screen(page, 'pick')).toBeVisible()
  await pickFile(page, 'form.pdf', await restrictedPdf())
  await expect(screen(page, 'done')).toBeVisible()
})
