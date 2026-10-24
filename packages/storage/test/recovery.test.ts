import { createProject } from "@tripreplay/domain";
import { describe, expect, it } from "vitest";
import { createAssetStore, RECOVERY_GRACE_MS, recoverStorage, referencedAssets } from "../src/index.ts";
import { chunks, memoryVolume } from "./memory-volume.ts";

describe("recovery", () => {
  it("removes leftovers of interrupted imports and unreferenced media once they are old enough", async () => {
    const volume = memoryVolume();
    const store = createAssetStore(volume);
    await store.put("kept", chunks(1), 1);
    await store.put("undone", chunks(1), 1);
    // An import interrupted before close: the browser leaves the target and its swap file.
    await volume.tmp.create("lost");
    await (await volume.tmp.create("lost.crswap")).close();

    volume.clock.now = RECOVERY_GRACE_MS;
    const report = await recoverStorage(volume, { referenced: new Set(["kept"]), now: volume.clock.now });
    expect(report).toEqual({ removedTemporary: ["lost", "lost.crswap"], removedAssets: ["undone"] });
    expect(await store.list()).toEqual(["kept"]);
    expect(volume.tmp.entries.size).toBe(0);
  });

  it("keeps recent files, which another tab may still be importing", async () => {
    const volume = memoryVolume({ now: 1000 });
    await createAssetStore(volume).put("new", chunks(1), 1);
    await volume.tmp.create("busy");
    const report = await recoverStorage(volume, { referenced: new Set(), now: 1000 + RECOVERY_GRACE_MS - 1 });
    expect(report).toEqual({ removedTemporary: [], removedAssets: [] });
  });

  it("collects the assets of every project", () => {
    const base = createProject({ id: "t", title: "T", timeZone: "UTC", themeId: "classic" });
    const asset = (id: string) =>
      ({
        kind: "audio",
        id,
        contentHash: id,
        fileName: id,
        mimeType: "audio/mpeg",
        byteSize: 1,
        durationUs: 1,
      }) as const;
    const ids = referencedAssets([
      { ...base, assets: [asset("a"), asset("b")] },
      { ...base, assets: [asset("b"), asset("c")] },
    ]);
    expect([...ids].sort()).toEqual(["a", "b", "c"]);
  });
});
