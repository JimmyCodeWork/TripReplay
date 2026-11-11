import { describe, expect, it } from "vitest";
import { CHANNELS, chooseFormat, encodeRecap, mixAudio, planAudio, SAMPLE_RATE } from "../../src/index.ts";
import { timeline } from "../fixture.ts";

/** Box types at the top level of an MP4 file. */
function topBoxes(bytes: Uint8Array): string[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const types: string[] = [];
  for (let at = 0; at + 8 <= bytes.length; ) {
    const size = view.getUint32(at);
    types.push(String.fromCharCode(...bytes.subarray(at + 4, at + 8)));
    if (size < 8) break;
    at += size;
  }
  return types;
}

/** A tone of `seconds` as a decoded buffer, standing in for a music file. */
function tone(seconds: number): AudioBuffer {
  const buffer = new AudioBuffer({
    length: seconds * SAMPLE_RATE,
    numberOfChannels: CHANNELS,
    sampleRate: SAMPLE_RATE,
  });
  for (let c = 0; c < CHANNELS; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < data.length; i++) data[i] = Math.sin((i / SAMPLE_RATE) * 2 * Math.PI * 440) * 0.2;
  }
  return buffer;
}

describe("encodeRecap", () => {
  it("chooses a supported format and writes a playable MP4 with sound, reporting progress", async () => {
    const size = { width: 320, height: 180, fps: 30 };
    const format = await chooseFormat(size, SAMPLE_RATE, CHANNELS);
    expect(format).toBeDefined();
    if (!format) return;
    const durationUs = 2_000_000;
    // The plan's music at full strength, cut to two seconds.
    const runs = planAudio(timeline).filter((run) => run.assetId === "m");
    const audio = await mixAudio(runs, durationUs, new Map([["m", tone(4)]]));
    expect(audio?.length).toBe(2 * SAMPLE_RATE);

    const canvas = new OffscreenCanvas(size.width, size.height);
    const context = canvas.getContext("2d") as OffscreenCanvasRenderingContext2D;
    const drawn: number[] = [];
    let file = new Uint8Array(0);
    const progress: string[] = [];
    await encodeRecap({
      timeline: { ...timeline, durationUs },
      size,
      format,
      audio,
      frames: {
        draw: async ({ timeUs }) => {
          drawn.push(timeUs);
          context.fillStyle = `hsl(${timeUs / 10_000}, 60%, 50%)`;
          context.fillRect(0, 0, size.width, size.height);
          return canvas;
        },
      },
      write: async (data, position) => {
        if (position + data.length > file.length) {
          const grown = new Uint8Array(position + data.length);
          grown.set(file);
          file = grown;
        }
        file.set(data, position);
      },
      onProgress: (p) => void progress.push(p.phase),
    });
    expect(drawn).toHaveLength(60);
    expect(drawn[1]).toBe(33_333);
    expect(progress).toContain("video");
    expect(progress.at(-1)).toBe("finishing");
    expect(topBoxes(file)).toEqual(["ftyp", "mdat", "moov"]);

    // The browser plays the file back for its full length.
    const video = document.createElement("video");
    video.src = URL.createObjectURL(new Blob([file], { type: "video/mp4" }));
    await new Promise((resolve, reject) => {
      video.addEventListener("loadedmetadata", resolve, { once: true });
      video.addEventListener("error", () => reject(video.error), { once: true });
    });
    expect(video.duration).toBeGreaterThan(1.9);
    expect(video.duration).toBeLessThan(2.2);
    expect(video.videoWidth).toBe(320);
  });

  it("stops when cancelled", async () => {
    const size = { width: 160, height: 90, fps: 30 };
    const format = await chooseFormat(size, SAMPLE_RATE, CHANNELS);
    if (!format) return;
    const controller = new AbortController();
    const canvas = new OffscreenCanvas(size.width, size.height);
    (canvas.getContext("2d") as OffscreenCanvasRenderingContext2D).fillRect(0, 0, size.width, size.height);
    let drawn = 0;
    const encoding = encodeRecap({
      timeline: { ...timeline, durationUs: 5_000_000 },
      size,
      format,
      frames: {
        draw: async () => {
          drawn++;
          if (drawn === 5) controller.abort();
          return canvas;
        },
      },
      write: async () => {},
      signal: controller.signal,
    });
    await expect(encoding).rejects.toMatchObject({ name: "AbortError" });
    expect(drawn).toBe(5);
  });
});
