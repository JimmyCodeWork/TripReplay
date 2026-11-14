export { audioFormat } from "./audio-format.ts";
export { IMAGE_HEAD_BYTES, type ImageMetadata, readExif, readImageMetadata } from "./image-metadata.ts";
export {
  contentHash,
  createMediaPort,
  FULL_HASH_BYTES,
  inspectMediaFile,
  type MediaPortOptions,
} from "./media-port.ts";
export { SHRUNK_PHOTO_SIZE, type ShrunkImage, shrinkPhoto } from "./shrink-photo.ts";
// shrink-video.ts is loaded on demand by the media port, so that its MP4 reader stays out of the
// application's first download; import it directly where it is needed.
export type { ShrinkVideoOptions, ShrunkVideo } from "./shrink-video.ts";
export {
  isHeif,
  parseIso6709,
  type ReadBytes,
  readMoov,
  readVideoMetadata,
  type VideoMetadata,
} from "./video-metadata.ts";
