"""Audit append regressions using isolated mongomock databases, not live MongoDB."""

import asyncio
import time
from datetime import datetime, timezone

import pytest
import pytest_asyncio
from mongomock_motor import AsyncMongoMockClient
from starlette.requests import Request

import lib.auth
import lib.db


def _request():
    return Request({"type": "http", "headers": [], "method": "GET", "path": "/"})


@pytest_asyncio.fixture
async def audit_db(monkeypatch):
    database = AsyncMongoMockClient()["audit_chain_regressions"]
    collections = {}

    class PinnedCollections:
        # mongomock_motor returns a fresh wrapper on every lookup. Pin wrappers so
        # failure/interleaving hooks exercise the collection used by production code.
        def __getitem__(self, name):
            if name not in collections:
                collections[name] = database[name]
            return collections[name]

        def __getattr__(self, name):
            return self[name]

    pinned = PinnedCollections()
    monkeypatch.setattr(lib.auth, "db", pinned)
    monkeypatch.setattr(lib.db, "db", pinned)
    await lib.db.ensure_indexes()
    return pinned


@pytest.mark.asyncio
async def test_append_uses_linked_legacy_tail_without_rewriting_hashes(audit_db):
    # Three distinct honest v1 hashes, all stored in the same Mongo millisecond.
    # Neither seq ordering nor a timestamp tie may pick the first legacy row.
    created = datetime(2026, 11, 26, 10, 0, 0, 123456, tzinfo=timezone.utc)
    prev = ""
    rows = []
    for i in range(3):
        target = f"legacy-{i}"
        digest = lib.auth.audit_hash(prev, "u1", "legacy", "post", target, created)
        rows.append({
            "id": target, "actor_id": "u1", "action": "legacy", "resource": "post",
            "target_id": target, "created_at": created, "prev_hash": prev, "hash": digest,
        })
        prev = digest
    # Storage order C, B, A must not be mistaken for chain order A -> B -> C.
    await audit_db.audit_log.insert_many(list(reversed(rows)))
    before = await audit_db.audit_log.find({"action": "legacy"}).to_list(None)
    assert (await lib.auth.verify_audit_chain())["ok"] is True

    await lib.auth.audit(_request(), "append", "probe", "first")
    await lib.auth.audit(_request(), "append", "probe", "second")

    appended = await audit_db.audit_log.find({"action": "append"}).sort("seq", 1).to_list(None)
    assert appended[0]["prev_hash"] == prev
    assert appended[1]["prev_hash"] == appended[0]["hash"]
    assert [row["seq"] for row in appended] == [1, 2]
    assert await audit_db.audit_log.find({"action": "legacy"}).to_list(None) == before
    assert (await lib.auth.verify_audit_chain())["ok"] is True


@pytest.mark.asyncio
@pytest.mark.parametrize("lock_mode", ["timeout", "cas_error", "expired_lease"])
async def test_two_workers_fence_stale_insert_and_retry(audit_db, monkeypatch, lock_mode):
    from pymongo.errors import DuplicateKeyError

    # Separate task-local locks simulate independent worker processes sharing Mongo.
    worker_locks = {name: asyncio.Lock() for name in ("stale-worker", "winner-worker")}
    monkeypatch.setattr(lib.auth, "_get_audit_lock", lambda: worker_locks[asyncio.current_task().get_name()])
    original_acquire = lib.auth._acquire_chain_lock
    claims = {}

    async def acquire(token):
        claimed = await original_acquire(token, timeout=0)
        claims[asyncio.current_task().get_name()] = claimed
        return claimed

    monkeypatch.setattr(lib.auth, "_acquire_chain_lock", acquire)
    if lock_mode == "timeout":
        await audit_db.audit_locks.insert_one({
            "_id": lib.auth.AUDIT_LOCK_ID, "held": True, "token": "foreign-worker",
            "expires_at": time.time() + 300,
        })
    elif lock_mode == "cas_error":
        async def unavailable(*args, **kwargs):
            raise RuntimeError("CAS unavailable")
        monkeypatch.setattr(audit_db.audit_locks, "find_one_and_update", unavailable)

    stale_ready = asyncio.Event()
    winner_inserted = asyncio.Event()
    stale_attempted = asyncio.Event()
    proposals = []
    conflicts = []
    original_insert = audit_db.audit_log.insert_one

    async def interleaved_insert(doc, *args, **kwargs):
        name = asyncio.current_task().get_name()
        proposals.append((name, doc["seq"], doc["prev_hash"]))
        first_stale = name == "stale-worker" and not stale_ready.is_set()
        if first_stale:
            # Pause AFTER head read, immediately before the real database insert.
            # Even an extra lease check before insert cannot protect this window.
            stale_ready.set()
            await winner_inserted.wait()
        try:
            result = await original_insert(doc, *args, **kwargs)
        except DuplicateKeyError:
            conflicts.append(name)
            raise
        finally:
            if first_stale:
                stale_attempted.set()
        if name == "winner-worker":
            winner_inserted.set()
            await stale_attempted.wait()
        return result

    monkeypatch.setattr(audit_db.audit_log, "insert_one", interleaved_insert)
    workers = [asyncio.create_task(lib.auth.audit(_request(), "concurrent", "probe", "stale"), name="stale-worker")]
    try:
        await asyncio.wait_for(stale_ready.wait(), timeout=5)
        if lock_mode == "expired_lease":
            claim = await audit_db.audit_locks.find_one({"_id": lib.auth.AUDIT_LOCK_ID})
            assert claim["held"] is True
            # Let B take A's lease while A is paused on its already-computed insert.
            await audit_db.audit_locks.update_one({"_id": lib.auth.AUDIT_LOCK_ID}, {"$set": {"expires_at": 0}})
        workers.append(asyncio.create_task(lib.auth.audit(_request(), "concurrent", "probe", "winner"), name="winner-worker"))
        await asyncio.wait_for(asyncio.gather(*workers), timeout=5)
    finally:
        for worker in workers:
            if not worker.done():
                worker.cancel()
        await asyncio.gather(*workers, return_exceptions=True)

    rows = await audit_db.audit_log.find({}).sort("seq", 1).to_list(None)
    assert len(rows) == 2, "neither audit write may disappear on lock failure"
    assert [row["seq"] for row in rows] == [1, 2]
    assert [row["target_id"] for row in rows] == ["winner", "stale"]
    assert rows[1]["prev_hash"] == rows[0]["hash"]
    assert conflicts == ["stale-worker"], "the stale append must be fenced at the actual insert"
    assert [(name, seq) for name, seq, _ in proposals] == [
        ("stale-worker", 1), ("winner-worker", 1), ("stale-worker", 2),
    ]
    assert claims == {name: lock_mode == "expired_lease" for name in worker_locks}
    if lock_mode == "timeout":
        assert (await audit_db.audit_locks.find_one({"_id": lib.auth.AUDIT_LOCK_ID}))["token"] == "foreign-worker"
    assert (await lib.auth.verify_audit_chain())["ok"] is True


@pytest.mark.asyncio
async def test_declared_sequence_index_is_unique_sparse_and_keeps_legacy(audit_db):
    from pymongo.errors import DuplicateKeyError

    # Use the production index declaration, not a test-only substitute.
    models = [model for model in lib.db.INDEXES["audit_log"] if model.document.get("unique")
              and list(model.document["key"]) == ["seq"]]
    assert len(models) == 1, "audit seq needs a database-enforced unique index"
    model = models[0]
    assert model.document.get("sparse") is True
    await audit_db.audit_log.drop_index(model.document["name"])
    await audit_db.audit_log.insert_many([{"id": "legacy-1"}, {"id": "legacy-2"}])
    await audit_db.audit_log.create_indexes([model])
    info = (await audit_db.audit_log.index_information())[model.document["name"]]
    assert info["unique"] is True and info["sparse"] is True
    await audit_db.audit_log.insert_one({"id": "v2-1", "hash_version": 2, "seq": 1})
    with pytest.raises(DuplicateKeyError):
        await audit_db.audit_log.insert_one({"id": "v2-duplicate", "hash_version": 2, "seq": 1})
    assert await audit_db.audit_log.count_documents({"seq": {"$exists": False}}) == 2


@pytest.mark.asyncio
async def test_failed_startup_index_creation_cannot_allow_unfenced_append(audit_db, monkeypatch):
    from pymongo.errors import OperationFailure

    original_create = audit_db.audit_log.create_indexes

    async def unavailable(models, *args, **kwargs):
        if any(list(model.document["key"]) == ["seq"] for model in models):
            raise OperationFailure("audit sequence index unavailable")
        return await original_create(models, *args, **kwargs)

    monkeypatch.setattr(audit_db.audit_log, "create_indexes", unavailable)
    # Startup currently logs index failures and continues; append must check for itself.
    await lib.db.ensure_indexes()
    with pytest.raises(OperationFailure, match="audit sequence index unavailable"):
        await lib.auth.audit(_request(), "must-not-fork", "probe")
    assert await audit_db.audit_log.count_documents({}) == 0


@pytest.mark.asyncio
async def test_persistent_insert_conflicts_raise_after_bounded_retry(audit_db, monkeypatch):
    from pymongo.errors import DuplicateKeyError

    attempts = 0

    async def conflict(*args, **kwargs):
        nonlocal attempts
        attempts += 1
        raise DuplicateKeyError("persistent sequence collision")

    monkeypatch.setattr(audit_db.audit_log, "insert_one", conflict)
    with pytest.raises(RuntimeError, match="Cannot append audit entry after .* conflicts") as caught:
        await lib.auth.audit(_request(), "contention", "probe")
    assert 1 < attempts <= 16
    assert isinstance(caught.value.__cause__, DuplicateKeyError)
    assert await audit_db.audit_log.count_documents({}) == 0
    assert (await audit_db.audit_locks.find_one({"_id": lib.auth.AUDIT_LOCK_ID}))["held"] is False


@pytest.mark.asyncio
async def test_insert_storage_error_propagates_without_success_or_retry(audit_db, monkeypatch):
    from pymongo.errors import OperationFailure

    failure = OperationFailure("write rejected")
    attempts = 0

    async def rejected(*args, **kwargs):
        nonlocal attempts
        attempts += 1
        raise failure

    monkeypatch.setattr(audit_db.audit_log, "insert_one", rejected)
    with pytest.raises(OperationFailure) as caught:
        await lib.auth.audit(_request(), "storage-error", "probe")
    assert caught.value is failure
    assert attempts == 1
    assert await audit_db.audit_log.count_documents({}) == 0


@pytest.mark.asyncio
@pytest.mark.parametrize("missing", ["absent", "empty", "null"])
async def test_missing_v2_tail_hash_is_a_break_not_prechain(audit_db, missing):
    # Truly pre-chain records remain skippable, including an empty unmarked hash.
    await audit_db.audit_log.insert_many([
        {"id": "prechain-absent"}, {"id": "prechain-empty", "hash": ""},
    ])
    await lib.auth.audit(_request(), "verify", "probe", "first")
    await lib.auth.audit(_request(), "verify", "probe", "tail")
    assert await lib.auth.verify_audit_chain() == {
        "checked": 2, "skipped": 2, "ok": True, "broken_at": None,
    }
    tail = await audit_db.audit_log.find_one({"target_id": "tail"})
    update = {"$unset": {"hash": ""}} if missing == "absent" else {"$set": {"hash": "" if missing == "empty" else None}}
    await audit_db.audit_log.update_one({"id": tail["id"]}, update)

    assert await lib.auth.verify_audit_chain() == {
        "checked": 1, "skipped": 2, "ok": False, "broken_at": tail["id"],
    }


@pytest.mark.asyncio
@pytest.mark.parametrize("marker", [{"hash_version": 2}, {"seq": 1}, {"prev_hash": ""}, {"hash_version": 1}])
async def test_hashless_row_with_chain_marker_cannot_be_skipped(audit_db, marker):
    await audit_db.audit_log.insert_one({"id": "broken", **marker})
    assert await lib.auth.verify_audit_chain() == {
        "checked": 0, "skipped": 0, "ok": False, "broken_at": "broken",
    }
