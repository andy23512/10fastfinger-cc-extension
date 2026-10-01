/**
 * Captures the live site into e2e/snapshot/ so the hermetic suite has a real,
 * deterministic page to replay.
 *
 * Re-run this when the canary suite starts failing — that is the signal the
 * site's markup moved and the snapshot has gone stale.
 *
 *   yarn e2e:record
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { SITE_URL, SNAPSHOT } from "./harness.mjs";

// Headless Chromium gets served a leaner header from 10FastFingers that
// omits the "Test" button src/apply-theme.ts reads pointer-color from (real
// users, who only ever run headed browsers, always see it) — so this must
// launch headed to capture the DOM real users get.
const browser = await chromium.launch({ headless: false });
// The header's "Test" button also only renders above the site's mobile
// breakpoint; Playwright's default viewport is narrower than that.
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
// 10FastFingers holds connections open (analytics, ads), so it never reaches
// networkidle. Wait for the typing test itself to be on the page instead.
await page.goto(SITE_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForSelector('[data-testid="word-box-words"] span', {
  timeout: 30000,
});
// src/apply-theme.ts also reads the primary "Test" button, which renders
// slightly after the word box, so wait for it too or the snapshot silently
// misses the element pointer-color detection depends on.
await page.waitForSelector(
  '[data-testid="LinkButton-root"][modifier="primary"]',
  { timeout: 30000 },
);
const html = await page.content();
await browser.close();

fs.mkdirSync(path.dirname(SNAPSHOT), { recursive: true });
fs.writeFileSync(SNAPSHOT, html);
console.log(`Recorded ${html.length} bytes of ${SITE_URL} to ${SNAPSHOT}`);
