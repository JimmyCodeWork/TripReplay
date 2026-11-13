/** What was clicked or changed, and where it was on the screen just before. */
interface Held {
  readonly target: Element;
  readonly top: number;
  readonly scrollY: number;
}

/**
 * Keeps what the user clicks or changes where it was on the screen. Choosing something often opens
 * or closes a row above it, or shortens the page below it (a stop's actions, a day of the
 * itinerary, the fields of a part of the timeline), which would otherwise make the page jump under
 * the finger. After the page has been updated and before it is painted, the page is scrolled by
 * as much as the chosen element moved. When the page has become too short for that, room is kept
 * at its end, and given back as the user scrolls up.
 *
 * Only the page's own scrolling is kept: dialogs and other areas that scroll on their own are left
 * alone, and so is a page that scrolled on purpose, for example to bring something into view.
 * Returns a function that stops keeping things in place.
 */
export function keepInPlace(win: Window = window): () => void {
  const doc = win.document;
  const root = doc.documentElement;
  let held: Held | undefined;
  let frame = 0;
  /** Room kept at the end of the page, in pixels. */
  let reserved = 0;

  const scrollsInside = (element: Element) => {
    for (let node = element.parentElement; node && node !== doc.body && node !== root; node = node.parentElement) {
      const { overflowY } = win.getComputedStyle(node);
      if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight) return true;
    }
    return false;
  };

  /**
   * Keeps the page at least `height` tall, with room at its end; 0 gives the room back. The room is
   * changed in one step, never removed first, which would let the browser pull the page up.
   */
  const reserve = (height: number) => {
    const extra = Math.max(0, Math.ceil(height - (root.scrollHeight - reserved)));
    if (extra === reserved) return;
    reserved = extra;
    doc.body.style.paddingBottom = extra > 0 ? `${extra}px` : "";
  };

  const before = (event: Event) => {
    const target = event.target;
    held = undefined;
    if (!(target instanceof Element) || target.closest("dialog") || scrollsInside(target)) return;
    held = { target, top: target.getBoundingClientRect().top, scrollY: win.scrollY };
  };

  const after = () => {
    const kept = held;
    held = undefined;
    if (!kept) return;
    win.cancelAnimationFrame(frame);
    frame = win.requestAnimationFrame(() => {
      if (!kept.target.isConnected) return;
      const end = root.scrollHeight - win.innerHeight;
      // The page scrolled by itself: on purpose, unless only because it became shorter.
      const shortened = win.scrollY < kept.scrollY && win.scrollY >= end - 1;
      if (win.scrollY !== kept.scrollY && !shortened) return;
      const wanted = Math.max(0, win.scrollY + kept.target.getBoundingClientRect().top - kept.top);
      if (Math.abs(wanted - win.scrollY) < 1) return;
      reserve(wanted + win.innerHeight);
      win.scrollTo({ top: wanted, behavior: "instant" });
    });
  };

  // The room kept at the end shrinks back as the user scrolls up, never below the page itself.
  let settling = 0;
  const settle = () => {
    if (reserved === 0 || settling) return;
    settling = win.requestAnimationFrame(() => {
      settling = 0;
      reserve(win.scrollY + win.innerHeight);
    });
  };

  const options = { capture: true } as const;
  doc.addEventListener("click", before, options);
  doc.addEventListener("change", before, options);
  win.addEventListener("click", after);
  win.addEventListener("change", after);
  win.addEventListener("scroll", settle, { passive: true });
  win.addEventListener("resize", settle);
  return () => {
    doc.removeEventListener("click", before, options);
    doc.removeEventListener("change", before, options);
    win.removeEventListener("click", after);
    win.removeEventListener("change", after);
    win.removeEventListener("scroll", settle);
    win.removeEventListener("resize", settle);
    win.cancelAnimationFrame(frame);
    win.cancelAnimationFrame(settling);
    reserve(0);
  };
}
