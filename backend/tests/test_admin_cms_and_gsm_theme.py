"""Tests for Admin CMS content CRUD, undo-delete, custom collections, and GSM theme token lifecycle with WCAG contrast reports."""

from uuid import uuid4
import pytest
from routers.siteadmin import theme_contrast_report


@pytest.mark.asyncio
async def test_content_crud_and_undo_delete(async_client, admin_cookies):
    # 1. Create a post
    payload = {
        "title": "Quantum Key Distribution Experiment in B-301",
        "slug": f"qkd-test-{uuid4().hex[:6]}",
        "excerpt": "Verifying BB84 protocol over campus dark fiber link.",
        "category": "Research",
        "status": "draft",
    }
    create_res = await async_client.post("/admin/content/posts", json=payload, cookies=admin_cookies)
    assert create_res.status_code == 201, create_res.text
    created = create_res.json()
    post_id = created["id"]
    assert created["status"] == "draft"

    # 2. Update post to published
    update_res = await async_client.put(
        f"/admin/content/posts/{post_id}",
        json={"status": "published", "title": "Updated QKD Experiment"},
        cookies=admin_cookies,
    )
    assert update_res.status_code == 200
    assert update_res.json()["title"] == "Updated QKD Experiment"
    assert update_res.json()["status"] == "published"

    # 3. Soft-delete / delete post
    del_res = await async_client.delete(f"/admin/content/posts/{post_id}", cookies=admin_cookies)
    assert del_res.status_code == 200

    # Verify post is deleted
    get_res = await async_client.get(f"/admin/content/posts/{post_id}", cookies=admin_cookies)
    assert get_res.status_code == 404

    # 4. Undo delete
    undo_res = await async_client.post(f"/admin/content/posts/{post_id}/undo-delete", cookies=admin_cookies)
    assert undo_res.status_code == 200

    # Post is restored
    restored_res = await async_client.get(f"/admin/content/posts/{post_id}", cookies=admin_cookies)
    assert restored_res.status_code == 200
    assert restored_res.json()["id"] == post_id


@pytest.mark.asyncio
async def test_custom_collections_lifecycle(async_client, admin_cookies):
    # Create a dynamic collection definition (e.g. Lab Awards)
    coll_key = f"awards_{uuid4().hex[:4]}"
    def_payload = {
        "key": coll_key,
        "name": "Laboratory Awards",
        "singular_name": "Award",
        "fields": [
            {"key": "title", "label": "Title", "type": "text", "required": True},
            {"key": "year", "label": "Year", "type": "text", "required": True},
        ],
    }
    coll_res = await async_client.post("/admin/collections", json=def_payload, cookies=admin_cookies)
    assert coll_res.status_code == 201, coll_res.text
    coll_def = coll_res.json()
    assert coll_def["name"] == "Laboratory Awards"
    actual_key = coll_def["key"]

    # Add an item to this collection
    item_payload = {
        "values": {
            "title": "Best Networking Research Lab ITS 2025",
            "year": "2025",
        }
    }
    item_res = await async_client.post(f"/admin/collections/{actual_key}/items", json=item_payload, cookies=admin_cookies)
    assert item_res.status_code == 201, item_res.text
    item_data = item_res.json()
    assert item_data["values"]["title"] == "Best Networking Research Lab ITS 2025"

    # List items
    list_res = await async_client.get(f"/admin/collections/{actual_key}/items", cookies=admin_cookies)
    assert list_res.status_code == 200
    items = list_res.json()
    assert len(items) >= 1

    # Cleanup
    await async_client.delete(f"/admin/collections/{coll_def['id']}", cookies=admin_cookies)


@pytest.mark.asyncio
async def test_gsm_theme_token_lifecycle_and_wcag_contrast(async_client, admin_cookies):
    # 1. Read current theme
    theme_res = await async_client.get("/admin/theme", cookies=admin_cookies)
    assert theme_res.status_code == 200
    theme_data = theme_res.json()
    assert "published" in theme_data

    # 2. Save a theme draft
    draft_tokens = dict(theme_data["published"])
    draft_tokens["primary_color"] = "#223027"
    draft_tokens["emerald_color"] = "#5D8A6B"
    draft_tokens["accent_color"] = "#A8977B"
    draft_tokens["color_surface"] = "#FAF7F2"
    draft_tokens["color_body"] = "#1E2521"
    draft_tokens["color_tan_text"] = "#6E604B"

    save_draft_res = await async_client.put("/admin/theme/draft", json=draft_tokens, cookies=admin_cookies)
    assert save_draft_res.status_code == 200

    # 3. Publish theme draft
    publish_res = await async_client.post("/admin/theme/publish", cookies=admin_cookies)
    assert publish_res.status_code == 200
    assert "published" in publish_res.json()

    # 4. Verify WCAG contrast calculations
    report = theme_contrast_report(draft_tokens)
    assert len(report) >= 5
    for check in report:
        assert "ratio" in check
        assert "passes" in check
        assert isinstance(check["ratio"], float)
        assert check["ratio"] > 1.0  # valid contrast ratio
