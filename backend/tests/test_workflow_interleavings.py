"""Deterministic ordinary interleavings from the independent workflow review."""

import asyncio
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from lib import mailer, privacy, registration_workflow as workflow
from routers import public


def test_mail_encryption_uses_stable_persisted_secret_without_env(monkeypatch):
    for key in ("MAILER_ENCRYPTION_KEY", "SESSION_SECRET", "UPLOAD_SIGNING_SECRET", "JWT_SECRET"):
        monkeypatch.delenv(key, raising=False)
    monkeypatch.setattr("lib.auth._upload_signing_secret", lambda: b"stable-test-only-secret")
    token = mailer._cipher().encrypt(b"original-message")
    assert mailer._cipher().decrypt(token) == b"original-message"


@pytest.mark.asyncio
async def test_delivery_and_reconciliation_preserve_archived_message(mock_db, monkeypatch):
    monkeypatch.setenv("SMTP_HOST", "smtp.example.test")
    monkeypatch.setattr(mailer, "_smtp_send", lambda *args, **kwargs: None)
    identifier = uuid4().hex
    notification = await mailer.send_email("person@example.org", "Reply", "<p>A reply</p>", message_id=identifier)
    await mock_db.messages.insert_one({"id": identifier, "status": "archived", "reply_notification_id": notification["id"]})
    assert (await mailer.deliver_pending(notification_id=notification["id"]))["delivered"] == 1
    assert (await mock_db.messages.find_one({"id": identifier}))["status"] == "archived"
    await mailer.reconcile_reply_delivery()
    stored = await mock_db.messages.find_one({"id": identifier})
    assert stored["status"] == "archived" and stored["reply_delivery"] == "delivered"


@pytest.mark.asyncio
async def test_cancelled_notification_can_be_requeued_once(mock_db):
    identifier = uuid4().hex
    await mock_db.outbox.insert_one({"id": identifier, "status": "cancelled"})
    queued = await mailer.send_email("person@example.org", "Accepted", "<p>Accepted again</p>", notification_id=identifier, replace_cancelled=True)
    assert queued["status"] == "queued"
    first = await mock_db.outbox.find_one({"id": identifier})
    await mailer.send_email("person@example.org", "Accepted", "<p>Duplicate attempt</p>", notification_id=identifier, replace_cancelled=True)
    assert await mock_db.outbox.count_documents({"id": identifier}) == 1
    assert (await mock_db.outbox.find_one({"id": identifier}))["payload"] == first["payload"]


@pytest.mark.asyncio
async def test_full_delete_upgrade_wins_over_inflight_anonymization(mock_db, monkeypatch):
    event_id, reg_id = uuid4().hex, uuid4().hex
    await mock_db.events.insert_one({"id": event_id, "capacity": 1})
    await mock_db.registrations.insert_one({"id": reg_id, "event_id": event_id, "status": "accepted", "data": {}, "email": "person@example.org"})
    await workflow.event_ledger(event_id)
    anon_ready, delete_ready = asyncio.Event(), asyncio.Event()
    release_anon, release_delete = asyncio.Event(), asyncio.Event()
    collection = mock_db.registrations
    original_update, original_delete = collection.update_one, collection.delete_one

    class BoundDatabase:
        def __getattr__(self, name):
            return collection if name == "registrations" else getattr(mock_db, name)

    monkeypatch.setattr(privacy.database, "db", BoundDatabase())

    async def held_update(query, update, *args, **kwargs):
        if update.get("$set", {}).get("anonymized"):
            anon_ready.set()
            await asyncio.wait_for(release_anon.wait(), 5)
        return await original_update(query, update, *args, **kwargs)

    async def held_delete(query, *args, **kwargs):
        if query.get("id") == reg_id:
            delete_ready.set()
            await asyncio.wait_for(release_delete.wait(), 5)
        return await original_delete(query, *args, **kwargs)

    monkeypatch.setattr(collection, "update_one", held_update)
    monkeypatch.setattr(collection, "delete_one", held_delete)
    anonymize = asyncio.create_task(privacy.request_erasure(reg_id))
    deletion = None
    try:
        try:
            await asyncio.wait_for(anon_ready.wait(), 5)
        except TimeoutError:
            job = await mock_db.privacy_jobs.find_one({"_id": reg_id})
            pytest.fail(f"Anonymization did not reach row update: status={job.get('status')}, error={job.get('error_code')}")
        deletion = asyncio.create_task(privacy.request_erasure(reg_id, delete=True))
        await asyncio.wait_for(delete_ready.wait(), 5)
        release_anon.set()
        await anonymize
        release_delete.set()
        assert (await deletion)["privacy_status"] == "completed"
    finally:
        release_anon.set()
        release_delete.set()
        await asyncio.gather(anonymize, *([deletion] if deletion else []), return_exceptions=True)
    assert await mock_db.registrations.find_one({"id": reg_id}) is None
    assert (await mock_db.privacy_jobs.find_one({"_id": reg_id}))["status"] == "completed"


@pytest.mark.asyncio
@pytest.mark.parametrize("delete", [False, True])
async def test_erasure_before_admission_cannot_create_occupied_ghost(async_client, mock_db, monkeypatch, delete):
    event_id = uuid4().hex
    await mock_db.events.insert_one({"id": event_id, "slug": event_id, "title": "Admission interleaving", "status": "published",
        "start_date": "2099-01-01", "reg_open_date": "2020-01-01", "reg_close_date": "2098-01-01", "capacity": 1,
        "form_fields": [{"type": "email", "label": "Email", "required": True}]})
    monkeypatch.setattr(public, "rate_limit_async", AsyncMock())
    monkeypatch.delenv("TURNSTILE_SECRET_KEY", raising=False)
    ready, release = asyncio.Event(), asyncio.Event()
    original = public.change_registration
    staged = {}

    async def held_admission(event, registration, **kwargs):
        if kwargs.get("add"):
            staged["id"] = registration
            ready.set()
            await asyncio.wait_for(release.wait(), 5)
        return await original(event, registration, **kwargs)

    monkeypatch.setattr(public, "change_registration", held_admission)
    submission = asyncio.create_task(async_client.post(f"/registrations/{event_id}", data={"consent": "1", "f_email": uuid4().hex + "@example.org"}))
    try:
        await asyncio.wait_for(ready.wait(), 5)
        assert (await privacy.request_erasure(staged["id"], delete=delete))["privacy_status"] == "completed"
    finally:
        release.set()
    response = await submission
    assert response.status_code == 409
    await workflow.reconcile_registrations()
    ledger = await workflow.event_ledger(event_id)
    assert not any(entry["id"] == staged["id"] and entry["status"] in workflow.OCCUPIED for entry in ledger["entries"])
    row = await mock_db.registrations.find_one({"id": staged["id"]})
    assert row is None if delete else row["anonymized"] and not row["uploads_ready"]
