// The other specs run with reduced motion. This one keeps view transitions and the busy screen's
// step ticks on, so the animated path still reaches the right screens.
import type { Page } from '@playwright/test'
import { bloatedPdf, lockedPdf, restrictedPdf } from '../test/fixtures.ts'
import { enterPassword, expect, pickFile, screen, test } from './test.ts'

test.use({ reducedMotion: 'no-preference' })

type Tick = { step: number; classes: string[]; at: number }
declare global {
  interface Window {
    holdWorker(): void
    stepLog: Tick[]
    busyShown: boolean
  }
}

// Qpdf answers these fixtures in tens of ms, well inside the patience, so the Unlocking screen would
// never show. Once `holdWorker()` is called, the worker's answers wait until it does, then reach the
// page in order, `gap` ms apart: a device slow enough to show the screen, the pacing left to the page.
async function slowWorker(page: Page, gap: number) {
  await page.addInitScript((gap) => {
    let shown = Promise.resolve()
    let show = () => {}
    let delivered = Promise.resolve()
    window.holdWorker = () => void (shown = new Promise((resolve) => (show = resolve)))
    document.addEventListener('DOMContentLoaded', () => {
      const busy = document.getElementById('busy')!
      new MutationObserver(() => busy.hidden || show()).observe(busy, { attributes: true, attributeFilter: ['hidden'] })
    })
    const Native = window.Worker
    window.Worker = class extends Native {
      get onmessage() {
        return super.onmessage
      }
      set onmessage(handler) {
        super.onmessage = (event) => {
          // One chain for every answer: one arriving after the release still waits its turn.
          const held = shown
          delivered = delivered
            .then(() => held)
            .then(() => handler?.call(this, event))
            .then(() => new Promise((resolve) => setTimeout(resolve, gap)))
        }
      }
    }
  }, gap)
}

async function recordSteps(page: Page) {
  await page.evaluate(() => {
    const log: Tick[] = (window.stepLog = [])
    const steps = [...document.querySelectorAll('#steps li')]
    // A batch of records arrives after its changes, so each one's classes are the next one's old value.
    new MutationObserver((records) => {
      const at = performance.now()
      records.forEach(({ target }, i) => {
        const next = records.slice(i + 1).find((r) => r.target === target)
        const classes = next ? (next.oldValue ?? '') : (target as Element).className
        log.push({ step: steps.indexOf(target as Element) + 1, classes: classes.split(' ').filter(Boolean), at })
      })
    }).observe(document.getElementById('steps')!, { subtree: true, attributeOldValue: true, attributeFilter: ['class'] })
  })
  return async () => {
    const log = await page.evaluate(() => window.stepLog)
    const first = (step: number, className: string) => log.findIndex((t) => t.step === step && t.classes.includes(className))
    return { log, first }
  }
}

async function watchBusy(page: Page) {
  await page.evaluate(() => {
    const busy = document.getElementById('busy')!
    window.busyShown = false
    new MutationObserver(() => {
      if (!busy.hidden) window.busyShown = true
    }).observe(busy, { attributes: true, attributeFilter: ['hidden'] })
  })
  return () => page.evaluate(() => window.busyShown)
}

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

test('restricted and unlocked arriving 5 ms apart show step 2 as active before step 3 is done', async ({ page }) => {
  await slowWorker(page, 5)
  await page.goto('/')
  const steps = await recordSteps(page)
  await page.evaluate(() => window.holdWorker())
  await pickFile(page, 'form.pdf', await restrictedPdf())
  await expect(screen(page, 'done')).toBeVisible()

  const { log, first } = await steps()
  const active2 = first(2, 'is-active')
  const done3 = first(3, 'is-done')
  expect(active2, 'step 2 was never active').toBeGreaterThanOrEqual(0)
  expect(done3, 'step 3 was done before step 2 was active').toBeGreaterThan(active2)
  expect(log[done3].at - log[active2].at, 'ms step 2 stayed active').toBeGreaterThanOrEqual(300)
})

test('a tiny locked PDF reaches Done without ever showing the Unlocking screen', async ({ page }) => {
  // A slow runner takes longer than the patience even on this file. With the page's clock stopped the
  // patience never runs out, so this checks that every answer beating it shows at once.
  await page.clock.install()
  await page.goto('/')
  await page.clock.pauseAt(Date.now() + 60_000)
  await pickFile(page, 'statement.pdf', await lockedPdf({ openPassword: 'secret' }))
  await expect(screen(page, 'unlock')).toBeVisible()
  const busyShown = await watchBusy(page)
  await enterPassword(page, 'secret')
  await expect(screen(page, 'done')).toBeVisible()
  expect(await busyShown()).toBe(false)
})

test('a bloated locked PDF ticks steps 1, 2 and 3 in order, the second at least 300 ms after the first', async ({ page }) => {
  await slowWorker(page, 0)
  await page.goto('/')
  await pickFile(page, 'scan.pdf', await bloatedPdf({ openPassword: 'secret' }))
  await expect(screen(page, 'unlock')).toBeVisible()
  const steps = await recordSteps(page)
  await page.evaluate(() => window.holdWorker())
  await enterPassword(page, 'secret')
  await expect(screen(page, 'done')).toBeVisible()

  const { log, first } = await steps()
  const ticks = [1, 2, 3].map((step) => first(step, 'is-done'))
  expect(ticks.every((i) => i >= 0), 'a step never ticked').toBe(true)
  expect([...ticks].sort((a, b) => a - b)).toEqual(ticks)
  expect(log[ticks[1]].at - log[ticks[0]].at, 'ms between the first tick and the second').toBeGreaterThanOrEqual(300)
})
