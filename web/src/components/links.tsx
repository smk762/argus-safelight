import Link from "next/link";
import type { ReactNode } from "react";

export const LINK = "text-accent-tertiary underline decoration-accent-tertiary/40 underline-offset-2 hover:decoration-accent-tertiary";

/** Off-site: a new tab, no opener, and a cue for screen readers that it opens one. */
export function ExternalLink({ href, children, className = LINK }: { href: string; children: ReactNode; className?: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
      <span className="sr-only"> (opens in new tab)</span>
    </a>
  );
}

/**
 * A link into `/docs`. `newTab` keeps the page it is on, for links inside the compose dialog, where navigating away
 * would close the form mid-thought.
 */
export function DocsLink({ href, children, newTab = false, className = LINK }: { href: string; children: ReactNode; newTab?: boolean; className?: string }) {
  if (newTab) return <ExternalLink href={href} className={className}>{children}</ExternalLink>;
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}
