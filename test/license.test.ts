// GitHub recognises a license only when LICENSE is the standard text and nothing else, so the art's
// exclusion lives in README.md instead.
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

// One line per paragraph: GitHub wraps it for display.
const mit = `MIT License

Copyright (c) 2026 Zaky Syihab Hatmoko

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
`

it('LICENSE is the standard MIT text, with nothing after the warranty paragraph', () => {
  expect(read('LICENSE')).toBe(mit)
})

it('README.md says under License that the code is MIT and the art and icons are all rights reserved', () => {
  const section = read('README.md').split(/^## License\n/m)[1]?.split(/^## /m)[0] ?? ''
  expect(section).toMatch(/The code is MIT/)
  for (const path of ['public/art/', 'public/*.png', 'public/favicon.ico']) expect(section).toContain(path)
  expect(section).toMatch(/all rights reserved/)
})
