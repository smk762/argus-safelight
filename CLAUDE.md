# CLAUDE.md — argus-safelight

Guidance for AI agents working in this repo. Human-facing usage lives in [README.md](README.md); the design and its acceptance list live in [spec.md](spec.md).

## What this is

The standalone **demo UI for argus-darkroom**: compose a prompt, see the pre-flight verdict, generate over SSE, see what every guard said about the output, browse the history. It is a client. Darkroom decides everything; safelight shows the record and decides nothing.

- `web/`: Next.js 16 App Router, React 19, Tailwind v4, vitest 4. Two builds from one tree. **Live** (default): a server; pages call darkroom from the browser at `NEXT_PUBLIC_DARKROOM_URL` (default `http://localhost:8106`, baked in at build). **Static demo** (`SAFELIGHT_STATIC=1`, `make pages`): a static export that replays the recorded tape in `web/public/data-tape` and never calls darkroom.
- `scripts/record_tape.py` writes the tape; `docs/demo-recording.md` is the recording plan. `scripts/mock_darkroom.mjs` is a zero-dependency mock of darkroom's API over `fixture/`, with the verdict chosen by prompt markers (listed at the top of the file and in the README). `scripts/make_fixture.py` draws `fixture/`, which is committed and read by the web tests, so it doubles as the contract between the mock and the UI.
- `web/schema/pins.json` is the **sync record** for argus-darkroom's `dev` HEAD (commit, version, a sha256 per imported file). `web/scripts/darkroom-sync.mjs` pulls through the opsec gate (`scripts/opsec.mjs`), checks offline, and generates `src/lib/generated/darkroom.ts`. `web/content/darkroom/` holds darkroom's README and spec.md verbatim for `/docs`. `darkroom-drift.yml` opens the sync PR daily.

There is no host Node here; the Makefile runs npm in `node:22-bookworm-slim` via Docker when `npm` is missing. Use `docker compose`, never `docker-compose`. `make help` lists the targets; run `make check` (what CI runs) before every PR. Single test: `cd web && npx vitest run -t "name"`.

## Must never happen

Each line names what enforces it. An **UNENFORCED** line is a known gap: rely on review, and close it with a check rather than more prose. When something slips through, add the missing check here and in code. Don't add a rule to remember. Test names are quoted so they survive line moves.

| Never | Enforced by |
|---|---|
| An `img`, `picture`, `canvas` or `video` for a deleted, omitted, refused or failed record (`hasImage()` is the gate) | `ResultView.test.tsx` "puts no image element in the DOM for a deleted, omitted, refused or failed record", "says a refused input image refused the attempt…"; `History.test.tsx` "marks a record whose image was removed, with no img element…" |
| Load an image by `image.path` rather than by id (`imageUrl(id)`) | `ResultView.test.tsx` "loads a served image by record id, never by path" |
| Deleted reading like omitted | `ResultView.test.tsx` "makes deleted and omitted read differently", "names the rule, policy and context on a deleted tile…" |
| An age without "MiVOLO" beside it, or an "Age" field (wording lives in `age.ts` only) | `ResultView.test.tsx` "never shows an age without MiVOLO beside it", "…the tools on a minor-exposed one" |
| Colour as a shield's only signal | `shields.test.ts` "gives every state a mark that is not a colour", "labels flagged and illegal with their letters" |
| The enforcing policy anywhere but first in a grid, or unlabelled | `shields.test.ts` "puts the enforcing policy first and labels it" |
| A ≠ badge or "Prompt changed the verdict" without two verdicts (a pending or `unchecked` cell is none) | `shields.test.ts` "flags a disagreement and a prompt that turned a green", "lists exactly the fixture records whose isolated and with-prompt cells disagree" |
| The browser deciding a verdict: reclassify a rule, compare a score to a threshold, infer a policy's mode from its name (`/policies` says `mode`; the form's blur threshold changes the request, not the display) | ESLint `no-restricted-syntax`: no `<`/`>` on a `score`/`threshold` name, no `startsWith`/`endsWith`/`includes` of `sfw`/`nsfw`/`adult`; `compose.test.ts` "refuses SFW generation without NudeNet" (and blocks nothing on a policy's name before `/policies` loads) |
| Send a value the chosen workflow has no slot for | `workflows.test.ts` "sends guidance to Flux and no negative prompt…", "sends no guidance to SDXL…", "sends clip skip above 2 only to a template that has the slot" |
| Append trigger words to the prompt in the client (darkroom does) | `compose.test.ts` "refills each LoRA's trigger words from the record, and sends them again" |
| Run `workflows.contract.test.ts` against a darkroom with a GPU (each accepted case generates) | The test's `beforeAll` reads `/health` and refuses any server without `demo: true` (darkroom ≥ argus-darkroom#66) before it sends anything; "the contract test's guard" pins the rule |
| Input pixels in browser storage, in `POST /preflight`, or in the pre-flight key | ESLint `no-restricted-globals`/`no-restricted-properties` (no `localStorage`/`sessionStorage` in `src/`); `workflows.test.ts` "sends the input and mask with Generate, and never to pre-flight or into the compared key" |
| Hand-edit `generated/darkroom.ts`, `web/schema/`, `web/content/darkroom/` or `fixture/darkroom.json` | `npm run darkroom:check` (in `make lint` and CI) against `pins.json`; `wire.test.ts` validates every fixture record against the schema |
| Import a doc the opsec gate refused, or redact one instead of refusing | `wire.test.ts` "the opsec gate" (refuses with the line, never echoes a denylist term) |
| A help link to an anchor darkroom's docs no longer have | `docsLinks.test.tsx` |
| Raw HTML in rendered markdown (`rehype-raw`, `dangerouslySetInnerHTML`) | ESLint `no-restricted-imports`, `react/no-danger`; `docsLinks.test.tsx` "render without a style attribute, raw HTML or a script…" |
| A server-rendered `style` attribute, or a script the CSP doesn't name | ESLint `react/forbid-dom-props` (a client-only exception carries a disable comment with its reason); the CSP itself (`csp.test.ts`, `staticCsp.test.ts`); `check-static.mjs` (every exported page has the CSP `<meta>`) |
| A raw hex colour class (`bg-[#…]`) instead of a theme token | ESLint `no-restricted-syntax` |
| Purge controls without `health.devmode` | `History.test.tsx` "has no purge button in the DOM unless /health reports devmode", "offers to purge a single record only in devmode, and asks first"; the mock 404s `POST /purge` without `MOCK_DEVMODE` |
| "Remove images" deleting a record, or touching a row with no image | `History.test.tsx` "removes the images of the ticked rows…", "will not remove anything when no ticked row has an image…" |
| Anything but flat colour fields with a label in `fixture/` | `scripts/test_fixture_images.py` (CI `scripts`): each image is ≥95% one colour |
| An image on a tape for a record darkroom did not serve | `check-static.mjs`; `tape.test.ts` "has an image file for served records only…", `parseTape` "refuses an image file for a record darkroom did not serve" |
| Publish a render no person approved | `tape.test.ts` "serves only renders a person approved…" (every published image's hash is in `docs/demo-takes.json`) and "pins every rendered take to its approved image, or expects pre-flight to refuse it…"; `record_tape.py live` stops on a hash mismatch |
| A blocked request's words on a tape (critical, illegal anywhere, or minor-exposed) | `tape.test.ts` "withholds every blocked request's words, in the record and in its take"; `check-static.mjs` |
| A path, private address or email on a tape, an unfiltered `/models` key, or a leak echoed to a log | `test_record_tape.py` (CI `scripts`); `check-static.mjs` |
| A failed recording destroying the last tape | `test_record_tape.py` "test_a_failed_recording_leaves_the_last_tape" |
| A write from the static demo | `static.test.ts` "makes no write" |
| Edit `web/vendor/dh` | CI `dh-shared`, `make shared-check`; `shared.test.ts` "serves the vendored script unchanged" |
| Commit `.env` | `.gitignore` |

## Argus suite
<!-- argus-suite: keep this block; argus-ci checks for it -->
This repo is part of the Argus suite. The suite map below lists every sibling and what it owns; check it before
building something a sibling may already do. **On every release, update this repo's row and capabilities in
argus-cortex's SUITE.md** (a PR to argus-cortex in the same release).

@../argus-core/SUITE.md

Not checked out? Read https://github.com/smk762/argus-cortex/blob/main/SUITE.md

## Layout

Logic lives in `web/src/lib/` as pure, unit-tested functions; components stay thin. Wording that a rule above governs has one home: outcome wording in `outcome.ts`, age wording in `age.ts`, help targets in `docsLinks.ts`. `types.ts` re-exports the generated record types and hand-writes the shapes outside darkroom's schema (`Health`, `Policies`, `Models`, `GenerateRequest`, `Preflight`, the events). `/` is the live view only: `start()` routes there, and it goes to `/history` when nothing is live.

## Modern Web Guidance

Frontend work uses the [Modern Web Guidance](https://developer.chrome.com/docs/modern-web-guidance) skill (`/modern-web-guidance`), installed per user (`/plugin marketplace add GoogleChrome/modern-web-guidance`, then `/plugin install modern-web-guidance@googlechrome`; other agents: `npx modern-web-guidance@latest install`). Search it before writing dialog, popover, form, image or CSP code; `npx -y modern-web-guidance@latest legacy-scan web/src --json` is the modernization pass.

House exceptions to its advice:

- **Browser support:** Baseline widely available, plus newly available features that degrade on their own (`closedby="any"` on the purge dialog keeps an `onClick` backdrop fallback). No polyfills.
- **Shield detail stays `popover="manual"`** with `placeBeside` and React state, not `popover="hint"` + `interestfor` + anchor positioning: none of those is in every current engine.
- **The status card and `Tip` stay CSS-revealed** (`group-hover`/`group-focus-within`) for the same reason, with `useEscapeDismiss` for WCAG 1.4.13's "dismissible".
- **History thumbnails load darkroom's full image**, lazily. Darkroom serves no thumbnail size; that is a darkroom change.

## Static demo

- **One flag, inlined.** `staticDemo()` reads `NEXT_PUBLIC_SAFELIGHT_STATIC` literally, so each build carries one branch. `api.ts` sends reads to `staticApi.ts` (the tape) and rejects writes with `NotInDemo`; components hide write controls rather than badge them.
- **Build-specific files** carry the build's extension (`pageExtensions` in `next.config.ts`): `proxy.live.ts`, `record/[id]/page.live.tsx` and `page.static.tsx`. The static layout must not call `headers()`.
- **CSP:** `web/scripts/csp.mjs` adds a hash CSP `<meta>`, a Trusted Types `default` policy and the `dh-theme.js` tag to every exported page; the policy names `'self'` only.
- **The tape decides what can be fetched.** `imageUrl`/`thumbUrl`/`veilUrl` return `""` for anything without a file. A veiled frame requests neither its thumbnail nor its image until Reveal. `demo-e2e.mjs` (`make browser-check`) checks the requests in a browser.
- **Recording** follows `docs/demo-recording.md`: synthetic adults, catalogue-level at most, a person reviews every candidate, and each approved take is pinned by `_expect_image_sha256`. Illegal and minor-exposed outcomes are hand-written fixture records (`--illustrative`), labelled Sample data, never generated.
- **Dragonhound shared layer:** `web/vendor/dh` is vendored (dh-shared 1.2.8); `public/dh-theme.js` is a copy. The strip renders in the static build only, with `data-dh-site="safelight"`.

## Conventions & gotchas

- **Native top layer, not z-index.** A shield's detail is a `popover="manual"` placed by `placeBeside`: the grids scroll and the pre-flight shields sit in the compose dialog, so `absolute` gets clipped. Modals are `<dialog>` with `showModal()` (no `role="dialog"`, `aria-modal`, focus trap or Escape listener), named by `aria-labelledby`, closed with `dialog.close()` and handled in `onClose` so focus returns to the opener. jsdom has no `showModal`; component tests stub it.
- **Hover and focus content closes on Escape** (WCAG 1.4.13): `useEscapeDismiss` for `Tip` and the status card; `ShieldCell`'s document listener also `preventDefault`s so the same Escape doesn't close the compose dialog behind it.
- **CSP (live):** `proxy.live.ts` sets a nonce CSP on every page (`lib/csp.ts`) with darkroom's origin for `connect-src`/`img-src`, from the request's Host via `darkroomUrl()`. Any new `<script>` needs the nonce; set styles from the client after mount (`LiveView`, `placeBeside`). `next dev` adds `'unsafe-eval'` and inline styles. Reading the nonce makes every route dynamic, which is expected.
- **Server and browser render the same text.** Anything that depends on `window` (the darkroom URL, the theme) goes through `useSyncExternalStore` with a server snapshot, or a page opened on any host but localhost logs a hydration error.
- **The record types are generated.** After `make sync`, fix what typecheck reports, then update `make_fixture.py` and the mock and run `make fixture`. Darkroom's schema is Pydantic's validation view (defaulted fields optional); the generator makes every field required, as darkroom serializes it. Darkroom re-validates a stored record on read, so an older record still arrives with every field. Check a change against darkroom's `make demo` (real shapes, fake backends), not only the mock.
- **`outcome_reason` is a joined list** (`adult-granular:A, minor-exposed`). Read it with `reasonParts`; never compare the whole string. `firedCell` matches a code on its policy as well as its letter, because letters mean different things per policy.
- **A record refused in pre-flight resolved nothing.** `checkpoint`, `vae`, `workflow_sha256`, `workflow` and `engine_version` are null, `loras` is empty, and `seed`/`sampling` are only what the request sent. `fromRecord` keeps the form's own values for those.
- **The form offers only what a workflow renders.** Darkroom picks a template by the checkpoint's `family`, the LoRA count and the mode (`workflowFor` mirrors `WorkflowSet.select`) and 400s a value with no slot. A checkpoint with empty `lora_counts` is listed but disabled; Generate is blocked with darkroom's reason; the negative prompt is kept in the form across a family without `$negative`. Pre-flight doesn't check workflows, so Check stays enabled. `familySampling` is a starting point when the family changes, never a constraint. There is no VAE picker: no shipped template has `$vae`. Modes come from `/models` (`lora_counts`, `img2img_lora_counts`, `inpaint_lora_counts`), never a fallback: darkroom never renders an input as text or drops a mask, so neither does the form.
- **Contract test, after any workflow change:** `DARKROOM_CONTRACT_URL=http://127.0.0.1:8116 npx vitest run src/lib/workflows.contract.test.ts` against darkroom's demo (it refuses any server whose `/health` lacks `demo: true`, the fixture mock included). Darkroom's demo can't finish an image-to-image render yet (its fake ComfyUI reads the size from an empty latent), so those cases end `failed`; the input scan and record shapes are still darkroom's.
- **Input images stay in memory.** The client checks mirror darkroom's `images.load_input`/`load_mask` (magic bytes, 16 MiB, 4096 px, the mask at the input's upright size, nothing at or above grey 128 is "masks nothing"); darkroom still checks everything. A record keeps no pixels, so Regenerate of an image-to-image record waits for the image to be chosen again (`recordInput`).
- **An input refusal is read from `guard.input`, not the reason's wording.** `inputRefused(record)` is `outcome === "refused"` with `guard.input.outcome !== "passed"`; only a passed input goes on, so a review-level input refuses.
- **Hooks lint is strict** (`react-hooks/set-state-in-effect`, `react-hooks/refs`): use `useLoad` for keyed fetches, `useSyncExternalStore` for browser state, and derive loading from keys rather than resetting state in effects.
- **Themes:** the colour names in `globals.css` map onto the shared `--dh-*` tokens by `@theme inline`; `dh-theme.js` sets `data-theme` from the `dh-theme` cookie. Anything drawn on a shield uses `fill-on-shield`/`stroke-on-shield`.
- **Removing an image is not deleting a record.** `DELETE /record/{id}` keeps the record, so that action says "images". Only a devmode darkroom deletes records (`POST /purge`, `POST /purge/{id}`).
- **A docs link inside the compose dialog opens a new tab** (`DocsLink newTab`), so the form isn't left mid-thought.
- **Git:** see Branches. Never force-push.

## Branches

`dev` is the default branch and the base for every PR. Cut feature branches from `origin/dev` and bring them up to date by merging `origin/dev`, never `main`. Never push work to `main` or open a PR against it, except the release PR from `dev`: `main` must never be ahead of `dev`, with one exception. A release fast-forwards `main` to a `dev` commit that passed CI (`git push origin origin/dev:main`), then tags it. If `main` is protected, the release is a reviewed PR from `dev` into `main`, and merging it leaves a merge commit on `main` alone. That merge commit is the one exception to the rule: it leaves `main` one commit ahead of `dev` with an identical tree. Leave it there and don't merge `main` back into `dev`. Anything else on `main` that `dev` lacks is a mistake (`git diff origin/dev origin/main` must be empty). Once `main` carries such a commit it can't be fast-forwarded, so later releases are PRs too.
