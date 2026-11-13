import Link from "next/link";

import type { DocHeading } from "@/lib/docs";

/** The docs' pages, and the current page's sections under it. */
export function DocsNav({ pages, current, headings }: { pages: { href: string; title: string; file: string }[]; current: string; headings: DocHeading[] }) {
  return (
    <nav aria-label="Docs" className="text-small">
      <ul className="space-y-1">
        {pages.map((page) => (
          <li key={page.href}>
            <Link href={page.href} aria-current={page.href === current ? "page" : undefined} className={`block rounded-md px-2 py-1 ${page.href === current ? "bg-base-700 font-medium text-text-primary" : "text-text-secondary hover:text-text-primary"}`}>
              {page.title} <span className="font-mono text-caption text-text-muted">{page.file}</span>
            </Link>
            {page.href === current ? (
              <ul className="mt-1 space-y-0.5 border-l border-base-600/60 pl-3">
                {headings.map((heading) => (
                  <li key={heading.id} className={heading.depth === 3 ? "pl-3" : ""}>
                    <a href={`#${heading.id}`} className="block py-0.5 text-caption text-text-secondary hover:text-text-primary">
                      {heading.text}
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
    </nav>
  );
}
