"use client";

import { useId, useState, type DragEvent } from "react";

import type { ComposeState } from "@/lib/compose";
import { InputError, MAX_DENOISE, MAX_INPUT_BYTES, MAX_INPUT_EDGE, MIN_DENOISE, clampDenoise, formatShare, readInputImage } from "@/lib/initImage";
import type { Models } from "@/lib/types";
import { modeBlock } from "@/lib/workflows";

import { MaskPainter } from "./MaskPainter";
import { Button, Notice, SectionTitle } from "./ui";

const short = (sha: string) => `${sha.slice(0, 12)}…`;

/**
 * The image-to-image input: a file picker that is also a drop target, the preview, the denoise, and the inpainting
 * mask. Offered only where `/models` says the checkpoint has a template for it at this LoRA count, and why not when it
 * does not. The pixels stay in this form's memory; darkroom checks the input again and keeps only its hashes.
 */
export function InputImageField({ compose, models, update }: { compose: ComposeState; models: Models | null; update: (patch: Partial<ComposeState> | ((current: ComposeState) => ComposeState)) => void }) {
  const fileId = useId();
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [over, setOver] = useState(false);
  const { initImage: image, mask } = compose;
  const img2img = modeBlock(models, compose.checkpoint, compose.loras.length, "img2img");
  const inpaint = modeBlock(models, compose.checkpoint, compose.loras.length, "inpaint");
  // A chosen image stays while the checkpoint changes; Generate then says why it cannot run. Before one is chosen, the
  // picker is off where no template could render it.
  const closed = !image && img2img != null && inpaint != null;

  const choose = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setReading(true);
    try {
      const read = await readInputImage(file);
      // A new image never keeps the old mask: it was painted for another picture, and its size may differ.
      update((current) => ({ ...current, initImage: read, mask: null, recordInput: null }));
    } catch (caught) {
      setError(caught instanceof InputError ? caught.message : "The image could not be read.");
    } finally {
      setReading(false);
    }
  };

  const drop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setOver(false);
    if (!closed && !reading) void choose(event.dataTransfer.files[0]);
  };

  return (
    <div className="space-y-3">
      <SectionTitle>Input image</SectionTitle>
      {compose.recordInput && !image ? (
        <Notice tone="warning">
          <>
            This record was made from a {compose.recordInput.width}×{compose.recordInput.height} input image (sha256 <span className="font-mono">{short(compose.recordInput.source_sha256)}</span>
            {compose.recordInput.mask ? ", with a mask" : ""}). Darkroom keeps no input pixels, so choose the image again{compose.recordInput.mask ? " and paint or upload the mask" : ""}.
          </>
          <div className="mt-2">
            <Button small onClick={() => update({ recordInput: null })}>
              Go on from text
            </Button>
          </div>
        </Notice>
      ) : null}

      {image ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-caption text-text-muted">
            <span className="min-w-0 truncate font-mono text-text-primary" title={image.name}>
              {image.name}
            </span>
            <span>
              {image.width}×{image.height} · {image.format.toUpperCase()} · {formatBytes(image.bytes)}
            </span>
            <Button small className="ml-auto" onClick={() => update({ initImage: null, mask: null })}>
              Remove image
            </Button>
          </div>
          {inpaint ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element -- the user's own input, held in memory as a data URL */}
              <img src={image.previewUrl} alt="The input image" width={image.width} height={image.height} className="block h-auto max-h-80 w-full rounded-md border border-base-600/60 object-contain" />
              <p className="text-caption text-text-muted">No mask: {inpaint.replace(/\.$/, "")}.</p>
              {mask ? (
                <Notice tone="warning">
                  The mask ({formatShare(mask.fraction)}) cannot be used here.{" "}
                  <Button small onClick={() => update({ mask: null })}>
                    Remove the mask
                  </Button>
                </Notice>
              ) : null}
            </>
          ) : (
            <MaskPainter key={image.id} image={image} mask={mask} onMask={(next) => update({ mask: next })} />
          )}
          <label className="block">
            <span className="block text-caption uppercase tracking-wide text-text-muted">Denoise</span>
            <span className="mt-1 flex items-center gap-3">
              <input
                type="range"
                min={MIN_DENOISE}
                max={MAX_DENOISE}
                step={0.05}
                value={compose.denoise}
                onChange={(event) => update({ denoise: clampDenoise(Number(event.target.value)) })}
                className="flex-1 accent-accent-primary"
                aria-describedby={`${fileId}-denoise`}
              />
              <output className="w-10 text-right font-mono text-small text-text-primary">{compose.denoise.toFixed(2)}</output>
            </span>
            <span id={`${fileId}-denoise`} className="mt-1 block text-caption text-text-muted">
              How much the sampler replaces: near {MIN_DENOISE} keeps the input, 1 ignores it.{mask ? " Inpainting usually wants a high value." : ""} The input is scaled and centre-cropped to the width and height under Sampling.
            </span>
          </label>
        </div>
      ) : (
        <>
          <label
            htmlFor={fileId}
            onDragOver={(event) => {
              event.preventDefault();
              if (!closed) setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={drop}
            className={`flex flex-col items-center justify-center gap-1 rounded-md border border-dashed px-4 py-5 text-center text-small transition-colors ${
              closed ? "cursor-not-allowed border-base-600/60 text-text-muted" : over ? "cursor-copy border-accent-primary bg-accent-primary/10 text-text-primary" : "cursor-pointer border-base-600 text-text-secondary hover:border-accent-primary/60"
            }`}
          >
            <span>{reading ? "Reading…" : "Choose or drop an image to start from"}</span>
            <span className="text-caption text-text-muted">
              PNG, JPEG or WebP, up to {MAX_INPUT_BYTES / (1024 * 1024)} MiB and {MAX_INPUT_EDGE} px a side. Checked like an output before anything renders.
            </span>
          </label>
          <input id={fileId} type="file" accept="image/png,image/jpeg,image/webp" disabled={closed || reading} className="sr-only" onChange={(event) => void choose(event.target.files?.[0]).finally(() => (event.target.value = ""))} />
          {closed ? <p className="text-caption text-text-muted">{img2img}</p> : null}
        </>
      )}
      {error ? <Notice tone="error">{error}</Notice> : null}
    </div>
  );
}

function formatBytes(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KiB` : `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}
