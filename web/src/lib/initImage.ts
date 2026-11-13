/**
 * The image-to-image input and the inpainting mask, as the form holds them: in memory only, never in browser storage.
 * The checks mirror darkroom's (`images.load_input`, `images.load_mask`) so a bad file is refused here, before any
 * upload; darkroom still checks everything itself.
 */

export const MAX_INPUT_BYTES = 16 * 1024 * 1024; // decoded, as darkroom counts it
export const MAX_INPUT_EDGE = 4096; // pixels, either side
export const MIN_DENOISE = 0.05;
export const MAX_DENOISE = 1;
export const DEFAULT_DENOISE = 0.5;
/** A grey at or above this repaints, as darkroom cuts the mask. */
export const MASK_THRESHOLD = 128;

export type InputFormat = "png" | "jpeg" | "webp";
const MIME: Record<InputFormat, string> = { png: "image/png", jpeg: "image/jpeg", webp: "image/webp" };

/** The input image: its bytes as base64 for the request, a preview, and its size once upright (as darkroom judges it). */
export interface InputImage {
  /** Which choice of image this is, for keys and effects: cheaper to compare than the pixels. */
  id: number;
  name: string;
  format: InputFormat;
  bytes: number;
  width: number;
  height: number;
  dataBase64: string;
  /** A `data:` URL of the same bytes. Never written anywhere. */
  previewUrl: string;
}

/** The inpainting mask: uploaded, or painted over the preview. White repaints. */
export interface InputMask {
  origin: "upload" | "painted";
  width: number;
  height: number;
  dataBase64: string;
  previewUrl: string;
  /** The share of the image repainted, after the cut at 128. */
  fraction: number;
}

/** PNG, JPEG or WebP by their magic bytes, not by the file name or the type the browser guesses. */
export function sniffFormat(head: Uint8Array): InputFormat | null {
  const at = (offset: number, bytes: number[]) => bytes.every((byte, index) => head[offset + index] === byte);
  if (at(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (at(0, [0xff, 0xd8, 0xff])) return "jpeg";
  if (at(0, [0x52, 0x49, 0x46, 0x46]) && at(8, [0x57, 0x45, 0x42, 0x50])) return "webp";
  return null;
}

/** Why darkroom would refuse the file before decoding it, or null. */
export function fileBlock(bytes: number, format: InputFormat | null, what = "The image"): string | null {
  if (bytes === 0) return `${what} is empty.`;
  if (bytes > MAX_INPUT_BYTES) return `${what} is over ${MAX_INPUT_BYTES / (1024 * 1024)} MiB.`;
  if (!format) return `${what} is not a PNG, JPEG or WebP.`;
  return null;
}

/** Why darkroom would refuse the decoded size, or null. Turning upright swaps the sides, never the longest. */
export function edgeBlock(width: number, height: number, what = "The image"): string | null {
  return Math.max(width, height) > MAX_INPUT_EDGE ? `${what} is ${width}×${height}; an edge may be ${MAX_INPUT_EDGE} at most.` : null;
}

/** The mask must be exactly the upright input's size. */
export function maskSizeBlock(mask: { width: number; height: number }, image: { width: number; height: number }): string | null {
  return mask.width === image.width && mask.height === image.height ? null : `The mask is ${mask.width}×${mask.height} but the input image is ${image.width}×${image.height}: they must match.`;
}

/** The share of pixels darkroom would repaint: greyscale as PIL's `convert("L")` makes it, cut at 128. Alpha is ignored, as there. */
export function maskedFraction(rgba: Uint8ClampedArray): number {
  const pixels = rgba.length / 4;
  if (pixels === 0) return 0;
  let masked = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    if (luma(rgba[i], rgba[i + 1], rgba[i + 2]) >= MASK_THRESHOLD) masked += 1;
  }
  // Never 0 once something is masked, as darkroom rounds it.
  return masked === 0 ? 0 : Math.max(masked / pixels, 1e-6);
}

/** Pillow's RGB to "L" in fixed point (`L24` in Convert.c): ITU-R 601-2 luma, rounded, not truncated. */
export function luma(r: number, g: number, b: number): number {
  return (r * 19595 + g * 38470 + b * 7471 + 0x8000) >> 16;
}

/** Whether any pixel is not fully opaque. A canvas premultiplies alpha, so such a pixel's colour is not the file's. */
export function hasTranslucency(rgba: Uint8ClampedArray): boolean {
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] < 255) return true;
  return false;
}

/** The mask's share as the form words it: "25%", "2.5%", "under 0.1%". */
export function formatShare(fraction: number): string {
  if (fraction > 0 && fraction < 0.001) return "under 0.1%";
  return `${(fraction * 100).toFixed(fraction < 0.1 ? 1 : 0)}%`;
}

export const NOTHING_MASKED = "The mask masks nothing: paint the region to repaint white.";

export function clampDenoise(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_DENOISE;
  return Math.min(MAX_DENOISE, Math.max(MIN_DENOISE, Math.round(value * 100) / 100));
}

// -- in the browser ------------------------------------------------------------------------------------

/** A refusal the form shows as it is. */
export class InputError extends Error {}

function dataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("the file could not be read"));
    reader.readAsDataURL(blob);
  });
}

/** Decoded the way the browser shows it: upright by its EXIF orientation, as darkroom turns it. */
async function decode(blob: Blob, what: string): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(blob, { imageOrientation: "from-image" });
  } catch {
    throw new InputError(`${what} cannot be decoded as PNG, JPEG or WebP.`);
  }
}

async function readChecked(file: Blob, what: string): Promise<{ format: InputFormat; bitmap: ImageBitmap; base64: string; previewUrl: string }> {
  const format = sniffFormat(new Uint8Array(await file.slice(0, 16).arrayBuffer()));
  const block = fileBlock(file.size, format, what);
  if (block || !format) throw new InputError(block ?? `${what} is not a PNG, JPEG or WebP.`);
  const bitmap = await decode(file, what);
  const edge = edgeBlock(bitmap.width, bitmap.height, what);
  if (edge) {
    bitmap.close();
    throw new InputError(edge);
  }
  const url = await dataUrl(file);
  const base64 = url.slice(url.indexOf(",") + 1);
  // The browser's type for the bytes, not the one it guessed from the name.
  return { format, bitmap, base64, previewUrl: `data:${MIME[format]};base64,${base64}` };
}

let chosen = 0;

export async function readInputImage(file: File): Promise<InputImage> {
  const { format, bitmap, base64, previewUrl } = await readChecked(file, "The image");
  chosen += 1;
  const image: InputImage = { id: chosen, name: file.name, format, bytes: file.size, width: bitmap.width, height: bitmap.height, dataBase64: base64, previewUrl };
  bitmap.close();
  return image;
}

function pixels(bitmap: ImageBitmap): Uint8ClampedArray {
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new InputError("This browser cannot read the mask's pixels.");
  context.drawImage(bitmap, 0, 0);
  return context.getImageData(0, 0, bitmap.width, bitmap.height).data;
}

export async function readMask(file: File, image: InputImage): Promise<InputMask> {
  const { bitmap, base64, previewUrl } = await readChecked(file, "The mask");
  try {
    const size = maskSizeBlock(bitmap, image);
    if (size) throw new InputError(size);
    const rgba = pixels(bitmap);
    const fraction = maskedFraction(rgba);
    // Darkroom's greyscale ignores alpha, but a canvas premultiplies it: a transparent white pixel reads back black
    // here. With any translucency the share is only an estimate, so darkroom, not the form, says "masks nothing".
    if (fraction === 0 && !hasTranslucency(rgba)) throw new InputError(NOTHING_MASKED);
    return { origin: "upload", width: bitmap.width, height: bitmap.height, dataBase64: base64, previewUrl, fraction };
  } finally {
    bitmap.close();
  }
}

/** The painted canvas as a PNG mask, or null when nothing is painted. */
export async function maskFromCanvas(canvas: HTMLCanvasElement): Promise<InputMask | null> {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  const fraction = maskedFraction(context.getImageData(0, 0, canvas.width, canvas.height).data);
  if (fraction === 0) return null;
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) return null;
  const url = await dataUrl(blob);
  return { origin: "painted", width: canvas.width, height: canvas.height, dataBase64: url.slice(url.indexOf(",") + 1), previewUrl: url, fraction };
}
