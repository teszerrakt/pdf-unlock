# design-sync notes (Sphynx)

- **Tokens-only on purpose.** Sphynx is plain HTML + `src/style.css`, no React components. `.design-sync/entry.mjs` is an empty entry so the converter emits a stylesheet-only design system; `.design-sync/conventions.md` (the README header) teaches the design agent the class vocabulary instead of components.
- **Build the CSS first.** `buildCmd` (`node .design-sync/build-css.mjs`) writes `.design-sync/.cache/sphynx.css`: `src/style.css` with the `/art/*.webp` cat art inlined as data URIs, since a design project has no `/art/` route. `cssEntry` points at that file.
- **Fonts** come from the same `@fontsource` CSS files `src/main.ts` imports, via `extraFonts`.
- **React and Playwright live only in `.ds-sync/node_modules`** (the app has neither React nor a root `playwright` package). Pass `--node-modules ./.ds-sync/node_modules --entry ./.design-sync/entry.mjs`. Install there: `npm i esbuild ts-morph @types/react react@19 react-dom@19` and `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm i playwright@<repo's @playwright/test version>` so it reuses the cached Chromium.
- **No render check covers the styling** (0 components). Check it by hand: `.design-sync/check.html` renders a Done screen from `../ds-bundle/styles.css`; open it or screenshot it with Playwright from `.ds-sync/`. Fonts, art, file card and action stack were confirmed on 2026-09-26.
- `[DTS_REACT]` in the build log is expected: there are no components to type.
- The generated README body says "React library … 0 components". The conventions header above it corrects that for the design agent.

## Re-sync risks

- `conventions.md` names classes by hand. Any class rename in `src/style.css` makes it wrong without warning: re-grep every named class and token against `ds-bundle/_ds_bundle.css` on each sync.
- New art in `public/art/` is only inlined if `src/style.css` references it as `url('/art/<name>.webp')`.
- Upload is 23 files, about 1.9 MB, with no components, so a re-sync is one driver run and one small upload.
- `.batch`, `.batch-done` and `.step-label` appear in `index.html` but have no CSS, so the header deliberately omits them.
