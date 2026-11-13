import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { keepInPlace } from "../../src/index.ts";

const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

let stop: (() => void) | undefined;
let page: HTMLElement;

/** A tall block that a click can remove, a button under it, and more page below. */
function build(above: number, below: number): { above: HTMLElement; below: HTMLElement; button: HTMLButtonElement } {
  page = document.createElement("div");
  const top = Object.assign(document.createElement("div"), { style: `height: ${above}px` });
  const button = document.createElement("button");
  button.textContent = "Choose";
  const bottom = Object.assign(document.createElement("div"), { style: `height: ${below}px` });
  page.append(top, button, bottom);
  document.body.append(page);
  return { above: top, below: bottom, button };
}

beforeEach(() => {
  document.body.style.margin = "0";
  stop = keepInPlace(window);
});

afterEach(() => {
  stop?.();
  page.remove();
  window.scrollTo({ top: 0, behavior: "instant" });
});

describe("keepInPlace", () => {
  it("keeps a clicked button in place when a row above it closes", async () => {
    const { above, button } = build(innerHeight * 2, innerHeight * 2);
    button.addEventListener("click", () => {
      above.style.height = `${innerHeight}px`;
    });
    window.scrollTo({ top: innerHeight * 1.5, behavior: "instant" });
    const before = button.getBoundingClientRect().top;
    button.click();
    await frame();
    await frame();
    expect(button.getBoundingClientRect().top).toBeCloseTo(before, 0);
  });

  it("keeps room at the end when the page becomes too short, and gives it back on scrolling up", async () => {
    const { above, below, button } = build(innerHeight, innerHeight * 2);
    // Left out as anchors, so that the browser would keep the block below in place.
    above.style.overflowAnchor = "none";
    button.style.overflowAnchor = "none";
    button.addEventListener("click", () => {
      below.style.height = "10px";
    });
    window.scrollTo({ top: innerHeight * 1.5, behavior: "instant" });
    const before = button.getBoundingClientRect().top;
    button.click();
    await frame();
    await frame();
    expect(button.getBoundingClientRect().top).toBeCloseTo(before, 0);
    expect(document.body.style.paddingBottom).not.toBe("");
    window.scrollTo({ top: 0, behavior: "instant" });
    await frame();
    await frame();
    expect(document.body.style.paddingBottom).toBe("");
  });

  it("turns off the browser's scroll anchoring, which moves other elements into place", async () => {
    expect(getComputedStyle(document.documentElement).overflowAnchor).toBe("none");
    expect(getComputedStyle(document.body).overflowAnchor).toBe("none");
    const { below, button } = build(innerHeight, innerHeight * 2);
    button.addEventListener("click", () =>
      below.before(Object.assign(document.createElement("div"), { style: "height: 200px" })),
    );
    window.scrollTo({ top: innerHeight - 40, behavior: "instant" });
    const before = button.getBoundingClientRect().top;
    button.click();
    await frame();
    await frame();
    expect(button.getBoundingClientRect().top).toBeCloseTo(before, 0);
    stop?.();
    stop = undefined;
    expect(document.documentElement.style.overflowAnchor).toBe("");
    expect(document.body.style.overflowAnchor).toBe("");
  });

  it("leaves a page that scrolled on purpose", async () => {
    const { above, button } = build(innerHeight * 2, innerHeight * 2);
    button.addEventListener("click", () => above.scrollIntoView({ block: "start", behavior: "instant" }));
    window.scrollTo({ top: innerHeight * 1.5, behavior: "instant" });
    button.click();
    await frame();
    await frame();
    expect(window.scrollY).toBe(0);
  });
});
