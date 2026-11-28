#!/usr/bin/env python3
"""Real MongoDB/process integration checks; never imports backend/tests/conftest.py.

Run: python scripts/test/verify_mongo_workflows.py
Opt in with TNL_INTEGRATION_MONGO_URL=mongodb://127.0.0.1:27017.
Only loopback and the CI service names mongo/mongodb are accepted. URI database
paths, when supplied, must have the integration prefix; they are never reused.
Every run owns a fresh tnl_integration_<uuid> database and drops only that database.
The parent supervises spawned OS processes; production audit/registration code
and production Mongo index definitions execute against a real, bounded client.
"""

from __future__ import annotations

import asyncio
import importlib
import ipaddress
import json
import logging
import multiprocessing
import os
import re
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from unittest.mock import patch
from urllib.parse import unquote, urlsplit
from uuid import uuid4

DB_PREFIX = "tnl_integration_"
DB_PATTERN = re.compile(r"tnl_integration_[0-9a-f]{32}\Z")
WORKERS = 4
AUDIT_ROWS_PER_WORKER = 30
WORKER_SECONDS = 60
PHASE_SECONDS = 90
RUN_SECONDS = 300
BACKEND = Path(__file__).resolve().parents[2] / "backend"


class SafetyError(Exception):
    """A fixed, credential-free refusal code."""


class VerificationError(Exception):
    """An invariant failed; messages contain codes, never driver exceptions."""


@dataclass(frozen=True)
class Config:
    uri: str = field(repr=False)
    database: str
    owner: str = field(repr=False)


def require(condition: bool, code: str) -> None:
    if not condition:
        raise VerificationError(code)


def validate_uri(uri: str) -> str:
    """Reject unsafe destinations before creating any Mongo client or resolving SRV."""
    if not uri or uri.strip() != uri:
        raise SafetyError("explicit_integration_mongo_url_required")
    try:
        parts = urlsplit(uri)
        if parts.scheme != "mongodb" or not parts.netloc or parts.fragment:
            raise SafetyError("mongodb_loopback_or_ci_service_url_required")
        supplied_db = unquote(parts.path.lstrip("/"))
        if supplied_db and not DB_PATTERN.fullmatch(supplied_db):
            raise SafetyError("nonintegration_database_refused")
        from pymongo.uri_parser import parse_uri

        parsed = parse_uri(uri)
        if len(parsed["nodelist"]) != 1:
            raise SafetyError("single_disposable_mongo_target_required")
        if parsed.get("collection"):
            raise SafetyError("collection_override_refused")
        for host, _port in parsed["nodelist"]:
            if host.lower() in {"localhost", "mongo", "mongodb"}:
                continue
            try:
                local = ipaddress.ip_address(host).is_loopback
            except ValueError:
                local = False
            if not local:
                raise SafetyError("nonlocal_mongo_target_refused")
    except SafetyError:
        raise
    except Exception:
        raise SafetyError("invalid_integration_mongo_url") from None
    return uri


def configuration(environ: Any = os.environ) -> Config:
    # Do not accept a caller-selected database, even one with the safe prefix.
    if environ.get("TNL_INTEGRATION_DB_NAME") is not None:
        raise SafetyError("database_override_refused")
    uri = validate_uri(environ.get("TNL_INTEGRATION_MONGO_URL", ""))
    return Config(uri, DB_PREFIX + uuid4().hex, uuid4().hex)


def mongo_client(config: Config):
    from motor.motor_asyncio import AsyncIOMotorClient

    if not DB_PATTERN.fullmatch(config.database):
        raise SafetyError("generated_database_guard_failed")
    return AsyncIOMotorClient(
        validate_uri(config.uri), serverSelectionTimeoutMS=3000,
        connectTimeoutMS=2000, socketTimeoutMS=5000, waitQueueTimeoutMS=3000,
        timeoutMS=7000, maxPoolSize=16, retryWrites=False, w=1,
        readPreference="primary", directConnection=True,
        appname="tnl-isolated-workflow-verification",
    )


def backend_modules(config: Config, client):
    """Import actual backend modules while bypassing only dotenv/client creation."""
    if "lib.db" in sys.modules:
        raise SafetyError("backend_database_imported_before_isolation")
    sys.path.insert(0, str(BACKEND))
    os.environ["MONGO_URL"] = config.uri
    os.environ["DB_NAME"] = config.database
    os.environ["WORKFLOW_WORKER_ENABLED"] = "0"
    os.environ["SMTP_HOST"] = ""
    os.environ["PYTHON_DOTENV_DISABLED"] = "1"
    import dotenv
    import motor.motor_asyncio

    # Keep the production lib.db/index definitions. No mock database, collection,
    # query, audit function, or workflow function is substituted.
    with patch.object(dotenv, "load_dotenv", return_value=False), patch.object(
        motor.motor_asyncio, "AsyncIOMotorClient", return_value=client
    ):
        database = importlib.import_module("lib.db")
        auth = importlib.import_module("lib.auth")
        workflow = importlib.import_module("lib.registration_workflow")
        integrity = importlib.import_module("lib.registration_integrity")
    require(database.client is client, "backend_client_binding")
    require(database.db.name == config.database, "backend_database_binding")
    return database, auth, workflow, integrity


async def wait_signal(signal, seconds: int = 20) -> None:
    ready = await asyncio.to_thread(signal.wait, seconds)
    require(bool(ready), "process_signal_timeout")


async def worker_run(config: Config, mode: str, payload: dict, connection, start, resume):
    client = mongo_client(config)
    try:
        await client[config.database].command("ping", maxTimeMS=2000)
        database, auth, workflow, integrity = backend_modules(config, client)
        db = database.db
        owner = await db.integration_guard.find_one({"_id": "owner"})
        require(bool(owner and owner.get("token") == config.owner), "worker_ownership_guard")
        connection.send({"event": "ready", "pid": os.getpid()})
        await wait_signal(start)
        result: dict[str, Any] = {"ok": True, "pid": os.getpid(), "mode": mode}
        if mode in {"audit", "stale_audit"}:
            head_reads = 0
            if mode == "stale_audit":
                original_head = auth._audit_head
                original_acquire = auth._acquire_chain_lock

                async def short_lease(token):
                    return await original_acquire(token, ttl=0.15, timeout=5)

                async def paused_head():
                    nonlocal head_reads
                    head = await original_head()
                    head_reads += 1
                    if head_reads == 1:
                        connection.send({"event": "head_read"})
                        await wait_signal(resume)
                    return head

                auth._acquire_chain_lock = short_lease
                auth._audit_head = paused_head
            rows = payload["rows"]
            for index in range(rows):
                detail = {"worker": payload["worker"], "row": index}
                if index % 3 == 0:
                    detail["nested"] = {"when": datetime.now(timezone.utc)}
                await auth.audit(
                    None, "integration-append", "integration",  # type: ignore[arg-type]
                    f"{mode}-{payload['worker']}-{index}", detail,
                    actor={"id": f"integration-worker-{payload['worker']}"},
                )
            result.update(inserted=rows, head_reads=head_reads)
        elif mode == "register":
            inserted = duplicates = 0
            from pymongo.errors import DuplicateKeyError

            for index in range(payload["rows"]):
                reg_id = f"{payload['scenario']}-{payload['worker']}-{index}"
                email = f"{reg_id}@example.invalid"
                nim = f"{payload['worker']}{index}12345678"
                if payload["scenario"] == "email_duplicate":
                    email = " SHARED@EXAMPLE.INVALID " if payload["worker"] % 2 else "shared@example.invalid"
                elif payload["scenario"] == "nim_duplicate":
                    nim = "12-345.678" if payload["worker"] % 2 else "12 345678"
                elif payload["scenario"] == "blank_identity":
                    email = nim = ""
                row = {
                    "id": reg_id, "event_id": payload["event_id"], "status": "processing",
                    "email": email, "nim": nim,
                    "email_normalized": integrity.normalize_email(email),
                    "nim_normalized": integrity.normalize_nim(nim),
                    "uploads_ready": True, "created_at": datetime.now(timezone.utc),
                }
                try:
                    await db.registrations.insert_one(row)
                except DuplicateKeyError:
                    duplicates += 1
                    continue
                await workflow.change_registration(payload["event_id"], reg_id, add=True)
                inserted += 1
            result.update(inserted=inserted, duplicates=duplicates)
        elif mode == "registration_change":
            await workflow.change_registration(
                payload["event_id"], payload["reg_id"],
                status=payload.get("status"), remove=payload.get("remove", False),
            )
            if payload.get("remove"):
                await db.registrations.delete_one({"id": payload["reg_id"], "event_id": payload["event_id"]})
        elif mode == "registration_readd":
            from fastapi import HTTPException

            try:
                await workflow.change_registration(payload["event_id"], payload["reg_id"], add=True)
            except HTTPException as exc:
                if exc.status_code != 409:
                    raise
                result["http_status"] = 409
            else:
                raise VerificationError("cancelled_registration_readmission")
        elif mode == "publish":
            from fastapi import HTTPException

            if payload.get("pause"):
                original_prepare = workflow._prepare_event_publication

                async def paused_prepare(event_id, publication):
                    await original_prepare(event_id, publication)
                    connection.send({"event": "publication_prepared"})
                    await wait_signal(resume)

                workflow._prepare_event_publication = paused_prepare
            current = payload["current"]
            updated = {**current, "capacity": payload["capacity"]}
            try:
                await workflow.persist_event_document(current, updated, publish=True)
                result["http_status"] = 200
            except HTTPException as exc:
                if exc.status_code != 409:
                    raise
                result["http_status"] = 409
        else:
            raise VerificationError("unknown_worker_mode")
        return result
    finally:
        client.close()


def worker_entry(config, mode, payload, connection, start, resume):
    logging.disable(logging.CRITICAL)
    sys.dont_write_bytecode = True
    try:
        result = asyncio.run(asyncio.wait_for(
            worker_run(config, mode, payload, connection, start, resume), WORKER_SECONDS
        ))
        connection.send({"event": "result", **result})
    except BaseException as exc:
        # Driver messages can contain the DSN. Never send/print their text or a traceback.
        try:
            connection.send({"event": "result", "ok": False, "error_type": type(exc).__name__})
        except (EOFError, OSError):
            pass
    finally:
        connection.close()


def spawn_worker(context, config, mode, payload, start, resume=None):
    receiver, sender = context.Pipe(duplex=False)
    process = context.Process(
        target=worker_entry, args=(config, mode, payload, sender, start, resume),
        name=f"tnl-integration-{mode}", daemon=True,
    )
    process.start()
    sender.close()
    return process, receiver


async def messages(workers, event: str, seconds: int = PHASE_SECONDS) -> list[dict]:
    pending = dict(enumerate(workers))
    results: dict[int, dict] = {}
    deadline = time.monotonic() + seconds
    while pending:
        if time.monotonic() >= deadline:
            raise VerificationError("process_phase_timeout")
        for index, (process, connection) in list(pending.items()):
            if connection.poll():
                try:
                    message = connection.recv()
                except EOFError:
                    raise VerificationError("worker_pipe_closed") from None
                if message.get("event") == "result" and not message.get("ok"):
                    raise VerificationError("worker_failed_" + message.get("error_type", "unknown"))
                require(message.get("event") == event, "worker_protocol_mismatch")
                results[index] = message
                del pending[index]
            elif process.exitcode is not None:
                raise VerificationError("worker_exited_without_result")
        if pending:
            await asyncio.sleep(0.02)
    return [results[index] for index in sorted(results)]


def stop_workers(workers) -> None:
    for process, _connection in workers:
        if process.is_alive():
            process.terminate()
    for process, connection in workers:
        process.join(timeout=2)
        if process.is_alive():
            process.kill()
            process.join(timeout=2)
        connection.close()
        process.close()


async def group(context, config, mode, payloads) -> list[dict]:
    start = context.Event()
    workers = []
    try:
        for payload in payloads:
            workers.append(spawn_worker(context, config, mode, payload, start))
        await messages(workers, "ready", seconds=20)
        start.set()
        results = await messages(workers, "result")
        require(len({row["pid"] for row in results}) == len(workers), "distinct_os_processes")
        return results
    finally:
        stop_workers(workers)


async def verify_chain(db, auth, expected: int) -> dict:
    rows = await db.audit_log.find({}, {"seq": 1, "target_id": 1}).sort("seq", 1).max_time_ms(3000).to_list(expected + 1)
    require(len(rows) == expected, "audit_exact_count")
    require([row["seq"] for row in rows] == list(range(1, expected + 1)), "audit_gapless_unique_sequence")
    require(len({row["target_id"] for row in rows}) == expected, "audit_unique_targets")
    verified = await auth.verify_audit_chain()
    require(verified == {"checked": expected, "skipped": 0, "ok": True, "broken_at": None}, "audit_full_chain")
    indexes = await db.audit_log.index_information()
    require(indexes["audit_seq_unique"].get("unique") is True, "audit_unique_index")
    return {"rows": expected, "seq_first": 1, "seq_last": expected,
            "gapless_unique_sequence": True, "full_chain_verified": True}


async def verify_tamper_detection(db, auth) -> None:
    target = await db.audit_log.find_one({"seq": 2}, {"id": 1, "action": 1})
    require(bool(target), "audit_tamper_fixture_missing")
    try:
        await db.audit_log.update_one({"id": target["id"]}, {"$set": {"action": "integration-tampered"}})
        broken = await auth.verify_audit_chain()
        require(not broken["ok"] and broken["broken_at"] == target["id"], "audit_tamper_detection")
    finally:
        await db.audit_log.update_one({"id": target["id"]}, {"$set": {"action": target["action"]}})


async def stale_lease(context, config, db, auth) -> dict:
    start, resume = context.Event(), context.Event()
    workers = []
    new_token = "integration-new-owner-" + uuid4().hex
    try:
        workers.append(spawn_worker(context, config, "stale_audit", {"worker": "stale", "rows": 1}, start, resume))
        await messages(workers, "ready", seconds=20)
        start.set()
        await messages(workers, "head_read", seconds=20)
        await group(context, config, "audit", [{"worker": "successor", "rows": 1}])
        require(await auth._acquire_chain_lock(new_token, ttl=10, timeout=3), "new_lease_acquisition")
        resume.set()
        result = (await messages(workers, "result", seconds=20))[0]
        require(result["head_reads"] >= 2, "stale_writer_must_reread_head_after_conflict")
        lock = await db.audit_locks.find_one({"_id": auth.AUDIT_LOCK_ID})
        require(bool(lock and lock.get("held") and lock.get("token") == new_token), "stale_release_must_not_unlock_new_owner")
        return {"conflict_forced_head_reread": True, "new_owner_lease_preserved": True}
    finally:
        resume.set()
        stop_workers(workers)
        await auth._release_chain_lock(new_token)


async def registration_snapshot(db, workflow, event_id: str, expected: int):
    ledger = await workflow.event_ledger(event_id)
    rows = await db.registrations.find({"event_id": event_id}).max_time_ms(3000).to_list(expected + 1)
    entries = ledger["entries"]
    require(len(rows) == len(entries) == expected, "registration_exact_count")
    require(len({entry["id"] for entry in entries}) == expected, "registration_unique_ledger_ids")
    projected = {row["id"]: row for row in rows}
    require(set(projected) == {entry["id"] for entry in entries}, "registration_ledger_projection_ids")
    require(all(projected[entry["id"]]["status"] == entry["status"] for entry in entries), "registration_projection_status")
    require(all(row.get("workflow_version") == ledger["version"] for row in rows), "registration_projection_version")
    occupied = sum(entry["status"] in workflow.OCCUPIED for entry in entries)
    require(not ledger["capacity"] or occupied <= ledger["capacity"], "registration_no_oversubscription")
    return ledger


async def registrations(context, config, db, workflow) -> dict:
    indexes = await db.registrations.index_information()
    for name in ("event_email_unique", "event_nim_unique"):
        require(bool(indexes.get(name, {}).get("unique")), "registration_unique_index_missing")
        require(bool(indexes[name].get("partialFilterExpression")), "registration_partial_index_missing")
    aggregate = {}
    for scenario, per_worker, expected in (
        ("last_slot", 3, WORKERS * 3), ("email_duplicate", 1, 1),
        ("nim_duplicate", 1, 1), ("blank_identity", 1, WORKERS),
    ):
        event_id = "integration-" + scenario
        await db.events.insert_one({"id": event_id, "slug": event_id, "capacity": 1, "status": "published"})
        await workflow.event_ledger(event_id)
        results = await group(context, config, "register", [
            {"scenario": scenario, "event_id": event_id, "worker": worker, "rows": per_worker}
            for worker in range(WORKERS)
        ])
        require(sum(row["inserted"] for row in results) == expected, "registration_insert_outcomes")
        require(sum(row["duplicates"] for row in results) == WORKERS * per_worker - expected, "registration_duplicate_outcomes")
        ledger = await registration_snapshot(db, workflow, event_id, expected)
        require(sum(entry["status"] == "accepted" for entry in ledger["entries"]) == 1, "registration_exact_last_slot")
        require(sum(entry["status"] == "waitlisted" for entry in ledger["entries"]) == expected - 1, "registration_exact_waitlist")
        aggregate[scenario] = {"inserted": expected, "duplicates": WORKERS * per_worker - expected,
                               "accepted": 1, "waitlisted": expected - 1}
    event_id = "integration-last_slot"
    old = await workflow.event_ledger(event_id)
    accepted = next(entry["id"] for entry in old["entries"] if entry["status"] == "accepted")
    first_waiter = next(entry["id"] for entry in old["entries"] if entry["status"] == "waitlisted")
    await group(context, config, "registration_change", [
        {"event_id": event_id, "reg_id": accepted, "status": "rejected"} for _ in range(2)
    ])
    await workflow.sync_ledger(old)
    current = await registration_snapshot(db, workflow, event_id, WORKERS * 3)
    accepted_ids = [entry["id"] for entry in current["entries"] if entry["status"] == "accepted"]
    require(accepted_ids == [first_waiter], "registration_fifo_promotion_after_rejection")
    next_waiter = next(entry["id"] for entry in current["entries"] if entry["status"] == "waitlisted")
    await group(context, config, "registration_change", [
        {"event_id": event_id, "reg_id": first_waiter, "remove": True} for _ in range(2)
    ])
    await workflow.sync_ledger(current)
    final = await registration_snapshot(db, workflow, event_id, WORKERS * 3 - 1)
    require([entry["id"] for entry in final["entries"] if entry["status"] == "accepted"] == [next_waiter], "registration_fifo_promotion_after_removal")
    require(first_waiter in final.get("cancelled_ids", []), "registration_permanent_cancellation_marker")
    await group(context, config, "registration_readd", [
        {"event_id": event_id, "reg_id": first_waiter} for _ in range(2)
    ])
    await registration_snapshot(db, workflow, event_id, WORKERS * 3 - 1)
    aggregate.update(fifo_promotion=True, stale_projection_rejected=True, cancelled_readmission_refused=True)
    return aggregate


async def publications(context, config, db, workflow) -> dict:
    event_id = "integration-publishers"
    await db.events.insert_one({"id": event_id, "slug": event_id, "status": "published",
                                "capacity": 10, "_cms_version": 0})
    await workflow.event_ledger(event_id)
    await group(context, config, "register", [
        {"scenario": "publisher_seed", "event_id": event_id, "worker": worker, "rows": 1}
        for worker in range(WORKERS)
    ])
    workers, resumes = [], []

    async def pause(current, capacity):
        start, resume = context.Event(), context.Event()
        worker = spawn_worker(context, config, "publish", {
            "current": current, "capacity": capacity, "pause": True,
        }, start, resume)
        workers.append(worker)
        resumes.append(resume)
        await messages([worker], "ready", seconds=20)
        start.set()
        await messages([worker], "publication_prepared", seconds=20)
        return worker, resume

    try:
        original = await db.events.find_one({"id": event_id}, {"_id": 0})
        publisher, resume = await pause(original, 5)
        competing = (await group(context, config, "publish", [{"current": original, "capacity": 8}]))[0]
        require(competing["http_status"] == 409, "competing_capacity_publisher_must_conflict")
        await group(context, config, "register", [
            {"scenario": "publisher_contender", "event_id": event_id, "worker": worker, "rows": 2}
            for worker in range(10, 10 + WORKERS)
        ])
        ledger = await workflow.event_ledger(event_id)
        occupied = sum(entry["status"] in workflow.OCCUPIED for entry in ledger["entries"])
        require(occupied == 5, "prepared_publication_must_constrain_admission")
        require(ledger["capacity_transition"]["capacity"] == 5, "competing_publisher_must_not_replace_constraint")
        resume.set()
        require((await messages([publisher], "result", seconds=20))[0]["http_status"] == 200, "capacity_publisher_commit")
        committed = await db.events.find_one({"id": event_id}, {"_id": 0})
        ledger = await workflow.event_ledger(event_id)
        require(committed["capacity"] == ledger["capacity"] == 5, "capacity_event_ledger_agreement")
        require("_capacity_publication" not in committed and "capacity_transition" not in ledger, "capacity_publication_finalized")

        stale, stale_resume = await pause(committed, 8)
        recovered = await workflow.recover_event_publication(
            event_id, now=datetime.now(timezone.utc) + timedelta(seconds=60)
        )
        require(recovered, "expired_publication_recovery")
        fresh = await db.events.find_one({"id": event_id}, {"_id": 0})
        replacement = (await group(context, config, "publish", [{"current": fresh, "capacity": 6}]))[0]
        require(replacement["http_status"] == 200, "replacement_capacity_publication")
        stale_resume.set()
        require((await messages([stale], "result", seconds=20))[0]["http_status"] == 409, "recovered_stale_publisher_must_be_fenced")
        final = await db.events.find_one({"id": event_id}, {"_id": 0})
        ledger = await workflow.event_ledger(event_id)
        require(final["capacity"] == ledger["capacity"] == 6, "stale_publisher_must_not_overwrite_new_capacity")
        require("_capacity_publication" not in final and "capacity_transition" not in ledger, "recovered_publication_finalized")
        # Exercise the ordinary production promotion/sync path after an increase.
        await workflow.change_registration(event_id)
        await registration_snapshot(db, workflow, event_id, WORKERS * 3)
        return {"competing_publisher_status": 409, "transition_occupied": occupied,
                "committed_capacity": 5, "stale_publisher_status": 409, "replacement_capacity": 6}
    finally:
        for resume in resumes:
            resume.set()
        stop_workers(workers)


async def cleanup_database(client, config: Config) -> bool:
    if not DB_PATTERN.fullmatch(config.database):
        raise SafetyError("cleanup_database_guard_failed")
    db = client[config.database]
    marker = await db.integration_guard.find_one({"_id": "owner"})
    if marker is None and not await db.list_collection_names():
        return True
    if not marker or marker.get("token") != config.owner:
        raise SafetyError("cleanup_ownership_guard_failed")
    await client.drop_database(config.database)
    return not await db.list_collection_names()


async def coordinate(config: Config, report: dict) -> None:
    client = mongo_client(config)
    owned = False
    try:
        report["stage"] = "connect"
        db = client[config.database]
        await db.command("ping", maxTimeMS=2000)
        require(not await db.list_collection_names(), "generated_database_already_exists")
        # Mark cleanup eligibility before insertion: an uncertain acknowledgement
        # still reaches guarded cleanup, which checks this exact run's token.
        owned = True
        await db.integration_guard.insert_one({"_id": "owner", "token": config.owner})
        report["stage"] = "indexes"
        database, auth, workflow, _integrity = backend_modules(config, client)
        await database.ensure_indexes()
        info = await client.server_info()
        report["mongo_version"] = str(info["version"])
        context = multiprocessing.get_context("spawn")
        report["stage"] = "audit_processes"
        results = await group(context, config, "audit", [
            {"worker": index, "rows": AUDIT_ROWS_PER_WORKER} for index in range(WORKERS)
        ])
        expected = WORKERS * AUDIT_ROWS_PER_WORKER
        require(sum(row["inserted"] for row in results) == expected, "audit_worker_insert_totals")
        report["audit"] = await verify_chain(db, auth, expected)
        report["audit"]["processes"] = WORKERS
        report["stage"] = "stale_lease"
        report["stale_lease"] = await stale_lease(context, config, db, auth)
        await verify_tamper_detection(db, auth)
        report["audit"] = {**report["audit"], **await verify_chain(db, auth, expected + 2)}
        report["audit"]["tamper_detected"] = True
        report["stage"] = "registration_processes"
        report["registrations"] = await registrations(context, config, db, workflow)
        report["stage"] = "publication_processes"
        report["publications"] = await publications(context, config, db, workflow)
        await database.ensure_indexes()
        report["indexes_rechecked"] = True
        report["stage"] = "complete"
    finally:
        if owned:
            try:
                report["cleanup_completed"] = await asyncio.wait_for(cleanup_database(client, config), timeout=12)
            except BaseException as exc:
                report["cleanup_completed"] = False
                report["cleanup_error_type"] = type(exc).__name__
        client.close()


def main() -> int:
    logging.disable(logging.CRITICAL)
    sys.dont_write_bytecode = True
    report: dict[str, Any] = {"ok": False, "cleanup_completed": False}
    exit_code = 1
    try:
        if len(sys.argv) != 1:
            raise SafetyError("command_line_overrides_refused")
        config = configuration()
        report["database"] = config.database
        asyncio.run(asyncio.wait_for(coordinate(config, report), timeout=RUN_SECONDS))
        require(report["cleanup_completed"], "cleanup_not_confirmed")
        report["ok"] = True
        exit_code = 0
    except SafetyError as exc:
        report["error"] = str(exc)
        exit_code = 2
    except VerificationError as exc:
        report["error"] = str(exc)
    except KeyboardInterrupt:
        report["error"] = "interrupted"
        exit_code = 130
    except BaseException as exc:
        report["error"] = "integration_failed"
        report["error_type"] = type(exc).__name__
    print(json.dumps(report, sort_keys=True), flush=True)
    return exit_code


if __name__ == "__main__":
    multiprocessing.freeze_support()
    raise SystemExit(main())
