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

  it('keeps a name that is not ASCII', () => {
    expect(readZip(storeZip([{ name: 'Kontoauszug März.pdf', bytes: bytes('x') }]))[0].name).toBe('Kontoauszug März.pdf')
  })

  it('writes an empty zip for no files', () => {
    expect(readZip(storeZip([]))).toEqual([])
  })
})
