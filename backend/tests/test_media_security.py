"""Tests for media upload security, magic byte validation, file size limits, and path traversal prevention."""

import io
import pytest


@pytest.mark.asyncio
async def test_media_upload_requires_alt_text(async_client, admin_cookies, temp_media_dir):
    files = {"file": ("test.png", b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR", "image/png")}
    data = {"alt": "   ", "folder": "lab"}
    res = await async_client.post("/admin/media/upload", data=data, files=files, cookies=admin_cookies)
    assert res.status_code == 422
    assert "Alt text is required" in str(res.json().get("detail", ""))


@pytest.mark.asyncio
async def test_media_upload_valid_png_and_derivatives(async_client, admin_cookies, temp_media_dir):
    # Minimal 1x1 valid PNG
    valid_png_bytes = (
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4"
        b"\x00\x00\x00\rIDATx\x9cc\xf8\xff\xff?\x00\x05\xfe\x02\xfe\r\xef\x8a\x7f\x00\x00\x00\x00IEND\xaeB`\x82"
    )
    files = {"file": ("rack.png", valid_png_bytes, "image/png")}
    data = {"alt": "Server rack in room B-301", "folder": "facilities"}
    res = await async_client.post("/admin/media/upload", data=data, files=files, cookies=admin_cookies)
    assert res.status_code == 201, res.text
    item = res.json()
    assert item["kind"] == "image"
    assert item["alt"] == "Server rack in room B-301"
    assert "url" in item


@pytest.mark.asyncio
async def test_media_upload_allowed_academic_document(async_client, admin_cookies, temp_media_dir):
    # Packet Tracer .pkt file or Python lab script
    pkt_bytes = b"CISCO PACKET TRACER SIMULATION FILE SAMPLE CONTENT"
    files = {"file": ("lab1_topology.pkt", pkt_bytes, "application/octet-stream")}
    data = {"alt": "Packet tracer network topology for practicum 1", "folder": "practicum"}
    res = await async_client.post("/admin/media/upload", data=data, files=files, cookies=admin_cookies)
    assert res.status_code == 201
    item = res.json()
    assert item["kind"] == "document"


@pytest.mark.asyncio
async def test_media_magic_bytes_spoofing_rejected(async_client, admin_cookies, temp_media_dir):
    # Pretending to be PNG while containing plain text script
    fake_png_bytes = b"#!/bin/bash\necho Malicious script pretending to be image"
    files = {"file": ("malicious.png", fake_png_bytes, "image/png")}
    data = {"alt": "Fake PNG exploit", "folder": "test"}
    res = await async_client.post("/admin/media/upload", data=data, files=files, cookies=admin_cookies)
    assert res.status_code == 422
    assert "magic bytes" in res.json().get("detail", "").lower() or "header" in res.json().get("detail", "").lower()


@pytest.mark.asyncio
async def test_media_file_size_limit_rejected(async_client, admin_cookies, temp_media_dir):
    # Exceeding 10MB limit (10MB + 1KB)
    large_file = b"0" * (10 * 1024 * 1024 + 1024)
    files = {"file": ("huge_file.pkt", large_file, "application/octet-stream")}
    data = {"alt": "Oversized file", "folder": "test"}
    res = await async_client.post("/admin/media/upload", data=data, files=files, cookies=admin_cookies)
    assert res.status_code == 413


@pytest.mark.asyncio
async def test_media_path_traversal_strictly_rejected(async_client, temp_media_dir):
    # Attempting to read outside MEDIA_DIR
    traversal_paths = [
        "../../etc/passwd",
        "..\\..\\windows\\system32\\calc.exe",
        "/etc/shadow",
        "folder/../../../secret.txt",
    ]
    for path in traversal_paths:
        res = await async_client.get(f"/media-files/{path}")
        assert res.status_code in (400, 403, 404), f"Path {path} did not reject traversal"


@pytest.mark.asyncio
async def test_media_upload_webp_optimization_and_scoped_attachment(async_client, admin_cookies, temp_media_dir):
    # Valid PNG image bytes to optimize into WebP
    from PIL import Image
    buf = io.BytesIO()
    img = Image.new("RGB", (2000, 1000), color=(0, 128, 255))
    img.save(buf, format="PNG")
    png_data = buf.getvalue()

    files = {"file": ("banner_original.png", png_data, "image/png")}
    data = {
        "alt": "Open House Banner 2026",
        "folder": "events",
        "attached_resource": "events",
        "attached_item_id": "event-open-house-2026",
        "optimize": "true",
    }
    res = await async_client.post("/admin/media", data=data, files=files, cookies=admin_cookies)
    assert res.status_code == 201, res.text
    item = res.json()

    assert item["kind"] == "image"
    assert item["folder"] == "events"
    assert item["filename"].endswith(".webp")
    assert item["content_type"] == "image/webp"
    assert item["original_name"] == "banner_original.png"
    assert item["width"] == 1920
    assert item["height"] == 960
    assert item["size_bytes"] > 0
    assert item["attached_to"] == {"resource": "events", "item_id": "event-open-house-2026"}
    assert item["url"].startswith("/api/media-files/events/")
    assert "uploads" not in item["url"]


@pytest.mark.asyncio
async def test_media_upload_folder_uploads_strictly_disallowed(async_client, admin_cookies, temp_media_dir):
    from PIL import Image
    buf = io.BytesIO()
    img = Image.new("RGB", (100, 100), color=(10, 20, 30))
    img.save(buf, format="PNG")
    png_data = buf.getvalue()

    # Attempting to upload to private "uploads" folder
    files = {"file": ("exploit.png", png_data, "image/png")}
    data = {"alt": "Disallowed folder upload", "folder": "uploads", "auto_alt": "true"}
    res = await async_client.post("/admin/media", data=data, files=files, cookies=admin_cookies)
    assert res.status_code == 422
    assert "disallowed" in res.json().get("detail", "").lower()

    # Attempting path traversal in folder name
    data_traversal = {"alt": "Traversal upload", "folder": "../outside", "auto_alt": "true"}
    res_traversal = await async_client.post("/admin/media", data=data_traversal, files=files, cookies=admin_cookies)
    assert res_traversal.status_code == 422


@pytest.mark.asyncio
async def test_media_listing_search_and_pagination(async_client, admin_cookies, temp_media_dir):
    from PIL import Image
    # Create two test media files
    buf1 = io.BytesIO()
    Image.new("RGB", (50, 50), color=(255, 0, 0)).save(buf1, format="PNG")
    await async_client.post(
        "/admin/media",
        data={"alt": "Antenna equipment photo", "folder": "equipment", "auto_alt": "false"},
        files={"file": ("antenna_dish.png", buf1.getvalue(), "image/png")},
        cookies=admin_cookies,
    )

    buf2 = io.BytesIO()
    Image.new("RGB", (50, 50), color=(0, 255, 0)).save(buf2, format="PNG")
    await async_client.post(
        "/admin/media",
        data={"alt": "Server rack cluster", "folder": "equipment", "auto_alt": "false"},
        files={"file": ("server_rack.png", buf2.getvalue(), "image/png")},
        cookies=admin_cookies,
    )

    # 1. Search by query
    res = await async_client.get("/admin/media?q=Antenna", cookies=admin_cookies)
    assert res.status_code == 200
    body = res.json()
    assert "items" in body
    assert "folders" in body
    assert "total" in body
    assert any("antenna" in (it.get("alt", "") + it.get("original_name", "")).lower() for it in body["items"])

    # 2. Filter by folder
    res_folder = await async_client.get("/admin/media?folder=equipment", cookies=admin_cookies)
    assert res_folder.status_code == 200
    assert all(it["folder"] == "equipment" for it in res_folder.json()["items"])

    # 3. Pagination limits
    res_page = await async_client.get("/admin/media?limit=1&offset=0", cookies=admin_cookies)
    assert res_page.status_code == 200
    assert len(res_page.json()["items"]) <= 1
    assert res_page.json()["limit"] == 1


@pytest.mark.asyncio
async def test_media_patch_alt_and_folder(async_client, admin_cookies, temp_media_dir):
    from PIL import Image
    buf = io.BytesIO()
    Image.new("RGB", (50, 50), color=(100, 100, 100)).save(buf, format="PNG")
    upload_res = await async_client.post(
        "/admin/media",
        data={"alt": "Initial alt text", "folder": "general"},
        files={"file": ("test_patch.png", buf.getvalue(), "image/png")},
        cookies=admin_cookies,
    )
    media_id = upload_res.json()["id"]

    # Patch alt text and folder
    patch_res = await async_client.patch(
        f"/admin/media/{media_id}",
        json={"alt": "Updated alt text description", "folder": "members"},
        cookies=admin_cookies,
    )
    assert patch_res.status_code == 200
    updated = patch_res.json()
    assert updated["alt"] == "Updated alt text description"
    assert updated["folder"] == "members"
