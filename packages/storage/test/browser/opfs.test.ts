import { afterEach, describe, expect, it } from "vitest";
import { createAssetStore, openOpfsVolume, RECOVERY_GRACE_MS, recoverStorage } from "../../src/index.ts";

async function* bytes(total: number, chunk = 1024 * 1024): AsyncIterable<Uint8Array> {
  for (let offset = 0, index = 0; offset < total; offset += chunk, index++) {
    yield new Uint8Array(Math.min(chunk, total - offset)).fill(index + 1);
  }
}

const later = () => Date.now() + RECOVERY_GRACE_MS + 1000;
let root = "";

afterEach(async () => {
  await (await navigator.storage.getDirectory()).removeEntry(root, { recursive: true });
});

describe("OPFS asset store", () => {
  it("stores, reads back, lists and removes media", async () => {
    root = "opfs-basic";
    const store = createAssetStore(await openOpfsVolume(root));
    await store.put("a1", bytes(3 * 1024 * 1024), 3 * 1024 * 1024);
    const file = await store.open("a1");
    expect(file?.size).toBe(3 * 1024 * 1024);
    const lastChunk = new Uint8Array(await (file as File).slice(2 * 1024 * 1024, 2 * 1024 * 1024 + 1).arrayBuffer());
    expect(lastChunk[0]).toBe(3);
    expect(await store.list()).toEqual(["a1"]);
    await store.remove("a1");
    await store.remove("a1");
    expect(await store.list()).toEqual([]);
  });

  it("leaves nothing behind for a wrong size or an existing id", async () => {
    root = "opfs-errors";
    const volume = await openOpfsVolume(root);
    const store = createAssetStore(volume);
    await store.put("a1", bytes(10), 10);
    await expect(store.put("a2", bytes(10), 11)).rejects.toMatchObject({ code: "sizeMismatch" });
    await expect(store.put("a1", bytes(5), 5)).rejects.toMatchObject({ code: "exists" });
    expect(await volume.tmp.names()).toEqual([]);
    expect(await store.list()).toEqual(["a1"]);
    expect((await store.open("a1"))?.size).toBe(10);
  });
});

describe("OPFS recovery", () => {
  it("removes an import that never closed, and unreferenced media", async () => {
    root = "opfs-recovery";
    const volume = await openOpfsVolume(root);
    const store = createAssetStore(volume);
    await store.put("kept", bytes(10), 10);
    await store.put("undone", bytes(10), 10);
    // An import still being written, as by another tab: the browser locks the file.
    const writer = await volume.tmp.create("interrupted");
    await writer.write(new Uint8Array(1024));
    const busy = await recoverStorage(volume, { referenced: new Set(["kept"]), now: later() });
    expect(busy.removedAssets).toEqual(["undone"]);
    expect(busy.removedTemporary).not.toContain("interrupted");

    // Once the writer is gone, as after the tab closed, the leftover is removed.
    await writer.abort();
    const report = await recoverStorage(volume, { referenced: new Set(["kept"]), now: later() });
    expect(report.removedTemporary).toContain("interrupted");
    expect(await volume.tmp.names()).toEqual([]);
    expect(await store.list()).toEqual(["kept"]);
  });

  it("keeps recent files", async () => {
    root = "opfs-recent";
    const volume = await openOpfsVolume(root);
    await createAssetStore(volume).put("new", bytes(10), 10);
    const report = await recoverStorage(volume, { referenced: new Set(), now: Date.now() });
    expect(report.removedAssets).toEqual([]);
  });
});
