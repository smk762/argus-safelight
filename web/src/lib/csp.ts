/**
 * A strict Content-Security-Policy with a fresh nonce per request. Safelight shows generation output, so a script that
 * is not ours must not run. Next.js reads the nonce from the request's header and puts it on its own scripts and
 * styles; the layout puts it on the theme boot script.
 *
 * Darkroom is the only other origin: the browser fetches its API and its images directly. Pass the origin the page will
 * call, `darkroomUrl(<the request's host>)`, since a loopback DARKROOM_URL follows the host the page was opened as. No
 * `upgrade-insecure-requests`, because darkroom is usually plain http on the LAN.
 */
export function contentSecurityPolicy(nonce: string, dev: boolean, darkroom: string): string {
  const origin = new URL(darkroom).origin;
  return [
    "default-src 'self'",
    // 'strict-dynamic': scripts the nonced ones load are trusted; host lists and 'self' are ignored where it is supported.
    // React needs eval for its error stacks in development only.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    // `next dev` injects its CSS as <style> elements without the nonce. A nonce in the list would make browsers ignore
    // 'unsafe-inline', so development drops it. Production builds keep the nonce only.
    dev ? "style-src 'self' 'unsafe-inline'" : `style-src 'self' 'nonce-${nonce}'`,
    `img-src 'self' blob: data: ${origin}`,
    `connect-src 'self' ${origin}`,
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}
