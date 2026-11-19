import type { NextConfig } from "next";

// Two builds from one tree:
//
// - Live (default): generation is live, so this is a server (`next start`) with the nonce CSP set per request by
//   src/proxy.live.ts.
// - Static demo (`SAFELIGHT_STATIC=1`, `make pages`): a pure static export to out/ that replays the recorded tape
//   (NEXT_PUBLIC_SAFELIGHT_TAPE_URL, /data-tape by default) and never calls darkroom. scripts/csp.mjs then gives
//   every exported page a hash-based CSP.
//
// Files that belong to one build carry its extension, which only that build's pageExtensions picks up: the proxy is
// proxy.live.ts, and the record route is page.live.tsx (any id, on request) or page.static.tsx (one page per record
// on the tape, from generateStaticParams).
const staticDemo = process.env.SAFELIGHT_STATIC === "1" || process.env.NEXT_PUBLIC_SAFELIGHT_STATIC === "1";

const nextConfig: NextConfig = {
  images: { unoptimized: true },
  pageExtensions: staticDemo ? ["tsx", "ts", "static.tsx"] : ["tsx", "ts", "live.ts", "live.tsx"],
  env: { NEXT_PUBLIC_SAFELIGHT_STATIC: staticDemo ? "1" : "" },
  ...(staticDemo ? { output: "export" as const, trailingSlash: true } : {}),
  // `next dev` refuses its own assets to any host but localhost. Name the LAN
  // address a dev page is opened as, comma-separated; production needs nothing.
  allowedDevOrigins: (process.env.SAFELIGHT_DEV_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
};

export default nextConfig;
