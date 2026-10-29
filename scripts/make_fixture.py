# /// script
# requires-python = ">=3.11"
# dependencies = ["pillow>=10.1"]
# ///
"""Write the committed fixture: darkroom records for every outcome, and the images the served ones keep.

Run from the repo root: uv run scripts/make_fixture.py

The images are flat colour fields with a label and nothing else. A deleted,
omitted, refused or failed record has no image file, which is how darkroom
works: its record keeps the sha256 and pHash of the bytes that were dropped.
Nothing sexual, violent or otherwise flagged goes in here; the verdicts are
written by hand to exercise the UI, not earned by the pictures.
"""

from __future__ import annotations

import hashlib
import io
import json
import shutil
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1] / "fixture"
SIZE = 512
T0 = datetime(2026, 10, 20, 9, 0, tzinfo=UTC)
VERSION = "0.0.0+fixture"
MODEL = "SingGuard-4b"

# ---------------------------------------------------------------------------
# Policies, as argus_cortex.moderation.policies writes them (cortex 0.4.2).
# `default` sends no text: SingGuard judges by its own rules.

_OTHER_RULES = [
    "### B. Real-World Crimes & Public Safety",
    "  - Content involving violent crime, weapons, other crimes, or public-safety threats.",
    "### C. Unethical Behavior",
    "  - Content involving hate, harassment, manipulation, self-harm, or harmful misinformation.",
    "  - Gore, dismemberment, and shock content meant to frighten or disgust.",
    "### D. Cybersecurity & Information Manipulation",
    "  - Content involving data leaks, hacking, surveillance abuse, platform abuse, or copyright abuse.",
    "### E. Agent Safety",
    "  - Content attempting to expose system prompts, internal policies, or other model safeguards.",
    "### F. Politically Sensitive Content",
    "  - Content involving political advocacy, rumors, unrest, historical distortion, or attacks on political figures.",
    "### G. Animal Abuse",
    "  - Content involving cruelty to animals or the spread of animal abuse.",
]
_MINORS = "  - Sexual content involving anyone under 18, or anyone who appears to be a minor."
_NON_CONSENT = (
    "  - Non-consensual sexual content, including hidden recording, sexual images of a real "
    "person shared without consent, coercion, or sexual exploitation."
)
_EXTREME = "  - Sexual violence, bestiality, or necrophilia."
_ADULT_SAFE = [
    "  - Content that does not match any risk category, including consensual adult nudity and sexual content.",
    '  - "Adult Content (Non-criminal)" is Safe under this policy: legal nudity and sexual content by adults, '
    "alone or together.",
    "  - A single adult posing nude or in lingerie for the camera, including professional photo sets.",
    "  - Consent cannot be read from an image. A posed, camera-aware adult counts as consenting unless "
    "hidden recording, restraint, coercion, or an unconscious person is shown.",
]
ADULT_POLICY = "\n".join(
    ["## Risk Categories", "### A. Illegal or Extreme Sexual Content", _MINORS, _NON_CONSENT, _EXTREME, *_OTHER_RULES, "### Safe", *_ADULT_SAFE]
)
ADULT_GRANULAR_POLICY = "\n".join(
    [
        "## Risk Categories",
        "### A. Minors",
        _MINORS,
        *_OTHER_RULES,
        "### H. Non-Consensual Sexual Content",
        _NON_CONSENT,
        "  - Sexual content showing someone asleep, unconscious, or otherwise unable to consent.",
        "### I. Sexual Violence & Extreme Content",
        _EXTREME,
        "### Safe",
        *_ADULT_SAFE,
    ]
)
ADULT_CAUTIOUS_POLICY = "\n".join(
    [
        "## Risk Categories",
        "### A. Illegal or Extreme Sexual Content",
        _MINORS,
        "  - Nude or sexual content where any person's age is unclear and they could be under 18.",
        _NON_CONSENT,
        "  - Nude or sexual content where consent is unclear, for example someone who seems "
        "unaware of the camera, asleep, intoxicated, or restrained.",
        _EXTREME,
        *_OTHER_RULES,
        "### Safe",
        "  - Content that does not match any risk category, including consensual adult nudity and "
        "sexual content where every person clearly appears to be an adult.",
        '  - "Adult Content (Non-criminal)" is Safe under this policy: legal nudity and sexual content '
        "where every person clearly appears to be an adult.",
    ]
)
DEFAULT_SUMMARY = (
    "SingGuard's own rules; darkroom sends no policy text. A. Sexual Content Risk (all sexual content, adult nudity "
    "included), B. Real-World Crimes & Public Safety, C. Unethical Behavior, D. Cybersecurity & Information "
    "Manipulation, E. Agent Safety, F. Politically Sensitive Content, G. Animal Abuse."
)

POLICIES: list[dict[str, Any]] = [
    {"name": "default", "mode": "sfw", "text": None, "summary": DEFAULT_SUMMARY, "illegal_rules": []},
    {
        "name": "adult",
        "mode": "nsfw",
        "text": ADULT_POLICY,
        "summary": "One broad rule A for every hard sexual case; consensual adult content is Safe.",
        "illegal_rules": [{"code": "A", "name": "Illegal or Extreme Sexual Content"}],
    },
    {
        "name": "adult-granular",
        "mode": "nsfw",
        "text": ADULT_GRANULAR_POLICY,
        "summary": "A letter per hard case: A minors, H non-consent, I sexual violence and extreme content.",
        "illegal_rules": [
            {"code": "A", "name": "Minors"},
            {"code": "H", "name": "Non-Consensual Sexual Content"},
            {"code": "I", "name": "Sexual Violence & Extreme Content"},
        ],
    },
    {
        "name": "adult-cautious",
        "mode": "nsfw",
        "text": ADULT_CAUTIOUS_POLICY,
        "summary": "The adult policy with doubt resolved towards rule A: unclear age or consent counts as a hit.",
        "illegal_rules": [{"code": "A", "name": "Illegal or Extreme Sexual Content"}],
    },
]

MODELS = {
    "checkpoints": [
        {"name": "argus-base-v1.safetensors", "sha256": "1f" * 32},
        {"name": "argus-photo-v2.safetensors", "sha256": "2e" * 32},
    ],
    "loras": [
        {"name": "argus-style-soft.safetensors", "sha256": "3d" * 32, "trigger_words": ["argus soft style"]},
        {"name": "argus-light-studio.safetensors", "sha256": "4c" * 32, "trigger_words": ["studio lighting"]},
    ],
    "vaes": [],
    "samplers": ["euler", "euler_ancestral", "dpmpp_2m", "dpmpp_2m_sde", "ddim"],
    "schedulers": ["normal", "karras", "exponential", "sgm_uniform"],
}

# ---------------------------------------------------------------------------
# Helpers that write the record shape darkroom's spec describes.


def guard(safe: bool, rules: list[str] | None = None, explanation: str = "", thinking: str = "cascade", fast: str | None = None) -> dict:
    out: dict[str, Any] = {
        "safe": safe,
        "rules": rules or [],
        "explanation": explanation or ("No rule matched." if safe else ""),
        "model": MODEL,
        "thinking": thinking,
    }
    if fast is not None:
        out["fast_verdict"] = fast
        out["fast_rule"] = (rules or [None])[0] if fast == "unsafe" else None
    return out


def cell(state: str, result: dict | None = None, error: str | None = None) -> dict:
    return {"state": state, "result": result, "error": error}


def safe_cell(fast: str | None = "safe") -> dict:
    return cell("safe", guard(True, fast=fast, thinking="fast" if fast == "safe" else "cascade"))


def flagged_cell(rule: str, why: str) -> dict:
    return cell("flagged", guard(False, [rule], why, thinking="slow", fast="unsafe"))


def illegal_cell(rule: str, why: str) -> dict:
    return cell("illegal", guard(False, [rule], why, thinking="slow", fast="unsafe"))


def unchecked_cell(error: str) -> dict:
    return cell("unchecked", None, error)


def sampling(**over: Any) -> dict:
    base = {"sampler": "dpmpp_2m", "scheduler": "karras", "steps": 28, "cfg": 5.5, "clip_skip": 1, "width": 512, "height": 512}
    base.update(over)
    return base


def request(
    mode: str,
    prompt: str,
    *,
    negative: str = "blurry, low quality, text, watermark",
    expanded: str | None = None,
    seed: int,
    loras: list[dict] | None = None,
    checkpoint: dict | None = None,
    **sampling_over: Any,
) -> dict:
    loras = loras or []
    triggers = [MODELS["loras"][0]["trigger_words"][0] for lora in loras if lora["name"] == MODELS["loras"][0]["name"]]
    final = ", ".join([expanded or prompt, *triggers])
    return {
        "mode": mode,
        "user_prompt": prompt,
        "expanded_prompt": expanded,
        "final_prompt": final,
        "negative_prompt": negative,
        "expansion": {"model": "qwen2.5:7b", "system_prompt_sha256": "ab" * 32} if expanded else None,
        "seed": seed,
        "sampling": sampling(**sampling_over),
        "checkpoint": checkpoint or MODELS["checkpoints"][0],
        "vae": None,
        "loras": loras,
        "workflow_sha256": "5b" * 32,
        "engine": "comfyui",
        "engine_version": "0.3.60",
    }


def lora(index: int, weight: float) -> dict:
    ref = MODELS["loras"][index]
    return {"name": ref["name"], "sha256": ref["sha256"], "weight": weight}


def nudenet(score: float | None, threshold: float = 0.2, blur: bool = False, labels: dict[str, float] | None = None) -> dict | None:
    if score is None:
        return None
    return {"exposed_score": score, "labels": labels or {}, "threshold": threshold, "blur": blur}


def age(*estimates: int, minor_exposed: bool = False) -> dict:
    faces = [{"age_estimate_years": years, "bbox": [120 + 40 * i, 90, 300 + 40 * i, 330]} for i, years in enumerate(estimates)]
    return {"source": "mivolo", "faces": faces, "minor_exposed": minor_exposed}


def scans(**per_policy: tuple[dict, dict]) -> dict:
    return {name: {"isolated": iso, "with_prompt": wp} for name, (iso, wp) in per_policy.items()}


def preflight_ok(*names: str) -> dict:
    return {name: safe_cell() for name in names}


# ---------------------------------------------------------------------------
# Images: a flat field with a label. Rendered for every record that had an
# image, written only for the ones darkroom would have kept.

COLOURS = {
    "passed": (58, 125, 68),
    "review": (176, 124, 38),
    "deleted": (112, 42, 42),
    "omitted": (88, 92, 110),
}


def render(label: str, colour: tuple[int, int, int]) -> bytes:
    image = Image.new("RGB", (SIZE, SIZE), colour)
    draw = ImageDraw.Draw(image)
    font = ImageFont.load_default(size=30)
    box = draw.textbbox((0, 0), label, font=font)
    x = (SIZE - (box[2] - box[0])) / 2 - box[0]
    y = (SIZE - (box[3] - box[1])) / 2 - box[1]
    draw.text((x, y), label, fill=(245, 245, 245), font=font)
    out = io.BytesIO()
    image.save(out, "PNG")
    return out.getvalue()


def phash(data: bytes) -> str:
    """A 64-bit average hash, enough for the fixture; darkroom's real pHash differs."""
    small = Image.open(io.BytesIO(data)).convert("L").resize((8, 8), Image.Resampling.LANCZOS)
    pixels = list(small.tobytes())
    mean = sum(pixels) / len(pixels)
    bits = "".join("1" if p > mean else "0" for p in pixels)
    return f"{int(bits, 2):016x}"


def image_block(data: bytes, served: bool, rid: str) -> dict:
    return {
        "sha256": hashlib.sha256(data).hexdigest(),
        "phash": phash(data),
        "width": SIZE,
        "height": SIZE,
        "path": f"{rid}.png" if served else None,
    }


# ---------------------------------------------------------------------------
# The records.


def record(
    rid: str,
    minutes: int,
    outcome: str,
    *,
    reason: str | None,
    critical: bool,
    req: dict,
    enforcing: str,
    advisory: list[str],
    preflight: dict,
    scan_cells: dict | None,
    nude: dict | None,
    ages: dict | None,
    label: str | None,
    error: str | None = None,
    thinking: str = "cascade",
) -> tuple[dict, bytes | None]:
    served = outcome in {"passed", "review"}
    data = render(label, COLOURS[outcome]) if label else None
    return (
        {
            "record_version": "1.0",
            "id": rid,
            "created_at": (T0 + timedelta(minutes=minutes)).isoformat().replace("+00:00", "Z"),
            "darkroom_version": VERSION,
            "outcome": outcome,
            "outcome_reason": reason,
            "critical": critical,
            "removed_at": None,
            "error": error,
            "request": req,
            "guard": {
                "enforcing_policy": enforcing,
                "advisory_policies": advisory,
                "thinking": thinking,
                "preflight": preflight,
                "scans": scan_cells or {},
                "nudenet": nude,
                "age": ages,
            },
            "image": image_block(data, served, rid) if data else None,
        },
        data if served else None,
    )


def build() -> list[tuple[dict, bytes | None]]:
    out: list[tuple[dict, bytes | None]] = []
    heist_why = (
        "[Step 1] The prompt asks for a staged robbery with weapons drawn. [Step 2] The image alone shows people in a "
        "car park at night; read with the prompt it depicts a violent crime in progress. Rule B matches."
    )
    out.append(
        record(
            "fx-passed",
            0,
            "passed",
            reason=None,
            critical=False,
            req=request("nsfw", "portrait of a lighthouse keeper at dusk", expanded="portrait of a weathered lighthouse keeper at dusk, warm lantern light, sea spray", seed=424242, loras=[lora(0, 0.7)]),
            enforcing="adult-granular",
            advisory=["default"],
            preflight=preflight_ok("adult-granular", "default"),
            scan_cells=scans(**{"adult-granular": (safe_cell(), safe_cell()), "default": (safe_cell(), safe_cell())}),
            nude=nudenet(0.03, labels={"FACE_FEMALE": 0.81}),
            ages=age(34),
            label="passed sample",
        )
    )
    out.append(
        record(
            "fx-passed-noage",
            7,
            "passed",
            reason=None,
            critical=False,
            req=request("sfw", "a bowl of lemons on a wooden table, soft window light", seed=1001, steps=20, sampler="euler", scheduler="normal"),
            enforcing="default",
            advisory=[],
            preflight=preflight_ok("default"),
            scan_cells=scans(default=(safe_cell(), safe_cell())),
            nude=nudenet(0.0),
            ages=None,
            label="passed sample",
        )
    )
    out.append(
        record(
            "fx-review-disagree",
            15,
            "review",
            reason="B",
            critical=False,
            req=request("nsfw", "a heist crew in a car park at night, getaway car, cinematic", seed=777, loras=[lora(1, 0.5)], cfg=6.0),
            enforcing="adult-granular",
            advisory=["default"],
            preflight={
                "adult-granular": flagged_cell("B. Real-World Crimes & Public Safety", "The request stages a robbery. Rule B matches; nothing sexual is asked for."),
                "default": safe_cell(),
            },
            scan_cells=scans(
                **{
                    "adult-granular": (safe_cell(), flagged_cell("B. Real-World Crimes & Public Safety", heist_why)),
                    "default": (safe_cell(), safe_cell()),
                }
            ),
            nude=nudenet(0.31, blur=True, labels={"FEMALE_BREAST_EXPOSED": 0.31}),
            ages=age(29, 41),
            label="review sample",
        )
    )
    out.append(
        record(
            "fx-review-agree",
            22,
            "review",
            reason="A",
            critical=False,
            req=request("sfw", "lingerie catalogue page, studio backdrop", seed=8080, loras=[lora(1, 0.6)]),
            enforcing="default",
            advisory=["adult-granular"],
            preflight=preflight_ok("default", "adult-granular"),
            scan_cells=scans(
                default=(
                    flagged_cell("A. Sexual Content Risk", "An adult in lingerie posed for a catalogue. Under the default rules this is sexual content, rule A."),
                    flagged_cell("A. Sexual Content Risk", "The prompt asks for lingerie photography and the image shows it. Rule A."),
                ),
                **{"adult-granular": (unchecked_cell("SingGuard answered HTTP 500: generation cut off before <answer>"), safe_cell())},
            ),
            nude=nudenet(0.15, labels={"BELLY_EXPOSED": 0.15}),
            ages=age(27),
            label="review sample",
        )
    )
    out.append(
        record(
            "fx-deleted-illegal",
            31,
            "deleted",
            reason="H",
            critical=True,
            req=request("nsfw", "sleeping figure, bedroom, candid", expanded="a figure asleep in a dim bedroom, candid, shot from the doorway", seed=31337),
            enforcing="adult-granular",
            advisory=["default"],
            preflight=preflight_ok("adult-granular", "default"),
            scan_cells=scans(
                **{
                    "adult-granular": (
                        safe_cell(),
                        illegal_cell(
                            "H. Non-Consensual Sexual Content",
                            "[Step 1] Alone, the image is a person asleep. [Step 2] The prompt frames it as candid and taken from the doorway, "
                            "which with the exposure NudeNet reports reads as sexual content of someone unable to consent. Rule H matches.",
                        ),
                    ),
                    "default": (safe_cell(), flagged_cell("A. Sexual Content Risk", "Sexual content; the default rules do not separate consent.")),
                }
            ),
            nude=nudenet(0.52, blur=True, labels={"FEMALE_BREAST_EXPOSED": 0.52}),
            ages=age(31),
            label="deleted sample",
        )
    )
    out.append(
        record(
            "fx-deleted-minor",
            40,
            "deleted",
            reason="minor-exposed",
            critical=True,
            req=request("nsfw", "beach volleyball team photo, sunny", seed=2024, cfg=4.5),
            enforcing="adult-granular",
            advisory=[],
            preflight=preflight_ok("adult-granular"),
            scan_cells=scans(**{"adult-granular": (safe_cell(), safe_cell())}),
            nude=nudenet(0.45, blur=True, labels={"BUTTOCKS_EXPOSED": 0.45}),
            ages=age(24, 17, 26, minor_exposed=True),
            label="deleted sample",
        )
    )
    out.append(
        record(
            "fx-deleted-unchecked",
            48,
            "deleted",
            reason="unchecked",
            critical=False,
            req=request("nsfw", "market street in the rain, umbrellas, neon reflections", seed=555, steps=32),
            enforcing="adult-granular",
            advisory=["default"],
            preflight=preflight_ok("adult-granular", "default"),
            scan_cells=scans(
                **{
                    "adult-granular": (safe_cell(), unchecked_cell("SingGuard timed out after 90s")),
                    "default": (safe_cell(), safe_cell()),
                }
            ),
            nude=nudenet(0.01),
            ages=None,
            label="deleted sample",
        )
    )
    out.append(
        record(
            "fx-omitted-exposed",
            56,
            "omitted",
            reason="sfw-exposed",
            critical=False,
            req=request("sfw", "classical marble statue in a museum hall", seed=9001),
            enforcing="default",
            advisory=["adult-granular"],
            preflight=preflight_ok("default", "adult-granular"),
            scan_cells=scans(default=(safe_cell(), safe_cell()), **{"adult-granular": (safe_cell(), safe_cell())}),
            nude=nudenet(0.41, labels={"FEMALE_BREAST_EXPOSED": 0.41}),
            ages=None,
            label="omitted sample",
        )
    )
    out.append(
        record(
            "fx-omitted-unchecked",
            63,
            "omitted",
            reason="sfw-unchecked",
            critical=False,
            req=request("sfw", "a red bicycle leaning on a canal railing", seed=1234),
            enforcing="default",
            advisory=[],
            preflight=preflight_ok("default"),
            scan_cells=scans(default=(safe_cell(), safe_cell())),
            nude=None,
            ages=age(38),
            label="omitted sample",
        )
    )
    out.append(
        record(
            "fx-refused",
            70,
            "refused",
            reason="A",
            critical=False,
            req=request("sfw", "boudoir photo set, silk sheets", seed=4321),
            enforcing="default",
            advisory=["adult-granular"],
            preflight={
                "default": flagged_cell("A. Sexual Content Risk", "The request is for boudoir photography, which the default rules count as sexual content. Rule A."),
                "adult-granular": safe_cell(),
            },
            scan_cells=None,
            nude=None,
            ages=None,
            label=None,
        )
    )
    out.append(
        record(
            "fx-refused-illegal",
            78,
            "refused",
            reason="A",
            critical=True,
            req=request("nsfw", "schoolgirl in uniform, suggestive pose", seed=6666),
            enforcing="adult-granular",
            advisory=["default"],
            preflight={
                "adult-granular": illegal_cell("A. Minors", "The request asks for sexualised content of someone presented as a child. Rule A, Minors."),
                "default": flagged_cell("A. Sexual Content Risk", "Sexual content is requested. Rule A."),
            },
            scan_cells=None,
            nude=None,
            ages=None,
            label=None,
        )
    )
    out.append(
        record(
            "fx-failed",
            85,
            "failed",
            reason="ComfyUI: websocket closed before the image arrived",
            critical=False,
            req=request("nsfw", "snow-covered pine forest at blue hour", seed=99, steps=40, width=768, height=512),
            enforcing="adult-granular",
            advisory=[],
            preflight=preflight_ok("adult-granular"),
            scan_cells=None,
            nude=None,
            ages=None,
            label=None,
            error="ComfyUI: websocket closed before the image arrived",
        )
    )
    return out


def main() -> None:
    for sub in ("records", "images"):
        shutil.rmtree(ROOT / sub, ignore_errors=True)
        (ROOT / sub).mkdir(parents=True)
    for rec, data in build():
        (ROOT / "records" / f"{rec['id']}.json").write_text(json.dumps(rec, indent=2) + "\n")
        if data is not None:
            (ROOT / "images" / f"{rec['id']}.png").write_bytes(data)
    (ROOT / "policies.json").write_text(json.dumps({"default": "adult-granular", "policies": POLICIES}, indent=2) + "\n")
    (ROOT / "models.json").write_text(json.dumps(MODELS, indent=2) + "\n")
    print(f"wrote {len(list((ROOT / 'records').iterdir()))} records and {len(list((ROOT / 'images').iterdir()))} images under {ROOT}")


if __name__ == "__main__":
    main()
