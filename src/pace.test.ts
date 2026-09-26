import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { createPacer } from './pace'

beforeEach(() => void vi.useFakeTimers())
afterEach(() => void vi.useRealTimers())

const clock = { now: () => Date.now(), later: (fn: () => void, ms: number) => setTimeout(fn, ms) }

// Pushes each update at its given time and records when each one runs.
function run(pacer: ReturnType<typeof createPacer>, pushAt: number[]) {
  const start = Date.now()
  const ran: [number, number][] = []
  pushAt.forEach((at, i) => setTimeout(() => pacer.push(() => ran.push([i, Date.now() - start])), at))
  vi.runAllTimers()
  return ran
}

test('updates pushed within one step floor run a step floor apart, in push order', () => {
  expect(run(createPacer(350, Infinity, clock), [0, 5, 10])).toEqual([
    [0, 0],
    [1, 350],
    [2, 700],
  ])
})

test('an update pushed after the pacer sat idle for a second runs at once', () => {
  const pacer = createPacer(350, Infinity, clock)
  expect(run(pacer, [0, 1000])).toEqual([
    [0, 0],
    [1, 1000],
  ])
})

test('past the cap of added wait, the rest run as they arrive', () => {
  const ran = run(createPacer(200, 2000, clock), Array(20).fill(0))
  expect(ran.map(([i]) => i)).toEqual([...Array(20).keys()])
  expect(ran.map(([, at]) => at)).toEqual([0, 200, 400, 600, 800, 1000, 1200, 1400, 1600, 1800, 2000, ...Array(9).fill(2000)])
})

test('a floor of 0, as under reduced motion, runs every update at once', () => {
  expect(run(createPacer(0, Infinity, clock), [0, 0, 0])).toEqual([
    [0, 0],
    [1, 0],
    [2, 0],
  ])
})
