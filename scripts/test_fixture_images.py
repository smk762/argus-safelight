"""The fixture's images are flat colour fields with a label and nothing else (scripts/make_fixture.py).

Measured, not reviewed: each image must be almost entirely one colour, which a picture of anything is not. The label
and its anti-aliasing take about 1% of a 512 px field; a photograph's commonest colour is a sliver of it.

    uv run --no-project --with pytest --with pillow pytest scripts -q
"""

from __future__ import annotations

from pathlib import Path

import pytest

PIL = pytest.importorskip("PIL.Image")

FIXTURE = Path(__file__).resolve().parents[1] / "fixture"
IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif"}
# The share of pixels the commonest colour must cover.
FLAT = 0.95


def images() -> list[Path]:
    return sorted(path for path in FIXTURE.rglob("*") if path.suffix.lower() in IMAGE_SUFFIXES)


def flat_share(path: Path) -> float:
    with PIL.open(path) as image:
        rgb = image.convert("RGB")
        colours = rgb.getcolors(rgb.width * rgb.height) or []
        return max(count for count, _ in colours) / (rgb.width * rgb.height)


def test_the_fixture_has_images() -> None:
    assert images(), "no fixture images found: the check below would pass on nothing"


@pytest.mark.parametrize("path", images(), ids=lambda path: str(path.relative_to(FIXTURE)))
def test_every_fixture_image_is_a_flat_field(path: Path) -> None:
    assert flat_share(path) >= FLAT, f"{path.relative_to(FIXTURE)} is not a flat colour field; the fixture holds nothing else"


def test_a_picture_is_not_a_flat_field(tmp_path: Path) -> None:
    gradient = PIL.new("RGB", (64, 64))
    gradient.putdata([(x * 4, y * 4, 128) for y in range(64) for x in range(64)])
    gradient.save(tmp_path / "gradient.png")
    assert flat_share(tmp_path / "gradient.png") < FLAT
