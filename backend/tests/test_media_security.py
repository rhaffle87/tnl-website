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
