"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { useCompose } from "./ComposeProvider";
import { ComposeIcon, HistoryIcon } from "./icons";
import { StatusMenu } from "./StatusMenu";
import { ThemeToggle } from "./ThemeToggle";
import { ICON_NEUTRAL, IconButton, Spinner, Tip } from "./ui";

/** Header and the main pane the routes fill. The header's controls are icons, so the routes keep the full width. */
export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { openComposer, running } = useCompose();
  const inHistory = pathname.startsWith("/history");
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
          <StatusMenu />
          <ThemeToggle />
        </nav>
      </header>
      <main className="min-w-0 flex-1 p-4 sm:p-6">{children}</main>
      <footer className="border-t border-base-600/60 px-4 py-3 text-caption text-text-muted sm:px-6">
        Captions, curation and training live elsewhere:{" "}
        <a href="https://github.com/smk762/argus-lightbox" className="underline decoration-base-600 underline-offset-2 hover:text-text-secondary">
          lightbox
        </a>{" "}
        for argus-lens,{" "}
        <a href="https://github.com/smk762/argus-cull" className="underline decoration-base-600 underline-offset-2 hover:text-text-secondary">
          cull
        </a>{" "}
        for argus-curator. Safelight shows the verdicts darkroom recorded and decides nothing itself.
      </footer>
    </div>
  );
}
