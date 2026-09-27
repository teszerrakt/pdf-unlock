import { formName, type Form } from './dates'
import { formatSize } from './file'
import type { Restriction } from './unlock'

// How the done screen offers the unlocked copy.
export type SaveChoice = {
  share: boolean
  download: boolean
  shareLabel: 'Save or share' | 'Share'
  primary: 'share' | 'download'
}

export function saveChoice(canShare: boolean, ios: boolean): SaveChoice {
  // iOS opens a downloaded PDF in a viewer instead of saving it; its share sheet has Save to Files.
  const shareOnly = canShare && ios
  return {
    share: canShare,
    download: !shareOnly,
    shareLabel: shareOnly ? 'Save or share' : 'Share',
    primary: canShare ? 'share' : 'download',
  }
}

// How a batch's end screen offers its `count` unlocked copies at once.
export function saveAllChoice(count: number, canShare: boolean, ios: boolean) {
  const { share, download, shareLabel, primary } = saveChoice(canShare, ios)
  return { share: !!count && share, download: !!count && download, shareLabel: `${shareLabel} all` as const, primary }
}

export type DoneOptions = { of?: number; password?: string | null; form?: Form | null; removed?: Restriction[] }

// "print", "print and copy", "print, copy and edit".
const list = (words: string[]) => words.slice(0, -1).join(', ') + (words.length > 1 ? ' and ' : '') + words.at(-1)

const doing: Record<Restriction, string> = { print: 'printing', copy: 'copying', edit: 'editing' }

const doneLedes = {
  locked: 'Opens only with the password you set. Printing and copying stay allowed.',
  'lock-failed': 'The password couldn’t be added on this device. Your unlocked copy is still here.',
}

// `saved`: bytes the repack took off an input `of` bytes long. It is named at 5% of `of`.
// `removed`: the restrictions the locked PDF had, in the order Sphynx names them.
export function doneText(copy: keyof typeof doneLedes): string
export function doneText(fileName: string, hadPassword: boolean, saved?: number, options?: DoneOptions): string
export function doneText(fileName: string, hadPassword?: boolean, saved = 0, { of = 0, password, form, removed = [] }: DoneOptions = {}) {
  if (hadPassword === undefined) return doneLedes[fileName as keyof typeof doneLedes]
  const smaller = saved >= 50_000 && saved * 20 >= of ? formatSize(saved) : null
  const written = form ? ` Your password worked written as ${password} (${formName(form)}).` : ''
  if (hadPassword) {
    const gone = removed.length ? ` The ${list(removed)} ${removed.length > 1 ? 'limits are' : 'limit is'} gone too.` : ''
    return `This copy opens anywhere, no password needed.${gone}${smaller ? ` It’s also ${smaller} smaller.` : ''}${written}`
  }
  const limits = removed.length ? `limits on ${list(removed.map((restriction) => doing[restriction]))}` : 'restrictions'
  return `${fileName} had no open password, only ${limits}. This copy has none${smaller ? `, and is ${smaller} smaller` : ''}.`
}

// `storeZip` throws a RangeError past what one zip holds.
export function zipFailed(error: unknown): { text: string; ms: number } | null {
  return error instanceof RangeError ? { text: 'Too big for one zip. Save them one by one.', ms: 4000 } : null
}
