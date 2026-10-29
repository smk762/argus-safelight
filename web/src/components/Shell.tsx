"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { ThemeToggle } from "./ThemeToggle";

const NAV = [
  { href: "/", label: "Compose" },
  { href: "/history", label: "History" },
];

/** Header, the sidebar, and the main pane the routes fill. */
export function Shell({ sidebar, children }: { sidebar: ReactNode; children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="mx-auto flex min-h-dvh max-w-[1500px] flex-col">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-base-600/60 px-4 py-3 sm:px-6">
        <Link href="/" className="font-display text-subheading font-semibold text-text-primary">
          Argus Safelight
        </Link>
        <span className="hidden text-caption text-text-muted sm:inline">
          the demo for{" "}
          <a href="https://github.com/smk762/argus-darkroom" className="underline decoration-base-600 underline-offset-2 hover:text-text-secondary">
            argus-darkroom
          </a>
        </span>
        <nav aria-label="Pages" className="ml-auto flex items-center gap-1">
          {NAV.map(({ href, label }) => {
            const active = href === "/" ? pathname === "/" || pathname.startsWith("/record") : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`rounded-md px-3 py-1.5 text-small font-medium ${active ? "bg-base-700 text-text-primary" : "text-text-secondary hover:bg-base-800 hover:text-text-primary"}`}
              >
                {label}
              </Link>
            );
          })}
        </nav>
        <ThemeToggle />
      </header>
      <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6 lg:flex-row">
        <aside className="w-full shrink-0 space-y-4 lg:w-[380px]">{sidebar}</aside>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
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
