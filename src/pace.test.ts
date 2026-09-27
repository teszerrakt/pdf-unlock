import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { createFrameLane, createPacer, type Frame } from './pace'

beforeEach(() => void vi.useFakeTimers())
afterEach(() => void vi.useRealTimers())

function run(pacer: ReturnType<typeof createPacer>, pushAt: number[]) {
  const start = Date.now()
  const ran: [number, number][] = []
  pushAt.forEach((at, i) => setTimeout(() => pacer.push(() => ran.push([i, Date.now() - start])), at))
  vi.runAllTimers()
  return ran
}

test('updates pushed within one step floor run a step floor apart, in push order', () => {
  expect(run(createPacer(350), [0, 5, 10])).toEqual([
    [0, 0],
    [1, 350],
    [2, 700],
  ])
})

test('an update pushed after the pacer sat idle for a second runs at once', () => {
  expect(run(createPacer(350), [0, 1000])).toEqual([
    [0, 0],
    [1, 1000],
  ])
})

test('past the cap of added wait, the rest run as they arrive', () => {
  const ran = run(createPacer(200, 2000), Array(20).fill(0))
  expect(ran.map(([i]) => i)).toEqual([...Array(20).keys()])
  expect(ran.map(([, at]) => at)).toEqual([0, 200, 400, 600, 800, 1000, 1200, 1400, 1600, 1800, 2000, ...Array(9).fill(2000)])
})

test('a floor of 0, as under reduced motion, runs every update at once', () => {
  expect(run(createPacer(0), [0, 0, 0])).toEqual([
    [0, 0],
    [1, 0],
    [2, 0],
  ])
})

// Records each named update's run time, relative to when the recorder was made.
function recorder() {
  const start = Date.now()
  const ran: [string, number][] = []
  return { ran, log: (name: string) => () => void ran.push([name, Date.now() - start]) }
}

test('an update pushed from inside a running update waits its floor and runs once', () => {
  const pacer = createPacer(350)
  const { ran, log } = recorder()
  pacer.push(() => {
    log('f')()
    pacer.push(log('g'))
  })
  vi.runAllTimers()
  expect(ran).toEqual([
    ['f', 0],
    ['g', 350],
  ])
})

test('an update pushed from inside a queued update keeps its place and its floor', () => {
  const pacer = createPacer(350)
  const { ran, log } = recorder()
  pacer.push(log('a'))
  pacer.push(() => {
    log('b')()
    pacer.push(log('d'))
  })
  pacer.push(log('c'))
  vi.runAllTimers()
  expect(ran).toEqual([
    ['a', 0],
    ['b', 350],
    ['c', 700],
    ['d', 1050],
  ])
})

test('an update that throws does not stall the ones queued behind it', () => {
  const pacer = createPacer(350)
  const { ran, log } = recorder()
  pacer.push(log('a'))
  pacer.push(() => {
    throw new Error('boom')
  })
  pacer.push(log('c'))
  expect(() => vi.runAllTimers()).toThrow('boom')
  vi.runAllTimers()
  expect(ran).toEqual([
    ['a', 0],
    ['c', 700],
  ])
})

const frame: Frame = (fn) => {
  const timer = setTimeout(fn, 16)
  return () => clearTimeout(timer)
}

test('a frame lane runs only the latest of the updates pushed within one frame, on that frame', () => {
  const lane = createFrameLane(frame)
  const { ran, log } = recorder()
  lane.push(log('a'))
  lane.push(log('b'))
  vi.advanceTimersByTime(10)
  lane.push(log('c'))
  vi.advanceTimersByTime(6)
  lane.push(log('d'))
  vi.runAllTimers()
  expect(ran).toEqual([
    ['c', 16],
    ['d', 32],
  ])
})

test('a cleared frame lane runs nothing it held', () => {
  const lane = createFrameLane(frame)
  const { ran, log } = recorder()
  lane.push(log('a'))
  lane.clear()
  vi.runAllTimers()
  expect(ran).toEqual([])
})
