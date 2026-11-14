import type { Metadata } from "next";
import { DM_Sans, Inter } from "next/font/google";
import { headers } from "next/headers";

import { ComposeDialog } from "@/components/ComposeDialog";
import { ComposeProvider } from "@/components/ComposeProvider";
import { DarkroomProvider } from "@/components/DarkroomProvider";
import { Shell } from "@/components/Shell";

import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans" });

export const metadata: Metadata = {
  title: "Argus Safelight",
  description: "Guarded image generation with argus-darkroom: the pre-flight verdict, then what each guard said about the output.",
  // Favicons: argus-cortex brand/packages/darkroom/favicon/, copied unchanged. favicon.ico, icon.svg and
  // apple-icon.png sit in src/app/ and Next emits their tags; icon-192/512 in public/ are for the manifest.
  manifest: "/site.webmanifest",
};

// Runs before paint so a saved theme does not flash the system one first. Inline, so it carries the request's CSP
// nonce (set in `proxy.ts`); reading it makes every page render per request, which a live client does anyway.
const THEME_BOOT = `try{var t=localStorage.getItem("safelight-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="en" className={`${inter.variable} ${dmSans.variable}`} suppressHydrationWarning>
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body className="min-h-dvh">
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
