"""Tests for record_tape.py: `uv run --with pytest pytest scripts/test_record_tape.py`. No Pillow needed: no record here is served."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

import record_tape

FIXTURE = Path(__file__).resolve().parents[1] / "fixture"


def fixture_record(record_id: str) -> dict:
    return json.loads((FIXTURE / "records" / f"{record_id}.json").read_text())


def write(out: Path, takes: list) -> None:
    darkroom = json.loads((FIXTURE / "darkroom.json").read_text())
    policies = json.loads((FIXTURE / "policies.json").read_text())
    record_tape.write_tape(
        out,
        kind="sample",
        source="fixture",
        darkroom=darkroom,
        note=None,
        health=record_tape.sample_health(darkroom, policies),
        policies=policies,
        models=json.loads((FIXTURE / "models.json").read_text()),
        takes=takes,
        image_bytes=lambda record: pytest.fail("no record here is served"),
        replayable=lambda record: True,
    )


def test_public_models_keeps_only_named_keys() -> None:
    models = json.loads((FIXTURE / "models.json").read_text())
    shelf = {**models, "embeddings": [{"name": "private-embedding"}], "root": "/srv/models"}
    record = fixture_record("fx-passed")
    out = record_tape.public_models(shelf, [record])
    assert set(out) == {"checkpoints", "default_checkpoint", "loras", "vaes", "workflows", "samplers", "schedulers"}
    assert [c["name"] for c in out["checkpoints"]] == [record["request"]["checkpoint"]["name"]]
    assert out["samplers"] == models["samplers"]


def test_check_leaks_names_the_place_not_the_secret(tmp_path: Path) -> None:
    (tmp_path / "tape.json").write_text('{\n "a": 1,\n "b": "ops@internal.example"\n}\n')
    with pytest.raises(SystemExit) as refused:
        record_tape.check_leaks(tmp_path)
    message = str(refused.value)
    assert "tape.json:3:8: email address" in message
    assert "ops@internal.example" not in message


def test_a_failed_recording_leaves_the_last_tape(tmp_path: Path) -> None:
    out = tmp_path / "data-tape"
    write(out, [(fixture_record("fx-refused"), None, None)])
    before = (out / "tape.json").read_text()
    # A served record that is also blocked is refused part-way through the build.
    bad = {**fixture_record("fx-passed"), "critical": True}
    with pytest.raises(SystemExit):
        write(out, [(fixture_record("fx-omitted-exposed"), None, None), (bad, None, None)])
    assert (out / "tape.json").read_text() == before
    assert sorted(p.name for p in tmp_path.iterdir()) == ["data-tape"]


def test_a_good_recording_replaces_the_last_tape(tmp_path: Path) -> None:
    out = tmp_path / "data-tape"
    write(out, [(fixture_record("fx-refused"), None, None)])
    (out / "takes" / "stale.json").write_text("{}")
    write(out, [(fixture_record("fx-omitted-exposed"), None, None)])
    assert [r["id"] for r in json.loads((out / "tape.json").read_text())["records"]] == ["fx-omitted-exposed"]
    assert not (out / "takes" / "stale.json").exists()
    assert sorted(p.name for p in tmp_path.iterdir()) == ["data-tape"]
