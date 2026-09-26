export type Entry = { name: string; method: number; crc: number; size: number; compressedSize: number; bytes: Uint8Array }

export function readZip(zip: Uint8Array): Entry[] {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
  const u16 = (at: number) => view.getUint16(at, true)
  const u32 = (at: number) => view.getUint32(at, true)
  // The end record is the last 22 bytes, as a zip with no comment has.
  const end = zip.length - 22
  if (u32(end) !== 0x06054b50) throw new Error('no end of central directory record')
  const entries: Entry[] = []
  let at = u32(end + 16)
  for (let i = 0; i < u16(end + 10); i++) {
    if (u32(at) !== 0x02014b50) throw new Error(`no central directory header at ${at}`)
    const nameLength = u16(at + 28)
    const compressedSize = u32(at + 20)
    const local = u32(at + 42)
    if (u32(local) !== 0x04034b50) throw new Error(`no local header at ${local}`)
    const data = local + 30 + u16(local + 26) + u16(local + 28)
    entries.push({
      name: new TextDecoder().decode(zip.subarray(at + 46, at + 46 + nameLength)),
      method: u16(at + 10),
      crc: u32(at + 16),
      size: u32(at + 24),
      compressedSize,
      bytes: zip.slice(data, data + compressedSize),
    })
    at += 46 + nameLength + u16(at + 30) + u16(at + 32)
  }
  return entries
}
