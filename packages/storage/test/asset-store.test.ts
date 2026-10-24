import { describe, expect, it } from "vitest";
import { createAssetStore, StorageError } from "../src/index.ts";
import { chunks, memoryVolume } from "./memory-volume.ts";

async function* failing(): AsyncIterable<Uint8Array> {
  yield new Uint8Array(10);
  throw new Error("Read failed");
}

describe("asset store", () => {
  it("stores a complete file under its id and nothing in the temporary directory", async () => {
    const volume = memoryVolume();
    const store = createAssetStore(volume);
    await store.put("a1", chunks(3, 2), 5);
    expect(await store.open("a1")).toEqual(new Uint8Array([1, 1, 1, 2, 2]));
    expect(await store.list()).toEqual(["a1"]);
    expect(volume.tmp.entries.size).toBe(0);
  });

  it("leaves no file when the source fails or has the wrong size", async () => {
    const volume = memoryVolume();
    const store = createAssetStore(volume);
    await expect(store.put("a1", failing(), 20)).rejects.toThrow("Read failed");
    await expect(store.put("a2", chunks(4), 5)).rejects.toMatchObject({ code: "sizeMismatch" });
    await expect(store.put("a3", chunks(4, 4), 5)).rejects.toMatchObject({ code: "sizeMismatch" });
    expect(volume.tmp.entries.size).toBe(0);
    expect(await store.list()).toEqual([]);
  });

  it("refuses ids that are not safe file names", async () => {
    const store = createAssetStore(memoryVolume());
    for (const id of ["../x", "a/b", "", ".", "a b", "x".repeat(129)]) {
      await expect(store.put(id, chunks(1), 1)).rejects.toBeInstanceOf(StorageError);
      expect(await store.open(id)).toBeUndefined();
    }
  });

  it("does not overwrite an existing asset", async () => {
    const store = createAssetStore(memoryVolume());
    await store.put("a1", chunks(1), 1);
    await expect(store.put("a1", chunks(2), 2)).rejects.toMatchObject({ code: "exists" });
    expect(await store.open("a1")).toEqual(new Uint8Array([1]));
  });

  it("removes files and ignores missing ones", async () => {
    const store = createAssetStore(memoryVolume());
    await store.put("a1", chunks(1), 1);
    await store.remove("a1");
    await store.remove("a1");
    expect(await store.list()).toEqual([]);
  });

  it("does not list platform files such as swap files", async () => {
    const volume = memoryVolume();
    await (await volume.assets.create("a1.crswap")).close();
    expect(await createAssetStore(volume).list()).toEqual([]);
  });
});
