# Sphynx conventions (read first)

Sphynx: PDF Unlock is a plain HTML app, not a React library. **`window.Sphynx` exports no components.** Build screens from ordinary JSX elements with `className`s from `styles.css`, which is the app's real stylesheet, so the classes below are the whole design language. Never invent class names or inline colours; use these classes and the `var(--*)` tokens.

## Frame

Every screen sits in this frame (column max 440px on mobile; at 960px and up the app widens and `.desk` / `.mob` elements swap):

```jsx
<div className="app">
  <header className="bar">
    <div className="brand"><span className="mark"><span className="art art-mark" /></span><span className="wordmark">Sphynx</span></div>
  </header>
  <main className="screens">
    <section className="screen done">…</section>
  </main>
</div>
```

Screen classes: `pick`, `unlock` (password prompt and Set-a-password), `busy` (Unlocking, and a batch's list), `done` (Unlocked, Locked, and a batch's summary), `stop` (not a PDF, nothing to unlock, failures).

## Blocks

- **Cat art**: `<div className="cat done-cat"><span className="art cat-3" /></div>`. `cat-1` asks, `cat-2` works, `cat-3` celebrates, `cat-4` is wrong/failed, `cat-5` sleeps (nothing to do).
- **Titles**: `h1.display` (serif; `<em>` turns accent), then `p.lede` or `p.sub`.
- **File card**: `div.file-card` > `span.file-icon` ("PDF" + `span.file-badge.open` or `.locked`, each holding a lock SVG) + `span.file-meta` (`span.file-name`, `span.file-info` such as "2.4 MB · No password") + optional `button.card-action.tap`.
- **Password field**: `div.password` > `label` + `div.field` (`.wrong` when rejected) > `input` + `button.reveal.tap`; below it `p.error` (with an icon SVG) or `p.hint`.
- **Steps (Unlocking)**: `ol.steps` > `li` (`.is-done` / `.is-active`) > `span.dot` (check SVG) + a `span` label; a small note under a label is `span.file-info.step-note`, placed with the label inside one wrapping `span`.
- **Batch rows**: `ol.rows` > `li[data-state=waiting|unlocking|needs-password|unlocked|not-locked|unreadable|skipped]` > `span.row-name` + `span.row-state` + optional `a.row-action` / `button.row-action`.
- **Action stack**: `div.actions` at the bottom: `button.button.primary.tap`, `a.button.secondary.tap`, `button.link.accent.tap`, `p.note`. `p.assure` (shield SVG + "Never sent anywhere.") sits above the buttons.
- **Toast**: `div.toast` > check SVG + `span`.
- Icons are inline `<svg viewBox="0 0 24 24">` with stroked paths; `styles.css` sizes them to 20px and strokes them `currentColor`.

## Tokens

`--ground` (page), `--surface`, `--raised`, `--ink`, `--muted`, `--hairline`, `--bar`, `--tint`, `--accent`, `--accent-hover`, `--danger`, `--danger-ring`, `--serif` (Instrument Serif), `--sans` (Geist Variable), `--ease`, `--spring`.

## Rules

- **At most three actions in a stack.** A secondary action goes on the object it acts on (for example `button.card-action` on the file card), never as a fourth button.
- `.rise` with a delay class (`d60`…`d400`) is an entrance animation for a new screen only. An update within the same screen changes text in place and never replays it.
- Copy uses the app's terms: open password, restrictions, locked PDF, restricted PDF, unlocked copy, own password.
