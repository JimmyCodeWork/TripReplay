import { describe, expect, it, vi } from "vitest";
import { AUTOSAVE_DELAY_MS, createEditor, type Editor } from "../src/index.ts";
import { ManualScheduler, MemoryRepository, sampleProject, settle, stop } from "./fakes.ts";

function setup(historyLimit?: number) {
  const repository = new MemoryRepository();
  const scheduler = new ManualScheduler();
  const editor = createEditor({
    project: sampleProject(),
    repository,
    scheduler,
    ...(historyLimit === undefined ? {} : { historyLimit }),
  });
  return { repository, scheduler, editor };
}

const rename = (editor: Editor, title: string) => editor.dispatch({ type: "renameTrip", title });

describe("editing", () => {
  it("applies commands as undoable steps", () => {
    const { editor } = setup();
    rename(editor, "One");
    rename(editor, "Two");
    expect(editor.getState()).toMatchObject({ canUndo: true, canRedo: false });
    editor.undo();
    expect(editor.getState().project.trip.title).toBe("One");
    editor.redo();
    expect(editor.getState().project.trip.title).toBe("Two");
    editor.undo();
    editor.undo();
    expect(editor.getState()).toMatchObject({ canUndo: false, canRedo: true });
    expect(editor.getState().project.trip.title).toBe("Kyoto");
  });

  it("reports invalid commands without changing the project or the history", () => {
    const { editor } = setup();
    const before = editor.getState();
    const result = editor.dispatch({ type: "addStop", stop: { ...stop("x"), name: " " } });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error.code).toBe("invalidArgument");
    expect(editor.getState()).toBe(before);
  });

  it("notifies subscribers once per change", () => {
    const { editor } = setup();
    const listener = vi.fn();
    editor.subscribe(listener);
    rename(editor, "One");
    expect(listener).toHaveBeenCalled();
    listener.mockClear();
    editor.undo();
    editor.undo(); // nothing left to undo
    expect(listener).toHaveBeenCalledTimes(2); // project change, then save status
  });

  it("limits the number of undo steps", () => {
    const { editor } = setup(2);
    for (const title of ["1", "2", "3"]) rename(editor, title);
    editor.undo();
    editor.undo();
    expect(editor.getState()).toMatchObject({ canUndo: false });
    expect(editor.getState().project.trip.title).toBe("1");
  });

  it("reuses the compiled timeline until the project or settings change", () => {
    const { editor } = setup();
    const first = editor.timeline();
    expect(editor.timeline()).toBe(first);
    expect(editor.timeline({ reducedMotion: true })).not.toBe(first);
    rename(editor, "One");
    expect(editor.timeline().title).toBe("One");
  });
});

describe("autosave", () => {
  it("saves once after the last of several quick changes", async () => {
    const { editor, repository, scheduler } = setup();
    rename(editor, "One");
    await scheduler.advance(AUTOSAVE_DELAY_MS / 2);
    rename(editor, "Two");
    expect(editor.getState().save.kind).toBe("pending");
    await scheduler.advance(AUTOSAVE_DELAY_MS / 2);
    expect(repository.saves).toHaveLength(0);
    await scheduler.advance(AUTOSAVE_DELAY_MS / 2);
    expect(repository.saves.map((p) => p.trip.title)).toEqual(["Two"]);
    expect(editor.getState().save.kind).toBe("saved");
    expect(editor.getState().project.trip.revision).toBe(1);
  });

  it("saves changes made during a save afterwards, with the new revision", async () => {
    const { editor, repository, scheduler } = setup();
    rename(editor, "One");
    repository.hold();
    await scheduler.advance(AUTOSAVE_DELAY_MS);
    expect(editor.getState().save.kind).toBe("saving");
    rename(editor, "Two");
    await scheduler.advance(AUTOSAVE_DELAY_MS); // the first save is still running
    repository.release();
    await settle();
    expect(editor.getState().save.kind).toBe("pending");
    expect(editor.getState().project.trip).toMatchObject({ title: "Two", revision: 1 });
    await scheduler.advance(AUTOSAVE_DELAY_MS);
    expect(repository.saves.map((p) => [p.trip.title, p.trip.revision])).toEqual([
      ["One", 0],
      ["Two", 1],
    ]);
    expect(editor.getState().save.kind).toBe("saved");
  });

  it("keeps the stored revision across undo and redo", async () => {
    const { editor, repository, scheduler } = setup();
    rename(editor, "One");
    await scheduler.advance(AUTOSAVE_DELAY_MS);
    editor.undo();
    expect(editor.getState().project.trip).toMatchObject({ title: "Kyoto", revision: 1 });
    await scheduler.advance(AUTOSAVE_DELAY_MS);
    editor.redo();
    await scheduler.advance(AUTOSAVE_DELAY_MS);
    expect(editor.getState().save.kind).toBe("saved");
    expect(repository.stored.get("t1")?.trip).toMatchObject({ title: "One", revision: 3 });
  });

  it("stops saving after a revision conflict", async () => {
    const { editor, repository, scheduler } = setup();
    repository.stored.set("t1", { ...sampleProject(), trip: { ...sampleProject().trip, revision: 5 } });
    rename(editor, "One");
    await scheduler.advance(AUTOSAVE_DELAY_MS);
    expect(editor.getState().save).toEqual({ kind: "conflict", storedRevision: 5 });
    rename(editor, "Two");
    expect(scheduler.pending).toBe(0);
    expect(editor.getState().save.kind).toBe("conflict");
    expect(editor.getState().project.trip.title).toBe("Two");
  });

  it("reports a failed save and retries on the next change", async () => {
    const { editor, repository, scheduler } = setup();
    repository.failNext = new Error("Quota exceeded");
    rename(editor, "One");
    await scheduler.advance(AUTOSAVE_DELAY_MS);
    expect(editor.getState().save).toEqual({ kind: "error", message: "Quota exceeded" });
    rename(editor, "Two");
    await scheduler.advance(AUTOSAVE_DELAY_MS);
    expect(editor.getState().save.kind).toBe("saved");
    expect(repository.stored.get("t1")?.trip.title).toBe("Two");
  });

  it("saves immediately on flush, and does nothing without changes", async () => {
    const { editor, repository, scheduler } = setup();
    await editor.flush();
    expect(repository.saves).toHaveLength(0);
    rename(editor, "One");
    await editor.flush();
    expect(repository.saves).toHaveLength(1);
    expect(scheduler.pending).toBe(0);
    expect(editor.getState().save.kind).toBe("saved");
  });

  it("cancels the pending save when disposed", async () => {
    const { editor, repository, scheduler } = setup();
    rename(editor, "One");
    editor.dispose();
    await scheduler.advance(AUTOSAVE_DELAY_MS);
    expect(repository.saves).toHaveLength(0);
  });
});
