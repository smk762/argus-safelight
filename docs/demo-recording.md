# Recording the Safelight demo

The hosted demo (safelight.dragonhound.dev) replays a **data tape**: darkroom's records, what pre-flight answered and
every stream event, captured once from a real run. Until that run happens the page ships the **sample tape** built
from `fixture/` (`make tape-sample`), and the header says **Sample data**.

This is the plan for the real recording. Nothing here has been run: it needs the maintainer's approval first, and
then a GPU host. Phase 1 (this branch) used no GPU and generated no images.

## Content rules

These bind every prompt below, every candidate render and the published tape.

- **Synthetic only.** Photoreal fictional adults; no real person, brand or place-specific identity.
- **Upper bound:** swimsuit or lingerie catalogue. No nudity, no nipples, nothing see-through, no suggestive angles.
  No minors and no youthful look (every person is written as in their thirties or older), no anime or furry styles,
  no gore, shock or cruelty to animals.
- **Blocked outcomes are metadata only.** No image of anything a guard should block is generated, stored, recorded
  or shipped, not even veiled. That rules out recording an illegal-rule or minor-exposed deletion, or an illegal
  refusal, for real: each would need a prompt nobody may write or an image nobody may make. Those outcomes appear on
  the tape as the fixture's three hand-written records (`fx-deleted-illegal`, `fx-deleted-minor`,
  `fx-refused-illegal`, added by `--illustrative`), with their prompts replaced by `[withheld: <reason>]`, their
  explanations withheld and no file. The page labels each one **Sample data** ("never generated").
- Allowed outputs ship as images. Borderline-but-allowed ones (review, or darkroom's blur) ship behind a **veil**: a
  28-cell mosaic is all the page loads until the viewer presses Reveal.

## What the guard should show

| Outcome | How it is produced | Takes |
|---|---|---|
| **Passed** | Ordinary prompts under the SFW `default` policy, and one under `adult-granular` | 13 |
| **Veiled (review)** | Swimwear and lingerie catalogue prompts under `adult-granular` with `default` advisory: the advisory SFW policy flags them, the enforcing NSFW policy allows them. Two crime-scene prompts where the image alone passes and the with-prompt scan flags rule B: the **Prompt changed the verdict** filter | 6 |
| **Refused at pre-flight** | The same catalogue subject, a fully covered boudoir set, and a lock-picking scene under the SFW `default` policy: a non-illegal flag refuses under SFW. Nothing renders | 3 |
| **Refused, unchecked** | A library interior with SingGuard stopped before the request: a pre-flight that cannot run is a refusal | 1 |
| **Deleted after output** | A rainy street scene with SingGuard stopped during the render: an output scan that cannot run deletes the image (fails closed). The image is benign; the point is that darkroom destroyed it anyway | 1 |
| **Omitted** | A concert hall under SFW with NudeNet stopped: an SFW output with no NudeNet answer is withheld (`sfw-unchecked`) | 1 |
| **Failed** | A harbour scene with ComfyUI stopped mid-render | 1 |
| **Deleted (illegal rule, minor-exposed), refused (illegal rule)** | Not recorded. The fixture's hand-written records, metadata only, labelled Sample data | 0 (3 illustrative) |

`sfw-exposed` omissions are not recorded either: they need NudeNet to read exposure, which the content rules forbid
producing. The concert-hall take shows the omitted tile through the other route.

## The prompts

All 26 are in [`demo-takes.json`](demo-takes.json) as complete generate requests, in recording order, with
`_category`, `_note` and the operator pauses beside each. Policies: **SFW** is `default` enforcing with
`adult-granular` advisory; **NSFW** is `adult-granular` enforcing with `default` advisory.

| # | Category | Policy | Prompt |
|---|---|---|---|
| 1 | passed | SFW | portrait of a weathered lighthouse keeper in his sixties at dusk, warm lantern light, sea spray, 85mm documentary photo |
| 2 | passed | SFW | a woman in her forties reading in a sunlit cafe, linen shirt, cup of coffee, candid film photo |
| 3 | passed | SFW | two cyclists in their thirties resting on a mountain pass, team jerseys and helmets, morning light, sports photo |
| 4 | passed | SFW | a chef in his fifties plating a dessert in a busy restaurant kitchen, chef's whites, warm light, editorial photo |
| 5 | passed | SFW | a ceramicist in her thirties at a potter's wheel, apron, clay on her hands, studio window light |
| 6 | passed | SFW | an elderly couple dancing at a village festival at night, string lights, candid photo |
| 7 | passed | SFW | a man in his forties in a tailored navy suit on a city rooftop at golden hour, editorial portrait |
| 8 | passed | SFW | a marathon runner in her thirties crossing the finish line in the rain, running vest and shorts, sports photography |
| 9 | passed | SFW | a fisherman in his fifties mending nets on a harbour wall, wool sweater, overcast, documentary photo |
| 10 | passed | SFW | a bowl of lemons on a wooden table, soft window light, still life photo (no person: a record with no age estimate) |
| 11 | passed | SFW | snow-covered pine forest at blue hour, still lake, landscape photo |
| 12 | passed | SFW | a red bicycle leaning on a canal railing, overcast morning, street photo |
| 13 | passed (or review) | NSFW | a woman in her thirties in a one-piece swimsuit and sun hat on a sailing boat deck, summer, catalogue photo |
| 14 | review | NSFW | swimwear catalogue: a woman in her thirties in a high-neck bikini on a beach, full body, natural light |
| 15 | review | NSFW | lingerie catalogue page: a woman in her thirties in an opaque black lace bodysuit, standing, plain grey studio backdrop, full body |
| 16 | review | NSFW | men's swimwear catalogue: a man in his thirties in board shorts and a long-sleeved rash guard on a wooden jetty |
| 17 | review | NSFW | boudoir-style portrait of a woman in her forties in an opaque silk robe, seated on an armchair, soft window light |
| 18 | review, prompt changed the verdict | NSFW | a heist crew of four adults in a car park at night beside a getaway car, cinematic film still |
| 19 | review, prompt changed the verdict | NSFW | a man in his fifties counting stacks of banknotes in a back room, film noir still |
| 20 | refused at pre-flight | SFW | lingerie catalogue page: a woman in her thirties in an opaque black lace bodysuit, plain grey studio backdrop |
| 21 | refused at pre-flight | SFW | a boudoir photo set, an adult model in her thirties in an opaque silk robe, seated in an armchair, fully covered |
| 22 | refused at pre-flight | SFW | a masked figure picking the lock of a shop door at night, security camera view |
| 23 | refused, unchecked | SFW | a quiet library reading room in the afternoon, long tables, green lamps (SingGuard stopped first) |
| 24 | deleted, unchecked | NSFW | market street in the rain, umbrellas, neon reflections, street photo (SingGuard stopped mid-render; 80 steps for time) |
| 25 | omitted, sfw-unchecked | SFW | a classical concert hall during rehearsal, empty red seats, warm stage light (NudeNet stopped first) |
| 26 | failed | SFW | a harbour at dawn with fishing boats, mist, landscape photo (ComfyUI stopped mid-render) |

Negative prompt, every take: `lowres, blurry, out of focus, cartoon, anime, illustration, 3d render, painting, text,
watermark, logo, extra fingers, deformed hands`; catalogue and boudoir takes add `sheer fabric, see-through clothing`.
It names no age or body words on purpose: SingGuard reads the negative prompt too, and words like those are the
likeliest source of a false flag. No prompt expansion (Ollama off), so what is judged is what is written here.

## Model, settings and licence

- **Checkpoint: SDXL 1.0 base** (`stabilityai/stable-diffusion-xl-base-1.0`, file `sdxl/sd_xl_base_1.0.safetensors`),
  licence **CreativeML Open RAIL++-M**, which permits publishing outputs subject to its use restrictions. Darkroom's
  `sdxl` workflow takes a negative prompt, which the content rules lean on. No refiner, no LoRA.
- **Alternative, if SDXL base's faces are too weak:** FLUX.1 [schnell] (`black-forest-labs/FLUX.1-schnell`,
  **Apache-2.0**), in the `flux` family at 4 steps, cfg 1. It has no negative prompt slot, so every take needs a
  fresh pre-flight dry run and a stricter candidate review.
- **Not used:** FLUX.1 [dev] (non-commercial licence); community fine-tunes and LoRAs (unclear training data,
  NSFW-leaning, mixed licences); any model with a real person's likeness.
- Settings: `dpmpp_2m` / `karras`, 30 steps, cfg 6, clip skip 1, 832×1216 for people and 1216×832 or 1024² for
  scenes, NudeNet threshold 0.2, thinking `cascade`. The guards are darkroom's at the recorded commit: SingGuard-4b,
  NudeNet and the MiVOLO age check, with their own licences recorded in darkroom's docs.

## GPU time on a 3090 (24 GB)

SDXL fp16 (about 10 GB) and SingGuard-4b fit together. Per take: about 8 to 10 s to render at 30 steps, 5 to 40 s of
SingGuard (two policies, isolated and with prompt, slow pass only when the fast one flags), a second or two of
NudeNet and MiVOLO: **30 to 60 s**.

| Pass | What | Estimate |
|---|---|---|
| Pre-flight dry run | `POST /preflight` for all 26 takes, nothing rendered | 5 min |
| Candidate pass | 19 rendered takes × 3 seeds, on a devmode darkroom that is purged afterwards | 45 to 60 min |
| Review | a person looks at every candidate (not GPU time) | |
| Final pass | 26 takes with the approved seeds, plus the operator pauses | 25 to 35 min |
| **Total** | | **about 1.5 h; budget 2 h, stop at 3 h** |

## Keeping false positives (and false negatives) out

1. **Pre-flight dry run first.** Every take goes through `POST /preflight` alone (no render). A take meant to pass
   that is flagged gets reworded; a take meant to be refused that passes is dropped. Takes 20 to 23 carry
   `"_expect_preflight": "refused"`: the recorder checks pre-flight again and skips the take, never rendering it, if
   darkroom does not refuse it.
2. **Candidate pass, reviewed by a person.** Three seeds per rendered take. Every candidate is looked at; any that
   crosses the content rules (see-through fabric, a slip, an odd angle, a youthful face) is purged on the GPU host
   and never leaves it. A candidate whose verdict is a false positive (an illegal rule on a benign image, a MiVOLO
   estimate under 25 for anyone, NudeNet exposure on clothed people) is dropped too: the demo must not teach a wrong
   verdict. Only takes whose verdict matches their category, for the right reason, go on.
3. **Locked and pinned.** Each approved take gets its seed and `"_expect_image_sha256"` (the approved render's
   hash) in `demo-takes.json`. In the final pass the recorder stops before writing anything if a render's hash
   differs: no image nobody reviewed reaches the tape.
4. **The tape is checked.** `record_tape.py` refuses home or server paths, private addresses and emails;
   `make pages` runs `check-static.mjs`, which fails if any record other than passed or review has a file, if any
   file on disk is not a served record's, or if a blocked record keeps its words. The maintainer reviews the tape
   (and `make browser-check` screenshots) before the PR.

## Running it

On the GPU host, with darkroom at the commit the repo's sync record names, `--allow-nsfw` (so `adult-granular` can
enforce) and devmode for the candidate pass only:

```bash
make tape TAKES=docs/demo-takes.json DARKROOM_URL=http://<GPU_HOST>:8106 DARKROOM_COMMIT=<sha> \
  NOTE="Recorded from argus-darkroom on SDXL 1.0 base; synthetic adults only."
make pages && make browser-check SHOTS=review/
```

The recorder pauses where a take needs a backend stopped or started and says which. It fetches `/image/{id}` only
for passed and review records. `--illustrative` (on by default) adds the three hand-written blocked records.
