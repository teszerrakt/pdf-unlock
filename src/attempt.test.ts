import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { createAttempt, type Clock, type Ui, type View } from './attempt'
import type { WorkerRequest, WorkerResponse } from './unlock.worker'

beforeEach(() => void vi.useFakeTimers())
afterEach(() => void vi.useRealTimers())

const clock: Clock = {
  now: () => Date.now(),
  later(fn, ms) {
    const timer = setTimeout(fn, ms)
    return () => clearTimeout(timer)
  },
}

type Call = { at: number; name: keyof Ui; args: unknown[] }

// Records what the page is told to render and what the worker is sent, each with its time.
function setup() {
  const start = Date.now()
  const calls: Call[] = []
  const ui = new Proxy({} as Ui, {
    get: (_, name) => (...args: unknown[]) => void calls.push({ at: Date.now() - start, name: name as keyof Ui, args }),
  })
  const sent: WorkerRequest['type'][] = []
  let worker = 0
  const attempt = createAttempt(ui, { start: (id) => void (worker = id), send: (request) => void sent.push(request.type), stop() {} }, {
    clock,
    today: () => new Date(2026, 8, 26, 12),
  })
  // Answers as the worker running now, `after` ms from now: a late answer once its attempt is gone.
  const answer = (response: WorkerResponse, after = 0) => {
    const from = worker
    setTimeout(() => attempt.answer(from, response), after)
  }
  const now = () => Date.now() - start
  const called = (name: keyof Ui) => calls.filter((call) => call.name === name)
  const shown = () => called('show').map(({ at, args: [view] }) => [view as View, at] as const)
  const steps = () => called('steps').map(({ at, args: [n] }) => [n as number, at] as const)
  return { attempt, answer, now, calls, called, shown, steps, sent }
}

const pdf = (name = 'statement.pdf') => new File([new Uint8Array(1000)], name, { type: 'application/pdf' })
const unlocked: WorkerResponse = { type: 'unlocked', pdf: new Uint8Array(900), hadPassword: true, password: 'secret', form: null, pages: 1, removed: [] }
const doneAt = (shown: readonly (readonly [View, number])[]) => shown.find(([view]) => view === 'done')?.[1]
const gaps = (ticks: readonly (readonly [number, number])[]) => ticks.slice(1).map(([, at], i) => at - ticks[i][1])

test('answers 10 ms apart on the Unlocking screen tick its steps at least 350 ms apart, and the last tick shows 500 ms before Done', () => {
  const { attempt, answer, shown, steps } = setup()
  attempt.open([pdf('form.pdf')])
  vi.advanceTimersByTime(300)
  expect(shown()).toEqual([['busy', 300]])
  answer({ type: 'restricted' }, 10)
  answer(unlocked, 20)
  vi.runAllTimers()

  expect(steps().map(([n]) => n)).toEqual([1, 2, 4])
  for (const gap of gaps(steps())) expect(gap).toBeGreaterThanOrEqual(350)
  expect(doneAt(shown())! - steps().at(-1)![1]).toBe(500)
})

// Reaches Done with an unlocked copy of a restricted PDF, quick enough to skip the Unlocking screen.
function toDone(harness: ReturnType<typeof setup>) {
  harness.attempt.open([pdf('form.pdf')])
  harness.answer({ type: 'restricted' })
  harness.answer(unlocked, 10)
  vi.advanceTimersByTime(20)
  expect(harness.attempt.view).toBe('done')
}

test('a lock of the unlocked copy slower than the 300 ms patience ticks the Locking steps exactly like Unlocking’s', () => {
  const harness = setup()
  const { attempt, answer, now, shown, steps, called } = harness
  toDone(harness)
  attempt.addPassword()
  const start = now()
  attempt.lock(pdf('form-unlocked.pdf'), 'hunter2')
  vi.advanceTimersByTime(300)
  answer({ type: 'locked', pdf: new Uint8Array(950) }, 10)
  vi.runAllTimers()

  expect(called('busy').at(-1)!.args).toEqual(['lock', 'form-unlocked.pdf'])
  const locking = steps().filter(([, at]) => at >= start)
  expect(locking).toEqual([
    [2, start + 300],
    [4, start + 650],
  ])
  expect(shown().filter(([, at]) => at >= start)).toEqual([
    ['relock', start],
    ['busy', start + 300],
    ['done', start + 1150],
  ])
})

// On the Unlocking screen, a date typed at the password prompt.
function toTries(harness: ReturnType<typeof setup>) {
  harness.attempt.open([pdf()])
  harness.answer({ type: 'needs-password' })
  vi.advanceTimersByTime(0)
  expect(harness.attempt.submit('05081990', false)).toBe(true)
  vi.advanceTimersByTime(300)
  expect(harness.attempt.view).toBe('busy')
}

const counts = (harness: ReturnType<typeof setup>) =>
  harness.called('trying').flatMap(({ at, args: [count] }) => (count ? [[(count as { n: number }).n, at] as const] : []))

test('20 date-form candidates and a worker that answers after the 3rd: both counts show, and Done shows within 1 s of the answer', () => {
  const harness = setup()
  toTries(harness)
  const start = harness.now()
  harness.answer({ type: 'trying', n: 2, of: 20 }, 10)
  harness.answer({ type: 'trying', n: 3, of: 20 }, 20)
  harness.answer({ ...unlocked, password: '050890', form: 'DDMMYY' }, 30)
  vi.runAllTimers()

  const shown = counts(harness)
  expect(shown.map(([n]) => n)).toEqual([2, 3])
  expect(shown.at(-1)![1] - (start + 20)).toBeLessThanOrEqual(1000)
  expect(doneAt(harness.shown())! - (start + 30)).toBeLessThanOrEqual(1000)
})

test('20 date-form candidates tried in quick succession: the counter reaches 20 of 20 within 1 s of that count arriving', () => {
  const harness = setup()
  toTries(harness)
  const start = harness.now()
  for (let n = 2; n <= 20; n++) harness.answer({ type: 'trying', n, of: 20 }, 10 * n)
  harness.answer({ type: 'wrong-password' }, 210)
  vi.runAllTimers()

  const shown = counts(harness)
  expect(shown.map(([n]) => n)).toEqual([...Array(19).keys()].map((i) => i + 2))
  expect(shown.at(-1)![1] - (start + 200)).toBeLessThanOrEqual(1000)
  for (const gap of gaps(shown.slice(0, 7))) expect(gap).toBeGreaterThanOrEqual(150)
  expect(harness.called('ask').at(-1)!.args[0]).toMatchObject({ wrong: true, tried: 7 })
})

// The cap bounds the counter; AC-1's step floor and last-tick hold still come after it.
test('20 date-form candidates tried in quick succession, then the answer: Done shows within the 1 s cap, a step floor and the hold of the answer', () => {
  const harness = setup()
  toTries(harness)
  const start = harness.now()
  for (let n = 2; n <= 20; n++) harness.answer({ type: 'trying', n, of: 20 }, 10 * n)
  harness.answer({ ...unlocked, password: '050890', form: 'DDMMYY' }, 210)
  vi.runAllTimers()

  expect(counts(harness).map(([n]) => n)).toEqual([...Array(19).keys()].map((i) => i + 2))
  expect(doneAt(harness.shown())! - (start + 210)).toBeLessThanOrEqual(1000 + 350 + 500)
})

// What the page was told after `from` ms: nothing, for an abandoned attempt's answer.
const since = (harness: ReturnType<typeof setup>, from: number) => harness.calls.filter(({ at }) => at > from)

test('an attempt abandoned with Cancel: its worker’s late answer changes nothing on screen', () => {
  const harness = setup()
  const { attempt, answer, now } = harness
  attempt.open([pdf()])
  answer({ type: 'needs-password' })
  vi.advanceTimersByTime(0)
  attempt.submit('secret', false)
  answer(unlocked, 250)
  vi.advanceTimersByTime(100)
  attempt.cancel()
  expect(attempt.view).toBe('pick')
  const cancelled = now()
  vi.runAllTimers()

  expect(since(harness, cancelled)).toEqual([])
  expect(attempt.view).toBe('pick')
})

test('an attempt abandoned with Back: its lock’s late answer changes nothing on screen', () => {
  const harness = setup()
  const { attempt, answer, now } = harness
  toDone(harness)
  attempt.addPassword()
  attempt.lock(pdf('form-unlocked.pdf'), 'hunter2')
  answer({ type: 'locked', pdf: new Uint8Array(950) }, 250)
  vi.advanceTimersByTime(100)
  attempt.back()
  expect(attempt.view).toBe('done')
  const left = now()
  vi.runAllTimers()

  expect(since(harness, left)).toEqual([])
  expect(attempt.view).toBe('done')
})

test('an attempt abandoned by picking another file: its answers, queued or late, change nothing on screen', () => {
  const harness = setup()
  const { attempt, answer, now, called } = harness
  attempt.open([pdf('form.pdf')])
  vi.advanceTimersByTime(300)
  // Both wait their turn behind the Unlocking screen's first tick.
  answer({ type: 'restricted' }, 5)
  answer(unlocked, 10)
  answer({ type: 'not-locked' }, 5000)
  vi.advanceTimersByTime(20)
  attempt.open([pdf('march.pdf')])
  answer({ type: 'needs-password' })
  vi.advanceTimersByTime(0)
  expect(attempt.view).toBe('unlock')
  const picked = now()
  vi.runAllTimers()

  expect(since(harness, picked)).toEqual([])
  expect(called('unlocked')).toEqual([])
  expect(called('ask').map(({ args: [prompt] }) => (prompt as { name: string }).name)).toEqual(['march.pdf'])
})

test('a batch whose password prompt is queued behind a row update: Skip this file never opens that prompt for the next file, and a second Skip does nothing', () => {
  const harness = setup()
  const { attempt, answer, called, sent } = harness
  attempt.open([pdf('march.pdf'), pdf('april.pdf')])
  answer({ type: 'needs-password' })
  vi.runAllTimers()
  expect(called('ask').map(({ args: [prompt] }) => prompt)).toMatchObject([{ name: 'march.pdf', wrong: false, batch: { at: 0, of: 2 } }])

  attempt.submit('nope', true)
  // The wrong password's prompt waits a row floor behind the row it changes.
  answer({ type: 'wrong-password' }, 10)
  vi.advanceTimersByTime(20)
  attempt.cancel()
  attempt.cancel()
  answer({ type: 'needs-password' }, 30)
  vi.runAllTimers()

  const asked = called('ask').map(({ args: [prompt] }) => prompt)
  expect(asked).toMatchObject([
    { name: 'march.pdf', wrong: false },
    { name: 'april.pdf', wrong: false, batch: { at: 1, of: 2 } },
  ])
  expect(called('rows').at(-1)!.args[0]).toEqual(['skipped', 'needs-password'])
  expect(sent).toEqual(['open', 'unlock', 'open'])
})

test('in a batch, a wrong password’s answer makes the password prompt ready again at once, before its prompt’s turn', () => {
  const harness = setup()
  const { attempt, answer, now, called } = harness
  attempt.open([pdf('march.pdf'), pdf('april.pdf')])
  answer({ type: 'needs-password' })
  vi.runAllTimers()
  attempt.submit('nope', true)
  const submitted = now()
  answer({ type: 'wrong-password' }, 10)
  vi.runAllTimers()

  expect(called('ready').filter(({ at }) => at > submitted).map(({ at }) => at)).toEqual([submitted + 10])
  expect(called('ask').at(-1)!.at).toBeGreaterThan(submitted + 10)
})

test('an attempt abandoned by picking another file while its counts wait their turn: none of them reach the next file’s Unlocking screen', () => {
  const harness = setup()
  const { attempt, answer, now, called } = harness
  toTries(harness)
  // Every count and the answer arrive within 20 ms, so all but the first wait in the capped lane.
  for (let n = 2; n <= 20; n++) answer({ type: 'trying', n, of: 20 }, n - 1)
  answer({ ...unlocked, password: '050890', form: 'DDMMYY' }, 20)
  vi.advanceTimersByTime(30)
  attempt.open([pdf('april.pdf')])
  vi.advanceTimersByTime(300)
  expect(attempt.view).toBe('busy')
  expect(called('busy').at(-1)!.args).toEqual(['unlock', 'april.pdf'])
  const shown = now()
  vi.runAllTimers()

  expect(since(harness, shown)).toEqual([])
  expect(called('unlocked')).toEqual([])
})
