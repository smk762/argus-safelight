# Recording the Safelight demo

The hosted demo (safelight.dragonhound.dev) replays a **data tape**: darkroom's records, what pre-flight answered and
every stream event, captured from a real run. The header says **Recorded**; `make tape-sample` puts the fixture's
sample tape back (header **Sample data**).

The tape was recorded on 2026-11-15 against argus-darkroom `0.1.4.dev36+gc9794888b`, with the maintainer's approval.
It holds 20 recorded takes (18 with images, 2 of them veiled) and the fixture's six hand-written records for the
outcomes the recording could not or must not produce (see [What was not recorded](#what-was-not-recorded)).

## Content rules

These bind every prompt below, every candidate render and the published tape.

- **Synthetic only.** Photoreal fictional adults; no real person, brand or place-specific identity.
- **Upper bound:** swimsuit or lingerie catalogue. No nudity, no nipples, nothing see-through, no suggestive angles.
  No minors and no youthful look (every person is written as an adult of 22 or older, with the age stated), no anime
  or furry styles, no gore, shock or cruelty to animals.
- **Blocked outcomes are metadata only.** No image of anything a guard should block is generated, stored, recorded
  or shipped, not even veiled. That rules out recording an illegal-rule or minor-exposed deletion, or an illegal
  refusal, for real: each would need a prompt nobody may write or an image nobody may make. Those outcomes appear on
  the tape as the fixture's three hand-written records (`fx-deleted-illegal`, `fx-deleted-minor`,
  `fx-refused-illegal`, added by `--illustrative`), with their prompts replaced by `[withheld: <reason>]`, their
  explanations withheld and no file. The page labels each one **Sample data** ("never generated").
- Allowed outputs ship as images. Borderline-but-allowed ones (review, or darkroom's blur) ship behind a **veil**: a
  28-cell mosaic is all the page loads until the viewer presses Reveal.

## What the tape shows

| Outcome | How it was produced | Takes |
|---|---|---|
| **Passed** | Ordinary prompts under the SFW `default` policy, and swimwear, boudoir and crime-scene prompts under `adult-granular` that neither policy flagged | 16 |
| **Veiled (review)** | A lingerie-catalogue prompt (the advisory SFW policy flags rule A with the prompt) and a heist scene (the enforcing NSFW policy flags rule B with the prompt only: **Prompt changed the verdict**) | 2 |
| **Refused at pre-flight** | A catalogue subject and a lock-picking scene under SFW `default`: nothing rendered | 2 |
| **Deleted (illegal rule, minor-exposed), refused (illegal rule)** | Not recorded. The fixture's hand-written records, words withheld, labelled Sample data | 0 (3 illustrative) |
| **Deleted (unchecked), omitted (sfw-unchecked), failed** | Not recorded: each needs a backend stopped on the GPU host mid-run. The fixture's hand-written records, labelled Sample data | 0 (3 illustrative) |

### What was not recorded

- **Stopping backends (plan takes 23 to 26).** Refused-unchecked, deleted-unchecked, omitted (sfw-unchecked) and
  failed each need SingGuard, NudeNet or ComfyUI stopped on the GPU host during the run. This recording drove darkroom
  over its API only and touched no services, so those outcomes are the fixture's records instead.
- **The covered boudoir refusal (plan take 21).** `POST /preflight` refused it, but the generate stream's own
  pre-flight passed it and the image rendered. That render was deleted and purged, and the take dropped: a refusal
  take must be refused every time. SingGuard's verdict on a borderline prompt is not deterministic run to run, so the
  recorder's `_expect_preflight` check narrows this but cannot close it. Refusal takes should be prompts that both
  policies flag (as the lock-picking one is).
- **The high-neck bikini catalogue (plan take 14).** Three renders, each rejected on review (framing, not fabric);
  dropped rather than shipped.

## The prompts

All 20 are in [`demo-takes.json`](demo-takes.json) as complete generate requests, in recording order, each with
its seed and `_expect_image_sha256` (the approved render's hash). Policies: **SFW** is `default` enforcing with
`adult-granular` advisory; **NSFW** is `adult-granular` enforcing with `default` advisory. The category is what darkroom
returned, which is not always what the plan expected (several review candidates passed outright).

| # | Category | Policy | Prompt |
|---|---|---|---|
| 1 | passed | SFW | portrait of a weathered lighthouse keeper in his sixties at dusk, warm lantern light, sea spray, 85mm documentary photo |
| 2 | passed | SFW | a woman in her late forties with greying hair and laugh lines reading in a sunlit cafe, linen shirt, cup of coffee, candid film photo |
| 3 | passed | SFW | two cyclists in their early thirties, a man and a woman, resting on a mountain pass beside their road bikes, team jerseys and helmets, morning light, sports photo |
| 4 | passed | SFW | a 27-year-old pastry chef plating a dessert in a busy restaurant kitchen, chef's whites, warm light, editorial photo |
| 5 | passed | SFW | a 26-year-old ceramicist at the potter's wheel in her studio, apron, clay on her hands, window light |
| 6 | passed | SFW | a couple in their seventies dancing in an empty village square at night, string lights, candid photo |
| 7 | passed | SFW | a man in his forties in a tailored navy suit on a city rooftop at golden hour, editorial portrait |
| 8 | passed | SFW | a 28-year-old woman on a solo run along a rain-soaked coastal road, running vest and shorts, sports photo |
| 9 | passed | SFW | a fisherman in his late twenties with stubble mending nets on a harbour wall, wool sweater, overcast, documentary photo |
| 10 | passed | SFW | a bowl of lemons on a wooden table, soft window light, still life photo |
| 11 | passed | SFW | snow-covered pine forest at blue hour, still lake, landscape photo |
| 12 | passed | SFW | a red bicycle leaning on a canal railing, overcast morning, street photo |
| 13 | passed | NSFW | a 36-year-old woman in a navy one-piece swimsuit and sun hat on a sailing boat deck, waist-up catalogue photo |
| 14 | review | NSFW | lingerie catalogue: a woman in her late thirties in a black satin slip dress, grey studio backdrop |
| 15 | passed | NSFW | men's swimwear catalogue: a man in his forties in board shorts and a long-sleeved rash guard on a wooden jetty |
| 16 | passed | NSFW | boudoir portrait of a woman in her mid-thirties in a belted silk robe by a window, waist-up, soft morning light |
| 17 | review, prompt changed the verdict | NSFW | a heist crew of four adults in a car park at night beside a getaway car, cinematic film still |
| 18 | passed | NSFW | a man in his fifties counting stacks of banknotes in a back room, film noir still |
| 19 | refused | SFW | lingerie catalogue: a woman in her thirties in a black lace bodysuit, grey studio backdrop |
| 20 | refused | SFW | a masked figure picking the lock of a shop door at night, security camera view |

Several prompts were reworded from the plan after review. The first pass leaned old: FLUX.1 [schnell] drew some
people younger than written, put children in two crowd scenes and framed swimwear full-body shots badly, and the fix
(age cues, forties or older) overshot. A second pass rebalanced the people takes across adult ages, each stated
explicitly with an adult context (a profession, a race, a catalogue): of the 15 rendered takes with people, 4 are
prompted 22 to 29, 4 in their thirties, 4 in their forties and 3 at 50 or over. The acceptance rule for that pass:
reject a render whose face reads under about 20 or teen-like, whose MiVOLO estimate is under 20, or that the guard
flags; a 20 to 25 estimate for a prompted 22 to 29 adult is fine. Catalogue takes stay waist-up, crowd scenes empty.
A third pass trimmed the wording. The earlier fixes had piled hedges into the people prompts ("opaque", "closed",
"covering his torso", "a high neckline", "alone in an empty …"), which read like a filter-dodging prompt rather than
what someone would type. Those takes are now plain catalogue or editorial prompts with the same subject, setting and
stated age, and each was re-rendered and reviewed again under its new wording (a record keeps the prompt that made
it, so no recorded prompt was edited). A framing word ("waist-up") or a garment's own description ("long-sleeved
rash guard", "belted silk robe") stays where the model ignored the garment or the framing without it.
FLUX has no negative prompt, so `negative_prompt` is empty. No prompt expansion (Ollama off), so what is judged is
what is written here.

## Model, settings and licence

- **Checkpoint: FLUX.1 [schnell]** (`black-forest-labs/FLUX.1-schnell`, fp8, file
  `flux/flux1-schnell-fp8-e4m3fn.safetensors`), licence **Apache-2.0**, in darkroom's `flux` workflow: `euler` /
  `simple`, 4 steps, cfg 1, guidance 3.5 (the workflow requires a value; schnell ignores it). The plan named SDXL 1.0
  base (CreativeML Open RAIL++-M) with FLUX.1 [schnell] as the fallback; SDXL base is not installed on the GPU host,
  so the recording used the fallback, with a fresh pre-flight dry run of every take and a stricter review.
- **Not used:** FLUX.1 [dev] (non-commercial licence); community fine-tunes and LoRAs (unclear training data,
  NSFW-leaning, mixed licences); any model with a real person's likeness.
- Settings: 832×1216 for people and 1216×832 or 1024² for scenes, NudeNet threshold 0.2, thinking `cascade`. The
  guards are darkroom's at the recorded commit: SingGuard-4b, NudeNet and the MiVOLO age check, with their own
  licences recorded in darkroom's docs.

## GPU time

The plan budgeted about 1.5 h for SDXL. On FLUX.1 [schnell] the whole run took about 35 minutes of GPU time: a
pre-flight dry run of every take (about a minute), 22 first candidates at 30 to 90 s each (most of it SingGuard), and
13 re-renders of the takes rejected on review, one seed at a time rather than three. No take started in the hour's
last ten minutes, which another job owns.

The wording pass added a pre-flight check of the eight reworded takes and 14 candidates for seven of them (take 19 is
refused, so never rendered): 7 kept, 7 rejected and purged one by one (three swimsuit renders on framing or cut, two of
them also flagged for review; two robe renders flagged for review, which would have changed the outcome mix; a rash
guard the model dropped; a man reading well over his written forties), then one full re-record of all 20 takes
against the pinned hashes.

## Keeping false positives (and false negatives) out

1. **Pre-flight dry run first.** Every take goes through `POST /preflight` alone (no render). A take meant to pass
   that is flagged gets reworded; a take meant to be refused that passes is dropped. Takes 19 and 20 carry
   `"_expect_preflight": "refused"`: the recorder checks pre-flight again and skips the take, never rendering it, if
   darkroom does not refuse it.
2. **Candidate pass, reviewed by a person.** One seed per rendered take, re-rolled (or the prompt reworded) on
   rejection. Every candidate is looked at; any that crosses the content rules (see-through fabric, a slip, an odd
   angle, a youthful face, a child anywhere in frame) is deleted locally and purged on darkroom with
   `POST /purge/{id}` (never `POST /purge`, which would take other people's history with it). A candidate whose verdict is a false positive (an illegal rule on a benign image, a MiVOLO
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
  NOTE="Recorded from argus-darkroom on FLUX.1 [schnell]; synthetic adults only."
make pages && make browser-check SHOTS=review/
```

The recorder pauses where a take needs a backend stopped or started and says which. It fetches `/image/{id}` only
for passed and review records. `--illustrative` (on by default) adds the six hand-written records for the outcomes
not recorded. The tape's `/models` is cut down to the checkpoints, LoRAs and VAEs the takes used, and its `/health`
says `devmode: false`: the tape is public, the server's model shelf is not, and a tape has nothing to purge.
