"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { useCompose } from "./ComposeProvider";
import { useDarkroom } from "./DarkroomProvider";
import { DemoBadge } from "./DemoBadge";
import { staticDemo } from "@/lib/demo";
import { DOCS } from "@/lib/docsLinks";
import type { Tape } from "@/lib/tape";

import { ComposeIcon, DocsIcon, HistoryIcon } from "./icons";
import { StatusMenu } from "./StatusMenu";
import { ThemeToggle } from "./ThemeToggle";
import { ICON_NEUTRAL, IconButton, Spinner, Tip } from "./ui";

/** Header and the main pane the routes fill. The header's controls are icons, so the routes keep the full width. */
export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { openComposer, running } = useCompose();
  const { tape } = useDarkroom();
  const inHistory = pathname.startsWith("/history");
  const inDocs = pathname.startsWith("/docs");
  return (
    <div className="mx-auto flex min-h-dvh max-w-[1500px] flex-col">
      <header className="relative flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-base-600/60 px-4 py-3 sm:px-6">
        <Link href={running ? "/" : "/history"} className="font-display text-subheading font-semibold text-text-primary">
          Argus Safelight
        </Link>
        <span className="hidden text-caption text-text-muted sm:inline">
          the demo for{" "}
          <a href="https://github.com/smk762/argus-darkroom" className="underline decoration-base-600 underline-offset-2 hover:text-text-secondary">
            argus-darkroom
          </a>
        </span>
        {staticDemo() && tape ? <TapeBadge tape={tape} /> : null}
        <nav aria-label="Pages" className="ml-auto flex items-center gap-1">
          {running ? (
            <Tip label="Generation running">
              <Link href="/" aria-label="Generation running" aria-current={pathname === "/" ? "page" : undefined} className={`${ICON_NEUTRAL} bg-accent-primary/20 hover:bg-accent-primary/30`}>
                <Spinner className="h-5 w-5 text-accent-primary" />
              </Link>
            </Tip>
          ) : null}
          <IconButton label="Compose" onClick={openComposer}>
            <ComposeIcon />
          </IconButton>
          <Tip label="History">
            <Link href="/history" aria-label="History" aria-current={inHistory ? "page" : undefined} className={`${ICON_NEUTRAL} ${inHistory ? "bg-base-700 text-text-primary" : ""}`}>
              <HistoryIcon />
            </Link>
          </Tip>
          <Tip label="Docs: argus-darkroom">
            <Link href={DOCS.home} aria-label="Docs" aria-current={inDocs ? "page" : undefined} className={`${ICON_NEUTRAL} ${inDocs ? "bg-base-700 text-text-primary" : ""}`}>
              <DocsIcon />
            </Link>
          </Tip>
          {/* A recording has no live server to report on: the status icon is for a running darkroom. */}
          {staticDemo() ? null : <StatusMenu />}
          <ThemeToggle />
        </nav>
      </header>
      <main id="main" className="min-w-0 flex-1 p-4 sm:p-6">{children}</main>
      <footer className="border-t border-base-600/60 px-4 py-3 text-caption text-text-muted sm:px-6">
        Captions, curation and training live elsewhere:{" "}
        <a href="https://github.com/smk762/argus-lightbox" className="underline decoration-base-600 underline-offset-2 hover:text-text-secondary">
          lightbox
        </a>{" "}
        for argus-lens,{" "}
        <a href="https://github.com/smk762/argus-cull" className="underline decoration-base-600 underline-offset-2 hover:text-text-secondary">
          cull
        </a>{" "}
        for argus-curator. Safelight shows the verdicts darkroom recorded and decides nothing itself.{" "}
        <Link href={DOCS.home} className="underline decoration-base-600 underline-offset-2 hover:text-text-secondary">
          Docs: argus-darkroom
        </Link>
        .
      </footer>
    </div>
  );
}

/** What the static demo replays: a real recording, or the fixture standing in for one. The note is the tooltip. */
function TapeBadge({ tape }: { tape: Tape }) {
  const sample = tape.provenance.kind === "sample";
  const what = sample
    ? "Sample data: the repo's fixture records with hand-written verdicts and flat-colour placeholder images, standing in until the demo set is recorded."
    : `Recorded from argus-darkroom ${tape.provenance.darkroom.version ?? ""}; no model runs while you browse.`;
  return <DemoBadge state={sample ? "sample" : "recorded"} title={`${what} Generate replays the recorded run for a prompt on the tape.`} />;
}
