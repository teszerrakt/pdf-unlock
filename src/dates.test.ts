import { describe, expect, it } from 'vitest'
import { dateForms, datesTried, formName, tryingText, wrongText } from './dates'

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

  const inputs = [
    ...Array.from({ length: 1_000_000 / 7 }, (_, i) => String(i * 7).padStart(6, '0')),
    ...Array.from({ length: 100_000_000 / 7919 }, (_, i) => String(i * 7919).padStart(8, '0')),
  ]

  it('given any 6 or 8 digit input, lists at most 20 passwords and no duplicates', () => {
    for (const typed of inputs) {
      const list = passwords(typed)
      expect(list.length).toBeLessThanOrEqual(20)
      expect(new Set(list).size).toBe(list.length)
    }
  })

  it('given a 6 or 8 digit input with spaces around it, lists at most 20 passwords and no duplicates', () => {
    for (const typed of inputs.filter((_, i) => i % 5 === 0).map((text) => ` ${text}\n`)) {
      const list = passwords(typed)
      expect(list.length).toBeLessThanOrEqual(20)
      expect(new Set(list).size).toBe(list.length)
    }
  })

  it('given a password with spaces around it, tries the trimmed text right after the exact text, and no date forms', () => {
    expect(dateForms(' sphynx ', today)).toEqual([
      { password: ' sphynx ', form: null, trimmed: false },
      { password: 'sphynx', form: null, trimmed: true },
    ])
  })

  it('given a date with spaces around it, tries the trimmed text second and its date forms after, 20 at most', () => {
    const list = dateForms(' 12/03/1988 ', today)
    expect(list.slice(0, 2)).toEqual([
      { password: ' 12/03/1988 ', form: null, trimmed: false },
      { password: '12/03/1988', form: null, trimmed: true },
    ])
    expect(list.slice(2)).toEqual(dateForms('12/03/1988', today).slice(1))
    expect(list.length).toBeGreaterThan(2)
    expect(list.length).toBeLessThanOrEqual(20)
  })

  it.each(['\t05081990', ' 05/08/1990\n'])('given %j, builds the date forms from the trimmed text, after it', (typed) => {
    expect(passwords(typed)).toEqual([typed, typed.trim(), ...passwords(typed.trim()).slice(1)])
    expect(passwords(typed).length).toBeGreaterThan(2)
  })

  it('trims a line break pasted with the password', () => {
    expect(passwords('\tsphynx\r\n')).toEqual(['\tsphynx\r\n', 'sphynx'])
  })

  it('tries no empty password when only spaces were typed', () => {
    expect(passwords('   ')).toEqual(['   '])
  })

  it('given a password with no spaces around it, marks no candidate trimmed', () => {
    expect(dateForms('05/08/90', today).some(({ trimmed }) => trimmed)).toBe(false)
  })
})

describe('datesTried', () => {
  it('counts the date forms, not the exact or the trimmed text', () => {
    expect(datesTried(dateForms(' sphynx ', today))).toBe(0)
    expect(datesTried(dateForms(' 050890 ', today))).toBe(7)
    expect(datesTried(dateForms('050890', today))).toBe(7)
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

describe('the copy for date forms', () => {
  it('counts the candidates on the Unlocking screen, the exact text included', () => {
    expect(tryingText(4, 8)).toBe('Trying other ways of writing the date · 4 of 8')
  })

  it('counts the date forms tried on the wrong-password line', () => {
    expect(wrongText(7)).toBe('Wrong password. Tried 7 ways of writing it as a date.')
  })

  it('keeps the plain wrong-password line when no date form was tried', () => {
    expect(wrongText(0)).toBe('Wrong password. Try again.')
  })
})
