// Some browsers leave the type empty for a PDF, so the extension counts too.
export const isPdf = (file: { type: string; name: string }) => file.type === 'application/pdf' || /\.pdf$/i.test(file.name)

// The unlocked copy's file name: "statement.pdf" becomes "statement-unlocked.pdf".
export const unlockedName = (name: string) => name.replace(/(\.pdf)?$/i, '-unlocked.pdf')

export const formatSize = (bytes: number) =>
  bytes < 1e6 ? `${Math.max(1, Math.round(bytes / 1e3))} KB` : `${(bytes / 1e6).toFixed(1)} MB`
