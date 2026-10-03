import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export const EXTENSION_ROOT = path.join(here, "..");
export const DIST = path.join(EXTENSION_ROOT, "dist");
export const SITE_URL = "https://10fastfingers.com/typing-test/english";
export const SNAPSHOT = path.join(here, "snapshot", "10fastfingers.html");
// The id is `10fastfingers-cc-extension-root`, which starts with a digit and
// is therefore not a valid CSS id-selector (`#10fast...`) — an attribute
// selector sidesteps that instead.
export const OVERLAY_ROOT = '[id="10fastfingers-cc-extension-root"]';

// The adapter these E2E tests exercise lives in src/site-config.ts.
// 10FastFingers renders the test inside `[data-testid="word-box-words"]`;
// only the active word's characters carry a class ending in `-aw`, and the
// one under the caret additionally ends in `-ac`. Kept in sync with the
// adapter by hand.
export const WORD_BOX_SELECTOR = '[data-testid="word-box-words"]';

// Mirrors the selectors src/apply-theme.ts reads the site's colors from.
// Kept in sync with that file by hand.
export const THEME_SELECTORS = {
  symbol: '[data-testid="word-box-words"]',
  pointer: '[data-testid="SeoTextBlock-root"] [data-testid="Link-root"]',
  surface: "body",
};

/**
 * Launches Chromium with the built extension loaded, and does not return until
 * it has *proven the extension's code actually runs*.
 *
 * Two hard constraints, learned the slow way, and neither has a workaround:
 *
 *   1. It must be headed. Playwright's headless shell cannot run extensions at
 *      all — the service worker never starts.
 *   2. It must be Playwright's own full Chromium, at a build that matches the
 *      Playwright client driving it. A mismatched binary still launches and
 *      still reports an extension target, but its renderer silently never
 *      executes the bundle: the options page stays blank, no content script
 *      injects, and nothing is logged anywhere.
 *
 * Because of (2), checking that an extension target *exists* is not enough —
 * it exists even in the broken case. So the self-check below opens the
 * extension's own options page and waits for React to render into it. If that
 * fails, the environment is broken, not the code, and we say so loudly here
 * rather than letting every downstream assertion fail for the wrong reason.
 */
export async function launchWithExtension() {
  if (!fs.existsSync(path.join(DIST, "manifest.json"))) {
    throw new Error(
      `No build at ${DIST}. Run \`yarn build\` before the e2e suite.`,
    );
  }

  const context = await chromium.launchPersistentContext("", {
    headless: false,
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
  });

  const worker =
    context.serviceWorkers()[0] ??
    (await context
      .waitForEvent("serviceworker", { timeout: 10000 })
      .catch(() => null));

  if (!worker) {
    await context.close();
    throw new Error(
      "The extension's service worker never started. This almost always means " +
        "the browser is Playwright's headless shell, which cannot run " +
        "extensions. The suite must run headed.",
    );
  }

  const extensionId = new URL(worker.url()).host;
  await assertBundleExecutes(context, extensionId);

  return { context, extensionId };
}

/**
 * Opens the extension's options page and waits for it to render. A blank
 * options page is the tell-tale of a mismatched browser binary.
 */
async function assertBundleExecutes(context, extensionId) {
  const page = await context.newPage();
  try {
    await page.goto(`chrome-extension://${extensionId}/options.html`, {
      waitUntil: "load",
    });
    await page.waitForSelector("#root > *", { timeout: 10000 });
  } catch {
    await context.close();
    throw new Error(
      "The extension loaded but its bundle never executed (the options page " +
        "stayed blank). This is the signature of a Playwright/Chromium version " +
        "mismatch — run `npx playwright install chromium` to fetch the browser " +
        "build matching the installed @playwright/test.",
    );
  } finally {
    await page.close();
  }
}

/**
 * Serves the recorded snapshot at the real site URL, and blocks the site's own
 * scripts so the captured DOM is not torn down and rebuilt by 10FastFingers's
 * SPA.
 *
 * The URL stays genuine because that is what the manifest's
 * `content_scripts.matches` is tested against; serving from file:// or
 * localhost injects nothing. A single route handler is used on purpose:
 * Playwright runs matching routes in reverse registration order and
 * `route.continue()` goes straight to the network rather than to the next
 * handler, so splitting this across two routes silently serves the live site.
 *
 * The page is a recording rather than a hand-written fixture because a fixture
 * only encodes what we *believe* the markup is — the very assumption that keeps
 * turning out wrong.
 */
export async function replaySnapshot(context) {
  if (!fs.existsSync(SNAPSHOT)) {
    throw new Error(
      `No snapshot at ${SNAPSHOT}. Run \`yarn e2e:record\` to capture one.`,
    );
  }
  const body = fs.readFileSync(SNAPSHOT, "utf8");
  await context.route("https://10fastfingers.com/**", (route) => {
    const request = route.request();
    if (request.url() === SITE_URL || request.resourceType() === "document") {
      return route.fulfill({ status: 200, contentType: "text/html", body });
    }
    if (request.resourceType() === "script") {
      return route.abort();
    }
    return route.continue();
  });
}

/**
 * Seeds the extension's settings before the overlay reads them.
 *
 * Settings persist as flat keys in `browser.storage.local`, so writing them
 * from any extension page (here, the options page) is enough — the content
 * script reads them on load. Use this to exercise the overlay under non-default
 * settings without driving the options UI.
 */
export async function seedSettings(context, extensionId, settings) {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html`, {
    waitUntil: "load",
  });
  await page.evaluate((s) => chrome.storage.local.set(s), settings);
  await page.close();
}

/**
 * 10fastfingers.com serves third-party ad scripts (Mediavine) that throw on
 * their own during normal page load, unrelated to anything this extension
 * does. The hermetic suite never sees this — replaySnapshot aborts all
 * script requests — but openOverlay hits the live site, so it filters this
 * one known source out rather than let it fail every run.
 */
function isThirdPartyNoise(error) {
  return /scripts\.mediavine\.com/.test(error.stack ?? "");
}

/** Opens the site and waits for the overlay to finish its first render. */
export async function openOverlay(context) {
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => {
    if (!isThirdPartyNoise(error)) {
      pageErrors.push(error.message);
    }
  });
  await page.goto(SITE_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(`${OVERLAY_ROOT} svg`, { timeout: 15000 });
  return { page, pageErrors };
}

/**
 * Reads the overlay's state from the page.
 *
 * A highlighted key is the single shape styled `fill-(--cc-pointer-color)`
 * that the layout doesn't render at 0 opacity; every other such shape (one
 * per key the layout can highlight) sits hidden at 0. Matched by class
 * rather than a specific opacity value because the site config's
 * `highlightOpacity` (left at its 0.5 default here) makes that value
 * configurable.
 *
 * `semanticVars` is whatever ended up on `--cc-*` on `<html>`: either
 * src/apply-theme.ts's live detection (if it found every color it needs) or
 * src/style.css's fixed fallback. Compare against `readDetectedThemeColors`
 * to tell which one is in effect.
 */
export function readOverlayState(page) {
  return page.evaluate((overlayRoot) => {
    const root = document.querySelector(overlayRoot);
    const style = getComputedStyle(document.documentElement);
    const layoutSvg = root.querySelector("svg");
    const highlighted = [...root.querySelectorAll('[class*="fill-(--cc-pointer-color)"]:not([opacity="0"])')];
    return {
      svgCount: root.querySelectorAll("svg").length,
      labelCount: root.querySelectorAll("text").length,
      // The layout SVG identifies which layout rendered: `layout` for the 3D
      // devices, `cclite-layout` for Lite. Its viewBox height encodes the
      // thumb-3 row (a 5th row appears only when that switch is shown).
      layoutSvgClass: layoutSvg?.getAttribute("class") ?? null,
      layoutViewBox: layoutSvg?.getAttribute("viewBox") ?? null,
      highlightCount: highlighted.length,
      highlightClass: highlighted[0]?.getAttribute("class") ?? null,
      semanticVars: {
        frame: style.getPropertyValue("--cc-frame-color").trim(),
        key: style.getPropertyValue("--cc-key-color").trim(),
        symbol: style.getPropertyValue("--cc-symbol-color").trim(),
        pointer: style.getPropertyValue("--cc-pointer-color").trim(),
      },
    };
  }, OVERLAY_ROOT);
}

/**
 * What the site adapter would read from the page right now.
 *
 * Mirrors src/site-config.ts: within the word box, only the active word's
 * characters carry a class ending in `-aw`, and the one under the caret also
 * ends in `-ac`. Kept in sync with the adapter by hand.
 */
export function readNextTextFromPage(page) {
  return page.evaluate((wordBoxSelector) => {
    const container = document.querySelector(wordBoxSelector);
    const children = container ? [...container.children] : [];
    const activeIndex = children.findIndex((element) =>
      [...element.classList].some((className) => className.endsWith("-ac")),
    );
    let text = "";
    for (let i = activeIndex; i >= 0 && i < children.length; i++) {
      const element = children[i];
      const inActiveWord = [...element.classList].some((className) =>
        className.endsWith("-aw"),
      );
      if (!inActiveWord) {
        break;
      }
      text += element.textContent;
    }
    return { activeWordFound: activeIndex !== -1, text };
  }, WORD_BOX_SELECTOR);
}

/**
 * Whether each of THEME_SELECTORS still matches an element on the page.
 *
 * Deliberately checks presence only, not resolved color (see
 * readDetectedThemeColors for that) — this is what e2e/canary.spec.mjs
 * asserts on, since what it exists to catch is 10FastFingers renaming or
 * removing the markup src/apply-theme.ts depends on.
 */
export function themeSelectorsExist(page) {
  return page.evaluate(
    (selectors) =>
      Object.fromEntries(
        Object.entries(selectors).map(([key, selector]) => [
          key,
          document.querySelector(selector) !== null,
        ]),
      ),
    THEME_SELECTORS,
  );
}

/**
 * What src/apply-theme.ts would read directly off the page right now, by
 * the same selectors and rules (a color is discarded if the element is
 * missing or its resolved value is transparent). Used to confirm those
 * selectors still find real colors on the site, independently of whether the
 * overlay ends up applying them.
 */
export function readDetectedThemeColors(page) {
  return page.evaluate((selectors) => {
    function readColor(selector, property) {
      const element = document.querySelector(selector);
      if (!element) {
        return null;
      }
      const value = getComputedStyle(element)[property];
      return value && value !== "rgba(0, 0, 0, 0)" && value !== "transparent"
        ? value
        : null;
    }
    return {
      symbol: readColor(selectors.symbol, "color"),
      pointer: readColor(selectors.pointer, "color"),
      surface: readColor(selectors.surface, "backgroundColor"),
    };
  }, THEME_SELECTORS);
}

/** The number of keys the overlay is currently highlighting. */
export function readHighlightCount(page) {
  return page.evaluate(
    (overlayRoot) =>
      document.querySelectorAll(`${overlayRoot} [class*="fill-(--cc-pointer-color)"]:not([opacity="0"])`).length,
    OVERLAY_ROOT,
  );
}

/**
 * Reads the labels printed on each highlighted key.
 *
 * A key's labels are the sibling `<text>` elements inside the same `<g>` as the
 * highlight shape — the characters that key produces across layers and
 * modifiers. The character the user is about to type is one of them, which is
 * how a test can check the *right* key lit up, not merely that one did.
 */
export function readHighlightedKeyLabels(page) {
  return page.evaluate((overlayRoot) => {
    const root = document.querySelector(overlayRoot);
    return [...root.querySelectorAll('[class*="fill-(--cc-pointer-color)"]:not([opacity="0"])')].map((shape) => {
      const group = shape.closest("g");
      return group
        ? [...group.querySelectorAll("text")].map((t) => t.textContent)
        : [];
    });
  }, OVERLAY_ROOT);
}

/**
 * Renders the overlay once under the given seeded settings and returns its
 * state, cleaning up the browser afterwards. Convenience for the settings-state
 * matrix, where each case needs a fresh context so seeds do not leak.
 */
export async function renderOverlayWithSettings(settings) {
  const { context, extensionId } = await launchWithExtension();
  try {
    await seedSettings(context, extensionId, settings);
    await replaySnapshot(context);
    const { page, pageErrors } = await openOverlay(context);
    const state = await readOverlayState(page);
    return { ...state, pageErrors };
  } finally {
    await context.close();
  }
}
