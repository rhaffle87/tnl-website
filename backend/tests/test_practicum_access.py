"""Practicum module files are laboratory-assistant material, not public content.

The catalog stays readable by anyone (curriculum transparency), but every download URL and
every shift schedule must disappear for anonymous visitors, for the read-only `viewer` role
and for a scoped API key — and the raw file must answer 403 when fetched directly.
"""

from datetime import datetime, timezone
from uuid import uuid4

import pytest

import lib.auth
from routers.apiv1 import hash_key

MODULE_URL = "/api/media-files/academic/modul-02-switching.pdf"


async def _session_cookies(mock_db, role: str) -> dict:
    user_id = str(uuid4())
    await mock_db.users.insert_one({
        "id": user_id,
        "name": f"{role} probe",
        "email": f"{role}-{uuid4().hex[:8]}@its.ac.id",
        "role": role,
        "divisions": ["academics"],
        "active": True,
        "password_hash": "",
        "totp_secret": None,
        "totp_enabled": False,
        "invite_token": None,
        "created_at": datetime.now(timezone.utc),
        "last_login_at": None,
    })
    token = await lib.auth.create_session(user_id)
    return {"tnl_session": token}


async def _published_module(mock_db) -> dict:
    doc = {
        "id": "test-practicum-" + uuid4().hex[:8],
        "code": "TST-01",
        "name": "Test module",
        "name_id": "Modul uji",
        "description": "Throughput, delay and loss measurement in B-301.",
        "description_id": "Pengukuran throughput, delay, dan loss di B-301.",
        "cover_image": "/api/media-files/illustrative/structured-cabling.webp",
        "gallery_images": [],
        "semester": "Ganjil 2026/2027",
        "resources": [{
            "id": str(uuid4()),
            "title": "Modul 02: Switch Configuration (PDF)",
            "file_url": MODULE_URL,
            "file_type": "pdf",
            "size_bytes": 1420000,
        }],
        "shifts": [{
            "id": str(uuid4()),
            "day": "Selasa",
            "time_slot": "16:00 - 18:00 WIB",
            "coordinator_name": "Asisten Lab",
            "quota": 24,
            "room": "Ruang B-301",
            "notes": "Sesi 1",
        }],
        "order": 99,
        "published": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await mock_db.practicum.replace_one({"id": doc["id"]}, doc, upsert=True)
    return doc


# ----------------------------------------------------------------- public catalog
@pytest.mark.asyncio
async def test_public_practicum_hides_module_urls_and_shifts_from_anonymous(async_client, mock_db):
    doc = await _published_module(mock_db)
    res = await async_client.get("/public/practicum")
    assert res.status_code == 200, res.text
    items = res.json()
    assert len(items) > 0

    assert MODULE_URL not in res.text
    assert "file_url" not in res.text
    assert "coordinator_name" not in res.text

    mine = next(i for i in items if i["id"] == doc["id"])
    # The catalog itself is still public…
    assert mine["code"] == "TST-01"
    assert mine["semester"] == "Ganjil 2026/2027"
    assert mine["cover_image"].endswith(".webp")
    # …but the module payload is redacted and labelled as such.
    assert mine["can_access_modules"] is False
    assert mine["resources_restricted"] is True
    assert mine["resources_count"] == 1
    assert mine["shifts_count"] == 1
    assert mine["shifts"] == []
    assert [r for r in mine["resources"]] == [{
        "id": doc["resources"][0]["id"],
        "title": "Modul 02: Switch Configuration (PDF)",
        "file_type": "pdf",
        "size_bytes": 1420000,
    }]


@pytest.mark.asyncio
async def test_public_practicum_keeps_module_urls_for_anonymous_never_any_doc(async_client, mock_db):
    await _published_module(mock_db)
    res = await async_client.get("/public/practicum")
    for item in res.json():
        assert item["can_access_modules"] is False
        assert item["resources_restricted"] is True
        assert item["shifts"] == []
        for resource in item["resources"]:
            assert "file_url" not in resource


@pytest.mark.asyncio
async def test_public_practicum_returns_module_urls_to_lab_assistant(async_client, mock_db):
    doc = await _published_module(mock_db)
    cookies = await _session_cookies(mock_db, "editor")
    res = await async_client.get("/public/practicum", cookies=cookies)
    assert res.status_code == 200, res.text

    mine = next(i for i in res.json() if i["id"] == doc["id"])
    assert mine["can_access_modules"] is True
    assert mine["resources_restricted"] is False
    assert mine["resources"][0]["file_url"] == MODULE_URL
    assert mine["shifts"][0]["coordinator_name"] == "Asisten Lab"


@pytest.mark.asyncio
async def test_public_practicum_hides_module_urls_from_viewer_role(async_client, mock_db):
    doc = await _published_module(mock_db)
    cookies = await _session_cookies(mock_db, "viewer")
    res = await async_client.get("/public/practicum", cookies=cookies)
    assert res.status_code == 200, res.text
    assert MODULE_URL not in res.text

    mine = next(i for i in res.json() if i["id"] == doc["id"])
    assert mine["can_access_modules"] is False
    assert mine["shifts"] == []


# ----------------------------------------------------------------- v1 API
@pytest.mark.asyncio
async def test_v1_practicum_is_redacted_for_a_plain_key_and_open_for_an_assistant(async_client, mock_db):
    doc = await _published_module(mock_db)
    raw = "tnl_test_" + uuid4().hex
    await mock_db.api_keys.insert_one({
        "id": str(uuid4()),
        "name": "practicum-probe",
        "scopes": ["read"],
        "key_hash": hash_key(raw),
        "prefix": raw[:12],
        "active": True,
        "calls": 0,
        "created_at": datetime.now(timezone.utc),
        "last_used_at": None,
    })

    bare = await async_client.get("/v1/practicum", headers={"X-API-Key": raw})
    assert bare.status_code == 200, bare.text
    assert MODULE_URL not in bare.text
    single = await async_client.get(f"/v1/practicum/{doc['id']}", headers={"X-API-Key": raw})
    assert single.status_code == 200, single.text
    assert single.json()["can_access_modules"] is False

    cookies = await _session_cookies(mock_db, "super_admin")
    with_assistant = await async_client.get(
        "/v1/practicum", headers={"X-API-Key": raw}, cookies=cookies
    )
    assert MODULE_URL in with_assistant.text


# ----------------------------------------------------------------- media file gate
@pytest.mark.asyncio
async def test_module_file_is_403_for_anonymous_and_200_for_assistant(async_client, mock_db, temp_media_dir):
    academic = temp_media_dir / "academic"
    academic.mkdir(parents=True, exist_ok=True)
    (academic / "modul-02-switching.pdf").write_bytes(b"%PDF-1.4 fake module")

    anon = await async_client.get("/media-files/academic/modul-02-switching.pdf")
    assert anon.status_code == 403
    assert "restricted to laboratory assistants" in anon.text
    assert anon.headers.get("x-robots-tag") == "noindex, nofollow"

    viewer = await async_client.get(
        "/media-files/academic/modul-02-switching.pdf",
        cookies=await _session_cookies(mock_db, "viewer"),
    )
    assert viewer.status_code == 403

    assistant = await async_client.get(
        "/media-files/academic/modul-02-switching.pdf",
        cookies=await _session_cookies(mock_db, "editor"),
    )
    assert assistant.status_code == 200
    assert assistant.headers.get("x-robots-tag") == "noindex, nofollow"
    assert "public" not in assistant.headers.get("cache-control", "")


@pytest.mark.asyncio
async def test_public_media_folders_stay_public(async_client, temp_media_dir):
    illustrative = temp_media_dir / "illustrative"
    illustrative.mkdir(parents=True, exist_ok=True)
    (illustrative / "structured-cabling.webp").write_bytes(b"RIFF webp")

    res = await async_client.get("/media-files/illustrative/structured-cabling.webp")
    assert res.status_code == 200
    assert "public" in res.headers.get("cache-control", "")


# ----------------------------------------------------------------- CMS read redaction
@pytest.mark.asyncio
async def test_cms_hides_practicum_resources_from_viewer_and_keeps_them_for_staff(async_client, mock_db):
    doc = await _published_module(mock_db)

    viewer = await async_client.get(
        "/admin/content/practicum", cookies=await _session_cookies(mock_db, "viewer")
    )
    assert viewer.status_code == 200, viewer.text
    assert MODULE_URL not in viewer.text
    mine = next(i for i in viewer.json()["items"] if i["id"] == doc["id"])
    assert "resources" not in mine and "shifts" not in mine

    editor = await async_client.get(
        "/admin/content/practicum", cookies=await _session_cookies(mock_db, "editor")
    )
    assert editor.status_code == 200, editor.text
    assert MODULE_URL in editor.text


@pytest.mark.asyncio
async def test_cms_gives_registrar_module_urls_but_not_participant_pii(async_client, mock_db):
    """Registrar is a laboratory-assistant role: modules yes, member PII no."""
    doc = await _published_module(mock_db)
    cookies = await _session_cookies(mock_db, "registrar")
    res = await async_client.get("/admin/content/practicum", cookies=cookies)
    assert res.status_code == 200, res.text
    mine = next(i for i in res.json()["items"] if i["id"] == doc["id"])
    assert mine["resources"][0]["file_url"] == MODULE_URL
