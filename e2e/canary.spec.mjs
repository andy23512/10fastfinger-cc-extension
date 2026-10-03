/**
 * Canary tier — "did the site change?"
 *
 * Runs against the live 10fastfingers.com, so it needs network and is allowed
 * to be flaky. It is deliberately *not* part of `yarn e2e`: a failure here
 * usually means 10FastFingers shipped a redesign, which calls for
 * re-recording the snapshot and revisiting the adapter, not for reverting
 * whatever was just committed.
 *
 * Assertions stay coarse on purpose. The test words are generated per session,
 * so nothing about their content can be pinned — only that the selectors the
 * adapter depends on still find something, and that the overlay still comes up.
 */
import { expect, test } from "@playwright/test";
import {
  launchWithExtension,
  openOverlay,
  readNextTextFromPage,
  readOverlayState,
  themeSelectorsExist,
  THEME_SELECTORS,
  WORD_BOX_SELECTOR,
} from "./harness.mjs";

test.describe("live 10fastfingers.com", () => {
  let context;
  let page;
  let pageErrors;

  test.beforeAll(async () => {
    ({ context } = await launchWithExtension());
    ({ page, pageErrors } = await openOverlay(context));
  });

  test.afterAll(async () => {
    await context?.close();
  });

  test("still injects the overlay", async () => {
    expect(pageErrors).toEqual([]);
    const state = await readOverlayState(page);
    expect(state.svgCount).toBe(1);
    expect(state.labelCount).toBeGreaterThan(50);
  });

  test("the adapter's selectors still match the site's markup", async () => {
    const { activeWordFound, text } = await readNextTextFromPage(page);
    expect(activeWordFound, WORD_BOX_SELECTOR).toBe(true);
    expect(text.length).toBeGreaterThan(0);
  });

  test("the theme-detection selectors still match the site's markup", async () => {
    // Checks presence, not resolved color — see themeSelectorsExist's doc
    // comment in harness.mjs for why. If this starts failing, 10FastFingers
    // renamed or removed markup src/apply-theme.ts depends on, and its theme
    // detection has likely fallen back to src/style.css's fixed colors.
    const exists = await themeSelectorsExist(page);
    expect(exists.symbol, THEME_SELECTORS.symbol).toBe(true);
    expect(exists.pointer, THEME_SELECTORS.pointer).toBe(true);
    expect(exists.surface, THEME_SELECTORS.surface).toBe(true);
  });
});
