// Bombadil specification for the static demo (`npm run build:pages`: the recorded tape, no
// darkroom). argus-ci's reusable bombadil.yml runs it on every PR (.github/workflows/ci.yml, job
// `bombadil`): Bombadil drives a browser around out/ at random (clicks, typing, scrolling,
// back/reload) for 3 minutes and checks every property below in each state.
//
// Locally, after `npm run build:pages`, serve out/ on :4173 and run:
//
//   docker run --rm --network host -v "$PWD":/w -w /w antithesishq/bombadil:0.7.10 \
//     browser test --headless --no-sandbox --time-limit 3m --output-path /w/bombadil-output \
//     http://127.0.0.1:4173/ bombadil/spec.ts
//
// Only point this at the static demo: random clicks press any button a live darkroom offers.

// Uncaught exceptions, unhandled rejections, console errors (which include CSP violation
// reports) and HTTP 4xx/5xx: the static demo should produce none. A call the demo can't make
// rejects with NotInDemo, so every such call must be caught and shown, never left unhandled.
export {
  noConsoleErrors,
  noHttpErrorCodes,
  noUncaughtExceptions,
  noUnhandledPromiseRejections,
} from "@antithesishq/bombadil/browser/defaults/properties";
export { defaultActions } from "@antithesishq/bombadil/browser/defaults";
