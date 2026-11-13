import { docHeadings } from "@/lib/docs";
import { DOC_PAGES, darkroomLinks, docsHref, type DocPage } from "@/lib/docsLinks";

import { DocArticle } from "./DocArticle";
import { DocsNav } from "./DocsNav";
import { ExternalLink } from "./links";

/** One doc with its contents beside it: the pages, and this page's sections. */
export async function DocPageView({ page }: { page: DocPage }) {
  const headings = (await docHeadings(page)).filter((heading) => heading.depth <= 3);
  return (
    <div className="grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)] lg:self-start lg:overflow-auto">
        <DocsNav pages={DOC_PAGES.map((doc) => ({ href: docsHref(doc), title: doc.title, file: doc.file }))} current={docsHref(page)} headings={headings} />
      </aside>
      <article className="min-w-0 max-w-[860px]" aria-label={`darkroom ${page.file}`}>
        <p className="mb-4 text-caption text-text-muted">
          From <ExternalLink href={darkroomLinks().blob(page.file)}>{page.file}</ExternalLink>
          {page.sections ? `: the ${page.sections.length} reference sections. The plan and acceptance list stay on GitHub.` : "."}
        </p>
        <DocArticle page={page} />
      </article>
    </div>
  );
}
