import { staticDemo } from "@/lib/demo";
import { ago, formatUtc, formatWhen } from "@/lib/time";

/**
 * When a record was made. Live: relative ("5 min ago"), with the local date and time on hover. The static demo replays
 * a recording, where a relative time rots, so it shows the recorded date and time in UTC.
 */
export function When({ iso, className }: { iso: string; className?: string }) {
  const recorded = staticDemo();
  return (
    <time dateTime={iso} className={className} title={recorded ? `Recorded ${formatUtc(iso)}` : formatWhen(iso)}>
      {recorded ? formatUtc(iso) : ago(iso)}
    </time>
  );
}
