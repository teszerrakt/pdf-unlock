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

// `password` and `form`: the open password that worked and its date form, null for the exact text.
export type DoneOptions = { of?: number; password?: string | null; form?: Form | null }

// `saved`: bytes the repack took off an input `of` bytes long. It is named at 5% of `of`.
export function doneText(fileName: string, hadPassword: boolean, saved = 0, { of = 0, password, form }: DoneOptions = {}) {
  const smaller = saved >= 50_000 && saved * 20 >= of ? formatSize(saved) : null
  const written = form ? ` Your password worked written as ${password} (${formName(form)}).` : ''
  if (hadPassword) return `This copy opens anywhere, no password needed.${smaller ? ` It’s also ${smaller} smaller.` : ''}${written}`
  return `${fileName} had no open password, only print or copy limits. This copy has none${smaller ? `, and is ${smaller} smaller` : ''}.`
}
