import { describe, expect, it } from "vitest";

import { DEFAULT_DENOISE, MAX_INPUT_BYTES, clampDenoise, edgeBlock, fileBlock, formatShare, hasTranslucency, luma, maskSizeBlock, maskedFraction, sniffFormat } from "./initImage";

const bytes = (...values: number[]) => new Uint8Array([...values, ...new Array(16).fill(0)]);

describe("the input image, checked as darkroom checks it", () => {
  it("knows PNG, JPEG and WebP by their bytes, not their names", () => {
    expect(sniffFormat(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("png");
    expect(sniffFormat(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("jpeg");
    expect(sniffFormat(bytes(0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50))).toBe("webp");
    expect(sniffFormat(bytes(0x47, 0x49, 0x46, 0x38))).toBeNull(); // GIF
    expect(sniffFormat(bytes(0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x41, 0x56, 0x49, 0x20))).toBeNull(); // AVI in RIFF
  });

  it("refuses an empty file, one over 16 MiB, and anything else", () => {
    expect(fileBlock(0, "png")).toContain("empty");
    expect(fileBlock(MAX_INPUT_BYTES, "png")).toBeNull();
    expect(fileBlock(MAX_INPUT_BYTES + 1, "png")).toContain("16 MiB");
    expect(fileBlock(1000, null)).toContain("not a PNG, JPEG or WebP");
  });

  it("allows 4096 px a side and no more", () => {
    expect(edgeBlock(4096, 2048)).toBeNull();
    expect(edgeBlock(2048, 4097)).toContain("4096");
  });

  it("wants the mask at the input's upright size", () => {
    expect(maskSizeBlock({ width: 512, height: 768 }, { width: 512, height: 768 })).toBeNull();
    expect(maskSizeBlock({ width: 768, height: 512 }, { width: 512, height: 768 })).toBe("The mask is 768×512 but the input image is 512×768: they must match.");
  });

  it("measures the mask as darkroom cuts it: greyscale at 128, alpha ignored", () => {
    const pixel = (r: number, g: number, b: number, a = 255) => [r, g, b, a];
    const rgba = new Uint8ClampedArray([...pixel(255, 255, 255), ...pixel(0, 0, 0), ...pixel(128, 128, 128), ...pixel(255, 0, 0, 0)]);
    // White and mid-grey repaint; black does not; pure red is grey 76, kept even though transparent.
    expect(maskedFraction(rgba)).toBe(0.5);
    expect(maskedFraction(new Uint8ClampedArray([...pixel(127, 127, 127)]))).toBe(0);
  });

  it("rounds greyscale as Pillow's convert(\"L\") does, not truncating", () => {
    // 0.299·0 + 0.587·218 + 0.114·0 = 127.97: Pillow rounds to 128 and repaints it.
    expect(luma(0, 218, 0)).toBe(128);
    expect(maskedFraction(new Uint8ClampedArray([0, 218, 0, 255]))).toBe(1);
    expect(luma(255, 255, 255)).toBe(255);
    expect(luma(0, 0, 0)).toBe(0);
  });

  it("notices translucency, which a canvas reads back premultiplied", () => {
    expect(hasTranslucency(new Uint8ClampedArray([255, 255, 255, 255]))).toBe(false);
    expect(hasTranslucency(new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 0]))).toBe(true);
  });

  it("words the mask's share", () => {
    expect(formatShare(0.25)).toBe("25%");
    expect(formatShare(0.025)).toBe("2.5%");
    expect(formatShare(0.0001)).toBe("under 0.1%");
  });

  it("never rounds a masked region down to nothing", () => {
    const rgba = new Uint8ClampedArray(4 * 2_000_000);
    rgba.set([255, 255, 255, 255], 0);
    expect(maskedFraction(rgba)).toBeGreaterThan(0);
  });

  it("keeps denoise within darkroom's 0.05 to 1", () => {
    expect(clampDenoise(0)).toBe(0.05);
    expect(clampDenoise(1.4)).toBe(1);
    expect(clampDenoise(0.333)).toBe(0.33);
    expect(clampDenoise(Number.NaN)).toBe(DEFAULT_DENOISE);
  });
});
