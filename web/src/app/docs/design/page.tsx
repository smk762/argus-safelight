import type { Metadata } from "next";

import { DocPageView } from "@/components/DocPageView";
import { DOC_PAGES } from "@/lib/docsLinks";

export const metadata: Metadata = { title: "Docs: darkroom's design · Argus Safelight" };

export default function DocsDesign() {
  return <DocPageView page={DOC_PAGES[1]} />;
}
