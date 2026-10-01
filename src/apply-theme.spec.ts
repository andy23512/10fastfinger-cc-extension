import { applyTheme } from "./apply-theme";

function render(html: string, bodyBackground = "rgb(241, 252, 255)") {
  document.body.innerHTML = html;
  document.body.style.backgroundColor = bodyBackground;
}

function cssVar(name: string) {
  return document.documentElement.style.getPropertyValue(name);
}

const CONTENT = `
  <a data-testid="LinkButton-root" modifier="primary" style="background-color: rgb(127, 86, 217);"></a>
  <div data-testid="word-box-words" style="color: rgb(16, 20, 35);"></div>
`;

describe("applyTheme", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    document.body.removeAttribute("style");
    document.documentElement.removeAttribute("style");
  });

  it("maps the site's colors onto the --cc-* variables when every source resolves", () => {
    render(CONTENT);
    applyTheme();
    expect(cssVar("--cc-frame-color")).toBe("rgb(241, 252, 255)");
    expect(cssVar("--cc-key-color")).toBe("rgb(241, 252, 255)");
    expect(cssVar("--cc-symbol-color")).toBe("rgb(16, 20, 35)");
    expect(cssVar("--cc-pointer-color")).toBe("rgb(127, 86, 217)");
  });

  it("falls back to the CSS defaults when the word box is missing", () => {
    render(
      '<a data-testid="LinkButton-root" modifier="primary" style="background-color: rgb(127, 86, 217);"></a>'
    );
    applyTheme();
    expect(cssVar("--cc-frame-color")).toBe("");
    expect(cssVar("--cc-key-color")).toBe("");
    expect(cssVar("--cc-symbol-color")).toBe("");
    expect(cssVar("--cc-pointer-color")).toBe("");
  });

  it("falls back to the CSS defaults when the primary button is missing", () => {
    render(
      '<div data-testid="word-box-words" style="color: rgb(16, 20, 35);"></div>'
    );
    applyTheme();
    expect(cssVar("--cc-pointer-color")).toBe("");
  });

  it("falls back to the CSS defaults when the body has no background color of its own", () => {
    render(CONTENT, "");
    applyTheme();
    expect(cssVar("--cc-frame-color")).toBe("");
    expect(cssVar("--cc-key-color")).toBe("");
  });

  it("falls back to the CSS defaults when the body resolves to transparent", () => {
    render(CONTENT, "transparent");
    applyTheme();
    expect(cssVar("--cc-frame-color")).toBe("");
  });

  it("clears a previously applied theme once a source stops resolving", () => {
    render(CONTENT);
    applyTheme();
    expect(cssVar("--cc-frame-color")).toBe("rgb(241, 252, 255)");

    render("", "");
    applyTheme();
    expect(cssVar("--cc-frame-color")).toBe("");
  });
});
