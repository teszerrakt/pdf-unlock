import { crc32 } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { readZip } from '../test/unzip'
import { storeZip } from './zip'

const bytes = (text: string) => new TextEncoder().encode(text)

describe('storeZip', () => {
  it('writes two entries stored as they are, with their names, sizes and CRC-32', () => {
    const files = [
      { name: 'march-unlocked.pdf', bytes: bytes('%PDF-1.7 march') },
      { name: 'april-unlocked.pdf', bytes: new Uint8Array(70_000).map((_, i) => i * 7) },
    ]
    const entries = readZip(storeZip(files))
    expect(entries.map(({ name, method, size, compressedSize, crc }) => ({ name, method, size, compressedSize, crc }))).toEqual(
      files.map(({ name, bytes }) => ({ name, method: 0, size: bytes.length, compressedSize: bytes.length, crc: crc32(bytes) })),
    )
    expect(entries.map((entry) => entry.bytes)).toEqual(files.map((file) => file.bytes))
  })

  it('refuses more entries than a zip without zip64 can count', () => {
    const files = Array.from({ length: 65536 }, () => ({ name: '', bytes: new Uint8Array(0) }))
    expect(() => storeZip(files)).toThrow(RangeError)
  })

  it('refuses files that would push an offset or size past 4 GB, before reading any of them', () => {
    // Only the lengths are read before the check, so no 4 GB is allocated.
    const huge = { name: 'scan.pdf', bytes: { length: 2 ** 31 } as Uint8Array }
    expect(() => storeZip([huge, huge])).toThrow(RangeError)
  })

  it('keeps a name that is not ASCII', () => {
    expect(readZip(storeZip([{ name: 'Kontoauszug März.pdf', bytes: bytes('x') }]))[0].name).toBe('Kontoauszug März.pdf')
  })
})
