import { NextResponse, type NextRequest } from "next/server";

import { contentSecurityPolicy } from "@/lib/csp";
import { darkroomUrl } from "@/lib/types";

/** Sets a fresh-nonce CSP on every page request; see `contentSecurityPolicy`. */
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  // The darkroom origin the browser will call: a loopback DARKROOM_URL follows the host this page is opened as. That is
  // the Host header; `nextUrl.hostname` is the address next is bound to (0.0.0.0 under `next start -H 0.0.0.0`).
  const darkroom = darkroomUrl(pageHostname(request.headers.get("host")) ?? request.nextUrl.hostname);
  const policy = contentSecurityPolicy(nonce, process.env.NODE_ENV === "development", darkroom);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", policy);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", policy);
  return response;
}

export const config = {
  matcher: [
    {
      // Pages only: static assets and link prefetches need no policy of their own.
      source: "/((?!_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};

/** The hostname of a Host header (`192.168.1.5:3097`, `[::1]:3097`), or null when it is missing or not a host. */
function pageHostname(host: string | null): string | null {
  if (!host) return null;
  try {
    return new URL(`http://${host}`).hostname;
  } catch {
    return null;
  }
}
