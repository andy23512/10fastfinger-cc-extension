import { tenFastFingersSiteConfig } from "./site-config";

function render(html: string) {
  document.body.innerHTML = `<div data-testid="word-box-words">${html}</div>`;
}

const readNextText = () => tenFastFingersSiteConfig.readNextText();

describe("10fastfingers readNextText", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("returns null when there is no word box on the page", () => {
    document.body.innerHTML = "";
    expect(readNextText()).toBeNull();
  });

  it("returns null when no character is active", () => {
    render('<span class="wb-hash-aw">to</span>');
    expect(readNextText()).toBeNull();
  });

  it("reads the whole active word before anything is typed", () => {
    render(
      '<span class="wb-hash-aw wb-hash-ac">t</span>' +
        '<span class="wb-hash-aw">o</span>' +
        '<span class="wb-hash-aw"> </span>' +
        "<span>talk</span>"
    );
    expect(readNextText()).toBe("to ");
  });

  it("reads the letters still left after a correctly typed run", () => {
    render(
      '<span class="wb-hash-aw wb-hash-t">t</span>' +
        '<span class="wb-hash-aw wb-hash-ac">o</span>' +
        '<span class="wb-hash-aw"> </span>'
    );
    expect(readNextText()).toBe("o ");
  });

  it("treats an incorrectly typed run as already consumed", () => {
    render(
      '<span class="wb-hash-aw wb-hash-e">t</span>' +
        '<span class="wb-hash-aw wb-hash-ac">o</span>' +
        '<span class="wb-hash-aw"> </span>'
    );
    expect(readNextText()).toBe("o ");
  });

  it("falls back to the trailing space once the active word is fully typed", () => {
    render(
      '<span class="wb-hash-aw wb-hash-t">to</span>' +
        '<span class="wb-hash-aw wb-hash-ac"> </span>' +
        "<span>talk</span>"
    );
    expect(readNextText()).toBe(" ");
  });

  it("stops at the boundary of the active word and ignores later words", () => {
    render(
      '<span class="wb-hash-t">to</span>' +
        '<span class="wb-hash-t"> </span>' +
        '<span class="wb-hash-aw wb-hash-ac">t</span>' +
        '<span class="wb-hash-aw">alk</span>' +
        '<span class="wb-hash-aw"> </span>' +
        "<span>into</span>"
    );
    expect(readNextText()).toBe("talk ");
  });
});
