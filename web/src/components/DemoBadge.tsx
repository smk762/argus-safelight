// The family's four demo states (dh-shared README, "Demo-state vocabulary"), styled by vendor/dh/dh-badge.css.
// The header names what kind of data the page shows (Recorded, or Sample data while the tape is the fixture).
// Controls the demo cannot run are left out rather than badged; In-browser and Not-in-this-demo stay in the
// vocabulary but this page does not print them.

export const DEMO_STATES = {
  recorded: { label: "Recorded", className: "dh-badge", title: "Recorded output from a real run; no model runs while you browse" },
  sample: { label: "Sample data", className: "dh-badge dh-badge--sample", title: "Synthetic sample to show the layout; not real output" },
  browser: { label: "In-browser", className: "dh-badge dh-badge--browser", title: "Runs in your browser; nothing is sent anywhere" },
  off: { label: "Not in this demo", className: "dh-badge dh-badge--off", title: "Needs the self-hosted backend; see the README" },
} as const;

export type DemoState = keyof typeof DEMO_STATES;

export function DemoBadge({ state, title }: { state: DemoState; title?: string }) {
  const s = DEMO_STATES[state];
  return (
    <span className={`${s.className} shrink-0`} title={title ?? s.title}>
      {s.label}
    </span>
  );
}
