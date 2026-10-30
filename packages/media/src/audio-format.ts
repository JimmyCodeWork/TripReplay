/**
 * The MIME type of an audio file from its first bytes, or undefined when it is none of MP3, WAV,
 * Ogg, FLAC or ADTS AAC. Audio in an MP4 container (M4A) is recognized from its tracks instead.
 */
export function audioFormat(head: Uint8Array): string | undefined {
  const text = (start: number, length: number) => String.fromCharCode(...head.subarray(start, start + length));
  if (text(0, 3) === "ID3") return "audio/mpeg";
  if (text(0, 4) === "RIFF" && text(8, 4) === "WAVE") return "audio/wav";
  if (text(0, 4) === "OggS") return "audio/ogg";
  if (text(0, 4) === "fLaC") return "audio/flac";
  const [a = 0, b = 0] = head;
  if (a === 0xff && (b & 0xf6) === 0xf0) return "audio/aac";
  if (a === 0xff && (b & 0xe0) === 0xe0) return "audio/mpeg";
  return undefined;
}
