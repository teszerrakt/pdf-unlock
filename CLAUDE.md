# CLAUDE.md

## Testing

| Command | Runs |
| --- | --- |
| `npm test` | Unit tests (Vitest): `src/*.test.ts`, `test/*.test.ts`. Seconds. |
| `npm run test:e2e` | Builds, then e2e (Playwright, Chromium and WebKit) against `vite preview` with production headers. |
| `npm run check` | Typecheck, unit and e2e: what CI runs. Run it before calling a change done. |

First run of e2e: `npx playwright install chromium webkit`.

- **Every behavior change comes with a test that fails before the change and passes after.** Work test-first (the `tdd` skill). Each acceptance criterion in the ticket maps to one test.
- Logic goes in a pure module with a unit test next to it (`src/unlock.ts`, `src/file.ts`, `src/platform.ts`, `src/save.ts`, `src/share-target.ts`). `src/main.ts` only wires the DOM; cover its wiring in `e2e/`.
- Unit tests run the real qpdf-wasm in Node; do not mock it. Build fixture PDFs in `test/fixtures.ts` (`lockedPdf({ openPassword, bits })`, `restrictedPdf()`, …). Real-world files from other producers live in `test/fixtures/`; never add a real document there.
- E2E tests import `test` from `e2e/test.ts`, never from `@playwright/test`, so the privacy guard runs.
- Name tests with the terms in `CONTEXT.md` (open password, restricted PDF, unlocked copy, …); assert on the exact UI copy.
- Never loosen the privacy guard (`e2e/test.ts`) or the header tests (`test/headers.test.ts`) to make a change pass: see `docs/adr/0001-privacy-guard-in-tests.md`.
- A PR is ready only when CI's `ci` check is green. Never merge on red.

## Agent skills

### Issue tracker

Issues live in GitHub Issues on `teszerrakt/pdf-unlock`, managed via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` + `docs/adr/` at repo root. See `docs/agents/domain.md`.
