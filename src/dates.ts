// Spells a typed date the other ways banks write it (see Date form in CONTEXT.md). Never corrects a
// reading and never adds anything the user did not type.

export type Form = 'DDMMYYYY' | 'DDMMYY' | 'YYYYMMDD' | 'YYMMDD' | 'MMDDYYYY' | 'MMDDYY'

// One password to try: the exact text typed, that text without the whitespace around it (`trimmed`),
// or one of its date forms.
export type Candidate = { password: string; form: Form | null; trimmed: boolean }

// Month-first last.
const forms: Form[] = ['DDMMYYYY', 'DDMMYY', 'YYYYMMDD', 'YYMMDD', 'MMDDYYYY', 'MMDDYY']

const names: Record<Form, string> = {
  DDMMYYYY: 'day-month-year',
  DDMMYY: 'day-month-year, short year',
  YYYYMMDD: 'year-month-day',
  YYMMDD: 'year-month-day, short year',
  MMDDYYYY: 'month-day-year',
  MMDDYY: 'month-day-year, short year',
}

export const formName = (form: Form) => names[form]

// The Unlocking screen's counter: `n` of `of` candidates, the exact text included.
export const tryingText = (n: number, of: number) => `Trying other ways of writing the date · ${n} of ${of}`

// `tried`: the date forms tried after the exact text.
export const wrongText = (tried: number) =>
  tried ? `Wrong password. Tried ${tried} ways of writing it as a date.` : 'Wrong password. Try again.'

type Day = { year: number; month: number; day: number }

const pad = (n: number) => String(n).padStart(2, '0')

function spell({ year, month, day }: Day, form: Form) {
  const parts = { DD: pad(day), MM: pad(month), YYYY: String(year), YY: String(year).slice(2) }
  return form.match(/YYYY|YY|MM|DD/g)!.map((part) => parts[part as keyof typeof parts]).join('')
}

// A two-digit year is the most recent year not in the future.
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
  if (date.getMonth() !== month - 1 || date.getDate() !== day || year < 1900 || date > today) return null
  return { year, month, day }
}

export function dateForms(typed: string, today: Date): Candidate[] {
  const candidates: Candidate[] = [{ password: typed, form: null, trimmed: false }]
  // Pasted text often brings a space or line break with it.
  const text = typed.trim()
  if (text && text !== typed) candidates.push({ password: text, form: null, trimmed: true })
  const digits = text.replace(/[ ./-]/g, '')
  if (!/^\d{6}(\d{2})?$/.test(digits)) return candidates
  const days = (['DMY', 'YMD', 'MDY'] as const).map((order) => read(digits, order, today)).filter((day) => day !== null)
  const seen = new Set([text])
  for (const form of forms) {
    for (const day of days) {
      const password = spell(day, form)
      if (seen.has(password)) continue
      seen.add(password)
      candidates.push({ password, form, trimmed: false })
    }
  }
  return candidates
}

export const datesTried = (candidates: Candidate[]) => candidates.filter(({ form }) => form !== null).length
