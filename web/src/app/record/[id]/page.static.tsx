import { readFileSync } from "node:fs";
import { join } from "node:path";

import { RecordView } from "@/components/RecordView";

/**
 * The static export's record pages: one per record on the tape it ships (public/data-tape/tape.json, or
 * SAFELIGHT_TAPE_DIR), and no other. Only the static build's pageExtensions picks this file up; the live build uses
 * page.live.tsx, since a route with generateStaticParams would try to prerender past the layout's per-request nonce.
 */
export function generateStaticParams(): { id: string }[] {
  const dir = process.env.SAFELIGHT_TAPE_DIR || join(process.cwd(), "public", "data-tape");
  const tape = JSON.parse(readFileSync(join(dir, "tape.json"), "utf8")) as { records: { id: string }[] };
  return tape.records.map((record) => ({ id: record.id }));
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RecordView id={id} />;
}
