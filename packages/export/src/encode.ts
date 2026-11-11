import { type FrameDescription, renderAt, type Timeline } from "@tripreplay/timeline";
import { Muxer, StreamTarget } from "mp4-muxer";
import type { ExportFormat, ExportSize } from "./formats.ts";

/** Draws a frame of the recap at the export's size and gives back the picture to encode. */
export interface FrameSource {
  draw(frame: FrameDescription): Promise<CanvasImageSource>;
}

export interface ExportProgress {
  readonly phase: "audio" | "video" | "finishing";
  readonly completed: number;
  readonly total: number;
}

export interface EncodeOptions {
  readonly timeline: Timeline;
  readonly size: ExportSize;
  readonly format: ExportFormat;
  readonly frames: FrameSource;
  /** The mixed sound, or undefined for a silent video. */
  readonly audio?: AudioBuffer | undefined;
  /** Writes bytes of the MP4 file at a position; the file is complete once encoding resolves. */
  readonly write: (data: Uint8Array<ArrayBuffer>, position: number) => Promise<void>;
  readonly onProgress?: (progress: ExportProgress) => void;
  readonly signal?: AbortSignal;
}

/** A key frame every this many seconds, so that players can seek in the video. */
const KEY_FRAME_S = 2;
/** Frames waiting in the encoder before drawing pauses, which bounds memory. */
const QUEUE = 4;
/** Samples of sound per encoded piece. */
const AUDIO_PIECE = 4800;

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw signal.reason ?? new DOMException("The export was cancelled", "AbortError");
}

/**
 * Encodes the recap into an MP4 file (Specification §7): the sound first, then each frame at
 * fixed 30 fps timestamps, drawn and encoded one at a time with a bounded queue, so that the
 * video is never held in memory. Rejects, leaving the written bytes incomplete, when encoding
 * fails or `signal` aborts.
 */
export async function encodeRecap(options: EncodeOptions): Promise<void> {
  const { timeline, size, format, audio, signal } = options;
  const { durationUs } = timeline;
  const report = options.onProgress ?? (() => {});
  let writing: Promise<void> = Promise.resolve();
  let failure: unknown;
  const fail = (error: unknown) => {
    failure ??= error;
  };
  const muxer = new Muxer({
    target: new StreamTarget({
      onData: (data, position) => {
        const copy = data.slice();
        writing = writing.then(() => options.write(copy, position));
      },
    }),
    video: { codec: format.video.mux, width: size.width, height: size.height, frameRate: size.fps },
    ...(audio && format.audio
      ? { audio: { codec: format.audio.mux, numberOfChannels: audio.numberOfChannels, sampleRate: audio.sampleRate } }
      : {}),
    fastStart: false,
    firstTimestampBehavior: "offset",
  });

  if (audio && format.audio) {
    const encoder = new AudioEncoder({ output: (chunk, meta) => muxer.addAudioChunk(chunk, meta), error: fail });
    encoder.configure(format.audio.config);
    const pieces = Math.ceil(audio.length / AUDIO_PIECE);
    for (let piece = 0; piece < pieces; piece++) {
      throwIfAborted(signal);
      const start = piece * AUDIO_PIECE;
      const frames = Math.min(AUDIO_PIECE, audio.length - start);
      const planar = new Float32Array(frames * audio.numberOfChannels);
      for (let channel = 0; channel < audio.numberOfChannels; channel++) {
        planar.set(audio.getChannelData(channel).subarray(start, start + frames), channel * frames);
      }
      const data = new AudioData({
        format: "f32-planar",
        sampleRate: audio.sampleRate,
        numberOfFrames: frames,
        numberOfChannels: audio.numberOfChannels,
        timestamp: Math.round((start / audio.sampleRate) * 1_000_000),
        data: planar,
      });
      encoder.encode(data);
      data.close();
      if (failure) throw failure;
      if (piece % 50 === 0) report({ phase: "audio", completed: piece, total: pieces });
    }
    await encoder.flush();
    encoder.close();
  }

  const encoder = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: fail });
  encoder.configure(format.video.config);
  const total = Math.max(1, Math.ceil((durationUs / 1_000_000) * size.fps));
  const frameUs = 1_000_000 / size.fps;
  try {
    for (let index = 0; index < total; index++) {
      throwIfAborted(signal);
      const timeUs = Math.round(index * frameUs);
      const picture = await options.frames.draw(renderAt(timeline, timeUs));
      const frame = new VideoFrame(picture, { timestamp: timeUs, duration: Math.round(frameUs) });
      encoder.encode(frame, { keyFrame: index % (KEY_FRAME_S * size.fps) === 0 });
      frame.close();
      while (encoder.encodeQueueSize > QUEUE && !failure) {
        await new Promise((resolve) => encoder.addEventListener("dequeue", resolve, { once: true }));
      }
      if (failure) throw failure;
      report({ phase: "video", completed: index + 1, total });
    }
    report({ phase: "finishing", completed: total, total });
    await encoder.flush();
  } finally {
    if (encoder.state !== "closed") encoder.close();
  }
  if (failure) throw failure;
  muxer.finalize();
  await writing;
}
