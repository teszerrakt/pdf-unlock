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

// `saved`: how many bytes the repack took off, out of an input `of` bytes long.
export type DoneOptions = { of?: number }

// A saving is worth a mention at 50 KB and 5% of the input; without `of`, only the 50 KB counts.
const worthSaying = (saved: number, of?: number) => saved >= 50_000 && (of === undefined || saved * 20 >= of)

export function doneText(fileName: string, hadPassword: boolean, saved = 0, { of }: DoneOptions = {}) {
  const smaller = worthSaying(saved, of) ? formatSize(saved) : null
  if (hadPassword) {
    const text = 'This copy opens anywhere, no password needed.'
    return smaller ? `${text} It’s also ${smaller} smaller.` : text
  }
  const text = `${fileName} had no open password, only print or copy limits. This copy has none`
  return smaller ? `${text}, and is ${smaller} smaller.` : `${text}.`
}
