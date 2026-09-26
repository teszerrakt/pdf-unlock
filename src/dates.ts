// Spells a typed date the other ways banks write it (see Date form in CONTEXT.md). Never corrects a
// reading and never adds anything the user did not type.

export type Form = 'DDMMYYYY' | 'DDMMYY' | 'YYYYMMDD' | 'YYMMDD' | 'MMDDYYYY' | 'MMDDYY'

// One password to try: the exact text typed (`form: null`) or one of its date forms.
export type Candidate = { password: string; form: Form | null }

// In the order they are tried, month-first last.
const names: Record<Form, string> = {
  DDMMYYYY: 'day-month-year',
  DDMMYY: 'day-month-year, short year',
  YYYYMMDD: 'year-month-day',
  YYMMDD: 'year-month-day, short year',
  MMDDYYYY: 'month-day-year',
  MMDDYY: 'month-day-year, short year',
}

export const formName = (form: Form) => names[form]

const MAX_TRIES = 20

type Day = { year: number; month: number; day: number }

const pad = (n: number) => String(n).padStart(2, '0')

function spell({ year, month, day }: Day, form: Form) {
  const parts = { DD: pad(day), MM: pad(month), YYYY: String(year), YY: String(year).slice(2) }
  return form.match(/YYYY|YY|MM|DD/g)!.map((part) => parts[part as keyof typeof parts]).join('')
}

// Reads the digits in one order. A two-digit year is the most recent year not in the future.
function read(digits: string, order: 'DMY' | 'YMD' | 'MDY', today: Date): Day | null {
  const width = digits.length - 4
  const at = { D: 0, M: 0, Y: 0 }
  let i = 0
  for (const part of order) {
    at[part as keyof typeof at] = i
    i += part === 'Y' ? width : 2
  }
  const slice = (start: number, length: number) => Number(digits.slice(start, start + length))
  const day = slice(at.D, 2)
  const month = slice(at.M, 2)
  let year = slice(at.Y, width)
  if (width === 2) {
    year += Math.floor(today.getFullYear() / 100) * 100
    if (year > today.getFullYear()) year -= 100
  }
  const date = new Date(year, month - 1, day)
  // Dropped, never corrected: day 00, month 13, 31 February, before 1900, after today.
  if (date.getMonth() !== month - 1 || date.getDate() !== day || year < 1900) return null
  const key = (d: Date) => d.getFullYear() * 10_000 + d.getMonth() * 100 + d.getDate()
  if (key(date) > key(today)) return null
  return { year, month, day }
}

// The exact text first, then, when it is a date of 6 or 8 digits, its other spellings.
export function dateForms(typed: string, today: Date): Candidate[] {
  const candidates: Candidate[] = [{ password: typed, form: null }]
  const digits = typed.replace(/[ ./-]/g, '')
  if (!/^\d{6}(\d{2})?$/.test(digits)) return candidates
  const days = (['DMY', 'YMD', 'MDY'] as const).map((order) => read(digits, order, today)).filter((day) => day !== null)
  const seen = new Set([typed])
  for (const form of Object.keys(names) as Form[]) {
    for (const day of days) {
      const password = spell(day, form)
      if (seen.has(password)) continue
      seen.add(password)
      candidates.push({ password, form })
    }
  }
  return candidates.slice(0, MAX_TRIES)
}
