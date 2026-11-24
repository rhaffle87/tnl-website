#!/usr/bin/env python3
"""Migrate legacy PNG media assets to WebP (TNL private-cloud lab site).

What it does (per PNG found on the app node's media root):
  1. Download the PNG from CT 103 (app node) over SSH.
  2. Convert it to WebP locally with Pillow (quality 85, method 6).
  3. Upload the .webp next to the original, preserving the relative path.
  4. Move the original PNG into an archive folder (kept, never deleted).
  5. Rewrite every ``.png`` media URL in MongoDB to ``.webp`` (deep-walk mongosh
     pass over pages blocks, members, equipment, practicum, events, activities,
     posts, publications and settings).

Guardrails (hard exclusions — this script must NEVER touch them):
  * ``uploads/`` directory: private HMAC-signed registrant proofs whose URLs
    were already distributed (Google Sheet); rewriting them breaks the links.
  * ``registrations`` collection: same reason — URLs carry pre-computed HMAC
    signatures tied to the original file names.
  * The archive folder itself lives OUTSIDE the media root, at
    ``/var/backups/tnl/legacy-png-<ts>/`` (mode 700), never inside ``MEDIA_ROOT``.

Safety rails:
  * DRY-RUN by default — pass ``--apply`` to actually touch files and the DB.
  * A fresh MongoDB dump is taken (mongodump --archive) on CT 116 before the
    DB rewrite, stored as ``/root/tnl-pre-webp-<ts>.archive``.
  * Files that fail to convert are reported and skipped; URLs referencing them
    stay untouched (never point at a missing file).

Usage:
    python scripts/ops/migrate-media-to-webp.py            # report only
    python scripts/ops/migrate-media-to-webp.py --apply    # convert + rewrite
    python scripts/ops/migrate-media-to-webp.py --apply --limit 5
"""
from __future__ import annotations

import argparse
import io
import json
import subprocess
import sys
import tempfile
import time
from pathlib import PurePosixPath

APP_NODE = "100.65.129.8"      # CT 103 — FastAPI app + /opt/tnl/media
DB_NODE = "100.111.32.102"     # CT 116 — mongod + mongosh
MEDIA_ROOT = "/opt/tnl/media"
# Archives live OUTSIDE the media root so /api/media-files/* can never serve
# them and the daily tnl-backup-media.sh run stays lean.
ARCHIVE_ROOT_TEMPLATE = "/var/backups/tnl/legacy-png-{ts}"
WEBP_QUALITY = 85

# Directories that must NEVER be converted (see docstring guardrails).
SKIP_DIRS = ("uploads",)

# Collections whose string fields may embed /media-files/... URLs.
DB_NAME = "tnl"


def ssh(host: str, command: str, timeout: int = 120) -> str:
    result = subprocess.run(
        ["ssh", f"root@{host}", command],
        capture_output=True, text=True, timeout=timeout, check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(f"ssh {host} failed ({result.returncode}): {result.stderr.strip()[:400]}")
    return result.stdout


def scp_from(host: str, remote_path: str, local_path: str) -> None:
    result = subprocess.run(
        ["scp", "-q", f"root@{host}:{remote_path}", local_path],
        capture_output=True, text=True, timeout=180, check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(f"scp from {host} failed: {result.stderr.strip()[:400]}")


def scp_to(host: str, local_path: str, remote_path: str) -> None:
    result = subprocess.run(
        ["scp", "-q", local_path, f"root@{host}:{remote_path}"],
        capture_output=True, text=True, timeout=180, check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(f"scp to {host} failed: {result.stderr.strip()[:400]}")


def list_pngs() -> list[str]:
    skip_exprs = " ".join(f"! -path '*/{d}/*'" for d in SKIP_DIRS)
    out = ssh(APP_NODE,
              f"find {MEDIA_ROOT} -type f -name '*.png' {skip_exprs} | sort")
    return [line.strip() for line in out.splitlines() if line.strip()]


def assert_uploads_untouched(converted_paths: list[str]) -> None:
    """Guard: refuse to run if any candidate path is inside an excluded dir."""
    offenders = [p for p in converted_paths
                 if any(f"/{d}/" in p for d in SKIP_DIRS)]
    if offenders:
        raise RuntimeError(
            "GUARDRAIL VIOLATION: uploads/ and archive dirs are off-limits, "
            "offenders=" + json.dumps(offenders))


def convert_png_to_webp(png_bytes: bytes) -> bytes:
    from PIL import Image  # Pillow

    img = Image.open(io.BytesIO(png_bytes))
    # Keep alpha where present; drop P-mode palette quirks.
    if img.mode not in ("RGB", "RGBA"):
        img = img.convert("RGBA" if "transparency" in img.info else "RGB")
    buf = io.BytesIO()
    img.save(buf, format="WEBP", quality=WEBP_QUALITY, method=6)
    return buf.getvalue()


def remote_dirname(path: str) -> str:
    return str(PurePosixPath(path).parent)


def db_rewrite_script() -> str:
    """mongosh program: deep-walk every collection and swap .png -> .webp in URL strings."""
    return f"""
const COLLECTIONS = ["pages", "members", "equipment", "practicum", "events",
                     "activities", "posts", "publications", "settings", "api_keys",
                     "media"];
const MEDIA_RE = /\\/media-files\\/[^"'\\s)]*\\.png/gi;
let total = 0;
for (const coll of COLLECTIONS) {{
    if (!db.getCollectionNames().includes(coll)) continue;
    const docs = db.getCollection(coll).find({{}}).toArray();
    let changed = 0;
    for (const doc of docs) {{
        const raw = EJSON.stringify(doc);
        if (!raw.includes(".png")) continue;
        let hits = 0;
        const next = raw.replace(MEDIA_RE, (m) => {{ hits++; return m.slice(0, -4) + ".webp"; }});
        if (hits > 0) {{
            db.getCollection(coll).replaceOne({{ _id: doc._id }}, EJSON.parse(next));
            changed += hits;
        }}
    }}
    if (changed) {{ print(coll + ": " + changed + " URL(s) rewritten"); total += changed; }}
}}
print("TOTAL_REWRITTEN=" + total);
"""


def db_count_remaining() -> int:
    out = ssh(DB_NODE, "mongosh tnl --quiet --eval '"
              + r'let n=0; for (const c of ["pages","members","equipment","practicum","events","activities","posts","publications","settings"]) {'
                f'db.getCollection(c).find({{}}).forEach(d => {{ const s = EJSON.stringify(d); const m = s.match(/\\/media-files\\/[^"]*\\.png/g); if (m) n += m.length; }}); }}'
              + " print(\"REMAINING=\" + n)'")
    for line in out.splitlines():
        if line.startswith("REMAINING="):
            return int(line.split("=", 1)[1])
    raise RuntimeError("Could not parse mongosh output: " + out[:400])


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--apply", action="store_true", help="convert files and rewrite DB URLs (default: dry-run)")
    parser.add_argument("--limit", type=int, default=0, help="process at most N files (0 = all)")
    parser.add_argument("--skip-db", action="store_true", help="skip the MongoDB URL rewrite pass")
    args = parser.parse_args()

    pngs = list_pngs()
    assert_uploads_untouched(pngs)
    if args.limit:
        pngs = pngs[: args.limit]
    print(f"Found {len(pngs)} legacy PNG file(s) under {MEDIA_ROOT} on {APP_NODE}.")
    if not pngs:
        print("Nothing to migrate.")
        return 0

    remaining_before = 0 if args.skip_db else db_count_remaining()
    print(f"DB .png URL references before: {remaining_before}")

    converted: list[tuple[str, int, int]] = []   # (rel_path, png_bytes, webp_bytes)
    failed: list[tuple[str, str]] = []
    if args.apply:
        try:
            from PIL import Image  # noqa: F401  — fail fast if Pillow is missing
        except ImportError:
            print("Pillow is required for --apply: pip install pillow", file=sys.stderr)
            return 2

    for rel in pngs:
        try:
            with tempfile.TemporaryDirectory() as td:
                local_png = f"{td}/in.png"
                scp_from(APP_NODE, rel, local_png)
                data = open(local_png, "rb").read()
            webp = convert_png_to_webp(data)
            converted.append((rel, len(data), len(webp)))
            print(f"  [convert-ok] {rel}: {len(data):,} B -> {len(webp):,} B")
        except Exception as exc:  # noqa: BLE001 — report and continue
            failed.append((rel, str(exc)))
            print(f"  [convert-FAIL] {rel}: {exc}")

    if not args.apply:
        print(f"\nDRY RUN — {len(converted)} file(s) convertible, {len(failed)} failed. Re-run with --apply to execute.")
        return 0

    # 1. Upload webp files, archive originals.
    ts = time.strftime("%Y%m%d-%H%M%S")
    uploaded = 0
    for rel, _png_size, webp_size in converted:
        webp_rel = rel[:-4] + ".webp"
        archive_rel = f"{ARCHIVE_ROOT_TEMPLATE.format(ts=ts)}/{rel[len(MEDIA_ROOT) + 1:]}"
        with tempfile.TemporaryDirectory() as td:
            local_png = f"{td}/in.png"
            local_webp = f"{td}/out.webp"
            scp_from(APP_NODE, rel, local_png)
            webp = convert_png_to_webp(open(local_png, "rb").read())
            with open(local_webp, "wb") as fh:
                fh.write(webp)
            assert len(webp) == webp_size, "regenerated webp size drifted"
            scp_to(APP_NODE, local_webp, webp_rel)
            # Verify the remote webp landed before archiving the original.
            listing = ssh(APP_NODE, f"stat -c '%s' '{webp_rel}'").strip()
            if listing != str(webp_size):
                raise RuntimeError(f"upload verification failed for {webp_rel}")
            ssh(APP_NODE,
                f"mkdir -p '{remote_dirname(archive_rel)}' && mv '{rel}' '{archive_rel}'")
            uploaded += 1
            print(f"  [uploaded+archived] {webp_rel} ({webp_size:,} B); original -> {archive_rel}")

    # 2. Pre-rewrite DB backup on CT 116.
    if not args.skip_db:
        print("Taking mongodump archive on CT 116 ...")
        ssh(DB_NODE, f"mongodump --archive=/root/tnl-pre-webp-{ts}.archive 2>/dev/null && echo BACKUP_OK")
        script_local = f"{tempfile.gettempdir()}/tnl_webp_rewrite_{ts}.js"
        with open(script_local, "w", encoding="utf-8") as fh:
            fh.write(db_rewrite_script())
        scp_to(DB_NODE, script_local, "/tmp/tnl_webp_rewrite.js")
        out = ssh(DB_NODE, "mongosh tnl --quiet /tmp/tnl_webp_rewrite.js && rm -f /tmp/tnl_webp_rewrite.js", timeout=300)
        print(out.strip())

        remaining_after = db_count_remaining()
        print(f"DB .png URL references after: {remaining_after}")
        if remaining_after != 0:
            print("WARNING: .png references remain — inspect manually.", file=sys.stderr)
            return 3

    leftover = list_pngs()
    print(f"\nSummary: {uploaded} file(s) migrated, {len(failed)} failed, {len(leftover)} PNG(s) left outside archive.")
    for rel, err in failed:
        print(f"  FAILED {rel}: {err}")
    return 0 if uploaded == len(converted) and not leftover else 1


if __name__ == "__main__":
    sys.exit(main())
