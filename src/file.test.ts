import { describe, expect, it } from 'vitest'
import { formatSize, isPdf, lockedName, unlockedName } from './file'

describe('isPdf', () => {
  it.each([
    ['application/pdf', 'statement'],
    ['', 'statement.pdf'],
    ['', 'STATEMENT.PDF'],
    ['application/octet-stream', 'statement.pdf'],
  ])('accepts type %j named %j', (type, name) => {
    expect(isPdf({ type, name })).toBe(true)
  })

  it.each([
    ['image/png', 'scan.png'],
    ['', 'statement.pdf.zip'],
    ['text/plain', 'notes'],
  ])('rejects type %j named %j', (type, name) => {
    expect(isPdf({ type, name })).toBe(false)
  })
})

describe('unlockedName', () => {
  it.each([
    ['statement.pdf', 'statement-unlocked.pdf'],
    ['Statement.PDF', 'Statement-unlocked.pdf'],
    ['no-extension', 'no-extension-unlocked.pdf'],
    ['report.final.pdf', 'report.final-unlocked.pdf'],
    ['e-statement 2026.pdf', 'e-statement 2026-unlocked.pdf'],
  ])('names the unlocked copy of %j %j', (name, expected) => {
    expect(unlockedName(name)).toBe(expected)
  })
})

describe('lockedName', () => {
  it.each([
    ['statement-unlocked.pdf', 'statement-locked.pdf'],
    ['x-unlocked-unlocked.pdf', 'x-unlocked-locked.pdf'],
  ])('names the locked copy of %j %j', (name, expected) => {
    expect(lockedName(name)).toBe(expected)
  })
})

describe('formatSize', () => {
  it.each([
    [0, '1 KB'],
    [400, '1 KB'],
    [1_500, '2 KB'],
    [999_499, '999 KB'],
    [1_000_000, '1.0 MB'],
    [12_345_678, '12.3 MB'],
  ])('shows %i bytes as %j', (bytes, expected) => {
    expect(formatSize(bytes)).toBe(expected)
  })
})
