/** How an export is encoded: the encoders' settings and the matching names in the MP4 file. */
export interface ExportFormat {
  readonly video: { readonly config: VideoEncoderConfig; readonly mux: "avc" | "vp9" | "av1" };
  /** Undefined where no audio encoder is available; the video is then silent. */
  readonly audio?: { readonly config: AudioEncoderConfig; readonly mux: "aac" | "opus" };
}

export interface ExportSize {
  readonly width: number;
  readonly height: number;
  readonly fps: number;
}

/** Bits per second of video for a frame size, about 8 Mbit/s at 1080p. */
const bitrate = ({ width, height }: ExportSize) => Math.round(width * height * 4);

/**
 * Video codecs in order of preference. H.264 plays everywhere and is what phones and Chrome
 * encode; VP9 and AV1 also go in MP4 and are used where H.264 cannot be encoded.
 */
function videoCandidates(size: ExportSize): ExportFormat["video"][] {
  const large = Math.max(size.width, size.height) > 1280;
  const base = { width: size.width, height: size.height, framerate: size.fps, bitrate: bitrate(size) };
  return [
    { mux: "avc", config: { ...base, codec: large ? "avc1.640028" : "avc1.64001f", avc: { format: "avc" } } },
    { mux: "avc", config: { ...base, codec: large ? "avc1.4d0028" : "avc1.4d001f", avc: { format: "avc" } } },
    { mux: "vp9", config: { ...base, codec: "vp09.00.40.08" } },
    { mux: "av1", config: { ...base, codec: "av01.0.08M.08" } },
  ];
}

function audioCandidates(sampleRate: number, numberOfChannels: number): NonNullable<ExportFormat["audio"]>[] {
  const base = { sampleRate, numberOfChannels, bitrate: 128_000 };
  return [
    { mux: "aac", config: { ...base, codec: "mp4a.40.2" } },
    { mux: "opus", config: { ...base, codec: "opus" } },
  ];
}

/**
 * The first video and audio encodings this browser supports for the size, or undefined when it
 * cannot encode video at all (Specification §7.1: probed before export, never assumed).
 */
export async function chooseFormat(
  size: ExportSize,
  sampleRate: number,
  numberOfChannels: number,
): Promise<ExportFormat | undefined> {
  if (typeof VideoEncoder === "undefined") return undefined;
  let video: ExportFormat["video"] | undefined;
  for (const candidate of videoCandidates(size)) {
    const { supported } = await VideoEncoder.isConfigSupported(candidate.config).catch(() => ({ supported: false }));
    if (supported) {
      video = candidate;
      break;
    }
  }
  if (!video) return undefined;
  if (typeof AudioEncoder === "undefined") return { video };
  for (const candidate of audioCandidates(sampleRate, numberOfChannels)) {
    const { supported } = await AudioEncoder.isConfigSupported(candidate.config).catch(() => ({ supported: false }));
    if (supported) return { video, audio: candidate };
  }
  return { video };
}
