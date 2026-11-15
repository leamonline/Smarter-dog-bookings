// Prepares a customer's dog photo for upload, entirely in the browser.
//
// Every photo is decoded and redrawn onto a canvas, then re-encoded as JPEG:
//   • it is scaled down so its longest side is at most MAX_EDGE pixels, which
//     keeps uploads to a few hundred KB (the bucket refuses anything over 2 MB);
//   • the redraw drops all metadata, including EXIF GPS — a phone photo taken
//     in the garden would otherwise carry the customer's home location;
//   • the EXIF orientation is applied first, so the dog is the right way up.
// Anything the browser cannot decode (an unsupported HEIC on desktop Chrome,
// say) fails here with a plain message rather than uploading a broken file.

export const MAX_EDGE = 1200;
export const MAX_INPUT_BYTES = 15 * 1024 * 1024;
export const MAX_OUTPUT_BYTES = 2 * 1024 * 1024;

export class DogPhotoError extends Error {
  constructor(public readonly reason: "not_image" | "too_large" | "unreadable") {
    super(reason);
    this.name = "DogPhotoError";
  }
}

/** Scale (width, height) so the longest side is at most maxEdge; never upscale. */
export function targetSize(width: number, height: number, maxEdge = MAX_EDGE): { width: number; height: number } {
  if (!(width > 0) || !(height > 0)) return { width: 0, height: 0 };
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export function friendlyDogPhotoError(error: unknown): string {
  const reason = error instanceof DogPhotoError ? error.reason : null;
  if (reason === "not_image") return "That file isn't a photo. Choose a JPEG, PNG or similar image.";
  if (reason === "too_large") return "That photo is too big. Choose one under 15 MB.";
  if (reason === "unreadable") return "We couldn't read that photo. Try a JPEG or PNG.";
  return "We couldn't save the photo. Please try again.";
}

type Drawable = ImageBitmap | HTMLImageElement;

async function decode(file: File): Promise<{ source: Drawable; width: number; height: number; release: () => void }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
    } catch {
      // Fall through to <img>, which some browsers decode more formats with.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, release: () => URL.revokeObjectURL(url) };
  } catch {
    URL.revokeObjectURL(url);
    throw new DogPhotoError("unreadable");
  }
}

function toJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

/** Returns a JPEG Blob ready for the dog-photos bucket. */
export async function prepareDogPhoto(file: File): Promise<Blob> {
  if (!file || !file.type.startsWith("image/")) throw new DogPhotoError("not_image");
  if (file.size > MAX_INPUT_BYTES) throw new DogPhotoError("too_large");

  const decoded = await decode(file);
  try {
    const size = targetSize(decoded.width, decoded.height);
    if (size.width === 0) throw new DogPhotoError("unreadable");
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (!context) throw new DogPhotoError("unreadable");
    // A transparent PNG would turn black as JPEG; give it a white background.
    context.fillStyle = "#fff";
    context.fillRect(0, 0, size.width, size.height);
    context.drawImage(decoded.source, 0, 0, size.width, size.height);

    for (const quality of [0.85, 0.7, 0.55]) {
      const blob = await toJpeg(canvas, quality);
      if (blob && blob.size <= MAX_OUTPUT_BYTES) return blob;
    }
    throw new DogPhotoError("too_large");
  } finally {
    decoded.release();
  }
}
