// iPadOS reports a Mac platform; touch tells them apart.
export const isIos = (platform: string, maxTouchPoints: number) =>
  /iphone|ipad|ipod/i.test(platform) || (/mac/i.test(platform) && maxTouchPoints > 1)

export const modifierKey = (platform: string) => (/mac|iphone|ipad|ipod/i.test(platform) ? '⌘' : 'Ctrl')

export type Brand = { brand: string; version: string }

// Names the browser for the How it works sheet, from UA Client Hints when there are any, else the UA string.
export function browserName(brands: Brand[], userAgent: string) {
  const brand = brands.find((b) => !/not.?a.?brand|chromium/i.test(b.brand)) ?? brands.find((b) => /chromium/i.test(b.brand))
  if (brand) return `${brand.brand} ${brand.version}`
  const known: [RegExp, string][] = [
    [/SamsungBrowser\/(\d+)/, 'Samsung Internet'],
    [/EdgiOS\/(\d+)|Edg\/(\d+)/, 'Microsoft Edge'],
    [/CriOS\/(\d+)/, 'Chrome'],
    [/FxiOS\/(\d+)|Firefox\/(\d+)/, 'Firefox'],
    [/Chrome\/(\d+)/, 'Chrome'],
    [/Version\/(\d+[.\d]*).*Safari/, 'Safari'],
  ]
  for (const [pattern, name] of known) {
    const match = userAgent.match(pattern)
    if (match) return `${name} ${match.slice(1).find(Boolean)}`
  }
  return 'unknown browser'
}
