import type { ReactNode } from "react";

import { ExternalLink } from "@/components/links";
import { DARKROOM, OLLAMA_SETUP, darkroomLinks } from "@/lib/docsLinks";

/** The external services' own setup guides, until Studio's "Setup and services" pages (argus-studio#172) exist to link instead. */
const SERVICES: [string, string][] = [
  ["ComfyUI", "https://docs.comfy.org/installation/manual_install"],
  ["Ollama", OLLAMA_SETUP],
  ["SingGuard", "https://huggingface.co/inclusionAI/SingGuard-4b-GGUF"],
  ["NudeNet", "https://github.com/notAI-tech/NudeNet"],
];

/**
 * argus-darkroom's docs, imported at its `dev` HEAD. The header names the version and commit they were taken at,
 * which is also the version the fixture records and the commit the wire types were generated from.
 */
export default function DocsLayout({ children }: { children: ReactNode }) {
  const links = darkroomLinks();
  return (
    <div className="space-y-6">
      <header className="space-y-2 border-b border-base-600/60 pb-4">
        <h1 className="font-display text-heading font-semibold text-text-primary">argus-darkroom docs</h1>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-small text-text-secondary">
          <span className="font-mono text-text-primary">
            argus-darkroom {DARKROOM.version} @ {DARKROOM.commit.slice(0, 7)}
          </span>
          <span aria-hidden="true">·</span>
          <ExternalLink href={links.pypi}>PyPI</ExternalLink>
          <span aria-hidden="true">·</span>
          <ExternalLink href={links.github}>GitHub at {DARKROOM.commit.slice(0, 7)}</ExternalLink>
          <span aria-hidden="true">·</span>
          <ExternalLink href={links.changelog}>Changelog</ExternalLink>
        </p>
        <p className="text-caption text-text-muted">
          Imported from darkroom&apos;s <span className="font-mono">{DARKROOM.branch}</span> branch, not hand-copied; a scheduled check opens a pull request when it moves on. The services darkroom calls have their own guides:{" "}
          {SERVICES.map(([name, href], index) => (
            <span key={name}>
              {index > 0 ? ", " : ""}
              <ExternalLink href={href}>{name}</ExternalLink>
            </span>
          ))}
          .
        </p>
      </header>
      {children}
    </div>
  );
}
