# Changelog

Each release has a `## [x.y.z]` section here. The release workflow uses that section as the GitHub Release notes.

Safelight follows argus-darkroom's `dev` branch at a recorded commit (`web/schema/pins.json`), not a darkroom release. Each section names the darkroom commit it was checked against.

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
