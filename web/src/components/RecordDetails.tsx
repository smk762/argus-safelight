import { formatShare } from "@/lib/initImage";
import { OUTCOME_TONE } from "@/lib/outcome";
import { inputGuard } from "@/lib/shields";
import type { GenerationRecord, NudeNetBlock } from "@/lib/types";

import { AgeEstimate } from "./AgeEstimate";
import { ShieldGrid } from "./ShieldGrid";
import { Badge, Collapsible, Kv } from "./ui";

const short = (sha: string) => `${sha.slice(0, 12)}…`;

/** NudeNet's reading as darkroom recorded it: the output's, or with `block`, the input image's. */
export function NudeNetLine({ record, block: given }: { record: GenerationRecord; block?: NudeNetBlock | null }) {
  const block = given === undefined ? record.guard.nudenet : given;
  if (!block) return <p className="text-small text-text-muted">{record.outcome === "refused" || record.outcome === "failed" ? "NudeNet did not run." : "NudeNet did not respond."}</p>;
  const labels = Object.entries(block.labels);
  return (
    <div className="text-small">
      {block.exposed_score == null ? (
        <p className="text-text-primary">NudeNet did not respond{given === undefined && block.blur ? "; the image is blurred" : ""}.</p>
      ) : (
        <p className="text-text-primary">
          NudeNet exposed score <span className="font-mono">{block.exposed_score.toFixed(2)}</span> against a threshold of <span className="font-mono">{block.threshold.toFixed(2)}</span>
          {given === undefined && record.request.mode === "nsfw" ? (block.blur ? "; blurred until revealed." : "; not blurred.") : "."}
        </p>
      )}
      {labels.length > 0 ? (
        <p className="mt-0.5 text-caption text-text-muted">
          {labels.map(([label, score]) => `${label.toLowerCase().replaceAll("_", " ")} ${score.toFixed(2)}`).join(" · ")}
        </p>
      ) : null}
    </div>
  );
}

export function PromptsCard({ record }: { record: GenerationRecord }) {
  const { request } = record;
  return (
    <Collapsible title="Prompts">
      <dl className="space-y-3 text-small">
        <div>
          <dt className="text-caption uppercase tracking-wide text-text-muted">User prompt</dt>
          <dd className="mt-0.5 whitespace-pre-wrap text-text-primary">{request.user_prompt || <span className="text-text-muted">(empty)</span>}</dd>
        </div>
        {request.expanded_prompt != null ? (
          <div>
            <dt className="text-caption uppercase tracking-wide text-text-muted">Ollama expansion{request.expansion ? ` (${request.expansion.model})` : ""}</dt>
            <dd className="mt-0.5 whitespace-pre-wrap text-text-primary">{request.expanded_prompt}</dd>
          </div>
        ) : null}
        <div>
          <dt className="text-caption uppercase tracking-wide text-text-muted">Final prompt (the text every check judged)</dt>
          <dd className="mt-0.5 whitespace-pre-wrap text-text-primary">{request.final_prompt}</dd>
        </div>
        <div>
          <dt className="text-caption uppercase tracking-wide text-text-muted">Negative prompt</dt>
          <dd className="mt-0.5 whitespace-pre-wrap text-text-primary">{request.negative_prompt || <span className="text-text-muted">(empty)</span>}</dd>
        </div>
      </dl>
    </Collapsible>
  );
}

export function ParametersCard({ record }: { record: GenerationRecord }) {
  const { request, image } = record;
  const s = request.sampling;
  return (
    <Collapsible title="Parameters">
      <dl className="divide-y divide-base-600/40">
        {request.seed != null ? (
          <Kv label="Seed">
            <span className="font-mono">{request.seed}</span>
          </Kv>
        ) : null}
        {s ? (
          <>
            <Kv label="Sampler">
              <span className="font-mono">
                {s.sampler} / {s.scheduler}
              </span>
            </Kv>
            <Kv label="Steps · CFG · clip skip">
              <span className="font-mono">
                {s.steps} · {s.cfg} · {s.clip_skip}
              </span>
            </Kv>
            {s.guidance != null ? (
              <Kv label="Guidance">
                <span className="font-mono">{s.guidance}</span>
              </Kv>
            ) : null}
            <Kv label="Size">
              <span className="font-mono">
                {s.width} × {s.height}
              </span>
            </Kv>
          </>
        ) : null}
        <Kv label="Checkpoint" title={request.checkpoint?.sha256}>
          {request.checkpoint ? <span className="font-mono">{request.checkpoint.name}</span> : <span className="text-text-muted">not resolved</span>}
        </Kv>
        {request.vae ? (
          <Kv label="VAE" title={request.vae.sha256}>
            <span className="font-mono">{request.vae.name}</span>
          </Kv>
        ) : null}
        <Kv label="LoRAs">
          {request.loras.length === 0 ? (
            <span className="text-text-muted">none</span>
          ) : (
            <ul className="space-y-0.5">
              {request.loras.map((lora) => (
                <li key={lora.name} title={lora.sha256} className="font-mono">
                  {lora.name} @ {lora.weight}
                </li>
              ))}
            </ul>
          )}
        </Kv>
        {request.engine_version != null ? (
          <Kv label="Engine">
            <span className="font-mono">
              {request.engine} {request.engine_version}
            </span>
          </Kv>
        ) : null}
        {request.workflow_sha256 != null ? (
          <Kv label="Workflow" title={request.workflow_sha256}>
            <span className="font-mono">{request.workflow ? `${request.workflow} · ${short(request.workflow_sha256)}` : short(request.workflow_sha256)}</span>
          </Kv>
        ) : null}
        <Kv label="Thinking">
          <span className="font-mono">{record.guard.thinking}</span>
        </Kv>
        {image ? (
          <>
            <Kv label="Image sha256" title={image.sha256}>
              <span className="font-mono">{short(image.sha256)}</span>
            </Kv>
            <Kv label="pHash">
              <span className="font-mono">{image.phash}</span>
            </Kv>
          </>
        ) : null}
        <Kv label="Darkroom">
          <span className="font-mono">
            {record.darkroom_version} · record {record.record_version}
          </span>
        </Kv>
      </dl>
    </Collapsible>
  );
}

export function ChecksCard({ record }: { record: GenerationRecord }) {
  return (
    <Collapsible title="NudeNet and age estimate">
      <div className="space-y-3">
        <NudeNetLine record={record} />
        <AgeEstimate age={record.guard.age} />
      </div>
    </Collapsible>
  );
}

/**
 * The image-to-image input: what darkroom recorded of it (size, denoise, hashes, the mask's share) and its own scan.
 * Darkroom never stores the input's pixels, so there is nothing to show of the picture itself.
 */
export function InputImageCard({ record }: { record: GenerationRecord }) {
  const init = record.request.init_image;
  const input = record.guard.input;
  const inputScans = inputGuard(record);
  if (!init) return null;
  return (
    <Collapsible title={init.mask ? "Input image and mask" : "Input image"} defaultOpen={input != null && input.outcome !== "passed"}>
      <p className="text-caption text-text-muted">Darkroom never stores the input&apos;s pixels, so the record has no picture of it: only its hashes, size and scan.</p>
      <dl className="mt-2 divide-y divide-base-600/40">
        <Kv label="Size (upright)">
          <span className="font-mono">
            {init.width} × {init.height}
          </span>
        </Kv>
        <Kv label="Denoise">
          <span className="font-mono">{init.denoise}</span>
        </Kv>
        <Kv label="sha256 (as rendered)" title={init.sha256}>
          <span className="font-mono">{short(init.sha256)}</span>
        </Kv>
        <Kv label="sha256 (as sent)" title={init.source_sha256}>
          <span className="font-mono">{short(init.source_sha256)}</span>
        </Kv>
        <Kv label="pHash">
          <span className="font-mono">{init.phash}</span>
        </Kv>
        {init.mask ? (
          <>
            <Kv label="Mask repaints">
              <span className="font-mono">{formatShare(init.mask.masked_fraction)}</span>
            </Kv>
            <Kv label="Mask sha256" title={`as rendered ${init.mask.sha256}, as sent ${init.mask.source_sha256}`}>
              <span className="font-mono">{short(init.mask.sha256)}</span>
            </Kv>
          </>
        ) : null}
      </dl>
      {input && inputScans ? (
        <div className="mt-3 space-y-3 border-t border-base-600/40 pt-3">
          <p className="flex flex-wrap items-center gap-2 text-small text-text-primary">
            Input scan <Badge className={OUTCOME_TONE[input.outcome]}>{input.outcome}</Badge>
            {input.reason ? <span className="font-mono text-caption text-text-secondary">{input.reason}</span> : null}
          </p>
          <ShieldGrid guard={inputScans} />
          <NudeNetLine record={record} block={input.nudenet} />
          <AgeEstimate age={input.age} />
          {init.mask ? <p className="text-caption text-text-muted">The mask was not scanned: it selects a region and carries no imagery. The output is scanned as usual.</p> : null}
        </div>
      ) : (
        <p className="mt-3 text-caption text-text-muted">The input was not scanned: pre-flight refused the prompt first.</p>
      )}
    </Collapsible>
  );
}

export function RecordJson({ record }: { record: GenerationRecord }) {
  return (
    <details className="rounded-lg border border-base-600/60 bg-base-800">
      <summary className="cursor-pointer px-4 py-3 text-small font-medium text-text-secondary hover:text-text-primary">Full record (JSON)</summary>
      <pre className="max-h-[480px] overflow-auto border-t border-base-600/40 p-4 text-caption leading-relaxed text-text-secondary">{JSON.stringify(record, null, 2)}</pre>
    </details>
  );
}
