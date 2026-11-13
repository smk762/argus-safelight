# Fixture

Darkroom records for every outcome, and the images the served ones keep, so the UI can be worked on without a GPU. `scripts/mock_darkroom.mjs` serves them as darkroom's API.

- `records/<id>.json`: one record per outcome. passed (with a MiVOLO estimate, and with `age: null`), review (scans disagreeing, and scans agreeing on a non-illegal flag with an advisory cell unchecked), deleted (illegal, minor-exposed, unchecked), omitted (sfw-exposed, sfw-unchecked), refused (a non-illegal flag under SFW, an illegal rule, and an input image refused for exposure under SFW), and failed. Two passed records are image-to-image and inpainting (`request.init_image`, `guard.input`); like darkroom, the fixture keeps no picture of any input.
- `images/<id>.png`: flat colour fields with a label and nothing else. Only passed and review records have one; a deleted or omitted record keeps the sha256 and pHash of bytes that were never written, which is how darkroom works.
- `policies.json` and `models.json`: what `GET /policies` and `GET /models` answer. The policy texts are argus-cortex's (`argus_cortex.moderation.policies`); `default` sends none and is summarised.

The verdicts are written by hand to exercise the UI, not earned by the pictures. No sexual, violent or otherwise flagged content, generated or otherwise, goes in here.

- `darkroom.json`: the darkroom the fixture is recorded against, its repo, `dev` commit and version, copied from the sync record (`web/schema/pins.json`). Every record's `darkroom_version` is that version, and the mock reports it from `/health`. `make lint` fails when the two disagree.

Every record is checked against darkroom's wire schema with every field present, as darkroom serves it (`web/src/lib/wire.test.ts`).

Regenerate with `uv run scripts/make_fixture.py` (or `make fixture`). `make sync` moves the sync record to darkroom's `dev` HEAD first.
