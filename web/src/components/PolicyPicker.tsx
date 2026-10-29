"use client";

import { useRef, useState } from "react";

import { enforceBlock, policyByName } from "@/lib/compose";
import type { Policies, PolicyInfo } from "@/lib/types";

import { Badge, Button, Notice } from "./ui";

export function ModeBadge({ mode }: { mode: "sfw" | "nsfw" }) {
  return <Badge className={mode === "nsfw" ? "border-warm-primary/60 text-warm-primary" : "border-base-600 text-text-secondary"}>{mode}</Badge>;
}

/**
 * One enforcing policy (radio) and any number of advisory ones (checkboxes).
 * The SFW/NSFW badge and the wording come from `GET /policies`, never from the
 * name in the browser. A policy the server cannot enforce is offered as
 * advisory only, with the reason.
 */
export function PolicyPicker({
  policies,
  enforcing,
  advisory,
  onEnforcing,
  onAdvisory,
}: {
  policies: Policies | null;
  enforcing: string;
  advisory: string[];
  onEnforcing: (name: string) => void;
  onAdvisory: (names: string[]) => void;
}) {
  const [wording, setWording] = useState<PolicyInfo | null>(null);
  if (!policies) return <p className="text-small text-text-muted">Loading policies…</p>;
  const own = policyByName(policies, enforcing);
  return (
    <div className="space-y-3">
      <fieldset>
        <legend className="text-caption uppercase tracking-wide text-text-muted">Enforcing policy</legend>
        <p className="mb-1.5 text-caption text-text-muted">Its verdict decides pre-flight and its name sets the mode. Server default: <span className="font-mono">{policies.default}</span>.</p>
        <ul className="space-y-1">
          {policies.policies.map((policy) => {
            const block = enforceBlock(policy);
            const checked = policy.name === enforcing;
            return (
              <li key={policy.name} className="flex items-start gap-2">
                <input
                  type="radio"
                  name="enforcing-policy"
                  id={`enforcing-${policy.name}`}
                  value={policy.name}
                  checked={checked}
                  disabled={block != null}
                  onChange={() => onEnforcing(policy.name)}
                  className="mt-1 accent-accent-primary"
                  title={block ?? undefined}
                />
                <label htmlFor={`enforcing-${policy.name}`} className={`flex flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-small ${block ? "text-text-muted" : "text-text-primary"}`} title={block ?? policy.summary}>
                  <span className="font-mono">{policy.name}</span>
                  <ModeBadge mode={policy.mode} />
                  {block ? <span className="text-caption">advisory only</span> : null}
                  <button type="button" onClick={() => setWording(policy)} className="text-caption text-accent-tertiary underline-offset-2 hover:underline">
                    wording
                  </button>
                </label>
              </li>
            );
          })}
        </ul>
      </fieldset>
      {own?.mode === "nsfw" ? (
        <Notice tone="warning">
          <span className="font-mono">{own.name}</span> is an NSFW policy. Non-illegal pre-flight flags warn instead of blocking, and NudeNet exposure blurs the image instead of withholding it. Illegal content is still refused at pre-flight and deleted after
          generation.
        </Notice>
      ) : null}
      <fieldset>
        <legend className="text-caption uppercase tracking-wide text-text-muted">Advisory policies</legend>
        <p className="mb-1.5 text-caption text-text-muted">Run for comparison. They never block or release an image, except that an illegal rule under any policy still deletes.</p>
        <ul className="space-y-1">
          {policies.policies
            .filter((policy) => policy.name !== enforcing)
            .map((policy) => {
              const checked = advisory.includes(policy.name);
              return (
                <li key={policy.name} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id={`advisory-${policy.name}`}
                    checked={checked}
                    onChange={(event) => onAdvisory(event.target.checked ? [...advisory, policy.name] : advisory.filter((name) => name !== policy.name))}
                    className="accent-accent-primary"
                  />
                  <label htmlFor={`advisory-${policy.name}`} className="flex flex-1 flex-wrap items-center gap-x-2 text-small text-text-primary" title={policy.summary}>
                    <span className="font-mono">{policy.name}</span>
                    <ModeBadge mode={policy.mode} />
                  </label>
                </li>
              );
            })}
        </ul>
      </fieldset>
      {wording ? <PolicyDialog policy={wording} onClose={() => setWording(null)} /> : null}
    </div>
  );
}

/** The policy's text and its illegal rules, as `GET /policies` serves them. */
export function PolicyDialog({ policy, onClose }: { policy: PolicyInfo; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <dialog
      ref={(node) => {
        ref.current = node;
        if (node && !node.open) node.showModal();
      }}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      className="m-auto w-[min(720px,92vw)] rounded-lg border border-base-600 bg-base-800 p-0 text-text-primary shadow-soft backdrop:bg-base-900/70"
    >
      <div className="flex items-center justify-between gap-3 border-b border-base-600/60 px-5 py-3">
        <h2 className="font-display text-subheading font-semibold">
          <span className="font-mono">{policy.name}</span> <ModeBadge mode={policy.mode} />
        </h2>
        <Button small onClick={onClose}>
          Close
        </Button>
      </div>
      <div className="max-h-[70vh] space-y-4 overflow-auto px-5 py-4 text-small">
        <p className="text-text-secondary">{policy.summary}</p>
        <div>
          <h3 className="text-caption uppercase tracking-wide text-text-muted">Illegal rules (delete)</h3>
          {policy.illegal_rules.length === 0 ? (
            <p className="mt-1 text-text-secondary">None. Under this policy every flag sends the image to review; nothing is deleted on its account.</p>
          ) : (
            <ul className="mt-1 space-y-0.5">
              {policy.illegal_rules.map((rule) => (
                <li key={rule.code}>
                  <span className="font-mono font-semibold text-error">{rule.code}</span> {rule.name}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-1 text-caption text-text-muted">Every other rule means review. The table lives in argus-cortex beside the text, so they cannot drift apart.</p>
        </div>
        <div>
          <h3 className="text-caption uppercase tracking-wide text-text-muted">Wording sent to SingGuard</h3>
          {policy.text ? <pre className="mt-1 whitespace-pre-wrap rounded-md bg-base-900 p-3 font-mono text-caption leading-relaxed text-text-secondary">{policy.text}</pre> : <p className="mt-1 text-text-secondary">Nothing is sent: SingGuard judges by its own built-in rules.</p>}
        </div>
      </div>
    </dialog>
  );
}
