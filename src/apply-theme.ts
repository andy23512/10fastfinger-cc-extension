const SYMBOL_SELECTOR = '[data-testid="word-box-words"]';
const POINTER_SELECTOR = '[data-testid="LinkButton-root"][modifier="primary"]';
const SURFACE_SELECTOR = "body";
const FRAME_GRADIENT_SELECTOR = '[data-testid="main-root"]';

const CSS_VARS = [
  "--cc-frame-color",
  "--cc-key-color",
  "--cc-symbol-color",
  "--cc-pointer-color",
] as const;

function readColor(
  selector: string,
  property: "color" | "backgroundColor"
): string | null {
  const element = document.querySelector(selector);
  if (!element) {
    return null;
  }
  const value = getComputedStyle(element)[property];
  // Real browsers always resolve a transparent background to
  // "rgba(0, 0, 0, 0)"; jsdom (used in tests) returns the literal keyword
  // instead, so both are treated as "no color here".
  return value && value !== "rgba(0, 0, 0, 0)" && value !== "transparent"
    ? value
    : null;
}

// EXPERIMENTAL: reads the color at a gradient's 0% or 100% stop instead of
// a plain background-color, for previewing --cc-frame-color /
// --cc-key-color against [data-testid="main-root"]'s gradient. If no stop
// is explicitly marked with that percent, the first (for "0%") or last
// (for "100%") stop is used, matching how gradients implicitly assign
// those.
function readGradientStopColor(
  selector: string,
  stopPercent: "0%" | "100%"
): string | null {
  const element = document.querySelector(selector);
  if (!element) {
    return null;
  }
  const backgroundImage = getComputedStyle(element).backgroundImage;
  const stops = [
    ...backgroundImage.matchAll(/(rgba?\([^)]*\))\s*(\d+(?:\.\d+)?%)?/g),
  ];
  if (stops.length === 0) {
    return null;
  }
  const fallback = stopPercent === "0%" ? stops[0] : stops[stops.length - 1];
  const explicit = stops.find((stop) => stop[2] === stopPercent);
  return (explicit ?? fallback)[1];
}

/**
 * 10FastFingers exposes no CSS custom properties for its theme (see
 * src/style.css), so its colors are read straight off the computed style of
 * a few representative elements instead: the typing text for symbol-color,
 * the primary CTA button for pointer-color, and `<body>` for both
 * frame-color and key-color (the site has no second neutral tone to tell
 * those two apart).
 *
 * `<body>`, not `[data-testid="Header-root"]`, on purpose: across
 * 10FastFingers's themes the header stays a fixed dark navy in every theme
 * except Default Light, while symbol-color (the typing text's own color)
 * stays a fixed dark near-black in every theme — reading frame/key from the
 * header paired dark-on-dark and made the overlay nearly unreadable in those
 * themes. `<body>`'s background stays a light, near-white tone across all of
 * them, which actually contrasts with the dark symbol color.
 *
 * If any one of them can't be found or resolves to transparent, the whole
 * set is discarded in favor of src/style.css's fixed defaults — a
 * half-applied theme would look broken in a way a fixed set of colors
 * doesn't.
 */
export function applyTheme(): void {
  const symbol = readColor(SYMBOL_SELECTOR, "color");
  const pointer = readColor(POINTER_SELECTOR, "backgroundColor");
  const surface = readColor(SURFACE_SELECTOR, "backgroundColor");

  const rootStyle = document.documentElement.style;
  if (!symbol || !pointer || !surface) {
    for (const cssVar of CSS_VARS) {
      rootStyle.removeProperty(cssVar);
    }
    return;
  }

  const frameColor =
    readGradientStopColor(FRAME_GRADIENT_SELECTOR, "0%") ?? surface;

  rootStyle.setProperty("--cc-frame-color", frameColor);
  rootStyle.setProperty("--cc-key-color", frameColor);
  rootStyle.setProperty("--cc-symbol-color", symbol);
  rootStyle.setProperty("--cc-pointer-color", pointer);
}

interface ThemeSourceMarker {
  selector: string;
  property: "color" | "backgroundColor";
  label: string;
  markerColor: string;
}

const THEME_SOURCE_MARKERS: ThemeSourceMarker[] = [
  {
    selector: SYMBOL_SELECTOR,
    property: "color",
    label: "--cc-symbol-color",
    markerColor: "#e91e63",
  },
  {
    selector: POINTER_SELECTOR,
    property: "backgroundColor",
    label: "--cc-pointer-color",
    markerColor: "#2196f3",
  },
  {
    selector: SURFACE_SELECTOR,
    property: "backgroundColor",
    label: "--cc-frame-color / --cc-key-color",
    markerColor: "#4caf50",
  },
];

const DEBUG_MARKER_CLASS = "cc-theme-debug-marker";

/**
 * Debug-only helper: outlines the DOM elements applyTheme() reads colors
 * from and labels each with the CSS var(s) it feeds, so the source-to-color
 * mapping can be eyeballed and re-evaluated on the live site. Not called by
 * default — wired up behind a URL query param in content_script.tsx.
 */
export function debugAnnotateThemeSources(): void {
  document
    .querySelectorAll(`.${DEBUG_MARKER_CLASS}`)
    .forEach((marker) => marker.remove());

  for (const source of THEME_SOURCE_MARKERS) {
    const element = document.querySelector(source.selector);
    if (!(element instanceof HTMLElement)) {
      continue;
    }

    element.classList.add(DEBUG_MARKER_CLASS);
    element.style.outline = `3px dashed ${source.markerColor}`;
    element.style.outlineOffset = "2px";

    const color = readColor(source.selector, source.property);
    const rect = element.getBoundingClientRect();
    const label = document.createElement("div");
    label.className = DEBUG_MARKER_CLASS;
    label.textContent = `${source.label}: ${color ?? "(not resolved)"}`;
    label.style.cssText = `
      position: fixed;
      top: ${Math.max(rect.top - 18, 0)}px;
      left: ${rect.left}px;
      background: ${source.markerColor};
      color: #fff;
      font: 11px/1.4 monospace;
      padding: 1px 4px;
      z-index: 2147483647;
      pointer-events: none;
      white-space: nowrap;
    `;
    document.body.appendChild(label);
  }
}
