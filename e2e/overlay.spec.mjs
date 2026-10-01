/**
 * Hermetic tier — "did we break it?"
 *
 * Runs against a recorded snapshot of 10fastfingers.com, so it is
 * deterministic and needs no network. It covers the parts nothing else does:
 * that the content script injects, that React renders the layout, that
 * src/apply-theme.ts falls back to src/style.css's fixed colors here (see
 * the theme test below for why that fallback, not live detection, is the
 * deterministic thing to assert against a snapshot), and that a key is
 * highlighted for the text on screen.
 *
 * When the site redesigns, this suite keeps passing against the old snapshot.
 * That is what the canary suite is for.
 */
import { expect, test } from "@playwright/test";
import {
  launchWithExtension,
  openOverlay,
  readDetectedThemeColors,
  readHighlightedKeyLabels,
  readNextTextFromPage,
  readOverlayState,
  replaySnapshot,
} from "./harness.mjs";

test.describe("overlay on a recorded 10fastfingers page", () => {
  let context;
  let page;
  let pageErrors;
  let state;

  test.beforeAll(async () => {
    ({ context } = await launchWithExtension());
    await replaySnapshot(context);
    ({ page, pageErrors } = await openOverlay(context));
    state = await readOverlayState(page);
  });

  test.afterAll(async () => {
    await context?.close();
  });

  test("renders without page errors", () => {
    expect(pageErrors).toEqual([]);
  });

  test("renders the device layout", () => {
    expect(state.svgCount).toBe(1);
    // The layout draws a label per key per layer; the exact count shifts with
    // the layout data, so assert it is populated rather than pinning a number.
    expect(state.labelCount).toBeGreaterThan(50);
  });

  test("falls back to the fixed theme colors from src/style.css", async () => {
    // 10FastFingers styles the "Test" button src/apply-theme.ts reads
    // pointer-color from through styled-components' "speedy" mode, which
    // inserts rules straight into the live CSSOM via `sheet.insertRule()`
    // rather than through a `<style>` tag's text content. `page.content()`
    // (used to record the snapshot) only serializes DOM text, so that rule
    // never makes it into the snapshot and the button's background resolves
    // as transparent here — on a real, live navigation (see
    // e2e/canary.spec.mjs) it resolves normally. `<body>`'s own background
    // (surface) is set via an inline style attribute rather than a
    // styled-components class, so it survives the snapshot fine; `symbol`
    // reads a text `color`, which — unlike backgroundColor — has an
    // inherited non-transparent default (plain black) even with no rule of
    // its own applied, so it resolves to *something*, just not
    // 10FastFingers's real text color. Either way, `pointer` alone missing
    // is enough to make the fixed fallback the only outcome a snapshot can
    // deterministically produce; live detection itself is covered by the
    // canary suite instead.
    const detected = await readDetectedThemeColors(page);
    expect(detected).toEqual({
      symbol: "rgb(0, 0, 0)",
      pointer: null,
      surface: "rgb(241, 252, 255)",
    });

    expect(state.semanticVars).toEqual({
      frame: "#d0d5dd",
      key: "#ffffff",
      symbol: "#101423",
      pointer: "#7f56d9",
    });
  });

  test("highlights exactly one key for the text on screen", async () => {
    const { text } = await readNextTextFromPage(page);
    expect(text).not.toBe("");
    expect(state.highlightCount).toBe(1);
    expect(state.highlightClass).toContain("--cc-pointer-color");
  });

  test("highlights the key that produces the next character", async () => {
    const { text } = await readNextTextFromPage(page);
    const nextChar = text[0];
    const highlightedLabels = await readHighlightedKeyLabels(page);
    // The one highlighted key must carry the character about to be typed —
    // this is the whole point of the overlay, not just that *a* key lit up.
    expect(highlightedLabels).toHaveLength(1);
    expect(
      highlightedLabels[0].map((label) => label.toLowerCase()),
      `the highlighted key should produce "${nextChar}"`,
    ).toContain(nextChar.toLowerCase());
  });
});
