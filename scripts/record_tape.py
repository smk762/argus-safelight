"""Record darkroom generations as the static demo's data tape (web/public/data-tape by default).

    # The stand-in: fixture/ records and their flat-colour placeholders, labelled Sample data
    python scripts/record_tape.py sample

    # A real run: every take in TAKES (a JSON list of generate requests) against a running darkroom
    python scripts/record_tape.py live --darkroom http://localhost:8106 --takes docs/demo-takes.json

The tape is what `make pages` (SAFELIGHT_STATIC=1) serves instead of darkroom:

    tape.json            provenance (kind, darkroom version and commit, note), /health, /policies,
                         /models, every record (newest first), the takes the compose form can
                         replay, the record id -> file id map, and which served frames are veiled
    takes/<id>.json      one take: what POST /preflight answered for its request, and the
                         generate stream's events in order, as darkroom sent them
    images/<f>.webp      the full view of a served image (passed or review only)
    thumbs/<f>.webp      its 160 px history thumbnail
    veils/<f>-medium.webp  for a veiled frame only: the image averaged into 28 cells on its long
                         side, which the page scales up as a mosaic, so a veiled frame loads
                         neither its thumbnail nor its view until the viewer reveals it

What never goes on a tape:

- An image of anything darkroom did not serve. Only `passed` and `review` records get files,
  and `live` never asks darkroom for any other record's image. A deleted, omitted, refused or
  failed record is its metadata alone.
- The words of a blocked request. A record that is critical, that any guard judged illegal, or
  that was deleted as minor-exposed keeps its verdict, rule, reason, timestamps and state, but
  its prompts, trigger words and SingGuard's explanations are replaced by "[withheld: <reason>]",
  in the record and in every stream event, and NudeNet's per-class labels are dropped (the score
  stays). The page shows the record as it is on the tape; it never sees the original words.
- A generation of anything a guard should block. A real recording never asks for one: the outcomes that would
  need it (an illegal-rule or minor-exposed deletion, an illegal refusal) come from the fixture's hand-written
  records instead (`--illustrative`), with no take and no file, and the page labels each one Sample data.
- File paths. `image.path` is nulled, and the script fails if a home or server path, a private
  address or an email address is left anywhere in the JSON.

Needs Pillow.
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import io
import json
import os
import re
import shutil
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

ROOT = Path(__file__).resolve().parents[1]
FIXTURE = ROOT / "fixture"
DEFAULT_OUT = ROOT / "web" / "public" / "data-tape"
FORMAT = "argus-safelight-tape"
VERSION = 1
THUMB_PX = 160
IMAGE_PX = 1600
# Cells across the long side of a veil. web/src/lib/tape.ts reads it from tape.json.
VEIL_CELLS = {"medium": 28}
SERVED = ("passed", "review")
WITHHELD_EXPLANATION = "[withheld]"

LEAKS = [
    ("home directory path", re.compile(r"(?:/home/|/Users/|/root/|~/)[\w.-]+")),
    ("server path", re.compile(r"/(?:srv|mnt|media|var/www)/[\w.-]+")),
    ("private IPv4 address", re.compile(r"\b(?:10\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])|192\.168)\.\d{1,3}\.\d{1,3}\b")),
    ("email address", re.compile(r"\b[\w.%+-]+@[\w-]+(?:\.[\w-]+)*\.[a-z]{2,}\b", re.I)),
]


# ---------------------------------------------------------------- withholding


def cells_of(record: dict) -> list[dict]:
    """Every guard cell on a record: pre-flight, the output's scans and the input's scans."""
    guard = record.get("guard") or {}
    cells = list((guard.get("preflight") or {}).values())
    for pair in (guard.get("scans") or {}).values():
        cells += [cell for cell in pair.values() if cell]
    for pair in ((guard.get("input") or {}).get("scans") or {}).values():
        cells += [cell for cell in pair.values() if cell]
    return cells


def blocked(record: dict) -> bool:
    """A record whose request the demo must not show: critical, judged illegal anywhere, or minor-exposed."""
    reasons = [part.strip() for part in (record.get("outcome_reason") or "").replace("input image:", "").split(",")]
    return bool(record.get("critical")) or "minor-exposed" in reasons or any(cell.get("state") == "illegal" for cell in cells_of(record))


def marker(record: dict) -> str:
    return f"[withheld: {record.get('outcome_reason') or record.get('outcome')}]"


def withhold_cell(cell: dict | None) -> None:
    if cell and cell.get("result") and cell["result"].get("explanation"):
        cell["result"]["explanation"] = WITHHELD_EXPLANATION


def withhold_record(record: dict) -> dict:
    """A blocked record with its words replaced: verdicts, rules, reasons, timestamps and state stay."""
    out = copy.deepcopy(record)
    text = marker(record)
    request = out["request"]
    request["user_prompt"] = text
    request["final_prompt"] = text
    request["negative_prompt"] = text if request.get("negative_prompt") else request.get("negative_prompt", "")
    if request.get("expanded_prompt") is not None:
        request["expanded_prompt"] = text
    for lora in request.get("loras") or []:
        lora["trigger_words"] = []
    for cell in cells_of(out):
        withhold_cell(cell)
    for block in (out["guard"].get("nudenet"), (out["guard"].get("input") or {}).get("nudenet")):
        if block and block.get("labels"):
            block["labels"] = {}
    return out


def withhold_preflight(preflight: dict, record: dict) -> dict:
    out = copy.deepcopy(preflight)
    text = marker(record)
    for key in ("user_prompt", "final_prompt"):
        out[key] = text
    if out.get("expanded_prompt") is not None:
        out["expanded_prompt"] = text
    if out.get("negative_prompt"):
        out["negative_prompt"] = text
    out["framed_text"] = text
    for cell in (out.get("results") or {}).values():
        withhold_cell(cell)
    if out.get("refusal") and out["refusal"].get("explanation"):
        out["refusal"]["explanation"] = WITHHELD_EXPLANATION
    for warning in out.get("warnings") or []:
        if warning.get("explanation"):
            warning["explanation"] = WITHHELD_EXPLANATION
    return out


def withhold_events(events: list[list], record: dict) -> list[list]:
    out = []
    for name, data in events:
        data = copy.deepcopy(data)
        if name == "preflight":
            data = withhold_preflight(data, record)
        elif name in ("scan", "input_scan"):
            withhold_cell(data.get("cell"))
        elif name == "complete":
            data = {**data, "record": withhold_record(data["record"])}
        out.append([name, data])
    return out


def clean_record(record: dict) -> dict:
    out = copy.deepcopy(record)
    if out.get("image"):
        out["image"]["path"] = None
    return out


# ---------------------------------------------------------------- images


def encode(data: bytes, longest: int, quality: int) -> bytes:
    from PIL import Image, ImageOps

    with Image.open(io.BytesIO(data)) as image:
        image = ImageOps.exif_transpose(image)
        if image.mode not in ("RGB", "RGBA"):
            image = image.convert("RGBA" if "A" in image.getbands() else "RGB")
        image.thumbnail((longest, longest))
        out = io.BytesIO()
        # No EXIF or XMP: a generated PNG's text chunks can carry the whole ComfyUI workflow.
        image.save(out, "WEBP", quality=quality, method=6)
        return out.getvalue()


def veil(data: bytes, cells: int) -> bytes:
    """The frame averaged into *cells* across its long side: a mosaic with no detail left to recover."""
    from PIL import Image, ImageOps

    with Image.open(io.BytesIO(data)) as image:
        image = ImageOps.exif_transpose(image).convert("RGB")
        w, h = image.size
        scale = cells / max(w, h)
        size = (max(1, round(w * scale)), max(1, round(h * scale)))
        small = image.resize(size, Image.Resampling.BOX)
        out = io.BytesIO()
        small.save(out, "WEBP", lossless=True, method=6)
        return out.getvalue()


def file_id(record_id: str) -> str:
    return hashlib.sha256(f"safelight-tape:{record_id}".encode()).hexdigest()[:16]


def veiled(record: dict) -> bool:
    """A served frame shown behind the veil: darkroom asked for blur, or a policy flagged it (review)."""
    return bool((record["guard"].get("nudenet") or {}).get("blur")) or record["outcome"] == "review"


# ---------------------------------------------------------------- sample streams


def framed(final: str, negative: str) -> str:
    return f"Image generation request.\nPrompt: {final}\nNegative prompt (what the image must not show): {negative}"


def policy_names(guard: dict) -> list[str]:
    enforcing = guard["enforcing_policy"]
    return [enforcing, *[name for name in guard["advisory_policies"] if name != enforcing]]


def sample_preflight(record: dict, *, stream: bool) -> dict:
    """What darkroom's pre-flight said, rebuilt from the record (sample tapes only; `live` records the real one)."""
    request, guard = record["request"], record["guard"]
    results = guard["preflight"]
    enforcing = guard["enforcing_policy"]
    outcome, refusal, warnings = "ok", None, []
    for name in policy_names(guard):
        cell = results.get(name)
        if cell and cell["state"] == "illegal" and refusal is None:
            rule = cell["result"]["rules"][0]
            outcome, refusal = "refused", {"policy": name, "reason": rule[:1], "rule": rule, "explanation": cell["result"]["explanation"]}
    own = results.get(enforcing) or {}
    if outcome != "refused" and own.get("state") == "unchecked":
        outcome, refusal = "refused", {"policy": enforcing, "reason": "unchecked", "rule": None, "explanation": own.get("error")}
    if outcome != "refused" and own.get("state") == "flagged":
        rule = own["result"]["rules"][0]
        if request["mode"] == "sfw":
            outcome, refusal = "refused", {"policy": enforcing, "reason": rule[:1], "rule": rule, "explanation": own["result"]["explanation"]}
        else:
            outcome = "warning"
            warnings.append({"policy": enforcing, "rule": rule, "explanation": own["result"]["explanation"]})
    if stream:
        expanded, final = request["expanded_prompt"], request["final_prompt"]
    else:
        # POST /preflight never expands: it judges the prompt as written, with the trigger words.
        triggers = [word for lora in request.get("loras") or [] for word in lora.get("trigger_words") or []]
        expanded, final = None, ", ".join([request["user_prompt"], *triggers])
    out = {
        "mode": request["mode"],
        "enforcing_policy": enforcing,
        "advisory_policies": [name for name in guard["advisory_policies"] if name != enforcing],
        "thinking": guard["thinking"],
        "user_prompt": request["user_prompt"],
        "expanded_prompt": expanded,
        "final_prompt": final,
        "negative_prompt": request["negative_prompt"],
        "framed_text": framed(final, request["negative_prompt"]),
        "outcome": outcome,
        "refusal": refusal,
        "warnings": warnings,
        "results": results,
    }
    if not stream:
        out["expansion_applied"] = False
    return out


def sample_events(record: dict) -> list[list]:
    """The generate stream darkroom would have sent for this record, in order."""
    guard = record["guard"]
    events: list[list] = [["preflight", sample_preflight(record, stream=True)]]
    names = policy_names(guard)
    if record["outcome"] == "refused" and not guard.get("input"):
        return [*events, ["complete", {"record": record}]]
    if guard.get("input"):
        for name in names:
            for context in ("isolated", "with_prompt"):
                cell = (guard["input"]["scans"].get(name) or {}).get(context)
                if cell:
                    events.append(["input_scan", {"policy": name, "context": context, "cell": cell}])
        if record["outcome"] == "refused":
            return [*events, ["complete", {"record": record}]]
    events.append(["queued", {"prompt_id": f"comfy-{record['id']}", "position": 0}])
    total = (record["request"].get("sampling") or {}).get("steps") or 20
    for step in range(1, total + 1):
        if record["outcome"] == "failed" and step == (total + 1) // 2:
            events.append(["error", {"detail": record["outcome_reason"], "record_id": record["id"]}])
            return [*events, ["complete", {"record": record}]]
        events.append(["progress", {"step": step, "total": total}])
    for name in names:
        for context in ("isolated", "with_prompt"):
            cell = (guard["scans"].get(name) or {}).get(context)
            if cell:
                events.append(["scan", {"policy": name, "context": context, "cell": cell}])
    return [*events, ["complete", {"record": record}]]


def sample_health(darkroom: dict, policies: dict) -> dict:
    return {
        "version": darkroom["version"],
        "backends": {"comfyui": True, "ollama": True, "singguard": True, "nudenet": True, "age": True},
        "policies": [policy["name"] for policy in policies["policies"]],
        "default_policy": policies["default"],
        "thinking": "cascade",
        "nsfw_allowed": True,
        "sfw_available": True,
        "devmode": False,
        "expansion_enabled": True,
        "age_unavailable": None,
    }


# ---------------------------------------------------------------- writing


def check_leaks(out: Path) -> None:
    problems = []
    for path in sorted(out.rglob("*.json")):
        text = path.read_text()
        for kind, pattern in LEAKS:
            for found in pattern.finditer(text):
                problems.append(f"{path.relative_to(out)}: {kind} ({found.group(0)})")
    if problems:
        raise SystemExit("record_tape: refusing to keep a tape that leaks:\n  " + "\n  ".join(problems))


def write_tape(
    out: Path,
    *,
    kind: str,
    source: str,
    darkroom: dict,
    note: str | None,
    health: dict,
    policies: dict,
    models: dict,
    takes: list[tuple[dict, dict | None, list[list] | None]],
    image_bytes: Callable[[dict], bytes],
    replayable: Callable[[dict], bool],
    illustrative: list[dict] | None = None,
) -> None:
    """Write the tape. `takes` is (record, POST /preflight answer or None, stream events or None) per record.

    `illustrative` records are hand-written (the fixture's) and never generated: they stand in for outcomes the demo
    must not produce for real, such as an illegal-rule or minor-exposed deletion. They get no take and no file, and
    the tape lists them so the page labels each one Sample data.
    """
    illustrative = illustrative or []
    takes = [*takes, *[(record, None, None) for record in illustrative]]
    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    if out.exists():
        shutil.rmtree(out)
    for sub in ("takes", "images", "thumbs", "veils"):
        (out / sub).mkdir(parents=True)
    records, files, veils, replay = [], {}, [], []
    for record, preflight, events in takes:
        record = clean_record(record)
        events = [[name, {**data, "record": clean_record(data["record"])} if name == "complete" else data] for name, data in events or []]
        hide = blocked(record)
        if hide:
            if record["outcome"] in SERVED:
                raise SystemExit(f"record_tape: {record['id']} is {record['outcome']} yet blocked; a served image cannot be blocked")
            events = withhold_events(events, record)
            preflight = withhold_preflight(preflight, record) if preflight else None
            record = withhold_record(record)
        records.append(record)
        if record["outcome"] in SERVED and record.get("removed_at") is None and record["id"] not in {r["id"] for r in illustrative}:
            ident = file_id(record["id"])
            data = image_bytes(record)
            (out / "images" / f"{ident}.webp").write_bytes(encode(data, IMAGE_PX, 82))
            (out / "thumbs" / f"{ident}.webp").write_bytes(encode(data, THUMB_PX, 72))
            files[record["id"]] = ident
            if veiled(record):
                (out / "veils" / f"{ident}-medium.webp").write_bytes(veil(data, VEIL_CELLS["medium"]))
                veils.append(record["id"])
        if events and replayable(record):
            (out / "takes" / f"{record['id']}.json").write_text(json.dumps({"preflight": preflight, "events": events}, separators=(",", ":")))
            replay.append(record["id"])
        print(f"  {record['id']}: {record['outcome']}{' (withheld)' if hide else ''}{' (veiled)' if record['id'] in veils else ''}", file=sys.stderr)
    records.sort(key=lambda r: r["created_at"], reverse=True)
    tape = {
        "format": FORMAT,
        "version": VERSION,
        "generated_at": now,
        "provenance": {"kind": kind, "source": source, "darkroom": {"version": darkroom.get("version"), "commit": darkroom.get("commit")}, "note": note},
        "health": health,
        "policies": policies,
        "models": models,
        "records": records,
        "takes": [rid for rid in (r["id"] for r in records) if rid in replay],
        "files": files,
        "veiled": [rid for rid in (r["id"] for r in records) if rid in veils],
        "veils": VEIL_CELLS,
        "illustrative": [record["id"] for record in illustrative],
    }
    (out / "tape.json").write_text(json.dumps(tape, indent=1) + "\n")
    check_leaks(out)
    print(f"tape: {len(records)} records, {len(files)} with images ({len(veils)} veiled), {len(replay)} replayable -> {out}")


def sample(args: argparse.Namespace) -> None:
    darkroom = json.loads((FIXTURE / "darkroom.json").read_text())
    policies = json.loads((FIXTURE / "policies.json").read_text())
    models = json.loads((FIXTURE / "models.json").read_text())
    takes = []
    for path in sorted((FIXTURE / "records").glob("*.json")):
        record = json.loads(path.read_text())
        takes.append((record, sample_preflight(record, stream=False), sample_events(record)))
    write_tape(
        Path(args.out).resolve(),
        kind="sample",
        source="fixture",
        darkroom=darkroom,
        note=args.note,
        health=sample_health(darkroom, policies),
        policies=policies,
        models=models,
        takes=takes,
        image_bytes=lambda record: (FIXTURE / "images" / f"{record['id']}.png").read_bytes(),
        # The compose form replays text-to-image takes; a record made from an input image needs that image again.
        replayable=lambda record: not record["request"].get("init_image"),
    )


# ---------------------------------------------------------------- live


def http(method: str, url: str, body: Any = None, timeout: float = 900) -> urllib.request.addinfourl:
    data = None if body is None else json.dumps(body).encode()
    request = urllib.request.Request(url, data=data, method=method, headers={"Content-Type": "application/json"} if data else {})
    return urllib.request.urlopen(request, timeout=timeout)


def get_json(base: str, path: str) -> Any:
    with http("GET", f"{base}{path}") as response:
        return json.load(response)


def pause(message: str) -> None:
    """Wait for the operator: a take that needs a backend stopped or started at a given moment says so."""
    input(f"\n>>> {message}\n    Press Enter to go on. ")


def stream(base: str, request: dict, pause_on: str | None = None, message: str = "") -> list[list]:
    """POST /generate/stream, every event as darkroom sent it. `pause_on` waits for the operator after that event."""
    events: list[list] = []
    with http("POST", f"{base}/generate/stream", request) as response:
        name, data = "message", []
        for raw in response:
            line = raw.decode().rstrip("\r\n")
            if line == "":
                if data:
                    events.append([name, json.loads("\n".join(data))])
                    if pause_on and name == pause_on:
                        pause(message)
                name, data = "message", []
            elif line.startswith("event:"):
                name = line[6:].strip()
            elif line.startswith("data:"):
                data.append(line[5:].lstrip())
    return events


def public_models(models: dict, records: list[dict]) -> dict:
    """/models cut down to what the recorded takes used: the tape is public, the server's model shelf is not."""
    def name(ref: Any) -> Any:
        # A record names a model as {"name", "sha256"}; /models lists it by name.
        return ref.get("name") if isinstance(ref, dict) else ref

    requests = [record.get("request") or {} for record in records]
    used = {name(request.get("checkpoint")) for request in requests}
    loras = {name(lora.get("model") or lora) for request in requests for lora in request.get("loras") or []}
    vaes = {name(request.get("vae")) for request in requests}
    checkpoints = [c for c in models.get("checkpoints", []) if c.get("name") in used]
    families = {c.get("family") for c in checkpoints}
    return {
        **models,
        "checkpoints": checkpoints,
        "default_checkpoint": checkpoints[0]["name"] if checkpoints else None,
        "loras": [lora for lora in models.get("loras", []) if lora.get("name") in loras],
        "vaes": [vae for vae in models.get("vaes", []) if name(vae) in vaes],
        "workflows": [w for w in models.get("workflows", []) if w.get("family") in families],
    }


def live(args: argparse.Namespace) -> None:
    base = args.darkroom.rstrip("/")
    requests = json.loads(Path(args.takes).read_text())
    health = get_json(base, "/health")
    if health.get("mock") and not args.allow_mock:
        raise SystemExit("record_tape: that darkroom is the fixture mock; pass --allow-mock to record it anyway (never for the published tape)")
    policies, models = get_json(base, "/policies"), get_json(base, "/models")
    takes = []
    for take in requests:
        # Keys starting with "_" are notes for the operator, not part of the request: _category, _note, and the
        # pauses a fail-closed take needs (_pause_before: before the request; _pause_on: after that stream event;
        # _pause_after: once the record has landed), each with its own message.
        request = {key: value for key, value in take.items() if not key.startswith("_")}
        #
        # Two guards against recording anything nobody reviewed:
        # - _expect_preflight: the pre-flight outcome the take is for ("refused" for a refusal). Checked with
        #   POST /preflight first, which renders nothing; if darkroom answers otherwise the take is skipped and never
        #   sent to /generate, so a prompt meant to be refused is never rendered.
        # - _expect_image_sha256: the image a human approved in the candidate pass. If the render's hash differs, the
        #   recording stops before anything is written.
        label = request["user_prompt"][:50]
        if take.get("_pause_before"):
            pause(take["_pause_before"])
        with http("POST", f"{base}/preflight", request) as response:
            preflight = json.load(response)
        expected = take.get("_expect_preflight")
        if expected and preflight.get("outcome") != expected:
            print(f"  SKIPPED {label!r}: pre-flight said {preflight.get('outcome')}, the take expects {expected}; not generated", file=sys.stderr)
            if take.get("_pause_after"):
                pause(take["_pause_after"])
            continue
        events = stream(base, request, take.get("_pause_on"), take.get("_pause_on_message", ""))
        if take.get("_pause_after"):
            pause(take["_pause_after"])
        landed = [data["record"] for name, data in events if name == "complete"]
        approved = take.get("_expect_image_sha256")
        if approved and landed and (landed[-1].get("image") or {}).get("sha256") != approved:
            raise SystemExit(f"record_tape: {label!r} rendered an image nobody approved (sha256 differs); nothing written")
        complete = [data for name, data in events if name == "complete"]
        if not complete:
            raise SystemExit(f"record_tape: the stream for {request['user_prompt'][:40]!r} ended without a record")
        takes.append((complete[-1]["record"], preflight, events))
    darkroom = {"version": health.get("version"), "commit": args.darkroom_commit}

    def image_bytes(record: dict) -> bytes:
        # Only ever called for a passed or review record (write_tape checks the outcome first).
        assert record["outcome"] in SERVED
        with http("GET", f"{base}/image/{record['id']}") as response:
            return response.read()

    # A tape has no live server: nothing to purge (devmode) and nothing in flight (generating).
    health = {**{key: value for key, value in health.items() if key not in ("generating",)}, "devmode": False}
    illustrative = [json.loads((FIXTURE / "records" / f"{rid}.json").read_text()) for rid in args.illustrative.split(",") if rid]
    write_tape(
        Path(args.out).resolve(),
        kind="recorded",
        source="darkroom",
        darkroom=darkroom,
        note=args.note,
        health=health,
        policies=policies,
        models=public_models(models, [record for record, _, _ in takes]),
        takes=takes,
        image_bytes=image_bytes,
        replayable=lambda record: True,
        illustrative=illustrative,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)
    for name in ("sample", "live"):
        command = sub.add_parser(name)
        command.add_argument("--out", default=os.environ.get("SAFELIGHT_TAPE_DIR") or DEFAULT_OUT)
        command.add_argument("--note", default=None)
    sub.choices["sample"].set_defaults(run=sample)
    sub.choices["live"].add_argument("--darkroom", required=True)
    sub.choices["live"].add_argument("--takes", required=True, help="JSON list of generate requests, in recording order")
    sub.choices["live"].add_argument("--darkroom-commit", default=None)
    sub.choices["live"].add_argument("--allow-mock", action="store_true")
    sub.choices["live"].add_argument(
        "--illustrative",
        default="fx-deleted-illegal,fx-deleted-minor,fx-refused-illegal,fx-deleted-unchecked,fx-omitted-unchecked,fx-failed",
        help="fixture record ids to add as hand-written, never-generated records (labelled Sample data); '' for none",
    )
    sub.choices["live"].set_defaults(run=live)
    args = parser.parse_args()
    try:
        args.run(args)
    except urllib.error.URLError as err:
        raise SystemExit(f"record_tape: {err}") from err


if __name__ == "__main__":
    main()
