# CLAUDE.md

## What this is

An unofficial browser extension (Manifest V3, Chrome + Firefox) that overlays
the layout of CharaChorder 3D input devices (CharaChorder One, CharaChorder
Two, CCU, Master Forge) on top of
[10FastFingers](https://10fastfingers.com/), so users can learn/practice the
device layout while typing. Not affiliated with CharaChorder or
10FastFingers.

## Tech stack

- TypeScript, React 18 (content script UI + options page), Zustand, RxJS,
  Emotion, MUI, Tailwind CSS v4
- Built with Webpack 5 (separate dev/prod configs)
- Shared device/overlay logic comes from two sibling CharaChorder packages
  pulled in as npm deps: `cc-extension-core` and `tangent-cc-lib` — this repo
  is a thin site-specific adapter over that shared core, not where the
  device-layout logic itself lives
- Package manager is **yarn** (yarn.lock is authoritative; package-lock.json
  also exists but yarn is what the README and `packageManager` field specify)
- Unit tests: Jest + ts-jest + jsdom. E2E tests: Playwright

## Key commands

```
yarn                  # install
yarn build             # production build -> dist/
yarn watch             # webpack dev build in watch mode
yarn start-chrome      # run via web-ext in Chromium
yarn start-firefox     # run via web-ext in Firefox
yarn test              # jest unit tests (src/**, jsdom env)
yarn style              # prettier --write src/**/*.{ts,tsx}
yarn e2e                # Playwright, hermetic (replays recorded 10fastfingers.com snapshot)
yarn e2e:canary         # Playwright, live against real 10fastfingers.com (can be flaky)
yarn e2e:record         # re-capture the e2e snapshot when canary drifts
yarn clean              # rimraf dist
yarn pack-firefox / pack-chrome / pack-source-code   # zip artifacts for store submission
```

There is no separate lint script; `yarn style` (Prettier) is the only
formatting/lint tooling defined.

To load the built extension manually: `yarn build`, then in Chrome load
`dist/` as an unpacked extension (chrome://extensions, Developer mode, Load
unpacked); in Firefox load any file under `dist/` as a temporary add-on
(about:debugging#/runtime/this-firefox).

## Structure

- `src/background.ts` — MV3 service worker
- `src/content_script.tsx` — injected into 10fastfingers.com, renders the
  device overlay
- `src/options.tsx` — extension options page (layout import/export, device
  selection, thumb-3 toggle, key highlighting, OS keyboard layout, edit mode)
- `src/site-config.ts` — the 10FastFingers-specific adapter: reads
  10FastFingers's DOM (`[data-testid="word-box-words"]`, whose children carry
  class names ending in `-aw`/`-ac`/`-t`/`-e`) to determine the next text the
  user needs to type; this is essentially the only site-specific business
  logic in the repo and is what `src/site-config.spec.ts` unit-tests
- `src/apply-theme.ts` — reads 10FastFingers's live theme colors off the DOM
  and maps them onto the overlay's `--cc-*` variables (see Non-obvious
  gotchas below); unit-tested by `src/apply-theme.spec.ts`
- `src/tool/minify-icon-font.ts` — build-time tool (`yarn minify-icon-font`)
  for trimming the Material Symbols icon font
- `public/manifest.json` — MV3 manifest (content script only matches
  `https://10fastfingers.com/*`)
- `webpack/` — `webpack.common.js`, `webpack.dev.js`, `webpack.prod.js`
- `e2e/` — Playwright specs (`overlay.spec.mjs`, `overlay-states.spec.mjs`,
  `sync.spec.mjs`, `canary.spec.mjs`), `harness.mjs`, and a recorded DOM
  `snapshot/` used by the hermetic suite
- `dist/` — build output, loaded directly by the browser (gitignored — run
  `yarn build` before loading the extension or running e2e)

## Non-obvious gotchas

- 10FastFingers computes its theme in JS (styled-components) and exposes no
  CSS custom properties for it, unlike Monkeytype/Keybr, so `src/style.css`
  can't map `--cc-*` onto a site variable the way those two do. Instead,
  `src/apply-theme.ts` reads colors straight off a few representative
  elements with `getComputedStyle` (the typing text for symbol-color, a
  language-switcher link's text color in the footer's "Typing tests in other
  languages" section for pointer-color, `<body>` for both frame-color and
  key-color — the site has no second neutral tone to tell those two apart)
  and writes them as inline `--cc-*` styles on `<html>`, which take
  precedence over `src/style.css`'s fixed values. If even one of those
  elements is missing or resolves to transparent, detection discards the
  whole set and falls back to the fixed values — never a half-applied theme.
  `content_script.tsx` re-runs this on a 1s interval, since 10FastFingers can
  switch its theme in-page without a reload and emits no event when it does.
  frame/key deliberately read `<body>` rather than
  `[data-testid="Header-root"]`: the header stays a fixed dark navy in every
  theme except Default Light, while symbol-color (the typing text itself)
  stays a fixed dark near-black in every theme, so reading frame/key from the
  header paired dark-on-dark and made the overlay nearly unreadable in those
  themes; `<body>`'s background stays light across all of them instead.
  pointer-color has gone through two prior sources: the header's primary
  "Test" button (dropped along with the `modifier` attribute pattern it
  relied on in a 10FastFingers redesign, which silently broke live theme
  detection for every user until caught), then the header logo mark's
  `<line>` stroke (present and theme-reactive on every page, but too close in
  tone to frame/key-color in some themes — e.g. both resolve dark in Default
  Dark). The footer link text resolves to a visibly lighter color in the dark
  themes, which contrasts better against frame/key-color, at the cost of only
  taking 4 distinct values across the site's 6 themes instead of 6 (Default
  Light/Classic share one value, Default Dark/Glow share another) — if this
  selector ever goes dark or contrast regresses again, `yarn e2e:canary`'s
  theme-detection test is what catches the former.
- `e2e/overlay.spec.mjs`'s recorded snapshot treats symbol and pointer the
  same way, and surface differently. 10FastFingers styles both symbol (the
  typing text) and pointer (the footer link) through styled-components'
  "speedy" mode, which inserts CSS rules straight into the live CSSOM via
  `sheet.insertRule()` rather than into a `<style>` tag's text content;
  `page.content()` (what records the snapshot) only serializes DOM text, so
  both rules are silently absent from every recording and both fall back to
  the browser's inherited default for text color (plain black) — a
  coincidental non-transparent value, not 10FastFingers's real one. surface
  has no such problem: `<body>`'s background is a plain inline style
  attribute, which `page.content()` serializes faithfully, so it survives
  replay with its real value intact. All three still count as "resolved"
  either way, so the hermetic suite ends up exercising the live-detection
  branch, not the fixed-fallback one — see that test's comment for the full
  breakdown.
- The extension's injected root id is `10fastfingers-cc-extension-root`,
  which starts with a digit and is therefore **not a valid CSS id selector**
  (`#10fastfingers-...` throws `SyntaxError` from `querySelector`). Anywhere
  this id needs to be selected (see `e2e/harness.mjs`'s `OVERLAY_ROOT`), use
  an attribute selector (`[id="10fastfingers-cc-extension-root"]`) instead.
- `readNextText()` in `src/site-config.ts` depends on 10FastFingers's
  specific DOM markup inside `[data-testid="word-box-words"]`: only the
  active word's characters carry a class ending in `-aw`, and the one under
  the caret additionally ends in `-ac`. Typed runs within that word split off
  into their own span ending in `-t` (correct) or `-e` (incorrect) but still
  carry `-aw` while the word stays active; a finished word loses `-aw`
  entirely. The class hash itself (`wb-<hash>-aw`) is regenerated per deploy,
  so matching is done on the suffix, not a fixed class name. If
  10FastFingers changes this markup, this is the first place to check, and
  `yarn e2e:canary` / `e2e:record` exist specifically to catch/re-baseline
  that drift.
- 10FastFingers serves third-party ad scripts (Mediavine) that throw their
  own uncaught `TypeError` on page load, unrelated to this extension.
  `e2e/harness.mjs`'s `openOverlay` filters that specific source out of
  `pageErrors` so `yarn e2e:canary` doesn't fail on it every run; the
  hermetic `yarn e2e` suite never sees it because `replaySnapshot` aborts all
  script requests.
- 10FastFingers resets the test ("非アクティブのため、テストはリセットされま
  した" / "Test was reset due to inactivity") if there is too long a gap
  between keystrokes — noticed while manually probing the DOM in a browser.
  Anything that drives real keystrokes against the live site (manual testing,
  `e2e:canary`, `e2e:record`) needs to keep actions close together or expect
  a reset mid-sequence.
- Unit tests only cover `src/site-config.ts` and `src/apply-theme.ts` (the
  10FastFingers-specific adapters); there's no broader unit test coverage of
  the React UI.
- Interactive behavior (edit-mode dragging, file import/export, live typing,
  theming) is verified manually before release using a shared checklist that
  lives in the sibling `cc-extension-core` repo (`RELEASE-SMOKE.md`), not in
  this repo.
