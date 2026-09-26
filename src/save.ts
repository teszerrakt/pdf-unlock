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

export type DoneOptions = { of?: number }

// `saved`: bytes the repack took off an input `of` bytes long. It is named at 5% of `of`.
export function doneText(fileName: string, hadPassword: boolean, saved = 0, { of = 0 }: DoneOptions = {}) {
  const smaller = saved >= 50_000 && saved * 20 >= of ? formatSize(saved) : null
  if (hadPassword) return `This copy opens anywhere, no password needed.${smaller ? ` It’s also ${smaller} smaller.` : ''}`
  return `${fileName} had no open password, only print or copy limits. This copy has none${smaller ? `, and is ${smaller} smaller` : ''}.`
}
