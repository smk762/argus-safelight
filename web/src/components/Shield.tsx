import { shieldLabel, shieldMark, type ShieldState } from "@/lib/shields";

const FILL: Record<ShieldState, string> = {
  safe: "text-success",
  flagged: "text-warning",
  illegal: "text-error",
  unchecked: "text-text-muted",
  pending: "text-text-muted",
};

const BODY = "M12 2 4 5.5V11c0 5.1 3.4 9.8 8 11 4.6-1.2 8-5.9 8-11V5.5L12 2Z";

/**
 * A verdict as a shield: green tick for safe, amber with the rule letters for
 * flagged, red with a cross and the letters for illegal, grey question mark
 * for unchecked. The mark is drawn inside and a text label can sit beside it,
 * so every state can be told apart in grayscale.
 */
export function Shield({
  state,
  letters = [],
  title,
  size = "h-7 w-7",
  withLabel = false,
  labelBelow = false,
  className = "",
}: {
  state: ShieldState;
  letters?: readonly string[];
  title?: string;
  size?: string;
  withLabel?: boolean;
  labelBelow?: boolean;
  className?: string;
}) {
  const mark = shieldMark(state, letters);
  const label = shieldLabel(state, letters);
  const long = mark.length > 1;
  const icon = (
    <svg viewBox="0 0 24 24" role="img" aria-label={title ?? label} className={`${size} shrink-0 ${FILL[state]}`}>
      {title ? <title>{title}</title> : null}
      {state === "pending" ? (
        <path d={BODY} fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2.5 2" />
      ) : (
        <path d={BODY} fill="currentColor" />
      )}
      {state === "illegal" && !long ? (
        <path d="m8.5 8.5 7 7M15.5 8.5l-7 7" fill="none" className="stroke-on-shield" strokeWidth="2.2" strokeLinecap="round" />
      ) : state === "safe" ? (
        <path d="m8 12.2 2.6 2.6L16 9.6" fill="none" className="stroke-on-shield" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <text
          x="12"
          y={state === "pending" ? 13.5 : 12.6}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={long ? 8 : 10.5}
          fontWeight="700"
          fontFamily="var(--font-sans)"
          className={state === "pending" ? "fill-current" : "fill-on-shield"}
        >
          {mark}
        </text>
      )}
    </svg>
  );
  if (!withLabel) return <span className={`inline-flex ${className}`}>{icon}</span>;
  return (
    <span className={`inline-flex items-center ${labelBelow ? "flex-col gap-0.5" : "gap-1.5"} ${className}`}>
      {icon}
      <span className={`text-caption font-medium capitalize leading-tight text-text-secondary ${labelBelow ? "whitespace-nowrap" : ""}`}>{label}</span>
    </span>
  );
}
