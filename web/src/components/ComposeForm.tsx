"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

import { NSFW_THRESHOLD_MAX, NSFW_THRESHOLD_MIN, SIZES, generateBlock, randomSeed } from "@/lib/compose";
import { THINKING_MODES, type ThinkingMode } from "@/lib/types";

import { useCompose } from "./ComposeProvider";
import { useDarkroom } from "./DarkroomProvider";
import { PolicyPicker } from "./PolicyPicker";
import { Button, Card, SectionTitle, Spinner } from "./ui";

const FIELD = "w-full rounded-md border border-base-600/60 bg-base-900 px-2.5 py-1.5 text-small text-text-primary placeholder:text-text-muted disabled:opacity-60";
const LABEL = "block text-caption uppercase tracking-wide text-text-muted";

function Field({ label, htmlFor, hint, children }: { label: string; htmlFor?: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className={LABEL}>
        {label}
      </label>
      <div className="mt-1">{children}</div>
      {hint ? <p className="mt-1 text-caption text-text-muted">{hint}</p> : null}
    </div>
  );
}

/** The compose form: prompt, models, sampling, policies, thinking mode and the NudeNet blur threshold. */
export function ComposeForm() {
  const { health, policies, models, error } = useDarkroom();
  const { compose, ready, update, check, preflight, start, stop, running } = useCompose();
  const router = useRouter();
  const ollamaDown = health != null && !health.backends.ollama;
  const checking = preflight.state === "checking";
  const block = generateBlock(health, error, compose, policies);

  return (
    <Card as="div" className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <SectionTitle>Compose</SectionTitle>
        {!ready && !error ? <Spinner /> : null}
      </div>

      <Field label="Prompt" htmlFor="prompt">
        <textarea id="prompt" rows={4} value={compose.userPrompt} onChange={(event) => update({ userPrompt: event.target.value })} placeholder="What to generate" className={FIELD} />
      </Field>
      <Field label="Negative prompt" htmlFor="negative" hint="Always part of pre-flight, labelled as what the image must not show.">
        <textarea id="negative" rows={2} value={compose.negativePrompt} onChange={(event) => update({ negativePrompt: event.target.value })} className={FIELD} />
      </Field>
      <div className="flex items-start gap-2">
        <input type="checkbox" id="expand" checked={compose.expand && !ollamaDown} disabled={ollamaDown} onChange={(event) => update({ expand: event.target.checked })} className="mt-1 accent-accent-primary" />
        <label htmlFor="expand" className={`text-small ${ollamaDown ? "text-text-muted" : "text-text-primary"}`}>
          Expand the prompt with Ollama
          <span className="block text-caption text-text-muted">{ollamaDown ? "Disabled: /health reports Ollama unreachable." : "The expanded prompt is shown after Check, and it is the text that gets checked."}</span>
        </label>
      </div>

      <div className="space-y-3">
        <SectionTitle>Models</SectionTitle>
        <Field label="Checkpoint" htmlFor="checkpoint">
          <select id="checkpoint" value={compose.checkpoint} onChange={(event) => update({ checkpoint: event.target.value })} className={FIELD} disabled={!models}>
            {models?.checkpoints.map((checkpoint) => (
              <option key={checkpoint.name} value={checkpoint.name}>
                {checkpoint.name}
              </option>
            ))}
          </select>
        </Field>
        <div>
          <span className={LABEL}>LoRAs</span>
          <ul className="mt-1 space-y-1.5">
            {compose.loras.map((lora, index) => (
              <li key={lora.name} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-mono text-small text-text-primary" title={lora.name}>
                  {lora.name}
                </span>
                <label className="flex items-center gap-1 text-caption text-text-muted">
                  weight
                  <input
                    type="number"
                    step="0.05"
                    min="-2"
                    max="2"
                    value={lora.weight}
                    aria-label={`Weight for ${lora.name}`}
                    onChange={(event) => update((current) => ({ ...current, loras: current.loras.map((entry, i) => (i === index ? { ...entry, weight: Number(event.target.value) } : entry)) }))}
                    className={`${FIELD} w-20`}
                  />
                </label>
                <label className="flex items-center gap-1 text-caption text-text-muted">
                  trigger words
                  <input
                    type="text"
                    value={lora.trigger_words.join(", ")}
                    placeholder="none"
                    aria-label={`Trigger words for ${lora.name}`}
                    onChange={(event) => update((current) => ({ ...current, loras: current.loras.map((entry, i) => (i === index ? { ...entry, trigger_words: event.target.value.split(",").map((word) => word.trim()).filter(Boolean) } : entry)) }))}
                    className={`${FIELD} w-36`}
                  />
                </label>
                <Button small aria-label={`Remove ${lora.name}`} onClick={() => update((current) => ({ ...current, loras: current.loras.filter((_, i) => i !== index) }))}>
                  ×
                </Button>
              </li>
            ))}
          </ul>
          {models && models.loras.some((lora) => !compose.loras.some((chosen) => chosen.name === lora.name)) ? (
            <select
              aria-label="Add a LoRA"
              value=""
              onChange={(event) => {
                const name = event.target.value;
                if (name) update((current) => ({ ...current, loras: [...current.loras, { name, weight: 1, trigger_words: [...(models.loras.find((known) => known.name === name)?.trigger_words ?? [])] }] }));
              }}
              className={`${FIELD} mt-1.5`}
            >
              <option value="">Add a LoRA…</option>
              {models.loras
                .filter((lora) => !compose.loras.some((chosen) => chosen.name === lora.name))
                .map((lora) => (
                  <option key={lora.name} value={lora.name}>
                    {lora.name}
                  </option>
                ))}
            </select>
          ) : null}
          <p className="mt-1 text-caption text-text-muted">The trigger words you enter are appended to the final prompt by darkroom, after any expansion. They are checked with it.</p>
        </div>
      </div>

      <div className="space-y-3">
        <SectionTitle>Sampling</SectionTitle>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Sampler" htmlFor="sampler">
            <select id="sampler" value={compose.sampling.sampler} onChange={(event) => update((c) => ({ ...c, sampling: { ...c.sampling, sampler: event.target.value } }))} className={FIELD} disabled={!models}>
              {(models?.samplers ?? [compose.sampling.sampler]).map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          </Field>
          <Field label="Scheduler" htmlFor="scheduler">
            <select id="scheduler" value={compose.sampling.scheduler} onChange={(event) => update((c) => ({ ...c, sampling: { ...c.sampling, scheduler: event.target.value } }))} className={FIELD} disabled={!models}>
              {(models?.schedulers ?? [compose.sampling.scheduler]).map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          </Field>
          <Field label="Steps" htmlFor="steps">
            <input id="steps" type="number" min={1} max={150} value={compose.sampling.steps} onChange={(event) => update((c) => ({ ...c, sampling: { ...c.sampling, steps: Math.max(1, Math.floor(Number(event.target.value) || 1)) } }))} className={FIELD} />
          </Field>
          <Field label="CFG" htmlFor="cfg">
            <input id="cfg" type="number" min={0} max={30} step={0.5} value={compose.sampling.cfg} onChange={(event) => update((c) => ({ ...c, sampling: { ...c.sampling, cfg: Number(event.target.value) } }))} className={FIELD} />
          </Field>
          <Field label="Width" htmlFor="width">
            <select id="width" value={compose.sampling.width} onChange={(event) => update((c) => ({ ...c, sampling: { ...c.sampling, width: Number(event.target.value) } }))} className={FIELD}>
              {sizeOptions(compose.sampling.width)}
            </select>
          </Field>
          <Field label="Height" htmlFor="height">
            <select id="height" value={compose.sampling.height} onChange={(event) => update((c) => ({ ...c, sampling: { ...c.sampling, height: Number(event.target.value) } }))} className={FIELD}>
              {sizeOptions(compose.sampling.height)}
            </select>
          </Field>
        </div>
        <Field label="Seed" htmlFor="seed" hint={compose.seedLocked ? "Held: the same seed is sent each time." : "Random: darkroom picks one and the record keeps it."}>
          <div className="flex items-center gap-2">
            <input
              id="seed"
              type="number"
              min={0}
              step={1}
              value={compose.seedLocked ? (compose.seed ?? "") : ""}
              placeholder="random"
              disabled={!compose.seedLocked}
              onChange={(event) => update({ seed: event.target.value === "" ? null : Math.max(0, Math.floor(Number(event.target.value))) })}
              className={FIELD}
            />
            <Button small aria-pressed={compose.seedLocked} onClick={() => update((c) => ({ ...c, seedLocked: !c.seedLocked, seed: c.seedLocked ? c.seed : (c.seed ?? randomSeed()) }))} title={compose.seedLocked ? "Unlock: let darkroom pick a seed" : "Lock: hold this seed"}>
              {compose.seedLocked ? "Locked" : "Lock"}
            </Button>
          </div>
        </Field>
      </div>

      <div className="space-y-3">
        <SectionTitle>Policies</SectionTitle>
        <PolicyPicker policies={policies} enforcing={compose.enforcingPolicy} advisory={compose.advisoryPolicies} onEnforcing={(name) => update((c) => ({ ...c, enforcingPolicy: name, advisoryPolicies: c.advisoryPolicies.filter((entry) => entry !== name) }))} onAdvisory={(names) => update({ advisoryPolicies: names })} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Thinking mode" htmlFor="thinking" hint="fast is a verdict and rule; the others also write why. cascade runs fast, then slow on what fast flags.">
          <select id="thinking" value={compose.thinking} onChange={(event) => update({ thinking: event.target.value as ThinkingMode })} className={FIELD}>
            {THINKING_MODES.map((mode) => (
              <option key={mode}>{mode}</option>
            ))}
          </select>
        </Field>
        <Field label="NudeNet blur threshold" htmlFor="threshold" hint="Under an NSFW policy, an exposed score at or above this blurs the image until revealed. It changes the request, not a verdict.">
          <input id="threshold" type="number" min={NSFW_THRESHOLD_MIN} max={NSFW_THRESHOLD_MAX} step={0.05} value={compose.nsfwThreshold} onChange={(event) => update({ nsfwThreshold: Math.min(NSFW_THRESHOLD_MAX, Math.max(NSFW_THRESHOLD_MIN, Number(event.target.value))) })} className={FIELD} />
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-base-600/40 pt-4">
        <Button
          onClick={async () => {
            router.push("/");
            await check();
          }}
          disabled={!ready || checking || running || !compose.userPrompt.trim()}
          title={!compose.userPrompt.trim() ? "Write a prompt first." : "POST /preflight: the text-only check, before anything is generated"}
        >
          {checking ? <Spinner /> : null}
          Check
        </Button>
        {running ? (
          <Button tone="danger" onClick={stop} title="Close the stream. Darkroom finishes on its own and keeps the record.">
            Stop
          </Button>
        ) : (
          <Button tone="primary" onClick={start} disabled={!ready || block != null} title={block ?? "POST /generate/stream: pre-flight, then render, then the scans"}>
            Generate
          </Button>
        )}
        {block && ready && !running ? <p className="basis-full text-caption text-text-muted">{block}</p> : null}
      </div>
    </Card>
  );
}

function sizeOptions(current: number) {
  const values = SIZES.includes(current as (typeof SIZES)[number]) ? [...SIZES] : [current, ...SIZES].sort((a, b) => a - b);
  return values.map((value) => (
    <option key={value} value={value}>
      {value}
    </option>
  ));
}
