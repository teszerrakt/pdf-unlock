import { describe, expect, it } from 'vitest'
import { isLeftover } from './share-target'

describe('isLeftover', () => {
  const now = 1_800_000_000_000

  it('keeps a file parked in the last minute: another window may be mid-share', () => {
    expect(isLeftover(String(now - 59_000), now)).toBe(false)
    expect(isLeftover(String(now - 60_000), now)).toBe(false)
  })

  it('sweeps a file parked over a minute ago', () => {
    expect(isLeftover(String(now - 60_001), now)).toBe(true)
  })

  it('sweeps a file with no parked time', () => {
    expect(isLeftover(null, now)).toBe(true)
  })
})
