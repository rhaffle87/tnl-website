"""Regressions for the backend security/API audit (RBAC, secrets, PII, file types, certificates)."""

import io
import time
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest

import lib.auth
import lib.mailer
import routers.auth as auth_router
import routers.figma as figma_router
from lib.auth import hash_password, principal
from lib.storage import safe_name


async def _user_cookie(mock_db, role: str, divisions=None, **extra):
    uid = f"u-{uuid4().hex[:10]}"
    doc = {
        "id": uid, "name": "Security Test User", "email": f"{uid}@example.org",
        "role": role, "divisions": divisions or [], "active": True,
        "password_hash": hash_password("LongEnough123"), "totp_secret": None,
        "totp_enabled": False, "created_at": datetime.now(timezone.utc),
    }
    doc.update(extra)
    await mock_db.users.insert_one(doc)
    token = await lib.auth.create_session(uid)
    return {"tnl_session": token}, doc


# ---------------------------------------------------------------- 1. Figma RBAC
@pytest.mark.asyncio
@pytest.mark.parametrize("role", ["viewer", "contributor"])
async def test_figma_write_routes_deny_read_only_roles(async_client, mock_db, role):
    cookies, _ = await _user_cookie(mock_db, role)
    assert (await async_client.post("/admin/figma/import-tokens", json={}, cookies=cookies)).status_code == 403
    assert (await async_client.post("/admin/figma/sync-frame", json={"title": "X"}, cookies=cookies)).status_code == 403


@pytest.mark.asyncio
async def test_figma_write_routes_allow_privileged_session_and_plugin_token(async_client, mock_db):
    editor, _ = await _user_cookie(mock_db, "editor")
    settings, _ = await _user_cookie(mock_db, "editor")
    token = "tnl_figma_test_token_" + uuid4().hex
    await mock_db.settings.update_one(
        {"id": "settings"}, {"$set": {"figma_sync_token_hash": figma_router.hash_token(token)}}, upsert=True)
    for cookies in (editor, settings):
        res = await async_client.post("/admin/figma/import-tokens", json={}, cookies=cookies)
        assert res.status_code == 200, res.text
    res = await async_client.post("/admin/figma/sync-frame", json={"title": "Figma frame"}, cookies=editor)
    assert res.status_code == 200, res.text
    hdr = {"X-Figma-Token": token}
    assert (await async_client.post("/admin/figma/import-tokens", json={}, headers=hdr)).status_code == 200
    assert (await async_client.post("/admin/figma/sync-frame", json={"title": "Plugin frame"}, headers=hdr)).status_code == 200


# ---------------------------------------------------------------- 2. TOTP
@pytest.mark.asyncio
async def test_totp_setup_is_self_service_pending_and_confirmed(async_client, mock_db, admin_cookies, admin_user):
    other_cookies, other = await _user_cookie(mock_db, "editor")
    assert (await async_client.get(f"/admin/users/{other['id']}/totp-setup", cookies=admin_cookies)).status_code == 405
    denied = await async_client.post(f"/admin/users/{other['id']}/totp-setup", cookies=admin_cookies)
    assert denied.status_code == 403

    first = await async_client.post(f"/admin/users/{admin_user['id']}/totp-setup", cookies=admin_cookies)
    assert first.status_code == 200, first.text
    secret = first.json()["secret"]
    stored = await mock_db.users.find_one({"id": admin_user["id"]})
    assert stored.get("totp_secret") in (None, "")
    assert stored.get("totp_pending_secret") == secret

    second = await async_client.post(f"/admin/users/{admin_user['id']}/totp-setup", cookies=admin_cookies)
    assert second.status_code == 200
    assert second.json()["secret"] != secret  # never reads/reuses the existing secret

    bad = lib.auth.verify_totp(second.json()["secret"], "000000")
    if bad:  # astronomically unlikely, keep the test deterministic
        second.json()["secret"] = lib.auth.new_totp_secret()
    code = lib.auth._totp(second.json()["secret"], int(time.time()) // 30)
    confirm = await async_client.post(
        f"/admin/users/{admin_user['id']}/totp-confirm", json={"code": code}, cookies=admin_cookies)
    assert confirm.status_code == 200, confirm.text
    promoted = await mock_db.users.find_one({"id": admin_user["id"]})
    assert promoted["totp_secret"] == second.json()["secret"]
    assert promoted["totp_enabled"] is True
    assert promoted.get("totp_pending_secret") is None

    # Clean up: the shared admin account is used by many tests.
    await mock_db.users.update_one({"id": admin_user["id"]}, {"$set": {
        "totp_secret": None, "totp_enabled": False, "totp_pending_secret": None}})


@pytest.mark.asyncio
async def test_totp_patch_cannot_enable_without_secret_or_inject_one(async_client, mock_db):
    cookies, user = await _user_cookie(mock_db, "editor")
    assert (await async_client.patch(
        f"/admin/users/{user['id']}", json={"totp_enabled": True}, cookies=cookies)).status_code in (403, 422)
    admin_c, admin = await _user_cookie(mock_db, "super_admin")
    assert (await async_client.patch(
        f"/admin/users/{user['id']}", json={"totp_enabled": True}, cookies=admin_c)).status_code == 422
    assert (await async_client.patch(
        f"/admin/users/{user['id']}", json={"totp_secret": "JBSWY3DPEHPK3PXP"}, cookies=admin_c)).status_code == 422
    stored = await mock_db.users.find_one({"id": user["id"]})
    assert not stored.get("totp_secret") and not stored.get("totp_enabled")


@pytest.mark.asyncio
async def test_login_fails_closed_when_totp_enabled_without_secret(async_client, mock_db):
    cookies, user = await _user_cookie(mock_db, "editor", totp_enabled=True, totp_secret=None)
    res = await async_client.post("/auth/login", json={"email": user["email"], "password": "LongEnough123"})
    assert res.status_code == 401


# ---------------------------------------------------------------- 3. signing secret
def test_sign_upload_refuses_to_use_a_hardcoded_fallback(monkeypatch):
    for var in ("UPLOAD_SIGNING_SECRET", "SESSION_SECRET", "JWT_SECRET"):
        monkeypatch.delenv(var, raising=False)
    with pytest.raises(RuntimeError, match="UPLOAD_SIGNING_SECRET"):
        lib.auth.sign_upload("anything.png")
    monkeypatch.setenv("UPLOAD_SIGNING_SECRET", "test-only-" + uuid4().hex)
    sig = lib.auth.sign_upload("anything.png")
    assert sig and lib.auth.verify_upload_sig("anything.png", sig)


# ---------------------------------------------------------------- 4. public settings
@pytest.mark.asyncio
async def test_public_settings_never_return_figma_credentials(async_client, mock_db):
    marker = "FIGMA-SECRET-MARKER-" + uuid4().hex
    await mock_db.settings.update_one({"id": "settings"}, {"$set": {
        "figma_sync_token_hash": marker, "figma_sync_token_prefix": marker,
        "figma_sync_token_created_at": datetime.now(timezone.utc),
        "internal_admin_note": marker,
    }}, upsert=True)
    res = await async_client.get("/public/settings")
    assert res.status_code == 200, res.text
    assert marker not in res.text
    assert not any(k.startswith("figma_") or k == "_id" for k in res.json())
    assert "site_title" in res.json() and "theme_tokens" in res.json()


# ---------------------------------------------------------------- 5. outbox
@pytest.mark.asyncio
@pytest.mark.parametrize("role", ["editor", "registrar"])
async def test_outbox_denied_to_messages_managers(async_client, mock_db, role):
    cookies, _ = await _user_cookie(mock_db, role)
    assert (await async_client.get("/admin/outbox", cookies=cookies)).status_code == 403


@pytest.mark.asyncio
async def test_outbox_stores_redacted_html_but_sends_real_email(async_client, mock_db, monkeypatch):
    sent = {}

    def fake_send(host, port, user, password, sender, to, subject, html, reply_to):
        sent["html"] = html

    monkeypatch.setenv("SMTP_HOST", "smtp.example.invalid")
    monkeypatch.setattr(lib.mailer, "_smtp_send", fake_send)
    secret_link = "https://example.org/admin/invite/" + uuid4().hex
    await lib.mailer.send_email("someone@example.org", "Invite", f'<a href="{secret_link}">{secret_link}</a>')
    stored = await mock_db.outbox.find_one({"subject": "Invite"})
    assert stored is not None
    assert secret_link not in stored["html"]
    assert "REDACTED" in stored["html"]
    assert sent["html"] == f'<a href="{secret_link}">{secret_link}</a>'  # delivery is untouched
    monkeypatch.delenv("SMTP_HOST", raising=False)


# ---------------------------------------------------------------- 6. media file types
@pytest.mark.asyncio
async def test_media_extension_is_derived_from_content_not_request(async_client, admin_cookies, temp_media_dir):
    from PIL import Image
    buf = io.BytesIO()
    Image.new("RGB", (40, 40), color=(10, 20, 30)).save(buf, format="PNG")
    res = await async_client.post(
        "/admin/media", data={"alt": "Looks like a page but is a PNG", "folder": "test", "optimize": "false"},
        files={"file": ("evil.html", buf.getvalue(), "text/html")}, cookies=admin_cookies)
    assert res.status_code == 201, res.text
    item = res.json()
    assert item["content_type"] == "image/png"
    assert item["filename"].endswith(".png")
    assert item["url"].endswith(".png")
    served = await async_client.get(item["url"][4:] if item["url"].startswith("/api") else item["url"])
    assert served.status_code == 200
    assert served.headers["content-type"].startswith("image/png")
    assert not any(p.name.endswith(".html") for p in temp_media_dir.rglob("*"))


@pytest.mark.asyncio
async def test_lab_photo_rejects_fake_image_bytes(async_client, admin_cookies, temp_media_dir):
    res = await async_client.post(
        "/admin/lab-photos/hero", data={"alt": "Not really an image"},
        files={"file": ("fake.png", b"<!doctype html><script>alert(1)</script>", "image/png")},
        cookies=admin_cookies)
    assert res.status_code == 422, res.text


# ---------------------------------------------------------------- 7. certificates
@pytest.mark.asyncio
async def test_certificate_is_issued_only_after_attendance_and_verification_is_gated(async_client, mock_db):
    ev_id = "cert-hardening-" + uuid4().hex[:6]
    await mock_db.events.insert_one({"id": ev_id, "slug": ev_id, "title": "Security Workshop", "status": "published",
                                    "start_date": "2027-05-10", "reg_open_date": "2026-01-01",
                                    "reg_close_date": "2027-05-01", "registration_deadline": "2027-05-01",
                                    "form_fields": [
                                        {"label": "Full name", "type": "text", "required": True},
                                        {"label": "Email", "type": "email", "required": True}]})
    email = "cert.hardening@example.org"
    reg = await async_client.post(f"/registrations/{ev_id}", data={
        "consent": "1", "f_full-name": "Attendee Satu", "f_email": email})
    assert reg.status_code == 200, reg.text
    stored = await mock_db.registrations.find_one({"email": email})
    assert not stored.get("certificate_code")
    assert (await async_client.get(f"/verify/UNISSUED-{uuid4().hex[:6]}")).json()["valid"] is False

    checked = await async_client.post("/admin/registrations/checkin",
                                      json={"code": stored["id"]}, cookies={
                                          "tnl_session": await lib.auth.create_session(
                                              (await mock_db.users.find_one({"role": "super_admin"}))["id"])})
    assert checked.status_code == 200, checked.text
    code = checked.json()["certificate_code"]
    before = await mock_db.registrations.find_one({"id": stored["id"]})
    assert before["status"] == "attended"
    invalid = await async_client.get(f"/verify/{code}")
    assert invalid.json()["valid"] is False  # attended but not issued (no issued_at)

    issued = await async_client.post("/admin/registrations/issue-certificates",
                                     json={"event_id": ev_id, "statuses": ["attended"]}, cookies={
                                         "tnl_session": await lib.auth.create_session(
                                             (await mock_db.users.find_one({"role": "super_admin"}))["id"])})
    assert issued.status_code == 200 and issued.json()["issued"] >= 1
    after = await mock_db.registrations.find_one({"id": stored["id"]})
    assert after.get("certificate_issued_at")
    assert (await async_client.get(f"/verify/{after['certificate_code']}")).json()["valid"] is True
    for _ in range(35):
        limited = await async_client.get(f"/verify/{after['certificate_code']}")
    assert limited.status_code == 429


# ---------------------------------------------------------------- 8. registrar hardening
@pytest.mark.asyncio
async def test_registrar_search_regex_and_formula_safe_export(async_client, admin_cookies, mock_db, tmp_path):
    ev_id = "formula-event-" + uuid4().hex[:6]
    await mock_db.registrations.insert_one({
        "id": uuid4().hex, "event_id": ev_id, "event_title": "Formula Event",
        "email": "formula@example.org", "nim": "", "status": "accepted",
        "data": {"f_full-name": "=HYPERLINK(\"http://evil\",\"click\")"},
        "created_at": datetime.now(timezone.utc)})
    r = await async_client.get(f"/admin/registrations?event_id={ev_id}&q=[", cookies=admin_cookies)
    assert r.status_code == 200, r.text
    csv_res = await async_client.get(f"/admin/registrations/export?event_id={ev_id}", cookies=admin_cookies)
    assert csv_res.status_code == 200
    assert "'=HYPERLINK" in csv_res.text
    xlsx_res = await async_client.get(f"/admin/registrations/export-excel?event_id={ev_id}", cookies=admin_cookies)
    assert xlsx_res.status_code == 200
    assert xlsx_res.content.startswith(b"PK")


@pytest.mark.asyncio
async def test_deleting_registration_also_deletes_its_upload(async_client, admin_cookies, mock_db, monkeypatch):
    import routers.registrar as registrar
    from lib import storage
    seen = []
    monkeypatch.setattr(storage, "MEDIA_DIR", str(uuid4().hex))
    monkeypatch.setattr(registrar, "delete_object", seen.append)
    reg_id = uuid4().hex
    await mock_db.registrations.insert_one({"id": reg_id, "email": "upload@example.org",
        "data": {"f_cv": {"url": "/api/media-files/uploads/cv.pdf?sig=review-placeholder#attachment"}}})
    res = await async_client.delete(f"/admin/registrations/{reg_id}", cookies=admin_cookies)
    assert res.status_code == 200, res.text
    assert "uploads/cv.pdf" in seen


# ---------------------------------------------------------------- 9. content integrity
@pytest.mark.asyncio
async def test_bulk_delete_applies_event_guard_but_allows_ordinary_items(async_client, admin_cookies, mock_db):
    ev_id = "bulk-guard-" + uuid4().hex
    await mock_db.events.insert_one({"id": ev_id, "slug": ev_id, "title": "Guarded Event", "published": True})
    await mock_db.registrations.insert_one({"id": uuid4().hex, "event_id": ev_id, "status": "accepted"})
    blocked = await async_client.post("/admin/content/events/bulk",
                                      json={"ids": [ev_id], "action": "delete"}, cookies=admin_cookies)
    assert blocked.status_code == 400, blocked.text
    assert await mock_db.events.find_one({"id": ev_id}) is not None

    post = await async_client.post("/admin/content/posts", json={
        "title": "Bulk delete me please with a long enough title",
        "slug": "bulk-delete-" + uuid4().hex[:6], "status": "draft"}, cookies=admin_cookies)
    assert post.status_code == 201, post.text
    ok = await async_client.post("/admin/content/posts/bulk",
                                 json={"ids": [post.json()["id"]], "action": "delete"}, cookies=admin_cookies)
    assert ok.status_code == 200, ok.text
    undone = await async_client.post(f"/admin/content/posts/{post.json()['id']}/undo-delete", cookies=admin_cookies)
    assert undone.status_code == 200, undone.text


@pytest.mark.asyncio
async def test_undo_delete_checks_division_scope(async_client, mock_db):
    cookies, user = await _user_cookie(mock_db, "contributor", divisions=["academics"])
    item_id = "undo-scope-" + uuid4().hex[:6]
    await mock_db.audit_log.insert_one({
        "id": uuid4().hex, "actor_id": "x", "actor_email": "x@example.org", "action": "delete",
        "resource": "posts", "target_id": item_id,
        "detail": {"restore": {"id": item_id, "title": "Restored post", "status": "draft"}},
        "created_at": datetime.now(timezone.utc)})
    res = await async_client.post(f"/admin/content/posts/{item_id}/undo-delete", cookies=cookies)
    assert res.status_code == 403


# ---------------------------------------------------------------- 10. audit chain & export
@pytest.mark.asyncio
async def test_audit_hash_chain_and_export_offset(async_client, mock_db, admin_cookies):
    req = type("Req", (), {"state": type("State", (), {"user": {"id": "x", "email": "x@example.org"}})()})()
    await lib.auth.audit(req, "chain-test", "unit", "target-1", {"n": 1})
    first = await mock_db.audit_log.find_one({"action": "chain-test"}, sort=[("created_at", -1)])
    await lib.auth.audit(req, "chain-test", "unit", "target-2", {"n": 2})
    second = await mock_db.audit_log.find_one({"action": "chain-test"}, sort=[("created_at", -1)])
    assert first.get("hash") and second.get("hash") != first["hash"]
    assert second["prev_hash"] == first["hash"]
    assert second["target_id"] == "target-2"

    for i in range(4):
        await mock_db.audit_log.insert_one({"id": uuid4().hex, "action": "chain-test",
            "created_at": datetime.now(timezone.utc) + timedelta(seconds=i), "actor_email": "x@example.org"})
    res = await async_client.get("/admin/audit/export?limit=2&offset=1", cookies=admin_cookies)
    assert res.status_code == 200, res.text
    assert res.headers.get("X-Audit-Truncated") == "true"
    assert len(res.text.strip().splitlines()) == 3  # header + 2 rows


# ---------------------------------------------------------------- 11. lockout
@pytest.mark.asyncio
async def test_login_failure_bucket_is_not_keyed_by_email_alone(async_client, mock_db, monkeypatch):
    victim_email = "victim-" + uuid4().hex[:6] + "@example.org"
    await mock_db.users.insert_one({"id": uuid4().hex, "name": "Victim", "email": victim_email,
        "role": "viewer", "divisions": [], "active": True,
        "password_hash": hash_password("LongEnough123"), "totp_enabled": False,
        "created_at": datetime.now(timezone.utc)})
    ip = {"value": "192.0.2.10"}
    monkeypatch.setattr(auth_router, "client_ip", lambda request: ip["value"])
    for _ in range(10):
        await async_client.post("/auth/login", json={"email": victim_email, "password": "wrong"})
    ip["value"] = "192.0.2.11"
    ok = await async_client.post("/auth/login", json={"email": victim_email, "password": "LongEnough123"})
    assert ok.status_code == 200, ok.text


# ---------------------------------------------------------------- 12. api key lifecycle
@pytest.mark.asyncio
async def test_expired_key_rejected_write_implies_read_and_import_cap(async_client, mock_db, admin_cookies):
    created = await async_client.post("/admin/api-keys", json={
        "name": "expired", "scopes": ["write"],
        "expires_at": (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()}, cookies=admin_cookies)
    assert created.status_code == 201, created.text
    assert (await async_client.get("/v1/news", headers={"X-API-Key": created.json()["key"]})).status_code == 401

    live = await async_client.post("/admin/api-keys", json={"name": "writer", "scopes": ["write"]},
                                   cookies=admin_cookies)
    key = live.json()["key"]
    assert (await async_client.get("/v1/news", headers={"X-API-Key": key})).status_code == 200
    many = await async_client.post("/v1/news/import", json={"items": [{"title": f"Item {i}"} for i in range(201)]},
                                   headers={"X-API-Key": key})
    assert many.status_code == 422, many.text
    docs = (await async_client.get("/v1-docs/openapi")).json()
    assert "200" in docs["paths"]["/v1/{resource}/import"]["post"]["responses"]


# ---------------------------------------------------------------- 13. health & indexes
@pytest.mark.asyncio
async def test_health_failure_hides_exception_text(async_client, monkeypatch):
    from unittest.mock import AsyncMock
    import lib.db
    import server
    mock = AsyncMock()
    mock.command.side_effect = Exception("internal DSN and password details")
    monkeypatch.setattr(lib.db, "db", mock)
    monkeypatch.setattr(server, "db", mock)
    res = await async_client.get("/health")
    assert res.status_code == 503
    assert "internal DSN" not in res.text
    assert res.json().get("database") == "unavailable"


def test_index_definitions_cover_audit_and_api_keys():
    import lib.db
    names = {m.document["name"] for models in lib.db.INDEXES.values() for m in models}
    assert "audit_created_action" in names
    assert "api_keys_active" in names
