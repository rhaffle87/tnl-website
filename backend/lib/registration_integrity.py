"""Read-only duplicate preflight and explicit, non-destructive key migration."""

import argparse
import asyncio
import re
import unicodedata


def normalize_email(value) -> str:
    return unicodedata.normalize("NFKC", str(value or "")).strip().casefold()


def normalize_nim(value) -> str:
    return re.sub(r"[\s.\-]", "", unicodedata.normalize("NFKC", str(value or ""))).casefold()


async def registration_preflight(database) -> dict:
    seen = {"email": {}, "nim": {}}
    conflicts = []
    missing = 0
    async for row in database.registrations.find({}, {
        "id": 1, "event_id": 1, "email": 1, "nim": 1,
        "email_normalized": 1, "nim_normalized": 1,
    }):
        for field, normalize in (("email", normalize_email), ("nim", normalize_nim)):
            value = normalize(row.get(field))
            key = field + "_normalized"
            if row.get(key, "") != value:
                missing += 1
            if not value:
                continue
            identity = (row.get("event_id"), value)
            previous = seen[field].get(identity)
            if previous:
                # IDs only: do not print addresses or student numbers to startup logs.
                conflicts.append({"field": field, "ids": [previous, row.get("id")]})
            else:
                seen[field][identity] = row.get("id") or str(row["_id"])
    return {"conflicts": conflicts, "keys_to_backfill": missing}


async def migrate_registration_keys(database, *, apply: bool = False) -> dict:
    result = await registration_preflight(database)
    if result["conflicts"] or not apply:
        return result
    async for row in database.registrations.find({}, {"email": 1, "nim": 1}):
        values = {"email_normalized": normalize_email(row.get("email")),
                  "nim_normalized": normalize_nim(row.get("nim"))}
        await database.registrations.update_one({"_id": row["_id"]}, {"$set": values})
    return {**result, "applied": True}


async def _main(apply: bool):
    from lib.db import db, client
    try:
        result = await migrate_registration_keys(db, apply=apply)
        print(result)
        if result["conflicts"]:
            raise SystemExit(1)
    finally:
        client.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Backfill keys; never deletes or merges rows.")
    asyncio.run(_main(parser.parse_args().apply))
