// Writes a zip with every file stored as it is (method 0): a PDF is already compressed inside, and
// storing needs no dependency. Under 4 GB in all, so no zip64.

export type ZipFile = { name: string; bytes: Uint8Array }

const table = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(bytes: Uint8Array) {
  let c = 0xffffffff
  for (const byte of bytes) c = table[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

// MS-DOS time and date, in local time as zip tools read them.
function dosTime(date: Date) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1)
  const day = ((Math.max(date.getFullYear(), 1980) - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  return { time, day }
}

export function storeZip(files: ZipFile[], date = new Date()): Uint8Array {
  const { time, day } = dosTime(date)
  const names = files.map((file) => new TextEncoder().encode(file.name))
  const local: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0
  files.forEach(({ bytes }, i) => {
    const name = names[i]
    const crc = crc32(bytes)
    // The fields a local header and a central directory header share, from "version needed" on.
    const common = (view: DataView, at: number) => {
      view.setUint16(at, 20, true) // version needed: 2.0
      view.setUint16(at + 2, 0x0800, true) // flags: the name is UTF-8
      view.setUint16(at + 4, 0, true) // method: stored
      view.setUint16(at + 6, time, true)
      view.setUint16(at + 8, day, true)
      view.setUint32(at + 10, crc, true)
      view.setUint32(at + 14, bytes.length, true) // compressed size
      view.setUint32(at + 18, bytes.length, true) // size
      view.setUint16(at + 22, name.length, true)
    }
    const header = new Uint8Array(30 + name.length)
    const h = new DataView(header.buffer)
    h.setUint32(0, 0x04034b50, true)
    common(h, 4)
    header.set(name, 30)
    local.push(header, bytes)

    const entry = new Uint8Array(46 + name.length)
    const e = new DataView(entry.buffer)
    e.setUint32(0, 0x02014b50, true)
    e.setUint16(4, 20, true) // version made by: 2.0, MS-DOS
    common(e, 6)
    e.setUint32(42, offset, true)
    entry.set(name, 46)
    central.push(entry)
    offset += header.length + bytes.length
  })
  const size = central.reduce((sum, entry) => sum + entry.length, 0)
  const end = new Uint8Array(22)
  const v = new DataView(end.buffer)
  v.setUint32(0, 0x06054b50, true)
  v.setUint16(8, files.length, true)
  v.setUint16(10, files.length, true)
  v.setUint32(12, size, true)
  v.setUint32(16, offset, true)
  const zip = new Uint8Array(offset + size + end.length)
  let at = 0
  for (const part of [...local, ...central, end]) {
    zip.set(part, at)
    at += part.length
  }
  return zip
}
