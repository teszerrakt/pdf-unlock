// Builds fixture PDFs at test time with qpdf-wasm. Add a case with one call:
//   await lockedPdf({ openPassword: 'pässwörd' })
// Real-world files that qpdf did not make live in test/fixtures/ (see its README).
import { readFileSync } from 'node:fs'
import { qpdf } from './qpdf'

// One page that says "Sphynx fixture". The wasm build of qpdf cannot repair a bad xref, so it is computed.
function source(content = 'BT /F1 24 Tf 20 60 Td (Sphynx fixture) Tj ET') {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
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
  return new TextEncoder().encode(pdf)
}

// A PDF that is not locked.
export const plainPdf = () => source()

type Lock = {
  // Omit or leave empty for a restricted PDF.
  openPassword?: string
  ownerPassword?: string
  // 40 is RC4 and needs qpdf's weak-crypto flag; 128 is AES-128; 256 is AES-256.
  bits?: 40 | 128 | 256
}

// A locked PDF: an open password, restrictions, or both.
export async function lockedPdf({ openPassword = '', ownerPassword = 'owner', bits = 256 }: Lock = {}, pdf = plainPdf(), write: string[] = []) {
  const restrictions = openPassword ? [] : ['--print=none', '--extract=n', '--modify=none']
  const args = [
    ...write,
    ...(bits === 40 ? ['--allow-weak-crypto'] : []),
    '--encrypt',
    `--user-password=${openPassword}`,
    `--owner-password=${ownerPassword}`,
    `--bits=${bits}`,
    ...(bits === 128 ? ['--use-aes=y'] : []),
    ...restrictions,
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

// A locked PDF written the way scanners and form exporters write one. About 270 KB, so the saving
// clears the 50 KB the Done text needs before it names one.
export function bloatedPdf(lock: Pick<Lock, 'openPassword'> = {}) {
  const lines = Array.from({ length: 5000 }, (_, i) => `BT /F1 8 Tf 10 ${i % 140} Td (Sphynx fixture line ${i}) Tj ET`)
  return lockedPdf(lock, source(lines.join('\n')), ['--compress-streams=n', '--object-streams=disable'])
}

// Bytes that are not a PDF at all, and a PDF cut off halfway.
export const notPdf = () => new TextEncoder().encode('This is a plain text file, not a PDF.\n')
export const brokenPdf = async () => (await lockedPdf({ openPassword: 'secret' })).slice(0, 200)

// Committed real-world fixtures, made by producers other than qpdf.
export const realWorld = (name: string) => new Uint8Array(readFileSync(new URL(`fixtures/${name}`, import.meta.url)))
