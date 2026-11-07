# Fixture

Darkroom records for every outcome, and the images the served ones keep, so the UI can be worked on without a GPU. `scripts/mock_darkroom.mjs` serves them as darkroom's API.

- `records/<id>.json`: one record per outcome. passed (with a MiVOLO estimate, and with `age: null`), review (scans disagreeing, and scans agreeing on a non-illegal flag with an advisory cell unchecked), deleted (illegal, minor-exposed, unchecked), omitted (sfw-exposed, sfw-unchecked), refused (a non-illegal flag under SFW, and an illegal rule), and failed.
- `images/<id>.png`: flat colour fields with a label and nothing else. Only passed and review records have one; a deleted or omitted record keeps the sha256 and pHash of bytes that were never written, which is how darkroom works.
- `policies.json` and `models.json`: what `GET /policies` and `GET /models` answer. The policy texts are argus-cortex's (`argus_cortex.moderation.policies`); `default` sends none and is summarised.

The verdicts are written by hand to exercise the UI, not earned by the pictures. No sexual, violent or otherwise flagged content, generated or otherwise, goes in here.

Regenerate with `uv run scripts/make_fixture.py` (or `make fixture`).
