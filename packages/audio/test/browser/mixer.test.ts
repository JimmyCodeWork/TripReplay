import type { FrameDescription } from "@tripreplay/app";
import { afterEach, describe, expect, it } from "vitest";
import { createAudioMixer } from "../../src/index.ts";

type AudioState = FrameDescription["audio"][number];

/** A WAV file with `seconds` of a quiet sine tone. */
function wav(seconds: number, rate = 8000): Blob {
  const samples = seconds * rate;
  const view = new DataView(new ArrayBuffer(44 + samples * 2));
  const text = (at: number, value: string) => {
    for (const [i, c] of [...value].entries()) view.setUint8(at + i, c.charCodeAt(0));
  };
  text(0, "RIFF");
  view.setUint32(4, 36 + samples * 2, true);
  text(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, samples * 2, true);
  for (let i = 0; i < samples; i++) view.setInt16(44 + i * 2, Math.sin((i / rate) * 2 * Math.PI * 440) * 3000, true);
  return new Blob([view.buffer], { type: "audio/wav" });
}

async function element(): Promise<HTMLAudioElement> {
  const audio = document.createElement("audio");
  audio.src = URL.createObjectURL(wav(10));
  await new Promise((resolve) => audio.addEventListener("loadedmetadata", resolve, { once: true }));
  return audio;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let dispose: (() => void) | undefined;
afterEach(() => dispose?.());

async function setup() {
  const music = await element();
  const clip = await element();
  let ctx: AudioContext | undefined;
  const gains: GainNode[] = [];
  const mixer = createAudioMixer({
    context: () => {
      ctx = new AudioContext();
      const create = ctx.createGain.bind(ctx);
      ctx.createGain = () => {
        const node = create();
        gains.push(node);
        return node;
      };
      return ctx;
    },
    element: (state) => (state.kind === "music" ? music : clip),
  });
  dispose = () => mixer.dispose();
  return { mixer, music, clip, gains, context: () => ctx as AudioContext };
}

const musicAt = (seconds: number, gain: number): AudioState => ({
  kind: "music",
  trackId: "t1",
  assetId: "m1",
  mediaTimeUs: seconds * 1_000_000,
  gain,
});

describe("createAudioMixer", () => {
  it("plays music from the recap's position at the frame's gain, and pauses with the recap", async () => {
    const { mixer, music, gains } = await setup();
    mixer.render([musicAt(3, 0.6)], true);
    await wait(300);
    expect(music.paused).toBe(false);
    expect(music.currentTime).toBeGreaterThan(3);
    expect(music.muted).toBe(false);
    expect(gains[0]?.gain.value).toBeCloseTo(0.6, 1);
    mixer.render([musicAt(3.3, 0.6)], false);
    expect(music.paused).toBe(true);
  });

  it("follows a seek and silences sources the frame no longer has", async () => {
    const { mixer, music, gains } = await setup();
    mixer.render([musicAt(1, 0.5)], false);
    expect(music.currentTime).toBeCloseTo(1, 1);
    mixer.render([musicAt(7, 0.5)], false);
    expect(music.currentTime).toBeCloseTo(7, 1);
    mixer.render([musicAt(7, 0.5)], true);
    await wait(100);
    mixer.render([], true);
    await wait(250);
    expect(music.paused).toBe(true);
    expect(gains[0]?.gain.value).toBeLessThan(0.05);
  });

  it("sets a clip's gain without moving the video, which the preview positions", async () => {
    const { mixer, clip, gains } = await setup();
    clip.currentTime = 2;
    mixer.render([{ kind: "clip", clipId: "c1", assetId: "v1", mediaTimeUs: 8_000_000, gain: 0.8 }], false);
    await wait(250);
    expect(clip.currentTime).toBeCloseTo(2, 1);
    expect(gains[0]?.gain.value).toBeCloseTo(0.8, 1);
  });
});
