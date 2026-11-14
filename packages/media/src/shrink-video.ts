import { ArrayBufferTarget, Muxer } from "mp4-muxer";
import { createFile, DataStream, Endianness, type ISOFile, MP4BoxBuffer, type Sample, type Track } from "mp4box";

/** Longest side of a shrunk video: the largest recap frame (1080p). */
export const SHRUNK_VIDEO_SIZE = 1920;

/** Bits per second for each pixel of a frame of a shrunk video: about 6 Mbit/s at 1080p. */
const BITS_PER_PIXEL = 3;
/** A key frame every this many microseconds, so that seeking in the preview stays quick. */
const KEY_FRAME_US = 2_000_000;
/** A shrunk video is kept only when it saves at least this share of the original's size. */
const MIN_SAVING = 0.2;
/** Frames waiting in the decoder or encoder before reading more, to bound memory. */
const QUEUE = 8;
/** Bytes read at a time while looking for the movie's description. */
const READ_CHUNK = 1 << 20;

export interface ShrunkVideo {
  readonly blob: Blob;
  readonly width: number;
  readonly height: number;
  readonly mimeType: "video/mp4";
}

export interface ShrinkVideoOptions {
  readonly maxSide?: number;
  /** Called as frames are encoded, with the share done from 0 to 1. */
  readonly onProgress?: (share: number) => void;
  readonly signal?: AbortSignal;
}

/** Reads the movie's description (moov), skipping the media data, and returns its tracks. */
async function readMovie(file: Blob): Promise<{ iso: ISOFile; tracks: Track[] } | undefined> {
  const iso = createFile();
  let tracks: Track[] | undefined;
  iso.onReady = (info) => {
    tracks = info.tracks;
  };
  iso.onError = () => {};
  let position = 0;
  while (!tracks && position < file.size) {
    const bytes = await file.slice(position, position + READ_CHUNK).arrayBuffer();
    const next = iso.appendBuffer(MP4BoxBuffer.fromArrayBuffer(bytes, position));
    // The parser asks for the next position it needs, past the media data it does not keep.
    position = next > position ? next : position + bytes.byteLength;
  }
  iso.flush();
  return tracks ? { iso, tracks } : undefined;
}

/** The decoder description of a track: its avcC, hvcC, vpcC or av1C box without the box header. */
function videoDescription(iso: ISOFile, track: Track): Uint8Array | undefined {
  const entry = iso.getTrackById(track.id).mdia.minf.stbl.stsd.entries[0] as unknown as Record<
    string,
    { write(stream: DataStream): void } | undefined
  >;
  const box = entry.avcC ?? entry.hvcC ?? entry.vpcC ?? entry.av1C;
  if (!box) return undefined;
  const stream = new DataStream(undefined, 0, Endianness.BIG_ENDIAN);
  box.write(stream);
  return new Uint8Array(stream.buffer as ArrayBuffer, 8);
}

/** The AAC AudioSpecificConfig of a track, which a muxer needs to describe it. */
function aacDescription(iso: ISOFile, track: Track): Uint8Array | undefined {
  const entry = iso.getTrackById(track.id).mdia.minf.stbl.stsd.entries[0] as unknown as {
    esds?: { esd?: { descs?: { descs?: { data?: Uint8Array }[] }[] } };
  };
  return entry.esds?.esd?.descs?.[0]?.descs?.[0]?.data;
}

/** The track's transformation matrix in the form the muxer takes, which keeps the rotation. */
function matrixOf(track: Track): [number, number, number, number, number, number, number, number, number] {
  const m = Array.from(track.matrix as ArrayLike<number>);
  const fixed = (v: number | undefined) => (v ?? 0) / 65536;
  const fraction = (v: number | undefined) => (v ?? 0) / 2 ** 30;
  return [
    fixed(m[0]),
    fixed(m[1]),
    fraction(m[2]),
    fixed(m[3]),
    fixed(m[4]),
    fraction(m[5]),
    fixed(m[6]),
    fixed(m[7]),
    fraction(m[8]),
  ];
}

const even = (value: number) => Math.max(2, Math.round(value / 2) * 2);
const microseconds = (value: number, timescale: number) => Math.round((value * 1_000_000) / timescale);

/** The first video encoding the browser supports for the size, H.264 first as it plays everywhere. */
async function chooseEncoder(width: number, height: number, framerate: number) {
  const base = { width, height, framerate, bitrate: Math.round(width * height * BITS_PER_PIXEL * (framerate / 30)) };
  const large = Math.max(width, height) > 1280;
  const candidates = [
    { mux: "avc", config: { ...base, codec: large ? "avc1.640028" : "avc1.64001f", avc: { format: "avc" } } },
    { mux: "avc", config: { ...base, codec: large ? "avc1.4d0028" : "avc1.4d001f", avc: { format: "avc" } } },
    { mux: "vp9", config: { ...base, codec: "vp09.00.40.08" } },
    { mux: "av1", config: { ...base, codec: "av01.0.08M.08" } },
  ] as const;
  for (const candidate of candidates) {
    const { supported } = await VideoEncoder.isConfigSupported(candidate.config).catch(() => ({ supported: false }));
    if (supported) return candidate;
  }
  return undefined;
}

/** Waits until a coder has room for more work. */
async function room(coder: { readonly decodeQueueSize?: number; readonly encodeQueueSize?: number }) {
  while ((coder.decodeQueueSize ?? coder.encodeQueueSize ?? 0) > QUEUE) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

/**
 * A smaller copy of an MP4 or QuickTime video, at most `maxSide` pixels on its longest side, made
 * with the browser's decoder and encoder (WebCodecs). The picture is encoded again, H.264 where
 * the browser can; the sound (AAC or Opus) is copied as it is, and the rotation recorded by the
 * camera is kept. Undefined when the browser cannot decode or encode the video, when its sound is
 * in another format, or when the copy would not be noticeably smaller.
 */
export async function shrinkVideo(file: Blob, options: ShrinkVideoOptions = {}): Promise<ShrunkVideo | undefined> {
  const { maxSide = SHRUNK_VIDEO_SIZE, onProgress, signal } = options;
  if (typeof VideoDecoder === "undefined" || typeof VideoEncoder === "undefined") return undefined;
  const movie = await readMovie(file).catch(() => undefined);
  if (!movie) return undefined;
  const { iso, tracks } = movie;
  const video = tracks.find((track) => track.type === "video" && track.video);
  if (!video?.video) return undefined;
  const audio = tracks.find((track) => track.type === "audio" && track.audio);
  const audioCodec = audio?.codec.startsWith("mp4a.40") ? "aac" : audio?.codec.toLowerCase() === "opus" ? "opus" : null;
  // Sound in another format would have to be encoded again; such videos stay as they are.
  if (audio && !audioCodec) return undefined;

  const decoderConfig: VideoDecoderConfig = {
    codec: video.codec,
    codedWidth: video.video.width,
    codedHeight: video.video.height,
  };
  const description = videoDescription(iso, video);
  if (description) decoderConfig.description = description;
  const { supported } = await VideoDecoder.isConfigSupported(decoderConfig).catch(() => ({ supported: false }));
  if (!supported) return undefined;

  const scale = Math.min(1, maxSide / Math.max(video.video.width, video.video.height));
  const width = even(video.video.width * scale);
  const height = even(video.video.height * scale);
  const durationS = video.duration / video.timescale || 1;
  const framerate = Math.min(60, Math.max(1, Math.round(video.nb_samples / durationS)));
  const encoder = await chooseEncoder(width, height, framerate);
  if (!encoder) return undefined;
  // A video already small and lean would only lose quality.
  if (scale === 1 && file.size * 8 < (encoder.config.bitrate * durationS) / (1 - MIN_SAVING)) return undefined;

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    fastStart: "in-memory",
    firstTimestampBehavior: "cross-track-offset",
    video: { codec: encoder.mux, width, height, rotation: matrixOf(video) },
    ...(audio?.audio && audioCodec
      ? {
          audio: {
            codec: audioCodec,
            numberOfChannels: audio.audio.channel_count,
            sampleRate: audio.audio.sample_rate,
          },
        }
      : {}),
  });

  let failure: unknown;
  const fail = (error: unknown) => {
    failure ??= error;
  };
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext("2d") as OffscreenCanvasRenderingContext2D;
  const samples = iso.getTrackSamplesInfo(video.id);
  let encoded = 0;
  let lastKey = Number.NEGATIVE_INFINITY;
  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => {
      muxer.addVideoChunk(chunk, meta);
      onProgress?.(++encoded / samples.length);
    },
    error: fail,
  });
  videoEncoder.configure(encoder.config);
  const decoder = new VideoDecoder({
    output: (frame) => {
      try {
        context.drawImage(frame, 0, 0, width, height);
        const out = new VideoFrame(canvas, {
          timestamp: frame.timestamp,
          ...(frame.duration === null ? {} : { duration: frame.duration }),
        });
        const keyFrame = frame.timestamp - lastKey >= KEY_FRAME_US;
        if (keyFrame) lastKey = frame.timestamp;
        videoEncoder.encode(out, { keyFrame });
        out.close();
      } catch (error) {
        fail(error);
      } finally {
        frame.close();
      }
    },
    error: fail,
  });
  decoder.configure(decoderConfig);

  const read = async (sample: Sample) =>
    new Uint8Array(await file.slice(sample.offset, sample.offset + sample.size).arrayBuffer());
  const audioSamples = audio ? iso.getTrackSamplesInfo(audio.id) : [];
  const audioDescription = audio && audioCodec === "aac" ? aacDescription(iso, audio) : undefined;
  let nextAudio = 0;
  const addAudioUntil = async (timeUs: number) => {
    if (!audio?.audio) return;
    while (nextAudio < audioSamples.length) {
      const sample = audioSamples[nextAudio] as Sample;
      const at = microseconds(sample.cts, sample.timescale);
      if (at > timeUs) return;
      muxer.addAudioChunkRaw(
        await read(sample),
        "key",
        at,
        microseconds(sample.duration, sample.timescale),
        nextAudio === 0
          ? {
              decoderConfig: {
                codec: audio.codec,
                sampleRate: audio.audio.sample_rate,
                numberOfChannels: audio.audio.channel_count,
                ...(audioDescription ? { description: audioDescription } : {}),
              },
            }
          : undefined,
      );
      nextAudio++;
    }
  };

  try {
    for (const sample of samples) {
      signal?.throwIfAborted();
      if (failure) throw failure;
      await room(decoder);
      await room(videoEncoder);
      const timestamp = microseconds(sample.cts, sample.timescale);
      await addAudioUntil(timestamp);
      decoder.decode(
        new EncodedVideoChunk({
          type: sample.is_sync ? "key" : "delta",
          timestamp,
          duration: microseconds(sample.duration, sample.timescale),
          data: await read(sample),
        }),
      );
    }
    await decoder.flush();
    await videoEncoder.flush();
    await addAudioUntil(Number.POSITIVE_INFINITY);
    if (failure) throw failure;
    muxer.finalize();
  } catch {
    if (signal?.aborted) throw signal.reason;
    return undefined;
  } finally {
    if (decoder.state !== "closed") decoder.close();
    if (videoEncoder.state !== "closed") videoEncoder.close();
  }

  const blob = new Blob([target.buffer], { type: "video/mp4" });
  if (blob.size > file.size * (1 - MIN_SAVING)) return undefined;
  // The size as shown, which the rotation turns.
  const turned = Math.abs(matrixOf(video)[1]) > 0.5;
  return { blob, width: turned ? height : width, height: turned ? width : height, mimeType: "video/mp4" };
}
