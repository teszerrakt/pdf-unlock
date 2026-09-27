import { formName, type Form } from './dates'
import { formatSize } from './file'

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

export type DoneOptions = { of?: number; password?: string | null; form?: Form | null }

const doneLedes = {
  locked: 'Opens only with the password you set. Printing and copying stay allowed.',
  'lock-failed': 'The password couldn’t be added on this device. Your unlocked copy is still here.',
}

// The Done lede for a locked copy, for an unlocked copy whose lock failed, or for an unlocked copy.
// `saved`: bytes the repack took off an input `of` bytes long. It is named at 5% of `of`.
export function doneText(copy: keyof typeof doneLedes): string
export function doneText(fileName: string, hadPassword: boolean, saved?: number, options?: DoneOptions): string
export function doneText(fileName: string, hadPassword?: boolean, saved = 0, { of = 0, password, form }: DoneOptions = {}) {
  if (hadPassword === undefined) return doneLedes[fileName as keyof typeof doneLedes]
  const smaller = saved >= 50_000 && saved * 20 >= of ? formatSize(saved) : null
  const written = form ? ` Your password worked written as ${password} (${formName(form)}).` : ''
  if (hadPassword) return `This copy opens anywhere, no password needed.${smaller ? ` It’s also ${smaller} smaller.` : ''}${written}`
  return `${fileName} had no open password, only print or copy limits. This copy has none${smaller ? `, and is ${smaller} smaller` : ''}.`
}

export type Toast = { text: string; ms: number }

// What Save all says when its zip cannot be made: `storeZip` throws a RangeError past what one zip holds.
export function zipFailed(error: unknown): Toast | null {
  return error instanceof RangeError ? { text: 'Too big for one zip. Save them one by one.', ms: 4000 } : null
}
