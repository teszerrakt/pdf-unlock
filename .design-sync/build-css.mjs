// Builds the stylesheet Claude Design ships: the app's own src/style.css, with the cat art the app
// serves from /art/ inlined as data URIs (a design project has no /art/ route). Run from the repo root.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const css = readFileSync('src/style.css', 'utf8').replace(/url\('\/art\/([\w-]+\.webp)'\)/g, (_, file) => {
  const data = readFileSync(`public/art/${file}`).toString('base64')
  return `url('data:image/webp;base64,${data}')`
})
mkdirSync('.design-sync/.cache', { recursive: true })
writeFileSync('.design-sync/.cache/sphynx.css', css)
