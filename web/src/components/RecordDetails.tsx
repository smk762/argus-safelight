import type { GenerationRecord } from "@/lib/types";

import { AgeEstimate } from "./AgeEstimate";
import { Card, Kv, SectionTitle } from "./ui";

const short = (sha: string) => `${sha.slice(0, 12)}…`;

/** NudeNet's reading as darkroom recorded it. */
export function NudeNetLine({ record }: { record: GenerationRecord }) {
  const block = record.guard.nudenet;
  if (!block) return <p className="text-small text-text-muted">{record.outcome === "refused" || record.outcome === "failed" ? "NudeNet did not run." : "NudeNet did not respond."}</p>;
  const labels = Object.entries(block.labels);
  return (
    <div className="text-small">
      {block.exposed_score == null ? (
        <p className="text-text-primary">NudeNet did not respond{block.blur ? "; the image is blurred" : ""}.</p>
      ) : (
        <p className="text-text-primary">
          NudeNet exposed score <span className="font-mono">{block.exposed_score.toFixed(2)}</span> against a threshold of <span className="font-mono">{block.threshold.toFixed(2)}</span>
          {record.request.mode === "nsfw" ? (block.blur ? "; blurred until revealed." : "; not blurred.") : "."}
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
    <Card>
      <SectionTitle>Prompts</SectionTitle>
      <dl className="mt-2 space-y-3 text-small">
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
    </Card>
  );
}

export function ParametersCard({ record }: { record: GenerationRecord }) {
  const { request, image } = record;
  const s = request.sampling;
  return (
    <Card>
      <SectionTitle>Parameters</SectionTitle>
      <dl className="mt-1 divide-y divide-base-600/40">
        <Kv label="Seed">
          <span className="font-mono">{request.seed}</span>
        </Kv>
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
        <Kv label="Size">
          <span className="font-mono">
            {s.width} × {s.height}
          </span>
        </Kv>
        <Kv label="Checkpoint" title={request.checkpoint.sha256}>
          <span className="font-mono">{request.checkpoint.name}</span>
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
        <Kv label="Engine">
          <span className="font-mono">
            {request.engine} {request.engine_version}
          </span>
        </Kv>
        <Kv label="Workflow" title={request.workflow_sha256}>
          <span className="font-mono">{short(request.workflow_sha256)}</span>
        </Kv>
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
    </Card>
  );
}

export function ChecksCard({ record }: { record: GenerationRecord }) {
  return (
    <Card>
      <SectionTitle>NudeNet and age estimate</SectionTitle>
      <div className="mt-2 space-y-3">
        <NudeNetLine record={record} />
        <AgeEstimate age={record.guard.age} />
      </div>
    </Card>
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
