"use client";

import { useEffect, useId, useRef, useState, type PointerEvent } from "react";

import { InputError, maskFromCanvas, readMask, type InputImage, type InputMask } from "@/lib/initImage";

import { Button, Notice } from "./ui";

type Tool = "brush" | "eraser";

const REPAINT = [244, 63, 94]; // what the overlay shows for "repaint here"; the mask itself is black and white

/**
 * The inpainting mask over the input's preview: paint white to repaint, erase back to black, or invert. Two canvases at
 * the input's upright size: the mask darkroom gets (black and white, never shown) and the overlay the user sees (a tint
 * where the mask is white). Uploading a mask file is the keyboard path. Nothing is kept outside this form's memory.
 */
export function MaskPainter({ image, mask, onMask }: { image: InputImage; mask: InputMask | null; onMask: (mask: InputMask | null) => void }) {
  const maskRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<HTMLCanvasElement>(null);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [tool, setTool] = useState<Tool>("brush");
  const longest = Math.max(image.width, image.height);
  const [size, setSize] = useState(() => Math.max(4, Math.round(longest / 20)));
  const [error, setError] = useState<string | null>(null);
  // The mask this painter opened with (the dialog may have been closed and reopened). Read once, by the effect below.
  const [opening] = useState(mask);
  const fileId = useId();

  /** The overlay rebuilt from the mask: tinted where white, clear where black. */
  const redraw = () => {
    const source = maskRef.current?.getContext("2d", { willReadFrequently: true });
    const view = viewRef.current?.getContext("2d");
    if (!source || !view) return;
    const { width, height } = image;
    const pixels = source.getImageData(0, 0, width, height);
    const out = view.createImageData(width, height);
    for (let i = 0; i < pixels.data.length; i += 4) {
      if (pixels.data[i] >= 128) {
        out.data[i] = REPAINT[0];
        out.data[i + 1] = REPAINT[1];
        out.data[i + 2] = REPAINT[2];
        out.data[i + 3] = 255;
      }
    }
    view.putImageData(out, 0, 0);
  };

  const load = (url: string | null) => {
    const context = maskRef.current?.getContext("2d", { willReadFrequently: true });
    if (!context) return;
    context.fillStyle = "#000";
    context.fillRect(0, 0, image.width, image.height);
    if (!url) {
      redraw();
      return;
    }
    const picture = new Image();
    picture.onload = () => {
      context.drawImage(picture, 0, 0, image.width, image.height);
      redraw();
    };
    picture.src = url;
  };

  // Start from the mask the form already holds, or from black. Drawing only: no state is set here.
  useEffect(() => {
    load(opening?.previewUrl ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per image; strokes update the canvas directly
  }, [image.id]);

  const commit = async () => {
    if (maskRef.current) onMask(await maskFromCanvas(maskRef.current));
  };

  const point = (event: PointerEvent<HTMLCanvasElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    return { x: ((event.clientX - box.left) * image.width) / box.width, y: ((event.clientY - box.top) * image.height) / box.height };
  };

  const stroke = (from: { x: number; y: number }, to: { x: number; y: number }) => {
    const colour = tool === "brush" ? "#fff" : "#000";
    const mask = maskRef.current?.getContext("2d");
    const view = viewRef.current?.getContext("2d");
    for (const [context, erase] of [
      [mask, false],
      [view, tool === "eraser"],
    ] as const) {
      if (!context) continue;
      context.save();
      context.lineCap = "round";
      context.lineJoin = "round";
      context.lineWidth = size;
      context.globalCompositeOperation = erase ? "destination-out" : "source-over";
      context.strokeStyle = context === view ? `rgb(${REPAINT.join(",")})` : colour;
      context.beginPath();
      context.moveTo(from.x, from.y);
      context.lineTo(to.x + 0.01, to.y);
      context.stroke();
      context.restore();
    }
  };

  const invert = () => {
    const context = maskRef.current?.getContext("2d", { willReadFrequently: true });
    if (!context) return;
    const pixels = context.getImageData(0, 0, image.width, image.height);
    for (let i = 0; i < pixels.data.length; i += 4) {
      const value = pixels.data[i] >= 128 ? 0 : 255;
      pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = value;
      pixels.data[i + 3] = 255;
    }
    context.putImageData(pixels, 0, 0);
    redraw();
    void commit();
  };

  const clear = () => {
    load(null);
    onMask(null);
  };

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      const read = await readMask(file, image);
      load(read.previewUrl);
      onMask(read);
    } catch (caught) {
      setError(caught instanceof InputError ? caught.message : "The mask could not be read.");
    }
  };

  return (
    <div className="space-y-2">
      <div className="relative overflow-hidden rounded-md border border-base-600/60 bg-base-900">
        {/* eslint-disable-next-line @next/next/no-img-element -- the user's own input, held in memory as a data URL */}
        <img src={image.previewUrl} alt="The input image, under the mask" width={image.width} height={image.height} className="block h-auto w-full select-none" draggable={false} />
        <canvas ref={maskRef} width={image.width} height={image.height} hidden />
        <canvas
          ref={viewRef}
          width={image.width}
          height={image.height}
          aria-label="Mask: paint where the image is repainted"
          className="absolute inset-0 h-full w-full cursor-crosshair touch-none opacity-50"
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            const at = point(event);
            last.current = at;
            stroke(at, at);
          }}
          onPointerMove={(event) => {
            if (!last.current) return;
            const at = point(event);
            stroke(last.current, at);
            last.current = at;
          }}
          onPointerUp={() => {
            if (!last.current) return;
            last.current = null;
            void commit();
          }}
          onPointerCancel={() => {
            last.current = null;
            void commit();
          }}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Mask tools">
        <Button small aria-pressed={tool === "brush"} onClick={() => setTool("brush")} className={tool === "brush" ? "ring-2 ring-accent-primary" : ""}>
          Brush
        </Button>
        <Button small aria-pressed={tool === "eraser"} onClick={() => setTool("eraser")} className={tool === "eraser" ? "ring-2 ring-accent-primary" : ""}>
          Eraser
        </Button>
        <label className="flex items-center gap-1.5 text-caption text-text-muted">
          size
          <input type="range" min={2} max={Math.max(8, Math.round(longest / 4))} value={size} onChange={(event) => setSize(Number(event.target.value))} className="w-24 accent-accent-primary" />
        </label>
        <Button small onClick={invert}>
          Invert
        </Button>
        <Button small onClick={clear} disabled={!mask}>
          Clear
        </Button>
        <label htmlFor={fileId} className="cursor-pointer text-caption text-accent-tertiary underline underline-offset-2">
          Upload a mask instead
        </label>
        <input id={fileId} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(event) => void upload(event.target.files?.[0]).finally(() => (event.target.value = ""))} />
      </div>
      <p className="text-caption text-text-muted">
        {mask ? `Repaints ${formatShare(mask.fraction)} of the image; the rest stays the input's.` : "Paint the region to repaint. With no mask, the whole image is reworked (image-to-image)."} A mask file must be the input&apos;s size, white where it repaints.
      </p>
      {error ? <Notice tone="error">{error}</Notice> : null}
    </div>
  );
}

export function formatShare(fraction: number): string {
  if (fraction > 0 && fraction < 0.001) return "under 0.1%";
  return `${(fraction * 100).toFixed(fraction < 0.1 ? 1 : 0)}%`;
}
