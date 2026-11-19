import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";

import { ComposeDialog } from "@/components/ComposeDialog";
import { ComposeProvider } from "@/components/ComposeProvider";
import { DarkroomProvider } from "@/components/DarkroomProvider";
import { DemoStrip } from "@/components/DemoStrip";
import { Shell } from "@/components/Shell";
import { staticDemo } from "@/lib/demo";

import "./globals.css";

const DESCRIPTION = "Guarded image generation with argus-darkroom: the pre-flight verdict, then what each guard said about the output.";
const DEMO_DESCRIPTION =
  "Argus Safelight, the guarded image generation demo for argus-darkroom: pre-flight verdicts, SingGuard scans with and without the prompt, NudeNet and MiVOLO, replayed from a recording.";

export const metadata: Metadata = {
  title: staticDemo() ? "Argus Safelight demo · Dragonhound Labs" : "Argus Safelight",
  description: staticDemo() ? DEMO_DESCRIPTION : DESCRIPTION,
  // Favicons: argus-cortex brand/packages/darkroom/favicon/, copied unchanged. favicon.ico, icon.svg and
  // apple-icon.png sit in src/app/ and Next emits their tags; icon-192/512 in public/ are for the manifest.
  manifest: "/site.webmanifest",
};

// The browser chrome follows the page: the family's --dh-bg values (a <meta> can't read a CSS variable).
export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfbf9" },
    { media: "(prefers-color-scheme: dark)", color: "#121416" },
  ],
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // The live build's proxy (proxy.live.ts) sets a nonce per request. The static export has no request to read: its
  // CSP is hash-based, added by scripts/csp.mjs, and reading headers() there would fail the export.
  const nonce = staticDemo() ? undefined : ((await headers()).get("x-nonce") ?? undefined);
  return (
    <html lang="en" suppressHydrationWarning data-dh-site={staticDemo() ? "safelight" : undefined}>
      <head>
        {/*
          The family theme script (public/dh-theme.js, a copy of vendor/dh/dh-theme.js): a plain blocking <script src>,
          first in <head>, so the saved choice (the `dh-theme` cookie, shared across *.dragonhound.dev) is on <html>
          before the first paint. Live, it carries the request's nonce ('strict-dynamic' ignores 'self'). The static
          build adds the same tag in scripts/csp.mjs instead, after its Trusted Types policy: React would create this
          element through innerHTML on a client render, which that policy blocks.
        */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts -- blocking on purpose: it must set the theme before first paint */}
        {staticDemo() ? null : <script src="/dh-theme.js" nonce={nonce} />}
      </head>
      <body className="min-h-dvh">
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        {staticDemo() ? <DemoStrip /> : null}
        <DarkroomProvider>
          <ComposeProvider>
            <Shell>{children}</Shell>
            <ComposeDialog />
          </ComposeProvider>
        </DarkroomProvider>
      </body>
    </html>
  );
}
