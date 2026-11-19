// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { InputImage, InputMask } from "@/lib/initImage";

import { MaskPainter } from "./MaskPainter";

const image: InputImage = { id: 1, name: "in.png", format: "png", bytes: 10, width: 4, height: 4, dataBase64: "", previewUrl: "data:image/png;base64," };
const mask: InputMask = { origin: "upload", width: 4, height: 4, dataBase64: "", previewUrl: "data:image/png;base64,mask", fraction: 0.5 };

const drawImage = vi.fn();
const pictures: { onload: (() => void) | null }[] = [];

beforeEach(() => {
  const context = {
    fillRect: vi.fn(),
    drawImage,
    getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    putImageData: vi.fn(),
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as unknown as CanvasRenderingContext2D);
  vi.stubGlobal(
    "Image",
    class {
      onload: (() => void) | null = null;
      src = "";
      constructor() {
        pictures.push(this);
      }
    },
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  drawImage.mockReset();
  pictures.length = 0;
});

describe("the mask painter", () => {
  it("does not paint the opening mask back after a Clear made while it decoded", () => {
    render(<MaskPainter image={image} mask={mask} onMask={vi.fn()} />);
    expect(pictures).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    pictures[0].onload?.();
    expect(drawImage).not.toHaveBeenCalled();
  });

  it("paints the opening mask when nothing changed while it decoded", () => {
    render(<MaskPainter image={image} mask={mask} onMask={vi.fn()} />);
    pictures[0].onload?.();
    expect(drawImage).toHaveBeenCalledTimes(1);
  });
});
