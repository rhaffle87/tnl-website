"""Tests for certificate issuance, public verification, and PDF generation with QR code."""

from datetime import datetime, timezone
from uuid import uuid4

import pytest


@pytest.mark.asyncio
async def test_certificate_lifecycle(async_client, mock_db, admin_cookies):
    # Setup event and attendee
    ev_id = "cert-test-event-" + uuid4().hex[:6]
    await mock_db.events.insert_one({
        "id": ev_id,
        "title": "Workshop Next-Gen 5G Network",
        "slug": "workshop-5g",
        "type": "training",
        "start_date": "2026-05-10",
        "published": True,
    })

    reg_id = str(uuid4())
    await mock_db.registrations.insert_one({
        "id": reg_id,
        "event_id": ev_id,
        "event_title": "Workshop Next-Gen 5G Network",
        "email": "peserta.5g@its.ac.id",
        "nim": "5024221001",
        "status": "attended",
        "data": {
            "f_full-name": "Muhammad Farhan Al-Fatih",
        },
        "created_at": datetime.now(timezone.utc),
    })

    # 1. Issue Certificates via Registrar Admin endpoint
    issue_res = await async_client.post(
        "/admin/registrations/issue-certificates",
        json={"event_id": ev_id, "statuses": ["attended"]},
        cookies=admin_cookies,
    )
    assert issue_res.status_code == 200
    assert issue_res.json().get("issued") >= 1

    # Check that registration received a certificate code
    reg = await mock_db.registrations.find_one({"id": reg_id})
    cert_code = reg.get("certificate_code")
    assert cert_code is not None
    assert cert_code.startswith("TNL-2026-TRA-")

    # 2. Public Verification Check
    verify_res = await async_client.get(f"/verify/{cert_code}")
    assert verify_res.status_code == 200
    vdata = verify_res.json()
    assert vdata.get("valid") is True
    assert vdata.get("code") == cert_code
    assert vdata.get("name") == "Muhammad Farhan Al-Fatih"
    assert "Telecommunication Network Laboratory" in vdata.get("message", "")

    # Invalid code check
    invalid_res = await async_client.get("/verify/NON-EXISTENT-CODE")
    assert invalid_res.status_code == 200
    assert invalid_res.json().get("valid") is False

    # 3. PDF Certificate Generation & Download
    pdf_res = await async_client.get(f"/public/certificates/{cert_code}/download")
    assert pdf_res.status_code == 200
    assert pdf_res.headers.get("content-type") == "application/pdf"
    assert "attachment" in pdf_res.headers.get("content-disposition", "")
    assert f"tnl-certificate-{cert_code}.pdf" in pdf_res.headers.get("content-disposition", "")

    # Check PDF magic bytes (%PDF-)
    assert pdf_res.content.startswith(b"%PDF-")
    assert len(pdf_res.content) > 5000  # Valid rendered PDF with embedded fonts & QR
