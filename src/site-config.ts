import { SiteConfig } from "cc-extension-core";

/**
 * 10FastFingers renders the whole test as a run of `<span>`s inside
 * `[data-testid="word-box-words"]`. Only the word under the cursor carries
 * per-character markup: its class names end in `-aw` (belongs to the active
 * word), and the run under the caret additionally ends in `-ac` (active
 * character). Typed runs within that word are split into their own spans
 * ending in `-t` (correct) or `-e` (incorrect) but still carry `-aw` while
 * the word is active. Words not yet reached are untouched `<span>`s with no
 * class at all, and a finished word loses `-aw` (keeping only `-t`/`-e`).
 *
 * The class hash (`wb-<hash>-aw`) is regenerated per deploy, so matching is
 * done on the suffix rather than a fixed class name.
 */
function readNextText(): string | null {
  const container = document.querySelector('[data-testid="word-box-words"]');
  if (!container) {
    return null;
  }
  const children = [...container.children];
  const activeIndex = children.findIndex((element) =>
    [...element.classList].some((className) => className.endsWith("-ac"))
  );
  if (activeIndex === -1) {
    return null;
  }
  let text = "";
  for (let i = activeIndex; i < children.length; i++) {
    const element = children[i];
    const inActiveWord = [...element.classList].some((className) =>
      className.endsWith("-aw")
    );
    if (!inActiveWord) {
      break;
    }
    text += element.textContent;
  }
  return text || null;
}

export const tenFastFingersSiteConfig: SiteConfig = {
  id: "10fastfingers",
  siteName: "10FastFingers",
  readNextText,
};
