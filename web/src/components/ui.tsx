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

export function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`${className} animate-spin text-text-muted`} fill="none" aria-hidden="true">
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
