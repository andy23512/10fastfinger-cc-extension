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

// Launched headed to capture the DOM real users get, matching the rest of
// this suite (see src/apply-theme.ts's doc comment for the header element
// this used to depend on that only rendered headed; headed is kept as the
// safer default for capturing what real users see).
const browser = await chromium.launch({ headless: false });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
// 10FastFingers holds connections open (analytics, ads), so it never reaches
// networkidle. Wait for the typing test itself to be on the page instead.
await page.goto(SITE_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForSelector('[data-testid="word-box-words"] span', {
  timeout: 30000,
});
// src/apply-theme.ts also reads the footer's language-switcher link, so wait
// for it too or the snapshot silently misses the element pointer-color
// detection depends on. It lives in a footer section near the bottom of the
// page, so this also ensures the page has fully rendered that far down.
await page.waitForSelector(
  '[data-testid="SeoTextBlock-root"] [data-testid="Link-root"]',
  { timeout: 30000 }
);
const html = await page.content();
await browser.close();

fs.mkdirSync(path.dirname(SNAPSHOT), { recursive: true });
fs.writeFileSync(SNAPSHOT, html);
console.log(`Recorded ${html.length} bytes of ${SITE_URL} to ${SNAPSHOT}`);
