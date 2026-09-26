import { describe, expect, it } from 'vitest'
import { dateForms, formName } from './dates'

const today = new Date(2026, 8, 26)
const passwords = (typed: string) => dateForms(typed, today).map(({ password }) => password)

describe('dateForms', () => {
  it.each([
    ['050890', ['050890', '05081990', '08051990', '080590', '19900805', '19900508', '900805', '900508']],
    ['19900805', ['19900805', '05081990', '050890', '900805', '08051990', '080590']],
    ['310290', ['310290']],
    ['05/08/90', ['05/08/90', '05081990', '08051990', '050890', '080590', '19900805', '19900508', '900805', '900508']],
    ['hunter2', ['hunter2']],
    ['27012027', ['27012027']],
    ['260926', ['260926', '26092026', '20260926', '09262026', '092626']],
  ])('given %s, lists the exact text then its date forms in order', (typed, expected) => {
    expect(passwords(typed)).toEqual(expected)
  })

  it('given any 6 or 8 digit input, lists at most 20 passwords and no duplicates', () => {
    const inputs = [
      ...Array.from({ length: 1_000_000 / 7 }, (_, i) => String(i * 7).padStart(6, '0')),
      ...Array.from({ length: 100_000_000 / 7919 }, (_, i) => String(i * 7919).padStart(8, '0')),
    ]
    for (const typed of inputs) {
      const list = passwords(typed)
      expect(list.length).toBeLessThanOrEqual(20)
      expect(new Set(list).size).toBe(list.length)
    }
  })
})

describe('formName', () => {
  it.each([
    ['DDMMYYYY', 'day-month-year'],
    ['DDMMYY', 'day-month-year, short year'],
    ['YYYYMMDD', 'year-month-day'],
    ['YYMMDD', 'year-month-day, short year'],
    ['MMDDYYYY', 'month-day-year'],
    ['MMDDYY', 'month-day-year, short year'],
  ] as const)('names %s %s', (form, name) => {
    expect(formName(form)).toBe(name)
  })
})
