// Guards the privacy model (docs/adr/0001-privacy-guard-in-tests.md): both hosts must send the same
// security headers. Fix a failure by syncing the two files, never by loosening this test.
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

type Rules = Record<string, Record<string, string>>

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

// vercel.json sources use "(.*)" where Cloudflare's _headers uses "*".
function vercel(): Rules {
  const { headers } = JSON.parse(read('vercel.json')) as { headers: { source: string; headers: { key: string; value: string }[] }[] }
  return Object.fromEntries(
    headers.map(({ source, headers }) => [
      source.replaceAll('(.*)', '*'),
      Object.fromEntries(headers.map(({ key, value }) => [key, value])),
    ]),
  )
}

// A path at the start of a line, then indented "Name: value" lines.
function cloudflare(): Rules {
  const rules: Rules = {}
  let path = ''
  for (const line of read('public/_headers').split('\n')) {
    if (!line.trim() || line.startsWith('#')) continue
    if (!/^\s/.test(line)) rules[(path = line.trim())] = {}
    else {
      const [key, ...value] = line.trim().split(':')
      rules[path]![key!] = value.join(':').trim()
    }
  }
  return rules
}

it('sends the same headers from vercel.json and public/_headers', () => {
  expect(cloudflare()).toEqual(vercel())
})

it('keeps connect-src to the app itself, so nothing can be sent to another origin', () => {
  const csp = vercel()['/*']!['Content-Security-Policy']!
  const directives = Object.fromEntries(csp.split(';').map((d) => d.trim().split(/\s+/)).map(([name, ...values]) => [name, values]))
  expect(directives['default-src']).toEqual(["'none'"])
  expect(directives['connect-src']).toEqual(["'self'"])
  expect(directives['form-action']).toEqual(["'none'"])
  for (const values of Object.values(directives)) {
    for (const value of values) expect(value, 'no third-party origins or wildcards').not.toMatch(/^(https?:|\*|data:|blob:)/)
  }
})
