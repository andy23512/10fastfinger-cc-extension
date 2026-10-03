/**
 * Hermetic tier — "did we break it?"
 *
 * Runs against a recorded snapshot of 10fastfingers.com, so it is
 * deterministic and needs no network. It covers the parts nothing else does:
 * that the content script injects, that React renders the layout, that
 * src/apply-theme.ts live-detects the theme even from a snapshot (see the
 * theme test below for why a snapshot can deterministically reproduce that,
 * not just the fixed-fallback branch), and that a key is highlighted for the
 * text on screen.
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

  test("live-detects the theme even from a snapshot, surface included", async () => {
    // Both symbol and pointer are styled through styled-components classes
    // inserted straight into the live CSSOM via `sheet.insertRule()`
    // ("speedy" mode) rather than a `<style>` tag's text content, so
    // `page.content()` (used to record the snapshot) never captures either
    // rule; both fall back to the browser's inherited default for text color
    // (plain black) instead — a coincidental non-transparent value, not
    // 10FastFingers's real one. `<body>`'s background (surface) is set via a
    // plain inline style attribute, which IS DOM text, so it survives replay
    // faithfully. Since none of the three sources resolves to null here,
    // applyTheme() still takes the live-detection branch rather than
    // src/style.css's fixed fallback; see src/apply-theme.spec.ts for that
    // fallback branch itself, which needs sources to be missing or
    // transparent, not just semantically wrong, to trigger.
    const detected = await readDetectedThemeColors(page);
    expect(detected).toEqual({
      symbol: "rgb(0, 0, 0)",
      pointer: "rgb(0, 0, 0)",
      surface: "rgb(241, 252, 255)",
    });

    expect(state.semanticVars).toEqual({
      frame: "rgb(241, 252, 255)",
      key: "rgb(241, 252, 255)",
      symbol: "rgb(0, 0, 0)",
      pointer: "rgb(0, 0, 0)",
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
