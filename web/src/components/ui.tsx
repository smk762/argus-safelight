import type { ButtonHTMLAttributes, ReactNode } from "react";

type Tone = "primary" | "neutral" | "danger";

const BUTTON_TONE: Record<Tone, string> = {
  primary: "bg-interactive text-white hover:bg-interactive-hover disabled:hover:bg-interactive",
  neutral: "bg-base-700 text-text-primary hover:bg-base-600 disabled:hover:bg-base-700",
  danger: "bg-error/15 text-error border border-error/40 hover:bg-error/25 disabled:hover:bg-error/15",
};

export function Button({ tone = "neutral", small = false, className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone; small?: boolean }) {
  const size = small ? "px-2.5 py-1 text-caption" : "px-3.5 py-2 text-small";
  return <button type="button" {...props} className={`inline-flex items-center gap-1.5 rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${size} ${BUTTON_TONE[tone]} ${className}`} />;
}

/** A square icon control. Its name goes in `aria-label`; `Tip` shows it to the pointer. */
export const ICON_BUTTON = "inline-flex h-9 w-9 items-center justify-center rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-50";
const ICON_TONE: Record<Tone, string> = {
  primary: "bg-interactive text-white hover:bg-interactive-hover disabled:hover:bg-interactive",
  neutral: "text-text-secondary hover:bg-base-700 hover:text-text-primary disabled:hover:bg-transparent",
  danger: "text-error hover:bg-error/15 disabled:hover:bg-transparent",
};
export const ICON_NEUTRAL = `${ICON_BUTTON} ${ICON_TONE.neutral}`;

/** A tooltip under one icon control, on hover and keyboard focus. The control has its own `aria-label`, so this is hidden from screen readers. */
export function Tip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="group relative inline-flex">
      {children}
      <span aria-hidden="true" className="pointer-events-none absolute right-0 top-full z-30 mt-2 hidden whitespace-nowrap rounded-md border border-base-600 bg-base-700 px-2 py-1 text-caption text-text-primary shadow-soft group-focus-within:block group-hover:block">
        {label}
      </span>
    </span>
  );
}

/** An icon button with its tooltip. `label` is its accessible name; `tip` is the longer wording, when it has one. */
export function IconButton({ label, tip, tone = "neutral", className = "", children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; tip?: string; tone?: Tone }) {
  return (
    <Tip label={tip ?? label}>
      <button type="button" {...props} aria-label={label} className={`${ICON_BUTTON} ${ICON_TONE[tone]} ${className}`}>
        {children}
      </button>
    </Tip>
  );
}

export function Badge({ children, className = "", title }: { children: ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={`inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-caption font-medium uppercase tracking-wide ${className}`}>
      {children}
    </span>
  );
}

export function Card({ children, className = "", as: Tag = "section" }: { children: ReactNode; className?: string; as?: "section" | "div" | "article" | "aside" }) {
  return <Tag className={`rounded-lg border border-base-600/60 bg-base-800 p-4 ${className}`}>{children}</Tag>;
}

/** SingGuard's own words on a verdict, which can run to pages. Closed until asked for; the rule's name stays in the line above it. */
export function Reasoning({ text }: { text: string }) {
  return (
    <details className="text-small">
      <summary className="cursor-pointer text-text-secondary hover:text-text-primary">SingGuard&apos;s reasoning</summary>
      <blockquote className="mt-2 whitespace-pre-wrap border-l-2 border-base-600 pl-3 text-text-secondary">{text}</blockquote>
    </details>
  );
}

/** A card that opens on its summary. Closed by default; its content stays in the DOM. */
export function Collapsible({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <details className="group rounded-lg border border-base-600/60 bg-base-800">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-4 [&::-webkit-details-marker]:hidden">
        <SectionTitle>{title}</SectionTitle>
        <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-text-muted transition-transform group-open:rotate-90" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M9 6l6 6-6 6" />
        </svg>
      </summary>
      <div className="px-4 pb-4">{children}</div>
    </details>
  );
}

export function SectionTitle({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <h2 className={`font-display text-small font-semibold uppercase tracking-wide text-text-secondary ${className}`}>{children}</h2>;
}

export function Notice({ tone = "info", children, className = "" }: { tone?: "info" | "warning" | "error"; children: ReactNode; className?: string }) {
  const tones = { info: "border-info/40 text-text-primary", warning: "border-warning/50 text-text-primary", error: "border-error/50 text-text-primary" };
  const word = { info: "Note", warning: "Warning", error: "Error" };
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`rounded-md border bg-base-700/60 px-3 py-2 text-small ${tones[tone]} ${className}`}>
      <span className={`mr-2 font-semibold ${tone === "warning" ? "text-warning" : tone === "error" ? "text-error" : "text-info"}`}>{word[tone]}:</span>
      {children}
    </div>
  );
}

export function Spinner({ className = "h-4 w-4 text-text-muted" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`${className} animate-spin`} fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Kv({ label, children, title }: { label: string; children: ReactNode; title?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 text-small" title={title}>
      <dt className="shrink-0 text-text-muted">{label}</dt>
      <dd className="min-w-0 break-words text-right text-text-primary">{children}</dd>
    </div>
  );
}
