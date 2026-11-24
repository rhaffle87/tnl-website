"""Hardening: private-field redaction, registration uploads, seed safety."""

import sys
from datetime import date, datetime, timedelta, timezone
from uuid import uuid4

import pytest

import seed

DUMMY_WA_GROUP = "https://chat.whatsapp.com/EXAMPLE_TEST_GROUP"
PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 32

NAME_FIELD = {"type": "text", "label": "Full name", "required": True, "options": []}
EMAIL_FIELD = {"type": "email", "label": "Email", "required": True, "options": []}
PROOF_FIELD = {"type": "file", "label": "Proof", "required": True, "options": []}


def _event(slug, form_fields, whatsapp_group_url=None):
    today = date.today()
    return {
        "id": str(uuid4()), "slug": slug, "title": "Hardening <b>Test</b>", "title_id": "",
        "type": "training", "status": "published", "capacity": 0, "price": 0,
        "start_date": str(today + timedelta(days=10)), "end_date": str(today + timedelta(days=11)),
        "reg_open_date": str(today - timedelta(days=2)), "reg_close_date": str(today + timedelta(days=5)),
        "form_fields": form_fields,
        "whatsapp_group_url": whatsapp_group_url or "",
    }


def _uploads_empty(tmp_path):
    uploads = tmp_path / "uploads"
    return not uploads.exists() or not list(uploads.iterdir())


def test_event_model_has_no_spreadsheet_webhook_field():
    from models.content import Event

    assert "spreadsheet_webhook_url" not in Event.model_fields


@pytest.mark.asyncio
async def test_public_and_v1_never_expose_spreadsheet_webhook_field(async_client, mock_db):
    slug = "no-webhook-" + uuid4().hex[:6]
    await mock_db.events.insert_one(_event(slug, [NAME_FIELD]))

    listing = await async_client.get("/public/events")
    assert listing.status_code == 200
    assert all("spreadsheet_webhook_url" not in e for e in listing.json())

    single = await async_client.get(f"/public/events/{slug}")
    assert single.status_code == 200
    assert "spreadsheet_webhook_url" not in single.json()

    from routers.apiv1 import hash_key
    raw = "tnl_test_" + uuid4().hex
    await mock_db.api_keys.insert_one({
        "id": str(uuid4()), "name": "hardening-test", "scopes": ["read"], "key_hash": hash_key(raw),
        "prefix": raw[:12], "active": True, "calls": 0,
        "created_at": datetime.now(timezone.utc), "last_used_at": None,
    })
    headers = {"X-API-Key": raw}

    v1_single = await async_client.get(f"/v1/events/{slug}", headers=headers)
    assert v1_single.status_code == 200, v1_single.text
    assert "spreadsheet_webhook_url" not in v1_single.json()

    v1_listing = await async_client.get("/v1/events?limit=100", headers=headers)
    assert v1_listing.status_code == 200
    assert "spreadsheet_webhook_url" not in v1_listing.text


@pytest.mark.asyncio
async def test_registration_score_and_sheet_sync_endpoints_are_removed(async_client, admin_cookies):
    for path in ("/admin/registrations/score-all", "/admin/registrations/sync-sheet"):
        res = await async_client.post(path, json={"event_id": "missing"}, cookies=admin_cookies)
        assert res.status_code in (404, 405), res.text


@pytest.mark.asyncio
async def test_registration_rejects_upload_whose_content_does_not_match_type(
        async_client, mock_db, monkeypatch, tmp_path):
    monkeypatch.setenv("MEDIA_DIR", str(tmp_path))
    ev = _event("fake-upload-" + uuid4().hex[:6], [NAME_FIELD, PROOF_FIELD])
    await mock_db.events.insert_one(ev)

    res = await async_client.post(
        f"/registrations/{ev['id']}",
        data={"consent": "1", "f_full-name": "Fake Upload"},
        files={"f_proof": ("proof.png", b"<html>not a png</html>", "image/png")},
    )
    assert res.status_code == 422, res.text
    assert _uploads_empty(tmp_path)


@pytest.mark.asyncio
async def test_rejected_registration_removes_the_file_it_already_stored(
        async_client, mock_db, monkeypatch, tmp_path):
    monkeypatch.setenv("MEDIA_DIR", str(tmp_path))
    ev = _event("orphan-upload-" + uuid4().hex[:6], [NAME_FIELD, PROOF_FIELD])
    await mock_db.events.insert_one(ev)

    # Valid PNG, but the required name is missing, so the registration is refused after the
    # upload was written. Nothing may be left on disk.
    res = await async_client.post(
        f"/registrations/{ev['id']}",
        data={"consent": "1"},
        files={"f_proof": ("proof.png", PNG, "image/png")},
    )
    assert res.status_code == 422, res.text
    assert _uploads_empty(tmp_path)


@pytest.mark.asyncio
async def test_valid_upload_is_still_stored(async_client, mock_db, monkeypatch, tmp_path):
    monkeypatch.setenv("MEDIA_DIR", str(tmp_path))
    ev = _event("valid-upload-" + uuid4().hex[:6], [NAME_FIELD, PROOF_FIELD])
    await mock_db.events.insert_one(ev)

    res = await async_client.post(
        f"/registrations/{ev['id']}",
        data={"consent": "1", "f_full-name": "Valid Upload"},
        files={"f_proof": ("proof.png", PNG, "image/png")},
    )
    assert res.status_code == 200, res.text
    assert len(list((tmp_path / "uploads").iterdir())) == 1


async def _certified_registration(mock_db, data):
    code = "TNL-" + uuid4().hex[:10].upper()
    await mock_db.registrations.insert_one({
        "id": str(uuid4()), "event_id": "hardening-event", "event_title": "Hardening Event",
        "email": "private.person@example.org", "nim": "", "status": "attended", "data": data,
        "certificate_code": code, "created_at": datetime.now(timezone.utc),
    })
    return code


@pytest.mark.asyncio
async def test_verify_never_falls_back_to_the_participants_email(async_client, mock_db):
    code = await _certified_registration(mock_db, {"f_unrelated": "value"})
    res = await async_client.get(f"/verify/{code}")
    assert res.status_code == 200
    body = res.json()
    assert body["valid"] is True
    assert body["name"] == "Participant"
    assert "private.person@example.org" not in res.text


@pytest.mark.asyncio
async def test_verify_finds_indonesian_name_labels(async_client, mock_db):
    code = await _certified_registration(mock_db, {"f_nama-lengkap": "Budi Santoso"})
    res = await async_client.get(f"/verify/{code}")
    assert res.json()["name"] == "Budi Santoso"


@pytest.mark.asyncio
async def test_certificate_pdf_survives_non_latin_text(async_client, mock_db):
    code = "TNL-" + uuid4().hex[:10].upper()
    await mock_db.registrations.insert_one({
        "id": str(uuid4()), "event_id": "hardening-event",
        "event_title": "Open Recruitment \u2014 Asisten Laboratorium",
        "email": "pdf.person@example.org", "nim": "", "status": "attended",
        "data": {"f_full-name": "Budi \u65e5\u672c Santoso"},
        "certificate_code": code, "created_at": datetime.now(timezone.utc),
    })
    res = await async_client.get(f"/certificates/{code}/pdf")
    assert res.status_code == 200, res.text
    assert res.content.startswith(b"%PDF")


@pytest.mark.asyncio
async def test_read_only_roles_do_not_see_private_member_fields(async_client, mock_db):
    import lib.auth

    viewer = await mock_db.users.find_one({"email": "viewer@its.ac.id", "active": True})
    admin = await mock_db.users.find_one({"role": "super_admin", "active": True})
    if viewer is None:
        pytest.skip("demo viewer account is not seeded in this environment")
    as_viewer = {"tnl_session": await lib.auth.create_session(viewer["id"])}
    as_admin = {"tnl_session": await lib.auth.create_session(admin["id"])}

    ev = _event("redaction-" + uuid4().hex[:6], [NAME_FIELD])
    await mock_db.events.insert_one(ev)
    member_id = str(uuid4())
    await mock_db.members.insert_one({
        "id": member_id, "name": "Redaction Test Person", "role": "assistant", "status": "active",
        "published": True, "phone": "+6280000000000", "email_personal": "redaction.private@example.org",
        "nim": "5024200000", "order": 9999,
    })

    # Read-only role: no private member data, in detail, list and CSV export.
    single = await async_client.get(f"/admin/content/events/{ev['id']}", cookies=as_viewer)
    assert single.status_code == 200, single.text
    listing = await async_client.get("/admin/content/events?limit=200", cookies=as_viewer)
    assert listing.status_code == 200

    member = await async_client.get(f"/admin/content/members/{member_id}", cookies=as_viewer)
    assert member.status_code == 200, member.text
    for private in ("phone", "email_personal", "nim"):
        assert private not in member.json()
    export = await async_client.get("/admin/content/members/export/csv", cookies=as_viewer)
    assert export.status_code == 200
    for leaked in ("+6280000000000", "redaction.private@example.org", "5024200000"):
        assert leaked not in export.text

    # Roles that can edit still get the full member record, so the admin forms keep working.
    full_member = await async_client.get(f"/admin/content/members/{member_id}", cookies=as_admin)
    assert full_member.json()["nim"] == "5024200000"


@pytest.mark.asyncio
async def test_seed_refuses_non_local_site_without_force(monkeypatch):
    monkeypatch.setenv("PUBLIC_SITE_URL", "https://labtnl.site")
    monkeypatch.setattr(sys, "argv", ["seed.py"])
    with pytest.raises(SystemExit):
        await seed.main()


@pytest.mark.asyncio
async def test_seed_with_force_still_needs_an_explicit_admin_password(monkeypatch):
    monkeypatch.setenv("PUBLIC_SITE_URL", "https://labtnl.site")
    monkeypatch.delenv("SEED_ADMIN_PASSWORD", raising=False)
    monkeypatch.setattr(sys, "argv", ["seed.py", "--force"])
    with pytest.raises(SystemExit):
        await seed.main()


@pytest.mark.asyncio
async def test_seed_skips_demo_accounts_when_asked(mock_db, monkeypatch):
    monkeypatch.setenv("SEED_ADMIN_EMAIL", f"seed-{uuid4().hex[:6]}@its.ac.id")
    # The test database is shared for the whole session: take the demo account out, check, put it back.
    original = await mock_db.users.find_one({"email": "contributor@its.ac.id"})
    await mock_db.users.delete_many({"email": "contributor@its.ac.id"})
    try:
        await seed.seed_admin(include_demo=False)
        assert await mock_db.users.find_one({"email": "contributor@its.ac.id"}) is None
    finally:
        if original is not None:
            await mock_db.users.insert_one(original)


@pytest.mark.asyncio
async def test_public_and_v1_events_never_expose_whatsapp_group_url(async_client, mock_db):
    slug = "wa-secrecy-" + uuid4().hex[:6]
    await mock_db.events.insert_one(_event(slug, [NAME_FIELD], whatsapp_group_url=DUMMY_WA_GROUP))

    # Public list & detail
    listing = await async_client.get("/public/events")
    assert listing.status_code == 200
    assert DUMMY_WA_GROUP not in listing.text
    assert all("whatsapp_group_url" not in e for e in listing.json())

    single = await async_client.get(f"/public/events/{slug}")
    assert single.status_code == 200
    assert "whatsapp_group_url" not in single.json()
    assert DUMMY_WA_GROUP not in single.text

    # V1 list & detail
    from routers.apiv1 import hash_key
    raw = "tnl_test_" + uuid4().hex
    await mock_db.api_keys.insert_one({
        "id": str(uuid4()), "name": "hardening-test-wa", "scopes": ["read"], "key_hash": hash_key(raw),
        "prefix": raw[:12], "active": True, "calls": 0,
        "created_at": datetime.now(timezone.utc), "last_used_at": None,
    })
    v1_single = await async_client.get(f"/v1/events/{slug}", headers={"X-API-Key": raw})
    assert v1_single.status_code == 200
    assert "whatsapp_group_url" not in v1_single.json()
    assert DUMMY_WA_GROUP not in v1_single.text


@pytest.mark.asyncio
async def test_registration_lifecycle_whatsapp_group_invite(async_client, mock_db):
    slug = "wa-reg-lifecycle-" + uuid4().hex[:6]
    ev = _event(slug, [NAME_FIELD, EMAIL_FIELD], whatsapp_group_url=DUMMY_WA_GROUP)
    await mock_db.events.insert_one(ev)

    # 1. Rejected registration (missing consent and name) does NOT leak WA url
    rejected = await async_client.post(
        f"/registrations/{ev['id']}",
        data={"f_full-name": ""},
    )
    assert rejected.status_code in (400, 422)
    assert DUMMY_WA_GROUP not in rejected.text

    # 2. Valid registration returns the whatsapp_group_url
    success = await async_client.post(
        f"/registrations/{ev['id']}",
        data={"consent": "1", "f_full-name": "Budi Participant", "f_email": "budi.part@example.com"},
    )
    assert success.status_code == 200, success.text
    body = success.json()
    assert body["ok"] is True
    assert body.get("whatsapp_group_url") == DUMMY_WA_GROUP

    # 3. Duplicate registration is rejected and does NOT leak WA url
    dup = await async_client.post(
        f"/registrations/{ev['id']}",
        data={"consent": "1", "f_full-name": "Budi Participant", "f_email": "budi.part@example.com"},
    )
    assert dup.status_code == 409
    assert DUMMY_WA_GROUP not in dup.text


@pytest.mark.asyncio
async def test_registration_quota_cutoff_and_wa_protection(async_client, mock_db):
    slug = "quota-cutoff-" + uuid4().hex[:6]
    ev = _event(slug, [NAME_FIELD, EMAIL_FIELD], whatsapp_group_url=DUMMY_WA_GROUP)
    ev["capacity"] = 2
    await mock_db.events.insert_one(ev)

    # Participant 1 -> 200, accepted, returns WA URL
    p1 = await async_client.post(
        f"/registrations/{ev['id']}",
        data={"consent": "1", "f_full-name": "Peserta Satu", "f_email": "satu@example.com"},
    )
    assert p1.status_code == 200
    assert p1.json().get("status") == "accepted"
    assert p1.json().get("whatsapp_group_url") == DUMMY_WA_GROUP

    # Participant 2 -> 200, accepted, returns WA URL (capacity reached 2/2)
    p2 = await async_client.post(
        f"/registrations/{ev['id']}",
        data={"consent": "1", "f_full-name": "Peserta Dua", "f_email": "dua@example.com"},
    )
    assert p2.status_code == 200
    assert p2.json().get("status") == "accepted"

    # Participant 3 (Quota Full) -> 409, detail indicates full, WA URL NEVER leaked!
    p3 = await async_client.post(
        f"/registrations/{ev['id']}",
        data={"consent": "1", "f_full-name": "Peserta Tiga", "f_email": "tiga@example.com"},
    )
    assert p3.status_code == 409
    assert "kuota" in p3.json().get("detail", "").lower()
    assert DUMMY_WA_GROUP not in p3.text
    assert "whatsapp_group_url" not in p3.json()


