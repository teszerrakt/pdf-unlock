// Builds fixture PDFs at test time with qpdf-wasm. Add a case with one call:
//   await lockedPdf({ openPassword: 'pässwörd' })
// Real-world files that qpdf did not make live in test/fixtures/ (see its README).
import { readFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'
import type { Restriction } from '../src/unlock'
import { qpdf } from './qpdf'

// Pages that say "Sphynx fixture". The wasm build of qpdf cannot repair a bad xref, so it is computed.
// `image` is a stream object drawn as /Im1, its data one byte per character. Every page draws the same
// content; the pages after the first are appended, so a one-page source keeps its bytes.
function source(content = 'BT /F1 24 Tf 20 60 Td (Sphynx fixture) Tj ET', image?: string, pages = 1) {
  const page = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >>${image ? ' /XObject << /Im1 6 0 R >>' : ''} >> >>`
  const first = image ? 7 : 6
  const kids = [3, ...Array.from({ length: pages - 1 }, (_, i) => first + i)]
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${kids.map((n) => `${n} 0 R`).join(' ')}] /Count ${pages} >>`,
    page,
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    ...(image ? [image] : []),
    ...kids.slice(1).map(() => page),
  ]
  let pdf = '%PDF-1.7\n'
  const offsets = objects.map((body, i) => {
    const offset = pdf.length
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`
    return offset
  })
  const xref = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  pdf += offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return new Uint8Array(Buffer.from(pdf, 'latin1'))
}

// A PDF that is not locked.
export const plainPdf = ({ pages = 1 }: { pages?: number } = {}) => source(undefined, undefined, pages)

type Lock = {
  // Omit or leave empty for a restricted PDF.
  openPassword?: string
  ownerPassword?: string
  // 40 is RC4 and needs qpdf's weak-crypto flag; 128 is AES-128; 256 is AES-256.
  bits?: 40 | 128 | 256
  // What the owner password refuses. Omit for all three on a restricted PDF, none with an open password.
  // 'high-res print' refuses only high-resolution printing.
  restrictions?: (Restriction | 'high-res print')[]
}

const refuse: Record<Restriction | 'high-res print', string> = {
  print: '--print=none',
  'high-res print': '--print=low',
  copy: '--extract=n',
  edit: '--modify=none',
}

// A locked PDF: an open password, restrictions, or both.
export async function lockedPdf(
  { openPassword = '', ownerPassword = 'owner', bits = 256, restrictions = openPassword ? [] : ['print', 'copy', 'edit'] }: Lock = {},
  pdf = plainPdf(),
  write: string[] = [],
) {
  const args = [
    ...write,
    ...(bits === 40 ? ['--allow-weak-crypto'] : []),
    '--encrypt',
    `--user-password=${openPassword}`,
    `--owner-password=${ownerPassword}`,
    `--bits=${bits}`,
    ...(bits === 128 ? ['--use-aes=y'] : []),
    ...restrictions.map((restriction) => refuse[restriction]),
    '--',
    '/in.pdf',
    '/out.pdf',
  ]
  const { code, output } = await qpdf(pdf, args)
  if (!output) throw new Error(`qpdf could not build the fixture (exit ${code}): ${args.join(' ')}`)
  return output
}

// A locked PDF with restrictions and no open password.
export const restrictedPdf = (ownerPassword = 'owner') => lockedPdf({ ownerPassword })

// Text drawing about 270 KB long, so the saving clears the 50 KB the Done text needs before it names one.
const bloatedText = () =>
  Array.from({ length: 5000 }, (_, i) => `BT /F1 8 Tf 10 ${i % 140} Td (Sphynx fixture line ${i}) Tj ET`).join('\n')

// A photo-like image stored the way PNG data is: Flate over PNG Sub-filtered rows. The filter is what
// compresses it; inflating and re-deflating without one makes it bigger.
function pngImage() {
  const width = 500
  let seed = 1
  const rows = Array.from({ length: 500 }, () => {
    const row = Buffer.alloc(width + 1)
    row[0] = 1 // Sub: each byte is the step from the pixel to its left.
    for (let x = 1; x <= width; x++) {
      seed = (seed * 1103515245 + 12345) % 2 ** 31
      row[x] = (((seed >> 16) % 3) + 255) % 256 // a step of -1, 0 or +1
    }
    return row
  })
  const data = deflateSync(Buffer.concat(rows), { level: 9 }).toString('latin1')
  const params = `/DecodeParms << /Predictor 11 /Colors 1 /BitsPerComponent 8 /Columns ${width} >>`
  return `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${rows.length} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode ${params} /Length ${data.length} >>\nstream\n${data}\nendstream`
}

const uncompressed = ['--compress-streams=n', '--decode-level=none', '--object-streams=disable']
const drawImage = 'q 280 0 0 124 10 10 cm /Im1 Do Q'

// A locked PDF written the way scanners and form exporters write one: streams left uncompressed,
// no object streams.
export const bloatedPdf = (lock: Pick<Lock, 'openPassword'> = {}) => lockedPdf(lock, source(bloatedText()), uncompressed)

// A locked PDF whose one image is PNG data.
export const pngImagePdf = (lock: Pick<Lock, 'openPassword'> = {}) => lockedPdf(lock, source(drawImage, pngImage()))

// Both at once: the repack shrinks the text and grows the image.
export const bloatedPngPdf = (lock: Pick<Lock, 'openPassword'> = {}) =>
  lockedPdf(lock, source(`${drawImage}\n${bloatedText()}`, pngImage()), uncompressed)

// Bytes that are not a PDF at all, and a PDF cut off halfway.
export const notPdf = () => new TextEncoder().encode('This is a plain text file, not a PDF.\n')
export const brokenPdf = async () => (await lockedPdf({ openPassword: 'secret' })).slice(0, 200)

// Committed real-world fixtures, made by producers other than qpdf.
export const realWorld = (name: string) => new Uint8Array(readFileSync(new URL(`fixtures/${name}`, import.meta.url)))
