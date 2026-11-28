"""Verification regressions against isolated mongomock, never a live database."""

import hashlib
import json
from copy import deepcopy
from datetime import datetime, timedelta, timezone

from bson import BSON
from bson.codec_options import CodecOptions

import pytest
import pytest_asyncio
from mongomock_motor import AsyncMongoMockClient
from starlette.requests import Request

import lib.auth


@pytest_asyncio.fixture
async def audit_db(monkeypatch, request):
    database = AsyncMongoMockClient(tz_aware=getattr(request, "param", False))["audit_verification_regressions"]
    monkeypatch.setattr(lib.auth, "db", database)
    return database


def _request():
    return Request({"type": "http", "headers": [], "method": "GET", "path": "/"})


def _historical_hash(prev, target, created, detail=None):
    # Independent pre-fix payload: pin historical v1/v2 compatibility.
    created = created.replace(tzinfo=created.tzinfo or timezone.utc).astimezone(timezone.utc)
    parts = [prev, "u1", "legacy", "post", target, created.isoformat()]
    if detail is not None:
        parts.append(json.dumps(detail, sort_keys=True, default=str, separators=(",", ":")))
    return hashlib.sha256("|".join(parts).encode()).hexdigest()


def _legacy_rows(descending_times=False):
    created = datetime(2026, 11, 26, 10, 0, 0, 123456, tzinfo=timezone.utc)
    rows = []
    prev = ""
    for i in range(3):
        authored = created - timedelta(days=i) if descending_times else created
        target = "ABC"[i]
        digest = _historical_hash(prev, target, authored)
        rows.append({"id": target, "actor_id": "u1", "action": "legacy", "resource": "post",
                     "target_id": target, "created_at": authored, "prev_hash": prev, "hash": digest})
        prev = digest
    return rows


@pytest.mark.asyncio
@pytest.mark.parametrize("mixed", [False, True], ids=["legacy", "mixed-v2"])
@pytest.mark.parametrize("descending_times", [False, True], ids=["tied-time", "reverse-time"])
async def test_valid_legacy_is_ordered_by_links(audit_db, mixed, descending_times):
    rows = _legacy_rows(descending_times)
    await audit_db.audit_log.insert_many(list(reversed(rows)))
    if mixed:
        for target in ("D", "E"):
            await lib.auth.audit(_request(), "new", "post", target, {"changed": True})
    before = await audit_db.audit_log.find({}).to_list(None)
    assert await lib.auth.verify_audit_chain() == {
        "checked": 5 if mixed else 3, "skipped": 0, "ok": True, "broken_at": None,
    }
    assert await audit_db.audit_log.find({}).to_list(None) == before


@pytest.mark.asyncio
@pytest.mark.parametrize("damage", ["missing-root", "missing-middle", "fork", "cycle", "hash", "payload"])
async def test_legacy_structural_corruption_is_rejected(audit_db, damage):
    rows = _legacy_rows()
    if damage == "missing-root":
        rows.pop(0)
    elif damage == "missing-middle":
        rows.pop(1)
    elif damage == "fork":
        fork = dict(rows[1], id="fork", target_id="fork")
        fork["hash"] = _historical_hash(fork["prev_hash"], "fork", fork["created_at"])
        rows.append(fork)
    elif damage == "cycle":
        rows[0]["prev_hash"] = rows[-1]["hash"]
    elif damage == "hash":
        rows[-1]["hash"] = "f" * 64
    else:
        rows[-1]["action"] = "tampered"
    await audit_db.audit_log.insert_many(list(reversed(rows)))
    before = await audit_db.audit_log.find({}).to_list(None)
    result = await lib.auth.verify_audit_chain()
    assert result["ok"] is False
    assert result["broken_at"] in {row["id"] for row in rows}
    assert await audit_db.audit_log.find({}).to_list(None) == before


@pytest.mark.asyncio
@pytest.mark.parametrize("field", ["hash", "prev_hash"])
@pytest.mark.parametrize("value", [["corrupted"], {"corrupted": True}])
async def test_legacy_malformed_link_is_reported_as_break(audit_db, field, value):
    rows = _legacy_rows()
    rows[-1][field] = value
    await audit_db.audit_log.insert_many(list(reversed(rows)))
    assert await lib.auth.verify_audit_chain() == {
        "checked": 2, "skipped": 0, "ok": False, "broken_at": "C",
    }


@pytest.mark.asyncio
@pytest.mark.parametrize("limit,checked,skipped", [(None, 3, 1), (0, 3, 1), (1, 0, 1), (2, 1, 1), (3, 2, 1), (4, 3, 1), (-2, 1, 1)])
async def test_limit_counts_prechain_rows_and_linked_prefix(audit_db, limit, checked, skipped):
    await audit_db.audit_log.insert_one({"id": "prechain"})
    await audit_db.audit_log.insert_many(list(reversed(_legacy_rows())))
    assert await lib.auth.verify_audit_chain(limit) == {
        "checked": checked, "skipped": skipped, "ok": True, "broken_at": None,
    }


@pytest.mark.asyncio
async def test_limit_does_not_verify_tampering_outside_prefix(audit_db):
    rows = _legacy_rows()
    rows[-1]["action"] = "tampered"
    await audit_db.audit_log.insert_many(rows)
    assert await lib.auth.verify_audit_chain(2) == {
        "checked": 2, "skipped": 0, "ok": True, "broken_at": None,
    }
    assert await lib.auth.verify_audit_chain() == {
        "checked": 2, "skipped": 0, "ok": False, "broken_at": "C",
    }


def _datetime_detail(shape):
    aware = datetime(2026, 11, 26, 10, 0, 0, 123456, tzinfo=timezone.utc)
    offset = aware.astimezone(timezone(timedelta(hours=5, minutes=30)))
    naive = aware.replace(tzinfo=None)
    return {
        "aware": {"when": aware},
        "offset": {"when": offset},
        "naive": {"when": naive},
        "nested-list": {"before": {"dates": [aware, {"offset": offset}, naive]}, "after": [None, True, 3, "unchanged"]},
    }[shape]


@pytest.mark.asyncio
@pytest.mark.parametrize("audit_db", [False, True], indirect=True, ids=["naive-reader", "aware-reader"])
@pytest.mark.parametrize("shape", ["aware", "offset", "naive", "nested-list"])
async def test_datetime_detail_survives_bson_roundtrip(audit_db, shape):
    detail = _datetime_detail(shape)
    authored = deepcopy(detail)
    await lib.auth.audit(_request(), "datetime", "probe", "first", detail)
    await lib.auth.audit(_request(), "ordinary", "probe", "next", {"nested": [1, "value", False]})
    rows = await audit_db.audit_log.find({}).sort("seq", 1).to_list(None)
    # Real BSON codec, independently of mongomock's normalisation implementation.
    expected = BSON.encode({"detail": authored}).decode(
        codec_options=CodecOptions(tz_aware=audit_db.codec_options.tz_aware)
    )["detail"]
    assert detail == authored, "hashing must not mutate callers' authored snapshots"
    assert rows[0]["detail"] == expected, "store native BSON dates, not hash-only strings"
    before = deepcopy(rows)
    assert await lib.auth.verify_audit_chain() == {
        "checked": 2, "skipped": 0, "ok": True, "broken_at": None,
    }
    assert await audit_db.audit_log.find({}).sort("seq", 1).to_list(None) == before


@pytest.mark.asyncio
@pytest.mark.parametrize("damage", ["millisecond", "date-string", "nested-value", "remove-date"])
async def test_datetime_detail_tampering_is_rejected(audit_db, damage):
    await lib.auth.audit(_request(), "datetime", "probe", "target", _datetime_detail("nested-list"))
    original = await audit_db.audit_log.find_one({})
    assert (await lib.auth.verify_audit_chain())["ok"] is True
    changed = deepcopy(original["detail"])
    if damage == "millisecond":
        changed["before"]["dates"][0] += timedelta(milliseconds=1)
    elif damage == "date-string":
        changed["before"]["dates"][0] = str(changed["before"]["dates"][0])
    elif damage == "nested-value":
        changed["after"][1] = False
    else:
        changed["before"]["dates"].pop()
    await audit_db.audit_log.update_one({"id": original["id"]}, {"$set": {"detail": changed}})
    assert await lib.auth.verify_audit_chain() == {
        "checked": 0, "skipped": 0, "ok": False, "broken_at": original["id"],
    }


@pytest.mark.asyncio
@pytest.mark.parametrize("limit,checked", [(3, 3), (4, 4), (5, 5), (6, 5), (-4, 4)])
async def test_limit_crosses_legacy_v2_boundary(audit_db, limit, checked):
    await audit_db.audit_log.insert_many(list(reversed(_legacy_rows())))
    for target in ("D", "E"):
        await lib.auth.audit(_request(), "new", "post", target)
    assert await lib.auth.verify_audit_chain(limit) == {
        "checked": checked, "skipped": 0, "ok": True, "broken_at": None,
    }


@pytest.mark.asyncio
async def test_legacy_v2_v3_chain_keeps_all_historical_rows(audit_db):
    legacy = _legacy_rows()
    await audit_db.audit_log.insert_many(list(reversed(legacy)))
    await lib.auth.audit(_request(), "ordinary", "post", "v2", {"n": 1})
    historical = await audit_db.audit_log.find({}).to_list(None)
    await lib.auth.audit(_request(), "datetime", "post", "v3", _datetime_detail("nested-list"))
    await lib.auth.audit(_request(), "ordinary", "post", "v2-after-v3", {"n": 2})
    sequenced = await audit_db.audit_log.find({"seq": {"$exists": True}}).sort("seq", 1).to_list(None)
    assert [row["hash_version"] for row in sequenced] == [2, 3, 2]
    assert [row["seq"] for row in sequenced] == [1, 2, 3]
    assert await lib.auth.verify_audit_chain() == {
        "checked": 6, "skipped": 0, "ok": True, "broken_at": None,
    }
    for row in historical:
        assert await audit_db.audit_log.find_one({"_id": row["_id"]}) == row


@pytest.mark.asyncio
@pytest.mark.parametrize("detail", [
    {}, {"before": {"n": 1}, "after": [None, True, "unchanged"]},
    {"when": "2026-11-26 10:00:00.123000", "$datetime": ["dict", "value"]},
    {"when": datetime(2026, 11, 26, 10, 0, 0, 123000)},
], ids=["empty", "ordinary", "date-looking-strings", "historical-naive-ms-date"])
async def test_historical_v2_detail_hashes_are_not_rewritten(audit_db, detail):
    created = datetime(2026, 11, 26, 10, 0, 0, 123000, tzinfo=timezone.utc)
    digest = _historical_hash("", "historical", created, detail)
    await audit_db.audit_log.insert_one({
        "id": "historical", "actor_id": "u1", "action": "legacy", "resource": "post",
        "target_id": "historical", "created_at": created, "detail": detail,
        "prev_hash": "", "hash": digest, "hash_version": 2, "seq": 1,
    })
    before = await audit_db.audit_log.find_one({})
    assert await lib.auth.verify_audit_chain() == {
        "checked": 1, "skipped": 0, "ok": True, "broken_at": None,
    }
    assert await audit_db.audit_log.find_one({}) == before
