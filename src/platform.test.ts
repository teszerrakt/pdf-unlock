import { describe, expect, it } from 'vitest'
import { browserName, isIos, modifierKey } from './platform'

describe('isIos', () => {
  it.each([
    ['iPhone', 5, true],
    ['iPad', 5, true],
    ['MacIntel', 5, true], // iPadOS asks for the desktop site and reports a Mac
    ['MacIntel', 0, false],
    ['macOS', 0, false],
    ['Win32', 10, false],
    ['Linux armv8l', 5, false],
    ['Android', 5, false],
  ])('platform %j with %i touch points is iOS: %s', (platform, touchPoints, expected) => {
    expect(isIos(platform, touchPoints)).toBe(expected)
  })
})

describe('modifierKey', () => {
  it.each([
    ['MacIntel', '⌘'],
    ['macOS', '⌘'],
    ['iPad', '⌘'],
    ['Win32', 'Ctrl'],
    ['Linux x86_64', 'Ctrl'],
  ])('platform %j pastes with %j', (platform, expected) => {
    expect(modifierKey(platform)).toBe(expected)
  })
})

describe('browserName', () => {
  it('prefers the real brand from client hints over Chromium and the GREASE brand', () => {
    const brands = [
      { brand: 'Not)A;Brand', version: '99' },
      { brand: 'Chromium', version: '153' },
      { brand: 'Google Chrome', version: '153' },
    ]
    expect(browserName(brands, '')).toBe('Google Chrome 153')
  })

  it('falls back to Chromium when it is the only real brand', () => {
    expect(browserName([{ brand: 'Not_A Brand', version: '8' }, { brand: 'Chromium', version: '153' }], '')).toBe('Chromium 153')
  })

  it.each([
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Mobile/15E148 Safari/604.1', 'Safari 19.0'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/153.0 Mobile/15E148 Safari/604.1', 'Chrome 153'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/150.0 Mobile/15E148 Safari/605.1.15', 'Firefox 150'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) EdgiOS/150.0 Mobile/15E148 Safari/605.1.15', 'Microsoft Edge 150'],
    ['Mozilla/5.0 (X11; Linux x86_64; rv:150.0) Gecko/20100101 Firefox/150.0', 'Firefox 150'],
    ['Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/29.0 Chrome/140.0 Mobile Safari/537.36', 'Samsung Internet 29'],
    ['curl/8.0', 'unknown browser'],
  ])('names %j from the user agent', (userAgent, expected) => {
    expect(browserName([], userAgent)).toBe(expected)
  })
})
