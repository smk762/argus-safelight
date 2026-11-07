import type { NextConfig } from "next";

// Generation is live, so this is a server (`next start`), not a static export.
const nextConfig: NextConfig = {
  images: { unoptimized: true },
  // `next dev` refuses its own assets to any host but localhost. Name the LAN
  // address a dev page is opened as, comma-separated; production needs nothing.
  allowedDevOrigins: (process.env.SAFELIGHT_DEV_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
};

export default nextConfig;
