import { mountContentScript } from "cc-extension-core";
import "./style.css";
import { applyTheme, debugAnnotateThemeSources } from "./apply-theme";
import { tenFastFingersSiteConfig } from "./site-config";

mountContentScript(tenFastFingersSiteConfig);

// 10FastFingers can switch theme in-page without a reload (see
// src/apply-theme.ts), and emits no event when it does, so this re-reads the
// site's colors on an interval rather than once.
const THEME_POLL_INTERVAL_MS = 1000;
applyTheme();
setInterval(applyTheme, THEME_POLL_INTERVAL_MS);

// Debug aid: run `localStorage.setItem("cc-debug-theme", "1")` in the page's
// console (then reload) to outline and label the DOM elements
// apply-theme.ts reads its colors from, for visually checking whether
// they're still the right picks. Remove with localStorage.removeItem.
if (localStorage.getItem("cc-debug-theme")) {
  debugAnnotateThemeSources();
  setInterval(debugAnnotateThemeSources, THEME_POLL_INTERVAL_MS);
}
