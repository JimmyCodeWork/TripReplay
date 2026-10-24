import { describe, expect, it, vi } from "vitest";
import { createHistory, createStore, record, redo, replacePresent, undo } from "../src/index.ts";

describe("history", () => {
  it("undoes and redoes recorded steps", () => {
    let h = record(record(createHistory(1), 2), 3);
    h = undo(undo(h));
    expect(h.present).toBe(1);
    h = redo(h);
    expect(h).toEqual({ past: [1], present: 2, future: [3] });
  });

  it("clears redo when a new step is recorded", () => {
    const h = record(undo(record(createHistory("a"), "b")), "c");
    expect(h).toEqual({ past: ["a"], present: "c", future: [] });
  });

  it("returns the same history when there is nothing to undo or redo", () => {
    const h = createHistory(0);
    expect(undo(h)).toBe(h);
    expect(redo(h)).toBe(h);
  });

  it("drops the oldest steps beyond the limit", () => {
    let h = createHistory(0);
    for (let i = 1; i <= 5; i++) h = record(h, i, 3);
    expect(h.past).toEqual([2, 3, 4]);
  });

  it("replaces the present without adding a step", () => {
    expect(replacePresent(record(createHistory(1), 2), 9)).toEqual({ past: [1], present: 9, future: [] });
  });
});

describe("store", () => {
  it("notifies subscribers of changes until they unsubscribe", () => {
    const store = createStore(0);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.setState((n) => n + 1);
    store.setState((n) => n);
    unsubscribe();
    store.setState((n) => n + 1);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getState()).toBe(2);
  });
});
