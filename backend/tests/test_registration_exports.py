"""Database-backed exports preserve protected proof links and registration codes."""
import csv
import io
from datetime import datetime, timezone
from uuid import uuid4

import openpyxl
import pytest


@pytest.mark.asyncio
@pytest.mark.parametrize("endpoint", ["export", "export-excel"])
async def test_exports_preserve_signed_proof_links_and_certificate_codes(
        async_client, mock_db, admin_cookies, endpoint):
    event_id = "export-" + uuid4().hex
    proof_url = "https://labtnl.site/api/media-files/uploads/export-proof.png?sig=test-signature"
    await mock_db.registrations.insert_one({
        "id": str(uuid4()), "event_id": event_id, "event_title": "Export regression",
        "email": "export@example.org", "nim": "5024211001", "status": "accepted",
        "certificate_code": "PRESERVE-CODE", "created_at": datetime.now(timezone.utc),
        "data": {"f_proof": {"name": "proof.png", "absolute_url": proof_url,
                              "url": "/api/media-files/uploads/export-proof.png?sig=test-signature"}},
    })
    response = await async_client.get(
        f"/admin/registrations/{endpoint}?event_id={event_id}", cookies=admin_cookies)
    assert response.status_code == 200
    if endpoint == "export":
        rows = list(csv.reader(io.StringIO(response.text)))
    else:
        workbook = openpyxl.load_workbook(io.BytesIO(response.content))
        rows = list(workbook.active.values)
    assert len(rows) == 2
    assert proof_url in rows[1]
    assert "PRESERVE-CODE" in rows[1]
    saved = await mock_db.registrations.find_one({"event_id": event_id})
    assert saved["certificate_code"] == "PRESERVE-CODE"
    assert saved["data"]["f_proof"]["absolute_url"] == proof_url
