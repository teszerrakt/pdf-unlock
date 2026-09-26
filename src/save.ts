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

export const doneText = (fileName: string, hadPassword: boolean) =>
  hadPassword
    ? 'This copy opens anywhere, no password needed.'
    : `${fileName} had no open password, only print or copy limits. This copy has none.`
