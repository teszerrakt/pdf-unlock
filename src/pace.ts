// Spaces out what the page shows so quick updates do not blur. Paces the display, never the work.

// `later` returns a function that cancels its timer.
export type Clock = { now(): number; later(fn: () => void, ms: number): () => void }

export const realClock: Clock = {
  now: () => performance.now(),
  later(fn, ms) {
    const timer = setTimeout(fn, ms)
    return () => clearTimeout(timer)
  },
}

// Each update runs at least `floor` ms after the one before it, until the pacer has added `cap` ms
// of wait in all; after that, updates run as they arrive.
export function createPacer(floor: number, cap = Infinity, { now, later }: Clock = realClock) {
  const queue: (() => void)[] = []
  let last = -Infinity
  let added = 0
  // Set while an update runs or a timer is pending, so a push, even one from inside an update, only queues.
  let draining = false

  function drain() {
    draining = true
    while (queue.length) {
      const wait = Math.min(floor - (now() - last), cap - added)
      if (wait > 0) {
        added += wait
        later(drain, wait)
        return
      }
      last = now()
      const update = queue.shift()!
      try {
        update()
      } catch (error) {
        // Rethrown on its own tick so the updates queued behind it still run.
        later(() => {
          throw error
        }, 0)
      }
    }
    draining = false
  }

  return {
    push(fn: () => void) {
      queue.push(fn)
      if (!draining) drain()
    },
  }
}
