"""All public surfaces must expose the approved document without editorial metadata."""

from datetime import datetime, timezone
from uuid import uuid4

import pytest

from routers.apiv1 import hash_key


@pytest.mark.asyncio
async def test_drafts_and_revisions_cannot_leak_through_public_or_v1(async_client, mock_db):
    identifier = uuid4().hex
    private = "EDITORIAL-PRIVATE-" + uuid4().hex
    doc = {"id": identifier, "slug": identifier, "title": "Approved article", "status": "published",
           "body": "Approved public content", "created_at": datetime.now(timezone.utc),
           "draft": {"title": private, "body": private}, "revisions": [{"saved_by": private, "body": private}],
           "_cms_version": 7, "needs_review": True, "issues": [{"detail": private}]}
    await mock_db.posts.insert_one(doc)
    raw_key = "tnl_" + uuid4().hex
    await mock_db.api_keys.insert_one({"id": uuid4().hex, "key_hash": hash_key(raw_key), "active": True, "scopes": ["read"]})
    headers = {"X-API-Key": raw_key}
    for endpoint in (f"/public/posts/{identifier}", f"/v1/news/{identifier}"):
        response = await async_client.get(endpoint, headers=headers)
        assert response.status_code == 200, response.text
        assert response.json()["title"] == "Approved article"
        assert private not in response.text
        assert not ({"draft", "revisions", "_cms_version", "needs_review", "issues"} & response.json().keys())
    listed = await async_client.get("/v1/news", headers=headers)
    assert listed.status_code == 200 and private not in listed.text
    assert any(item["id"] == identifier for item in listed.json()["items"])


@pytest.mark.asyncio
async def test_public_page_allowlist_excludes_hidden_and_editor_identity(async_client, mock_db):
    identifier = uuid4().hex
    private = "PRIVATE-PAGE-" + uuid4().hex
    await mock_db.pages.insert_one({
        "id": identifier, "slug": identifier, "title": "Approved page", "status": "published",
        "created_at": datetime.now(timezone.utc), "internal_note": private,
        "revisions": [{"saved_by": private, "title": private}], "draft": {"title": private},
        "blocks": [{"id": "visible", "type": "rich_text", "props": {"html": "<p>Public</p>"}},
                   {"id": "hidden", "type": "rich_text", "hidden": True, "props": {"html": private}}],
    })
    result = await async_client.get(f"/public/pages/{identifier}")
    assert result.status_code == 200 and private not in result.text
    assert [block["id"] for block in result.json()["blocks"]] == ["visible"]


@pytest.mark.asyncio
async def test_v1_rejects_invalid_pagination(async_client, mock_db):
    raw_key = "tnl_" + uuid4().hex
    await mock_db.api_keys.insert_one({"id": uuid4().hex, "key_hash": hash_key(raw_key), "active": True, "scopes": ["read"]})
    for query in ("limit=0", "limit=101", "offset=-1"):
        result = await async_client.get("/v1/news?" + query, headers={"X-API-Key": raw_key})
        assert result.status_code == 422
