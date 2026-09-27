// Some browsers leave the type empty for a PDF, so the extension counts too.
export const isPdf = (file: { type: string; name: string }) => file.type === 'application/pdf' || /\.pdf$/i.test(file.name)

// The unlocked copy's file name: "statement.pdf" becomes "statement-unlocked.pdf".
export const unlockedName = (name: string) => name.replace(/(\.pdf)?$/i, '-unlocked.pdf')

// The locked copy's file name: "statement-unlocked.pdf" becomes "statement-locked.pdf".
export const lockedName = (unlockedName: string) => unlockedName.replace(/-unlocked\.pdf$/, '-locked.pdf')

// Copies saved together (a zip, a share sheet) would overwrite each other, so a repeat is numbered.
export function uniqueNames(names: string[]) {
  const seen = new Set<string>()
  return names.map((name) => {
    let unique = name
    for (let n = 2; seen.has(unique); n++) unique = name.replace(/(\.[^.]*)?$/, ` (${n})$1`)
    seen.add(unique)
    return unique
  })
}

export const formatSize = (bytes: number) =>
  bytes < 1e6 ? `${Math.max(1, Math.round(bytes / 1e3))} KB` : `${(bytes / 1e6).toFixed(1)} MB`

// The line under a copy's name on Done.
export const cardLine = (size: number, pages: number | null, locked = false) =>
  [formatSize(size), pages === null ? '' : `${pages} ${pages === 1 ? 'page' : 'pages'}`, locked ? 'Your password' : '']
    .filter(Boolean)
    .join(' · ')
