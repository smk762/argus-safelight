# argus-safelight — build doc

Standalone demo UI for [argus-darkroom](../argus-darkroom/spec.md), the way lightbox is the demo for argus-lens and cull is the demo for argus-curator. A user writes a prompt, sees the pre-flight verdict, generates, and sees what each guard said about the output. Images that are destroyed show as their record, never as pixels. The suite-wide UI (argus-studio) gets a full redesign later, once each package's UI is finished. Until then it gets no darkroom tab. This doc is the build plan; the repo does not exist yet.

The server is the product. Safelight is a client: it shows the verdicts darkroom recorded and decides nothing itself.

## What it shows

1. **Compose.**
   - Prompt and negative prompt.
   - Checkpoint and LoRA pickers (`GET /models`), with a weight for each LoRA.
   - Sampler, scheduler, steps, cfg, size and seed (random, or fixed with a lock).
   - Ollama expansion on or off. When on, the expanded prompt is shown before Generate, and it is the text that gets checked.
   - **Policies.** The enforcing policy is labelled as enforcing and defaults to the server's. Each policy carries an **SFW** or **NSFW** badge, taken from `GET /policies`, not worked out from its name in the browser. Choosing an NSFW enforcing policy states what changes: non-illegal pre-flight flags warn instead of blocking, and illegal content is still refused and deleted. When `/health` reports `nsfw_allowed: false`, NSFW policies are offered only as advisory. Advisory policies are checkboxes. The wording of each policy, and its illegal rules, comes from `GET /policies` and is a click away.
   - Thinking mode, and the NudeNet blur threshold.
2. **Pre-flight.** A Check button calls `POST /preflight`. Generate does the same check first, regardless. The panel shows one shield per policy, and the rule and explanation for any shield that is not green. Under an NSFW enforcing policy, a non-illegal flag shows as an amber warning and Generate stays enabled. A refusal says which rule fired, under which policy, in SingGuard's own words. It also shows the final prompt that was judged, so the user sees what the expansion added.
3. **Generate.** Progress comes from the SSE stream: pre-flight, queued, the ComfyUI step bar, then one event per finished scan cell. The shield grid fills in as the scans finish.
4. **Result.**
   - **passed:** the image and an all-green grid.
   - **review:** the image with its grid. Blurred if darkroom set `blur`, until the user clicks to reveal.
   - **deleted:** a tile with no image, stating that the image was destroyed, with the rule, the policy and the scan context that fired, followed by the full record. It has no reveal, because nothing is left to reveal.
   - **omitted:** a plainer tile with no image, stating that the SFW output was withheld because NudeNet reported exposure (with the score), or because NudeNet did not respond. It must look different from deleted, so withheld nudity is not read as illegal content. It has the same record and no reveal.
   - **refused:** the pre-flight panel, with the record.
   - **Age estimate**, when darkroom recorded one: one line per face, e.g. "MiVOLO estimate: 34". It is never shown as a bare age, never in a field labelled "Age", and never shown without the tool's name. Its hover text says it is an automated guess from a face and can be wrong. A deletion for `minor-exposed` says it was triggered by "a MiVOLO age estimate under 18 together with NudeNet exposure", not "a minor".
   - Every result offers **Regenerate**, which refills the form from the record, and **Copy record** (JSON).
5. **History.** Records from `GET /records`, filterable by outcome and by mode. A filter called **Prompt changed the verdict** lists the records where the isolated and with-prompt scans disagree. That filter is the comparison the package exists to show.

6. **Purge all (dev only).** Shown only when `/health` reports `devmode: true`, which is darkroom's `ARGUS_DARKROOM_DEVMODE`, set from `DEVMODE=1` in the compose `.env`. Darkroom also refuses the purge when that is off, so the hidden button is not the only safeguard. Clicking it opens a dialog:
   - It states what will go: N records, M images, and darkroom's ComfyUI history. It cannot be undone.
   - **Download archive** (`GET /archive`) comes first, as the obvious step.
   - **Purge** stays disabled until the user types `purge`, then sends `POST /purge`.
   - Afterwards, the history is empty and the form keeps its settings.

A history view's URL holds its filter. A result's URL holds the record id.

## Shield grid

The grid shows the main finding at a glance, and the detail on hover or tap.

```
                 Isolated   With prompt
adult-granular   [shield]    [shield]     ← enforcing, listed first, labelled
default          [shield]    [shield]     ← advisory
```

| Shield | Cell state | Colour and mark |
|---|---|---|
| safe | `safe` | green, tick |
| flagged | `flagged` | amber, the rule letter(s) |
| illegal | `illegal` | red, a cross and the rule letter(s) |
| unchecked | `unchecked` | grey, a question mark |

- Colour is never the only signal. Each shield also carries a mark and a text label, for colour-blind users and in both light and dark themes.
- The **overall shield**, beside the image, takes the worst cell.
- A **≠** badge appears when the two cells in a row disagree. A dashed outline on the with-prompt column appears when the prompt alone turned an isolated green into amber or red.
- Hovering or tapping a shield shows the rule code, SingGuard's explanation, the thinking mode that judged it, and the cascade's fast verdict when there was one.
- The pre-flight panel uses the same shields, one column wide.

Once release narrows the policies to `default` and one adult policy, the grid is 2 × 2.

## What it does not show

- Pixels, a thumbnail or a preview of a deleted image. It has none to show, and it must not draw a placeholder that suggests the content.
- A second decision in the browser. The outcome and cell states come from the record. The browser does not reclassify rules or apply its own thresholds; changing the blur threshold changes the request sent to darkroom.
- File paths. Images load by record id (`GET /image/{id}`).
- Policy text editing. Policies are chosen by name.
- Captions, curation or training. Link to lightbox and cull instead.

## Shape

```
browser ──▶ safelight :3097 ──▶ argus-darkroom :8106
            compose, shields,     preflight, generate (SSE),
            history               records, images by id
```

- A Next.js app of the same generation as lightbox and cull (App Router, Tailwind tokens from the suite palette, light and dark themes). It is not a static export, because generation is live. Pages call darkroom directly. `NEXT_PUBLIC_DARKROOM_URL` defaults to `http://localhost:8106` and is baked in when the image is built, like cull's `NEXT_PUBLIC_CURATOR_URL`.
- In the darkroom compose file, safelight runs beside the published darkroom image. ComfyUI, Ollama, SingGuard and NudeNet are external and reached by URL.
- Safelight offers Generate only after `GET /health` answers and reports SingGuard reachable. Ollama expansion is disabled, with the reason, when `/health` reports Ollama unreachable.

## Fixture

A committed set of records and images for working on the UI without a GPU, served by a small mock of darkroom's API in `scripts/`.

- Every outcome is represented: passed, review (scans disagreeing, and scans agreeing on a non-illegal flag), deleted (illegal, minor-exposed and unchecked), omitted (sfw-exposed and sfw-unchecked), a record with no age check (`age: null`), refused and failed.
- The images are flat colour fields with a label ("passed sample") and nothing else. A deleted fixture record has no image file, which is how the real thing works.
- No sexual, violent or otherwise flagged content, generated or otherwise, goes in the repo.

## Build order

1. **Shell against the fixture mock.** History list, result view with all six outcomes, the shield grid and its hover detail, both themes.
2. **Compose form.** Model pickers from `GET /models`, policies from `GET /policies`, the pre-flight panel on `POST /preflight`.
3. **Generate.** The SSE stream, the progress bar, the grid filling in cell by cell, the result.
4. **Review handling.** Blur and click-to-reveal; Regenerate from a record; Copy record.
5. **The Prompt changed the verdict filter**, plus URL state for filters and records.
6. **Against the real darkroom**, with compose. README with screenshots taken from the fixture only.

Repo conventions as for darkroom: `main` for releases, `dev` for work, PRs into `dev`, checks run locally before every PR into `dev`.

## Done when

- The purge button does not exist in the DOM unless `/health` reports `devmode`. With it, purging after an archive download leaves an empty history, and the archive holds every record.
- Every fixture outcome renders, and a deleted or omitted record shows no image element at all. Check the DOM, not only what is visible.
- The shield grid can be read in grayscale: every state can be told apart without colour.
- A generation against real darkroom fills the grid as each scan finishes, and the final grid matches `GET /record/{id}`.
- The Prompt changed the verdict filter lists exactly the records whose isolated and with-prompt cells disagree.
- Regenerate from a deleted record refills the form with the same seed and parameters.
- No age appears anywhere in the UI without "MiVOLO estimate" beside it.
- Against a server without `--allow-nsfw`, no NSFW policy can be chosen as enforcing, and NSFW policies can still be ticked as advisory.
