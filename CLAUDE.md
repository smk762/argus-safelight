# CLAUDE.md — argus-safelight

Guidance for AI agents working in this repo. Human-facing usage lives in [README.md](README.md); the design and its acceptance list live in [spec.md](spec.md). This file is the orientation an agent needs to change code safely.

## What this is

The standalone **demo UI for argus-darkroom**: compose a prompt, see the pre-flight verdict, generate over SSE, see what every guard said about the output, browse the history. It is a client. Darkroom decides everything; safelight shows the record and decides nothing.

- `web/`: Next.js 16 App Router, React 19, Tailwind v4, vitest 4. **Not** a static export: generation is live. Pages call darkroom directly from the browser at `NEXT_PUBLIC_DARKROOM_URL` (default `http://localhost:8106`, baked in at build).
- `scripts/mock_darkroom.mjs`: a zero-dependency Node mock of darkroom's API that serves `fixture/` and generates new records with the verdict chosen by prompt markers (`[flag]`, `[illegal]`, `[exposed]`, … listed at the top of the file and in the README).
- `scripts/make_fixture.py`: draws `fixture/` (PEP 723 script, `uv run`). `fixture/` is committed; the web tests read it, so it doubles as a contract test between the mock and the UI.

There is no host Node here; the Makefile runs npm in `node:22-bookworm-slim` via Docker when `npm` is missing. Use `docker compose`, never `docker-compose`.

## Layout

- `web/src/lib/`: pure, unit-tested logic. `types.ts` (darkroom's wire contract, `record_version` 1.0), `api.ts` (fetch wrappers, `generate()` over the SSE stream), `sse.ts`, `shields.ts` (cell severity, marks and labels, `policyRows`, `rowDisagrees`, `promptTurned`, `promptChangedVerdict`, `firedCell`), `outcome.ts` (labels, tones, the deleted/omitted wording, `hasImage`), `age.ts` (the only place MiVOLO wording lives), `compose.ts` (form state, `toRequest`, `fromRecord`, `generateBlock`), `live.ts` (the reducer over stream events), `historyQuery.ts` (the filter in the URL), `theme.ts`, `useLoad.ts`.
- `web/src/components/`: `Shell` (header, 380px sidebar, footer links), `DarkroomProvider` (`/health` every 30s, `/policies`, `/models`), `ComposeProvider` (form state, `check`, `start`/`stop`, the live reducer), `ComposeForm`, `PolicyPicker`, `PreflightPanel`, `ComposePane` + `LiveView`, `Shield` / `ShieldCell` / `ShieldGrid`, `OutcomeTiles` (image with blur and reveal, deleted, omitted, failed, the refused panel), `RecordDetails`, `ResultView`, `RecordView` + `RecordActions`, `History` + `PurgeDialog`, `ui.tsx`.
- `web/src/app/`: `/` (compose, live view), `/history`, `/record/[id]`.

## Commands

```bash
make install   # npm ci
make mock      # fixture mock on :8106 (MOCK_PORT)
make dev       # next dev on :3097 (PORT); SAFELIGHT_DEV_ORIGINS=host allows a LAN origin
make test      # vitest
make lint      # eslint + tsc
make check     # lint + test + build, what CI runs; run it before every PR
make fixture   # uv run scripts/make_fixture.py
```

Single test: `cd web && npx vitest run -t "name"` (or the Docker equivalent the Makefile prints).

## Conventions & gotchas

- **The browser decides nothing.** Outcome, cell states, blur, the fired rule: all from the record. Do not reclassify rules, compare scores to thresholds, or infer a policy's mode from its name (`/policies` says `mode`). The blur threshold in the form changes the request, not the display.
- **Never an `<img>` for deleted, omitted, refused or failed.** `hasImage()` is the gate; `ResultView.test.tsx` asserts no `img`/`picture`/`canvas`/`video` in the DOM for those outcomes. Images load by id (`imageUrl(id)` → `GET /image/{id}`), never by `image.path`.
- **Deleted must not read like omitted.** Deleted is red, "destroyed", names the rule, policy and scan context. Omitted is plain, "withheld", names NudeNet's score or its silence. Keep the wording in `outcome.ts`.
- **Age wording** is in `age.ts` only: "MiVOLO estimate: N" with the hover text, never a bare age or an "Age" field. Minor-exposed deletions are phrased as "a MiVOLO age estimate under 18 together with NudeNet exposure".
- **Shields carry a mark and a label** (`shieldMark`, `shieldLabel`); colour is never the only signal. The enforcing policy is first in every grid and labelled.
- **Disagreement needs two verdicts.** `rowDisagrees` is false while a cell is pending and when either cell is `unchecked`; the ≠ badge and the "Prompt changed the verdict" filter both use it. `promptTurned` (dashed outline) is safe → flagged/illegal only.
- **`types.ts` mirrors darkroom's contract.** When darkroom's record shape changes, change `types.ts`, `scripts/make_fixture.py`, the mock, and run `make fixture`, or the tests drift from the server. Check a change against the real server with darkroom's `make demo` (same shapes, fake backends), not only the mock.
- **Trigger words are per LoRA and per request.** They are in the request's `loras[].trigger_words` and in the record's `params.loras[].trigger_words`; darkroom appends them to the final prompt. `fromRecord` refills them. Never append them in the client.
- **Hooks lint is strict** (`react-hooks/set-state-in-effect`, `react-hooks/refs`): no synchronous `setState` inside effects. Use `useLoad` for keyed fetches, `useSyncExternalStore` for browser state (see `theme.ts`), and derive loading from keys rather than resetting state in effects.
- **Themes:** tokens in `globals.css` under `:root`/`[data-theme=dark]` and `[data-theme=light]`, mapped by `@theme inline`. Use token classes (`bg-base-800`, `text-text-secondary`, `text-caption`, …), not raw hex. Anything drawn on a shield uses `fill-on-shield`/`stroke-on-shield`.
- **Purge all** renders only when `health.devmode`; `History.test.tsx` asserts the button is absent from the DOM otherwise. The mock answers 404 to `POST /purge` without `MOCK_DEVMODE`, as darkroom does.
- **Fixture content:** flat colour fields with a label and nothing else. Nothing sexual, violent or otherwise flagged goes in the repo, generated or not.
- **Git:** `main` releases, `dev` is the working branch, topic branches off `dev` with a PR into `dev` (see `.cursor/rules/git-workflow.mdc`). Run `make check` before a PR. Never force-push; never commit `.env`.
