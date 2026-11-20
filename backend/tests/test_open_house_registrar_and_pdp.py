"""Tests for Open House registration pipeline, Google Sheets sync, Excel/CSV exports, and UU PDP compliance."""

from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest


@pytest.mark.asyncio
async def test_registration_validation_rules(async_client, mock_db):
    event = await mock_db.events.find_one({"slug": "cisco-packet-tracer-training"})
    if not event:
        event = await mock_db.events.find_one()
    ev_id = event["id"]

    base_form = {
        "consent": "1",
        "company_website": "",  # Honeypot empty
        "f_full-name": "Calon Peserta Pelatihan",
        "f_email": "peserta.baru.2026@its.ac.id",
        "f_whatsapp": "+6281234567890",
        "f_nrp-nim": "5024211099",
        "f_department": "Electrical Engineering",
        "f_experience-level": "Some coursework",
        "f_what-do-you-hope-to-learn": "Routing & switching configuration hands-on.",
    }

    # 1. Successful Registration
    res = await async_client.post(f"/registrations/{ev_id}", data=base_form)
    assert res.status_code == 200, res.text
    data = res.json()
    assert data.get("ok") is True
    assert data.get("status") in ("pending", "waitlisted")

    # 2. Duplicate registration rejection (same email + same event)
    dup_email_form = dict(base_form)
    dup_email_form["f_nrp-nim"] = "5024211098"  # different NIM, same email
    dup_res = await async_client.post(f"/registrations/{ev_id}", data=dup_email_form)
    assert dup_res.status_code == 409
    assert "already registered" in dup_res.json().get("detail", "").lower()

    # 3. Duplicate NIM rejection
    dup_nim_form = dict(base_form)
    dup_nim_form["f_email"] = "different.email.unique@its.ac.id"
    dup_nim_res = await async_client.post(f"/registrations/{ev_id}", data=dup_nim_form)
    assert dup_nim_res.status_code == 409

    # 4. Consent PDP required
    no_consent_form = dict(base_form)
    no_consent_form["f_email"] = "noconsent@its.ac.id"
    no_consent_form["f_nrp-nim"] = "5024211999"
    no_consent_form["consent"] = "0"
    no_consent_res = await async_client.post(f"/registrations/{ev_id}", data=no_consent_form)
    assert no_consent_res.status_code == 422

    # 5. Honeypot blocks bots
    bot_form = dict(base_form)
    bot_form["f_email"] = "bot@spambot.com"
    bot_form["f_nrp-nim"] = "5024211888"
    bot_form["company_website"] = "http://spam-link.ru"
    bot_res = await async_client.post(f"/registrations/{ev_id}", data=bot_form)
    assert bot_res.status_code == 400


@pytest.mark.asyncio
async def test_registration_export_csv_and_excel(async_client, admin_cookies):
    # CSV export
    csv_res = await async_client.get("/admin/registrations/export", cookies=admin_cookies)
    assert csv_res.status_code == 200
    assert "text/csv" in csv_res.headers.get("content-type", "")
    assert "registered_at" in csv_res.text

    # Excel export
    excel_res = await async_client.get("/admin/registrations/export-excel", cookies=admin_cookies)
    assert excel_res.status_code == 200
    assert "openxmlformats" in excel_res.headers.get("content-type", "")
    assert len(excel_res.content) > 1000  # valid binary .xlsx file


@pytest.mark.asyncio
async def test_uu_pdp_anonymization_and_retention_sweep(async_client, mock_db, admin_cookies):
    # Create test registration with personal details
    test_id = str(uuid4())
    await mock_db.registrations.insert_one({
        "id": test_id,
        "event_id": "test-event-id",
        "event_title": "Open House 2026",
        "email": "pdp.target@its.ac.id",
        "nim": "5024201044",
        "status": "attended",
        "data": {
            "f_full-name": "Nama Peserta Asli",
            "f_phone": "08123456789",
        },
        "created_at": datetime.now(timezone.utc) - timedelta(days=120),  # 120 days old
        "anonymized": False,
    })

    # Test single registrant anonymization
    anon_res = await async_client.post(f"/admin/registrations/{test_id}/anonymize", cookies=admin_cookies)
    assert anon_res.status_code == 200
    assert anon_res.json().get("ok") is True

    record = await mock_db.registrations.find_one({"id": test_id})
    assert record["anonymized"] is True
    assert record["email"] == ""
    assert record["nim"] == ""
    assert record["data"].get("f_full-name") == "[anonymized]"
    # Status and event attendance remain intact for metrics
    assert record["status"] == "attended"

    # Test automated retention sweep
    stale_id = str(uuid4())
    await mock_db.registrations.insert_one({
        "id": stale_id,
        "event_id": "test-event-id",
        "event_title": "Old Event",
        "email": "stale.attendee@its.ac.id",
        "nim": "5024201011",
        "status": "attended",
        "data": {"f_full-name": "Stale Attendee"},
        "created_at": datetime.now(timezone.utc) - timedelta(days=100),
        "anonymized": False,
    })

    sweep_res = await async_client.post("/admin/registrations/retention-sweep", cookies=admin_cookies)
    assert sweep_res.status_code == 200
    assert sweep_res.json().get("ok") is True

    stale_record = await mock_db.registrations.find_one({"id": stale_id})
    assert stale_record["anonymized"] is True
    assert stale_record["email"] == ""
