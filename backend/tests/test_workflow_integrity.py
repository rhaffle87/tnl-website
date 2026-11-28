"""Regression cases for distributed registration, erasure and mail failure."""

import asyncio
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from fastapi import HTTPException
from mongomock_motor import AsyncMongoMockClient

from lib import mailer, privacy, registration_workflow as workflow
from lib.registration_integrity import migrate_registration_keys
from routers import public, registrar


@pytest.fixture(autouse=True)
def no_external_delivery(monkeypatch):
    monkeypatch.setenv("WORKFLOW_WORKER_ENABLED", "0")
    monkeypatch.delenv("TURNSTILE_SECRET_KEY", raising=False)
    monkeypatch.delenv("SMTP_HOST", raising=False)


async def event(mock_db, capacity=1, fields=None):
    row = {"id": uuid4().hex, "slug": uuid4().hex, "title": "Workflow regression",
           "status": "published", "capacity": capacity, "start_date": "2099-01-01",
           "reg_open_date": "2020-01-01", "reg_close_date": "2098-01-01",
           "form_fields": fields or [{"type": "email", "label": "Email", "required": True}],
           "whatsapp_group_url": "https://chat.whatsapp.com/example-test-group"}
    await mock_db.events.insert_one(row)
    return row


async def row(mock_db, event_id, status="processing", **extras):
    reg = {"id": uuid4().hex, "event_id": event_id, "status": status,
           "created_at": datetime.now(timezone.utc), "email": uuid4().hex + "@example.org", **extras}
    await mock_db.registrations.insert_one(reg)
    return reg


async def test_last_seat_cas_and_stale_projection_cannot_demote_both(mock_db, monkeypatch):
    ev = await event(mock_db)
    await workflow.event_ledger(ev["id"])
    regs = [await row(mock_db, ev["id"]) for _ in range(12)]
    original = workflow.event_ledger

    async def interleave(event_id):
        snapshot = await original(event_id)
        await asyncio.sleep(.001)
        return snapshot

    monkeypatch.setattr(workflow, "event_ledger", interleave)
    await asyncio.gather(*(workflow.change_registration(ev["id"], r["id"], add=True) for r in regs))
    ledger = await original(ev["id"])
    assert sum(e["status"] == "accepted" for e in ledger["entries"]) == 1
    assert sum(e["status"] == "waitlisted" for e in ledger["entries"]) == 11
    accepted = next(e for e in ledger["entries"] if e["status"] == "accepted")
    await workflow.change_registration(ev["id"], accepted["id"], status="rejected")
    await workflow.sync_ledger(ledger)  # simulate a paused, stale process resuming
    rows = await mock_db.registrations.find({"event_id": ev["id"]}).to_list(None)
    assert sum(r["status"] == "accepted" for r in rows) == 1
    assert next(r for r in rows if r["id"] == accepted["id"])["status"] == "rejected"


async def test_simultaneous_normalized_duplicate_email_and_nim(async_client, mock_db, monkeypatch):
    monkeypatch.setattr(public, "rate_limit_async", AsyncMock())
    ev = await event(mock_db, capacity=0, fields=[{"type": "email", "label": "Email"},
                                                {"type": "nim", "label": "NIM"}])
    results = await asyncio.gather(*(
        async_client.post(f"/registrations/{ev['id']}", data={"consent": "1", "f_email": email, "f_nim": nim})
        for email, nim in [(" SAME@Example.org ", "5024-211-099"), ("same@example.org", "5024211098")]))
    assert sorted(r.status_code for r in results) == [200, 409]
    results = await asyncio.gather(*(
        async_client.post(f"/registrations/{ev['id']}", data={"consent": "1", "f_email": email, "f_nim": nim})
        for email, nim in [("first@example.org", "5024-211-088"), ("second@example.org", "5024211088")]))
    assert sorted(r.status_code for r in results) == [200, 409]


async def test_empty_identity_keys_are_not_unique_and_other_forms_are_independent(async_client, mock_db, monkeypatch):
    monkeypatch.setattr(public, "rate_limit_async", AsyncMock())
    ev = await event(mock_db, capacity=0, fields=[{"type": "text", "label": "Name"}])
    results = await asyncio.gather(*(async_client.post(f"/registrations/{ev['id']}",
        data={"consent": "1", "f_name": "Participant"}) for _ in range(3)))
    assert all(r.status_code == 200 for r in results)
    other = await event(mock_db, capacity=0)
    assert (await async_client.post(f"/registrations/{other['id']}",
            data={"consent": "1", "f_email": "same@example.org"})).status_code == 200


async def test_full_event_waitlists_and_delete_promotes(async_client, mock_db, admin_cookies):
    ev = await event(mock_db)
    responses = [await async_client.post(f"/registrations/{ev['id']}", data={
        "consent": "1", "f_email": f"seat-{i}@example.org"}) for i in range(3)]
    assert [r.json()["status"] for r in responses] == ["accepted", "waitlisted", "waitlisted"]
    assert "whatsapp_group_url" not in responses[1].json()
    deleted = await async_client.delete(f"/admin/registrations/{responses[0].json()['id']}", cookies=admin_cookies)
    assert deleted.json()["privacy_status"] == "completed"
    promoted = await mock_db.registrations.find_one({"id": responses[1].json()["id"]})
    assert promoted["status"] == "accepted"
    assert (await mock_db.registrations.find_one({"id": responses[2].json()["id"]}))["status"] == "waitlisted"


async def test_manual_status_cannot_overbook_and_checkin_requires_eligibility(async_client, mock_db, admin_cookies):
    ev = await event(mock_db)
    accepted = await row(mock_db, ev["id"], "accepted")
    rejected = await row(mock_db, ev["id"], "rejected")
    response = await async_client.patch(f"/admin/registrations/{rejected['id']}",
                                       json={"status": "accepted"}, cookies=admin_cookies)
    assert response.status_code == 409
    for payload in ({"code": rejected["id"]}, {"code": rejected["id"], "override": True, "override_reason": "short"}):
        assert (await async_client.post("/admin/registrations/checkin", json=payload, cookies=admin_cookies)).status_code == 409
    # Override records intent but never overrides capacity safety.
    assert (await async_client.post("/admin/registrations/checkin", json={"code": rejected["id"],
        "override": True, "override_reason": "Approved by the event organizer"}, cookies=admin_cookies)).status_code == 409
    await workflow.change_registration(ev["id"], accepted["id"], status="rejected")
    result = await async_client.post("/admin/registrations/checkin", json={"code": rejected["id"],
        "override": True, "override_reason": "Approved by the event organizer"}, cookies=admin_cookies)
    assert result.status_code == 200
    assert await mock_db.audit_log.find_one({"target_id": rejected["id"], "action": "checkin-override"})


@pytest.mark.parametrize("data", [
    {"f_track": "Invented", "f_agree": "true"},
    {"f_track": "Student", "f_agree": "false"},
    {"f_track": "Student", "f_agree": "on", "f_nim": "   "},
    {"f_track": "Staff", "f_agree": "on", "f_name": "x" * 2001},
])
async def test_form_options_checkbox_whitespace_and_bounds(async_client, mock_db, data):
    fields = [{"type": "nim", "label": "NIM", "required": True,
               "show_if_field": "Track", "show_if_value": "Student"},
              {"type": "select", "label": "Track", "required": True, "options": ["Student", "Staff"]},
              {"type": "checkbox", "label": "Agree", "required": True}, {"type": "text", "label": "Name"}]
    ev = await event(mock_db, fields=fields)
    response = await async_client.post(f"/registrations/{ev['id']}", data={"consent": "1", **data})
    assert response.status_code == 422
    assert await mock_db.registrations.count_documents({"event_id": ev["id"]}) == 0


async def test_condition_is_independent_of_schema_order_and_ignores_hidden_data(async_client, mock_db):
    ev = await event(mock_db, fields=[{"type": "nim", "label": "NIM", "required": True,
        "show_if_field": "Track", "show_if_value": "Student"},
        {"type": "select", "label": "Track", "options": ["Student", "Staff"]}])
    response = await async_client.post(f"/registrations/{ev['id']}",
        data={"consent": "1", "f_track": "Staff", "f_nim": "private hidden value"})
    assert response.status_code == 200
    stored = await mock_db.registrations.find_one({"id": response.json()["id"]})
    assert "f_nim" not in stored["data"]
    blank_contact = await async_client.post("/contact", json={"name": "  ", "email": "a@example.org",
        "subject": " ", "message": " "})
    assert blank_contact.status_code == 422


async def test_duplicate_preflight_never_deletes_and_startup_index_failure_is_visible(monkeypatch):
    from lib import db as db_module
    isolated = AsyncMongoMockClient()["workflow_preflight"]
    await isolated.registrations.insert_many([
        {"id": "one", "event_id": "event", "email": " Same@example.org "},
        {"id": "two", "event_id": "event", "email": "same@EXAMPLE.org"},
    ])
    before = await isolated.registrations.find({}).to_list(None)
    result = await migrate_registration_keys(isolated, apply=True)
    assert result["conflicts"]
    assert await isolated.registrations.find({}).to_list(None) == before
    monkeypatch.setattr(db_module, "db", isolated)
    with pytest.raises(RuntimeError, match="duplicate preflight"):
        await db_module.ensure_indexes()
    await isolated.registrations.delete_many({})
    # Motor resolves a fresh collection proxy on attribute lookup.
    monkeypatch.setattr(type(isolated.registrations), "create_index", AsyncMock(side_effect=RuntimeError("unavailable")))
    with pytest.raises(RuntimeError, match="Required safety index"):
        await db_module.ensure_indexes()


async def test_privacy_failure_keeps_durable_refs_blocks_serving_and_retries(mock_db, monkeypatch, tmp_path,
                                                                           async_client, admin_cookies):
    monkeypatch.setenv("MEDIA_DIR", str(tmp_path))
    folder = tmp_path / "uploads"
    folder.mkdir()
    attachment = folder / (uuid4().hex + ".pdf")
    attachment.write_bytes(b"%PDF-private")
    key = "uploads/" + attachment.name
    reg = await row(mock_db, uuid4().hex, "attended", notes="Private interview note", data={
        "f_proof": {"url": "/api/media-files/" + key + "?sig=old"}})
    await mailer.send_email(reg["email"], "Private mail", "private body", registration_id=reg["id"])

    def fail(_):
        raise PermissionError("private filename is deliberately not logged")

    result = await privacy.request_erasure(reg["id"], delete_file=fail)
    assert result["privacy_status"] == "pending"
    assert attachment.exists()
    assert key in (await mock_db.privacy_jobs.find_one({"_id": reg["id"]}))["keys"]
    response = await async_client.get("/admin/privacy-jobs", cookies=admin_cookies)
    assert response.status_code == 200 and response.json()["pending"] >= 1
    assert key not in response.text and "keys" not in response.text
    assert not await privacy.upload_is_servable(key)
    assert (await mock_db.registrations.find_one({"id": reg["id"]}))["data"]["f_proof"]
    response = await async_client.post(f"/admin/privacy-jobs/{reg['id']}/retry", cookies=admin_cookies)
    assert response.json()["privacy_status"] == "completed"
    assert not attachment.exists()
    stored = await mock_db.registrations.find_one({"id": reg["id"]})
    assert stored["anonymized"] and stored["notes"] == "" and stored["email_normalized"] == ""
    job = await mock_db.outbox.find_one({"registration_id": reg["id"]})
    assert job["status"] == "erased" and "payload" not in job and job["to"] == ""
    assert not await privacy.upload_is_servable(key)


async def test_mail_failure_backoff_operator_retry_and_encrypted_payload(mock_db, monkeypatch):
    sent = []
    monkeypatch.setenv("SMTP_HOST", "smtp.invalid")
    link = "https://example.org/admin/invite/" + uuid4().hex
    result = await mailer.send_email("safe@example.org", uuid4().hex, f'<a href="{link}">Invite</a>')
    assert result["status"] == "queued" and "payload" not in result
    stored = await mock_db.outbox.find_one({"id": result["id"]})
    assert link not in stored["html"] and link not in stored["payload"]

    def fail(*args):
        raise OSError("do not expose SMTP credentials or recipient")

    monkeypatch.setattr(mailer, "_smtp_send", fail)
    await mailer.deliver_pending(100)
    stored = await mock_db.outbox.find_one({"id": result["id"]})
    assert stored["status"] == "failed" and stored["attempts"] == 1
    assert "error" not in stored and stored["error_code"] == "OSError"
    assert stored["next_attempt_at"] > stored["created_at"]
    await mailer.retry_email(result["id"])
    monkeypatch.setattr(mailer, "_smtp_send", lambda *args: sent.append(args[7]))
    await mailer.deliver_pending(100)
    assert f'<a href="{link}">Invite</a>' in sent
    assert (await mock_db.outbox.find_one({"id": result["id"]}))["status"] == "delivered"


async def test_reply_stays_unreplied_until_actual_delivery(async_client, mock_db, admin_cookies, monkeypatch):
    message_id = uuid4().hex
    await mock_db.messages.insert_one({"id": message_id, "email": "reply@example.org", "subject": "Question",
        "body": "Question body", "status": "new", "created_at": datetime.now(timezone.utc)})
    response = await async_client.patch(f"/admin/messages/{message_id}", json={"reply_body": "An actual response"}, cookies=admin_cookies)
    assert response.json()["status"] == "new" and response.json()["reply_delivery"] == "queued"
    await mailer.deliver_pending(100)
    assert (await mock_db.messages.find_one({"id": message_id}))["status"] == "new"
    assert (await mock_db.messages.find_one({"id": message_id}))["reply_delivery"] == "failed"
    notification = response.json()["reply_notification_id"]
    await mailer.retry_email(notification)
    monkeypatch.setenv("SMTP_HOST", "smtp.invalid")
    monkeypatch.setattr(mailer, "_smtp_send", lambda *args: None)
    await mailer.deliver_pending(100)
    assert (await mock_db.messages.find_one({"id": message_id}))["status"] == "replied"
    outbox = await async_client.get("/admin/outbox", cookies=admin_cookies)
    assert "payload" not in outbox.text


async def test_retention_clears_notes_and_notification_payloads(mock_db):
    old = datetime.now(timezone.utc) - timedelta(days=400)
    reg = await row(mock_db, uuid4().hex, "attended", notes="sensitive", created_at=old)
    job = await mailer.send_email(reg["email"], "Retention", "secret", registration_id=reg["id"])
    await mock_db.outbox.update_one({"id": job["id"]}, {"$set": {"created_at": old}})
    await privacy.run_retention_sweep()
    assert (await mock_db.registrations.find_one({"id": reg["id"]}))["notes"] == ""
    assert "payload" not in await mock_db.outbox.find_one({"id": job["id"]})


async def test_two_mail_workers_claim_once_and_repair_reply_projection(mock_db, monkeypatch):
    sent = []
    monkeypatch.setenv("SMTP_HOST", "smtp.invalid")
    monkeypatch.setattr(mailer, "_smtp_send", lambda *args: sent.append(args[6]))
    message_id = uuid4().hex
    await mock_db.messages.insert_one({"id": message_id, "status": "new"})
    job = await mailer.send_email("claim@example.org", uuid4().hex, "a reply", message_id=message_id)
    await asyncio.gather(*(mailer.deliver_pending(1, notification_id=job["id"]) for _ in range(8)))
    assert sent == [job["subject"]]
    # Crash/race: the message pointer is stored after delivery already completed.
    await mock_db.messages.update_one({"id": message_id}, {"$set": {"reply_notification_id": job["id"]}})
    await mailer.reconcile_reply_delivery()
    assert (await mock_db.messages.find_one({"id": message_id}))["status"] == "replied"


async def test_speculative_capacity_increase_does_not_overbook_old_published_cap(mock_db):
    ev = await event(mock_db)
    await workflow.event_ledger(ev["id"])
    first = await row(mock_db, ev["id"])
    await workflow.change_registration(ev["id"], first["id"], add=True)
    assert await workflow.set_event_capacity(ev["id"], 2) == 1
    second = await row(mock_db, ev["id"])
    ledger = await workflow.change_registration(ev["id"], second["id"], add=True)
    assert sum(e["status"] == "accepted" for e in ledger["entries"]) == 1
    await mock_db.events.update_one({"id": ev["id"]}, {"$set": {"capacity": 2}})
    await workflow.reconcile_registrations()
    assert (await mock_db.registrations.find_one({"id": second["id"]}))["status"] == "accepted"


async def test_confirmation_is_cancelled_if_registration_changed(mock_db, monkeypatch):
    sent = []
    monkeypatch.setenv("SMTP_HOST", "smtp.invalid")
    monkeypatch.setattr(mailer, "_smtp_send", lambda *args: sent.append(args))
    reg = await row(mock_db, uuid4().hex, "rejected")
    job = await mailer.send_email(reg["email"], "Acceptance", "You are accepted", registration_id=reg["id"], expected_status="accepted")
    await mailer.deliver_pending(1, notification_id=job["id"])
    assert not sent
    assert (await mock_db.outbox.find_one({"id": job["id"]}))["status"] == "cancelled"


async def test_explicit_withdrawal_is_idempotent_and_promotes_once(mock_db, async_client, admin_cookies):
    ev = await event(mock_db)
    first = await row(mock_db, ev["id"], "accepted")
    waiting = await row(mock_db, ev["id"], "waitlisted")
    last = await row(mock_db, ev["id"], "waitlisted")
    for _ in range(2):
        response = await async_client.post(f"/admin/registrations/{first['id']}/withdraw", cookies=admin_cookies)
        assert response.status_code == 200 and response.json()["status"] == "rejected"
    assert (await mock_db.registrations.find_one({"id": waiting["id"]}))["status"] == "accepted"
    assert (await mock_db.registrations.find_one({"id": last["id"]}))["status"] == "waitlisted"


async def test_expired_certificate_is_private_even_before_retention_worker_runs(mock_db, async_client):
    code = uuid4().hex.upper()
    reg = await row(mock_db, uuid4().hex, "attended", certificate_code=code,
                    certificate_issued_at=datetime.now(timezone.utc),
                    created_at=datetime.now(timezone.utc) - timedelta(days=400),
                    data={"f_full-name": "A retained private name"})
    assert (await async_client.get(f"/verify/{code}")).json()["valid"] is False
    assert (await async_client.get(f"/certificates/{code}/pdf")).status_code == 404
    assert not (await mock_db.registrations.find_one({"id": reg["id"]})).get("anonymized")
