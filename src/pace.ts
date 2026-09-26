// Spaces out what the page shows so quick updates do not blur. Paces the display, never the work.

type Clock = { now(): number; later(fn: () => void, ms: number): unknown }

const realClock: Clock = { now: () => performance.now(), later: (fn, ms) => setTimeout(fn, ms) }

// Each update runs at least `floor` ms after the one before it, until the pacer has added `cap` ms
// of wait in all; after that, updates run as they arrive.
export function createPacer(floor: number, cap = Infinity, { now, later }: Clock = realClock) {
  const queue: (() => void)[] = []
  let last = -Infinity
  let added = 0
  let waiting = false

  function runNext() {
    last = now()
    queue.shift()!()
  }

  function drain() {
    while (queue.length) {
      const wait = Math.min(floor - (now() - last), cap - added)
      if (wait > 0) {
        added += wait
        waiting = true
        later(() => {
          waiting = false
          runNext()
          drain()
        }, wait)
        return
      }
      runNext()
    }
  }

  return {
    push(fn: () => void) {
      queue.push(fn)
      if (!waiting) drain()
    },
  }
}
