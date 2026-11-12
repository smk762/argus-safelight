import { describe, expect, it } from "vitest";

import { contentSecurityPolicy } from "./csp";
import { darkroomUrl } from "./types";

function directives(policy: string): Map<string, string[]> {
  return new Map(policy.split("; ").map((part) => {
    const [name, ...values] = part.split(" ");
    return [name, values];
  }));
}

describe("contentSecurityPolicy", () => {
  it("allows only nonced scripts, with no unsafe-inline and no eval in production", () => {
    const csp = directives(contentSecurityPolicy("abc", false, "http://darkroom:8106/"));
    expect(csp.get("script-src")).toEqual(["'self'", "'nonce-abc'", "'strict-dynamic'"]);
    expect(csp.get("style-src")).toEqual(["'self'", "'nonce-abc'"]);
    expect(contentSecurityPolicy("abc", false, "http://darkroom:8106/")).not.toContain("unsafe-inline");
    expect(csp.get("object-src")).toEqual(["'none'"]);
    expect(csp.get("frame-ancestors")).toEqual(["'none'"]);
  });

  it("lets the browser reach darkroom's API and images by origin, and nothing else", () => {
    const csp = directives(contentSecurityPolicy("abc", false, "http://192.168.1.5:8106/api"));
    expect(csp.get("connect-src")).toEqual(["'self'", "http://192.168.1.5:8106"]);
    expect(csp.get("img-src")).toEqual(["'self'", "blob:", "data:", "http://192.168.1.5:8106"]);
    expect(csp.has("upgrade-insecure-requests")).toBe(false);
  });

  it("allows the address a LAN page calls when darkroom's URL is loopback", () => {
    const origin = darkroomUrl("192.168.1.5", "http://localhost:8106");
    expect(directives(contentSecurityPolicy("abc", false, origin)).get("connect-src")).toEqual(["'self'", "http://192.168.1.5:8106"]);
  });

  it("relaxes only what next dev needs: eval for React's stacks and its own inline styles", () => {
    const csp = directives(contentSecurityPolicy("abc", true, "http://localhost:8106"));
    expect(csp.get("script-src")).toEqual(["'self'", "'nonce-abc'", "'strict-dynamic'", "'unsafe-eval'"]);
    expect(csp.get("style-src")).toEqual(["'self'", "'unsafe-inline'"]);
  });
});
