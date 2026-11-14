/** Longest side of a shrunk photo: about a third more than the largest recap frame (1920 px). */
export const SHRUNK_PHOTO_SIZE = 2560;

/** JPEG quality of a shrunk photo, which keeps no visible loss at its size. */
const JPEG_QUALITY = 0.85;

/** A shrunk photo is kept only when it saves at least this share of the original's size. */
const MIN_SAVING = 0.2;

export interface ShrunkImage {
  readonly blob: Blob;
  readonly width: number;
  readonly height: number;
  readonly mimeType: "image/jpeg";
}

/**
 * A smaller copy of a photo, at most `maxSide` pixels on its longest side, as JPEG. The picture is
 * turned upright as the camera recorded it, so the copy needs no orientation. Metadata such as the
 * capture time and position is not copied: the application reads it at import and keeps it with
 * the trip. Undefined when the browser cannot decode the photo, when it is animated (GIF), or
 * when the copy would not be noticeably smaller, so a photo is never made larger or recompressed
 * for nothing.
 */
export async function shrinkPhoto(file: Blob, maxSide = SHRUNK_PHOTO_SIZE): Promise<ShrunkImage | undefined> {
  if (file.type === "image/gif") return undefined;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return undefined;
  }
  try {
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d");
    if (!context) return undefined;
    // Transparent areas, as in a PNG screenshot, become white rather than black in JPEG.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: JPEG_QUALITY });
    if (blob.size > file.size * (1 - MIN_SAVING)) return undefined;
    return { blob, width, height, mimeType: "image/jpeg" };
  } finally {
    bitmap.close();
  }
}
