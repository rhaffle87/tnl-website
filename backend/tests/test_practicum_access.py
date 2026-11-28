"""Practicum module files are gated by the CMS `available_to_download` toggle (default False)
and assistant-only shift access rules.

The catalog stays readable by anyone (curriculum transparency), download URLs are only exposed
when `available_to_download` is enabled in the CMS (otherwise hidden from all public callers),
and shift schedules stay restricted to signed-in laboratory assistants. Direct fetches to
`/media-files/academic/*` respect the same rule.
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


@pytest.fixture(autouse=True)
async def _cleanup_test_practicum(mock_db):
    yield
    await mock_db.practicum.delete_many({"id": {"$regex": "^test-practicum-"}})


async def _published_module(mock_db, *, available_to_download: bool = False, file_url: str = MODULE_URL) -> dict:
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
        "available_to_download": available_to_download,
        "resources": [{
            "id": str(uuid4()),
            "title": "Modul 02: Switch Configuration (PDF)",
            "file_url": file_url,
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
async def test_public_practicum_hides_module_urls_and_shifts_when_download_disabled(async_client, mock_db):
    doc = await _published_module(mock_db, available_to_download=False)
    res = await async_client.get("/public/practicum")
    assert res.status_code == 200, res.text
    items = res.json()
    assert len(items) > 0

    assert MODULE_URL not in res.text
    assert "file_url" not in res.text
    assert "coordinator_name" not in res.text

    mine = next(i for i in items if i["id"] == doc["id"])
    assert mine["code"] == "TST-01"
    assert mine["semester"] == "Ganjil 2026/2027"
    assert mine["cover_image"].endswith(".webp")
    assert mine["available_to_download"] is False
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
async def test_public_practicum_keeps_urls_hidden_for_all_when_available_to_download_false(async_client, mock_db):
    doc = await _published_module(mock_db, available_to_download=False)
    cookies = await _session_cookies(mock_db, "editor")
    res = await async_client.get("/public/practicum", cookies=cookies)
    assert res.status_code == 200, res.text

    mine = next(i for i in res.json() if i["id"] == doc["id"])
    assert mine["available_to_download"] is False
    assert mine["resources_restricted"] is True
    assert mine["can_access_modules"] is True
    assert "file_url" not in mine["resources"][0]
    assert mine["shifts"][0]["coordinator_name"] == "Asisten Lab"


@pytest.mark.asyncio
async def test_public_practicum_exposes_module_urls_when_available_to_download_enabled(async_client, mock_db):
    doc = await _published_module(mock_db, available_to_download=True)
    res = await async_client.get("/public/practicum")
    assert res.status_code == 200, res.text

    mine = next(i for i in res.json() if i["id"] == doc["id"])
    assert mine["available_to_download"] is True
    assert mine["resources_restricted"] is False
    assert mine["can_access_modules"] is False
    assert mine["resources"][0]["file_url"] == MODULE_URL
    assert mine["shifts"] == []


@pytest.mark.asyncio
async def test_public_practicum_hides_shifts_from_viewer_role(async_client, mock_db):
    doc = await _published_module(mock_db, available_to_download=False)
    cookies = await _session_cookies(mock_db, "viewer")
    res = await async_client.get("/public/practicum", cookies=cookies)
    assert res.status_code == 200, res.text
    assert MODULE_URL not in res.text

    mine = next(i for i in res.json() if i["id"] == doc["id"])
    assert mine["can_access_modules"] is False
    assert mine["resources_restricted"] is True
    assert mine["shifts"] == []


# ----------------------------------------------------------------- v1 API
@pytest.mark.asyncio
async def test_v1_practicum_respects_available_to_download_and_assistant_shifts(async_client, mock_db):
    locked_doc = await _published_module(mock_db, available_to_download=False)
    open_doc = await _published_module(mock_db, available_to_download=True)
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

    locked_single = await async_client.get(f"/v1/practicum/{locked_doc['id']}", headers={"X-API-Key": raw})
    assert locked_single.status_code == 200, locked_single.text
    assert "file_url" not in locked_single.json()["resources"][0]
    assert locked_single.json()["available_to_download"] is False
    assert locked_single.json()["can_access_modules"] is False

    open_single = await async_client.get(f"/v1/practicum/{open_doc['id']}", headers={"X-API-Key": raw})
    assert open_single.status_code == 200, open_single.text
    assert open_single.json()["available_to_download"] is True
    assert open_single.json()["resources"][0]["file_url"] == MODULE_URL
    assert open_single.json()["shifts"] == []

    cookies = await _session_cookies(mock_db, "super_admin")
    with_assistant = await async_client.get(
        f"/v1/practicum/{locked_doc['id']}", headers={"X-API-Key": raw}, cookies=cookies
    )
    assert with_assistant.status_code == 200
    assert with_assistant.json()["shifts"][0]["coordinator_name"] == "Asisten Lab"
    assert "file_url" not in with_assistant.json()["resources"][0]


# ----------------------------------------------------------------- media file gate
@pytest.mark.asyncio
async def test_module_file_is_gated_by_available_to_download_and_assistant_session(async_client, mock_db, temp_media_dir):
    academic = temp_media_dir / "academic"
    academic.mkdir(parents=True, exist_ok=True)
    locked_name = f"modul-locked-{uuid4().hex[:6]}.pdf"
    open_name = f"modul-open-{uuid4().hex[:6]}.pdf"
    (academic / locked_name).write_bytes(b"%PDF-1.4 locked module")
    (academic / open_name).write_bytes(b"%PDF-1.4 open module")

    await _published_module(mock_db, available_to_download=False, file_url=f"/api/media-files/academic/{locked_name}")
    await _published_module(mock_db, available_to_download=True, file_url=f"/api/media-files/academic/{open_name}")

    anon_locked = await async_client.get(f"/media-files/academic/{locked_name}")
    assert anon_locked.status_code == 403
    assert "restricted to laboratory assistants" in anon_locked.text
    assert anon_locked.headers.get("x-robots-tag") == "noindex, nofollow"

    viewer_locked = await async_client.get(
        f"/media-files/academic/{locked_name}",
        cookies=await _session_cookies(mock_db, "viewer"),
    )
    assert viewer_locked.status_code == 403

    assistant_locked = await async_client.get(
        f"/media-files/academic/{locked_name}",
        cookies=await _session_cookies(mock_db, "editor"),
    )
    assert assistant_locked.status_code == 200
    assert assistant_locked.headers.get("x-robots-tag") == "noindex, nofollow"
    assert "public" not in assistant_locked.headers.get("cache-control", "")

    anon_open = await async_client.get(f"/media-files/academic/{open_name}")
    assert anon_open.status_code == 200
    assert "no-cache" in anon_open.headers.get("cache-control", "")


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
