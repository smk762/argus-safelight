import { RecordView } from "@/components/RecordView";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RecordView id={id} />;
}
