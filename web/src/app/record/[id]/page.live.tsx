import { RecordView } from "@/components/RecordView";

/** Live: any record id renders on request. The static export uses page.static.tsx instead (see next.config.ts). */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RecordView id={id} />;
}
