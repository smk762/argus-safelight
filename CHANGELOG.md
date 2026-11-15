# Changelog

Each release has a `## [x.y.z]` section here. The release workflow uses that section as the GitHub Release notes.

Safelight follows argus-darkroom's `dev` branch at a recorded commit (`web/schema/pins.json`), not a darkroom release. Each section names the darkroom commit it was checked against.

## [Unreleased]

### Added

- **A hosted static demo** for safelight.dragonhound.dev (`make pages`, `SAFELIGHT_STATIC=1`): a pure static export that replays a recorded data tape (`web/public/data-tape`) and never calls darkroom. Every page gets a hash-based CSP with a Trusted Types policy (`web/scripts/csp.mjs`, as in Cull), and `_headers` carries `frame-ancestors`. History, records, docs, Regenerate and Copy record work as live. Compose offers the tape's **recorded prompts**: Check shows the pre-flight darkroom recorded for it, and Generate replays the recorded stream, so the grid fills cell by cell and lands on the record. Writes (Remove image, row selection, purge) and the input-image field are left out, and the status icon too: a recording has no live server.
- **The tape**, written by `scripts/record_tape.py`: `sample` from `fixture/` (labelled **Sample data**, the current tape), or `live` from a running darkroom and a take list. Only passed and review records get image files; a deleted, omitted, refused or failed record is its metadata alone. A blocked request (critical, judged illegal, or minor-exposed) keeps its verdict, rule, reason, timestamps and state, but its prompts and SingGuard's explanations are replaced by `[withheld: <reason>]`. Borderline frames (review, or darkroom's blur) load only a 28-cell **veil** until Reveal. `web/scripts/check-static.mjs` fails the build if any of that is not so, and `web/scripts/demo-e2e.mjs` (`make browser-check`) checks it in Chromium at 1440 and 390 px, light and dark.
- **The recording plan**, `docs/demo-recording.md`, with the proposed takes in `docs/demo-takes.json`.
- **The recorded tape.** The demo now replays a real run of argus-darkroom (`0.1.4.dev36+gc9794888b`) on FLUX.1 [schnell] (Apache-2.0; SDXL 1.0 base, the plan's first choice, is not installed): 20 takes, 18 with real images (2 veiled for review), 2 refused at pre-flight, plus the fixture's six hand-written records, labelled Sample data, for outcomes that need a backend stopped mid-run or must never be generated. Every candidate was reviewed by eye; rejected renders were deleted and purged, several prompts were reworded (age cues, no crowds, waist-up catalogue framing), and two plan takes were dropped. `docs/demo-recording.md` says which and why; `docs/demo-takes.json` pins each take's seed and approved image hash.
- **The Dragonhound shared layer** (dh-shared 1.2.4) vendored in `web/vendor/dh`, with a CI job that fails on local edits or drift from the published manifest. The static demo carries the family strip (`data-dh-site="safelight"`, default "recorded output" label) and the demo-state badge.

### Changed

- **The recorded tape's `/models` lists only what the takes used**, and its `/health` reports `devmode: false` (`record_tape.py live`): a public tape no longer carries the server's whole model shelf, and the static page no longer offers Purge all.
- **Unit tests read the fixture's sample tape** (`fixture/sample-tape`, `make sample-tape`) instead of the published one, which now gets its own invariant checks (files for served records only, blocked words withheld, every take ending in its record). `make browser-check` replays an unserved take from whichever tape is published.

- **Theme and type follow the family.** The colours map onto the shared `--dh-*` tokens, the fonts are the system stack (no webfonts), and light/dark is `dh-theme.js`: two states, following the system until toggled, and shared across `*.dragonhound.dev` by cookie. The old three-state toggle and its `localStorage` key are gone.
- The proxy is `src/proxy.live.ts` and the record route has a live and a static page (`page.live.tsx`, `page.static.tsx`); each build's `pageExtensions` picks its own.

## [0.2.0] - 2026-11-13

Checked against argus-darkroom `dev` @ `3cf0818` (`0.1.4.dev18+g3cf0818`).

### Added

- **Darkroom's docs in the app.** `/docs` (the book icon, and the footer) renders darkroom's README and the reference sections of its `spec.md`, imported at its `dev` HEAD. The header names the version and commit, with links to PyPI, GitHub at that commit and the changelog (#31).
- **In-context help.** Links from the shield grid (the two scans, what each shield means, thinking modes), from every outcome to its definition, from the policy picker (policies, SFW and NSFW, illegal rules), and from expansion (how it is judged, and Ollama's setup guide). Each record also gets a "Judged by argus-darkroom *version*, policy *enforcing*, thinking *mode*" line, read from the record (#31).
- **One sync record for darkroom**, `web/schema/pins.json`, with the `dev` commit, the version and a sha256 per imported file. `make sync` pulls darkroom's schema and docs through an opsec gate that refuses rather than redacts, regenerates the wire types and re-records the fixture. `make lint` and CI fail when the docs, the types or the fixture's darkroom version disagree with the record. A daily workflow opens the sync PR when darkroom moves on (#31).
- **Image-to-image and inpainting.** You can pick or drop an input image, set the denoise, and paint or upload a mask. The input's own scan appears live as a row of shields. The pixels stay in the page's memory and are never stored (#27, #28, #33).
- **The form offers only what darkroom's workflows render.** Checkpoints are grouped by family. LoRAs stop at the family's limit. Flux gets a Guidance field. A field the template has no slot for is hidden and not sent. Generate is blocked, with darkroom's reason, when nothing renders the choice (#26).

### Changed

- **The record types are generated from darkroom's wire schema** instead of being written by hand. The fixture is validated against that schema in the tests (#31).
- The shield detail no longer has a "Cascade fast pass" line. Darkroom never records a separate fast verdict, so the line could only ever appear against the mock (#31).
- Modals are native `<dialog>` elements. Hover and focus content closes on Escape (WCAG 1.4.13). Every page carries a nonce Content-Security-Policy that allows only darkroom's origin (#25).
- The README lists every condition that blocks Generate, documents `SAFELIGHT_DEV_ORIGINS`, says when Regenerate holds the seed, and covers the 200-record history page (#34).
- CI runs on `dev` as well as `main`, and the dev/main branch model is documented (#32). LAN addresses in the docs are now `.env` placeholders (#30). `CLAUDE.md` imports the Argus suite map (#22).

## [0.1.0] - 2026-11-07

First release, merged to `main` in #18 (not tagged). Compose and pre-flight, generation over SSE with the shield grid filling cell by cell, a view for every outcome (images only for passed and review), history filtered in the URL with **Prompt changed the verdict**, Regenerate, Copy record and Remove image, Purge all under `devmode`, the fixture mock, and light and dark themes (#1–#20).
