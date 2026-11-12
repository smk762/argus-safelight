# CLAUDE.md — argus-safelight

Guidance for AI agents working in this repo. Human-facing usage lives in [README.md](README.md); the design and its acceptance list live in [spec.md](spec.md). This file is the orientation an agent needs to change code safely.

## What this is

The standalone **demo UI for argus-darkroom**: compose a prompt, see the pre-flight verdict, generate over SSE, see what every guard said about the output, browse the history. It is a client. Darkroom decides everything; safelight shows the record and decides nothing.

- `web/`: Next.js 16 App Router, React 19, Tailwind v4, vitest 4. **Not** a static export: generation is live. Pages call darkroom directly from the browser at `NEXT_PUBLIC_DARKROOM_URL` (default `http://localhost:8106`, baked in at build).
- `scripts/mock_darkroom.mjs`: a zero-dependency Node mock of darkroom's API that serves `fixture/` and generates new records with the verdict chosen by prompt markers (`[flag]`, `[illegal]`, `[exposed]`, … listed at the top of the file and in the README).
- `scripts/make_fixture.py`: draws `fixture/` (PEP 723 script, `uv run`). `fixture/` is committed; the web tests read it, so it doubles as a contract test between the mock and the UI.

There is no host Node here; the Makefile runs npm in `node:22-bookworm-slim` via Docker when `npm` is missing. Use `docker compose`, never `docker-compose`.

## Layout

- `web/src/lib/`: pure, unit-tested logic. `types.ts` (darkroom's wire contract, `record_version` 1.0), `api.ts` (fetch wrappers, `generate()` over the SSE stream), `sse.ts`, `shields.ts` (cell severity, marks and labels, `policyRows`, `rowDisagrees`, `promptTurned`, `promptChangedVerdict`, `reasonParts`, `firedCell`, `uncheckedCell`, `recordRules`, `matchesRule`), `outcome.ts` (labels, tones, the deleted/omitted wording, `hasImage`), `age.ts` (the only place MiVOLO wording lives), `health.ts` (the backends and the status icon's summary), `compose.ts` (form state, `toRequest`, `fromRecord`, `generateBlock`), `live.ts` (the reducer over stream events), `historyQuery.ts` (the filter in the URL), `theme.ts`, `useLoad.ts`.
- `web/src/components/`: `Shell` (header of icons with tooltips: Compose, History, `StatusMenu`, `ThemeToggle`, and a link back to a running generation; full-width main pane; footer links), `StatusMenu` (health icon with a marked badge, `HealthCard` on hover, focus or tap), `icons.tsx`, `DarkroomProvider` (`/health` every 30s, `/policies`, `/models`), `ComposeProvider` (form state, `check`, `start`/`stop`, the live reducer, `composerOpen`), `ComposeDialog` (the form in a native `<dialog>`, two columns by container query, widening for the pre-flight verdict; the header icon opens it from anywhere, Regenerate included), `ComposeForm`, `PolicyPicker`, `PreflightPanel`, `ComposePane` + `LiveView`, `Shield` / `ShieldCell` / `ShieldGrid`, `OutcomeTiles` (image with blur and reveal, deleted, omitted, failed, the refused panel), `RecordDetails` (the collapsed cards), `ResultView` (image or verdict across two thirds, the shield grid open and the rest collapsed beside it), `RecordView` + `RecordActions`, `History` + `HistorySelection` + `PurgeDialog`, `ui.tsx` (`IconButton` and `Tip` for icon controls, `Collapsible`).
- `web/src/app/`: `/` (the live view only: `start()` routes here, and it goes to `/history` when nothing is live), `/history`, `/record/[id]`.

## Commands

```bash
make install   # npm ci
make mock      # fixture mock on :8106 (MOCK_PORT). Compose starts it only with COMPOSE_PROFILES=mock
make dev       # next dev on :3097 (PORT); SAFELIGHT_DEV_ORIGINS=host allows a LAN origin
make test      # vitest
make lint      # eslint + tsc
make check     # lint + test + build, what CI runs; run it before every PR
make fixture   # uv run scripts/make_fixture.py
```

Single test: `cd web && npx vitest run -t "name"` (or the Docker equivalent the Makefile prints).

## Modern Web Guidance

Frontend work here uses the [Modern Web Guidance](https://developer.chrome.com/docs/modern-web-guidance) skill (`/modern-web-guidance`). It is installed per user, not committed, because it fetches its guides with `npx` at query time: `/plugin marketplace add GoogleChrome/modern-web-guidance` then `/plugin install modern-web-guidance@googlechrome` in Claude Code, or `npx modern-web-guidance@latest install` for other agents. Search it before writing dialog, popover, form, image or CSP code; `npx -y modern-web-guidance@latest legacy-scan web/src --json` is the modernization pass (clean as of issue #23).

House exceptions to its advice, with the reason:

- **Browser support:** Baseline widely available, plus newly available features that degrade on their own (`closedby="any"` on the purge dialog keeps an `onClick` backdrop fallback). No polyfills.
- **Shield detail stays `popover="manual"`** with `placeBeside` and React state, not `popover="hint"` + `interestfor` + anchor positioning: none of those three is in every current engine, and the guide's way needs a polyfill for each.
- **The status card and `Tip` stay CSS-revealed** (`group-hover`/`group-focus-within`) for the same reason, with `useEscapeDismiss` covering WCAG 1.4.13's "dismissible".
- **History thumbnails load darkroom's full image**, lazily. Darkroom serves no thumbnail size; that is a darkroom change, not a client one.

## Conventions & gotchas

- **The browser decides nothing.** Outcome, cell states, blur, the fired rule: all from the record. Do not reclassify rules, compare scores to thresholds, or infer a policy's mode from its name (`/policies` says `mode`). The blur threshold in the form changes the request, not the display.
- **Never an `<img>` for deleted, omitted, refused or failed.** `hasImage()` is the gate; `ResultView.test.tsx` asserts no `img`/`picture`/`canvas`/`video` in the DOM for those outcomes. Images load by id (`imageUrl(id)` → `GET /image/{id}`), never by `image.path`.
- **Deleted must not read like omitted.** Deleted is red, "destroyed", names the rule, policy and scan context. Omitted is plain, "withheld", names NudeNet's score or its silence. Keep the wording in `outcome.ts`.
- **Age wording** is in `age.ts` only: "MiVOLO estimate: N" with the hover text, never a bare age or an "Age" field. Minor-exposed deletions are phrased as "a MiVOLO age estimate under 18 together with NudeNet exposure".
- **Shields carry a mark and a label** (`shieldMark`, `shieldLabel`); colour is never the only signal. The enforcing policy is first in every grid and labelled.
- **A shield's detail is a native popover** (`popover="manual"`, placed by `placeBeside`). It has to be in the top layer: the grids scroll and the pre-flight shields sit in the compose dialog, so `absolute` and `z-index` get clipped or hidden.
- **Modals are native `<dialog>` opened with `showModal()`** (`ComposeDialog`, `PolicyDialog`, `PurgeDialog`): the browser gives the inert page, focus containment, Escape and the top layer, so no `role="dialog"`, `aria-modal`, focus trap or Escape listener. Name each with `aria-labelledby`. Close with `dialog.close()` and react in `onClose`, so the focus returns to the opener; unmounting an open dialog skips that. jsdom has no `showModal`; the component tests stub it.
- **Hover and focus content closes on Escape** without the pointer or focus moving (WCAG 1.4.13): `useEscapeDismiss` for the CSS-revealed `Tip` and status card, a document listener in `ShieldCell`, which also `preventDefault`s so the same Escape does not close the compose dialog behind it.
- **CSP:** `src/proxy.ts` sets a nonce CSP on every page (`lib/csp.ts`): nonced scripts with `'strict-dynamic'`, nonced styles, and darkroom's origin for `connect-src`/`img-src`, resolved from the request's Host with `darkroomUrl()`. The layout puts the nonce on `THEME_BOOT`; any new inline `<script>` needs it too, and a server-rendered `style` attribute is blocked in production (set styles from the client, as `LiveView` and `placeBeside` do). Development adds `'unsafe-eval'` and `'unsafe-inline'` styles for `next dev` only. Reading the nonce makes every route dynamic, which is expected.
- **Server and browser must render the same text.** Anything that depends on `window` (the darkroom URL the page calls, the theme) goes through `useSyncExternalStore` with a server snapshot, or the page logs a hydration error on any host but localhost.
- **Disagreement needs two verdicts.** `rowDisagrees` is false while a cell is pending and when either cell is `unchecked`; the ≠ badge and the "Prompt changed the verdict" filter both use it. `promptTurned` (dashed outline) is safe → flagged/illegal only.
- **`types.ts` mirrors darkroom's contract.** When darkroom's record shape changes, change `types.ts`, `scripts/make_fixture.py`, the mock, and run `make fixture`, or the tests drift from the server. Check a change against the real server with darkroom's `make demo` (same shapes, fake backends), not only the mock.
- **`outcome_reason` is a joined list.** `policy:letter` codes and words, comma-separated (`adult-granular:A, minor-exposed`). Read it with `reasonParts`, and never compare the whole string to a word. `firedCell` matches a code on its policy as well as its letter, because letters mean different things per policy.
- **A record refused in pre-flight resolved nothing.** `checkpoint`, `vae`, `workflow_sha256` and `engine_version` are null, `loras` is empty, and `seed` and `sampling` are only what the request sent. `fromRecord` keeps the form's own values for those.
- **Trigger words are per LoRA and per request.** They are in the request's `loras[].trigger_words` and in the record's `request.loras[].trigger_words`; darkroom appends them to the final prompt. `fromRecord` refills them. Never append them in the client.
- **Hooks lint is strict** (`react-hooks/set-state-in-effect`, `react-hooks/refs`): no synchronous `setState` inside effects. Use `useLoad` for keyed fetches, `useSyncExternalStore` for browser state (see `theme.ts`), and derive loading from keys rather than resetting state in effects.
- **Themes:** tokens in `globals.css` under `:root`/`[data-theme=dark]` and `[data-theme=light]`, mapped by `@theme inline`. Use token classes (`bg-base-800`, `text-text-secondary`, `text-caption`, …), not raw hex. Anything drawn on a shield uses `fill-on-shield`/`stroke-on-shield`.
- **Removing an image is not deleting a record.** `DELETE /record/{id}` keeps the record, so that action says "images" and skips rows with none. Only a devmode darkroom deletes records, with `POST /purge` or `POST /purge/{id}`; **Purge N records** renders only with `health.devmode`.
- **Purge all** renders only when `health.devmode`; `History.test.tsx` asserts the button is absent from the DOM otherwise. The mock answers 404 to `POST /purge` without `MOCK_DEVMODE`, as darkroom does.
- **Fixture content:** flat colour fields with a label and nothing else. Nothing sexual, violent or otherwise flagged goes in the repo, generated or not.
- **Git:** `main` releases, `dev` is the working branch, topic branches off `dev` with a PR into `dev` (see `.cursor/rules/git-workflow.mdc`). Run `make check` before a PR. Never force-push; never commit `.env`.
