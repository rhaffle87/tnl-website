"""Regression tests for CMS publication, import and referential integrity boundaries."""

import asyncio
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from mongomock_motor import AsyncMongoMockClient

from lib import auth, db as database, settings
from lib.publishing import public_content_projection, public_page_projection, sanitize_html
from models.content import PageDoc, Post
from routers import content, figma, media, public, siteadmin

pytestmark = pytest.mark.asyncio


@pytest.fixture
def cms_db(monkeypatch):
    memory = AsyncMongoMockClient()["cms_regressions"]
    for module in (database, auth, settings, content, figma, media, public, siteadmin):
        monkeypatch.setattr(module, "db", memory)
    for module in (content, figma, media, siteadmin):
        monkeypatch.setattr(module, "audit", AsyncMock())
    return memory


async def session(db, role="editor", divisions=None):
    token = uuid4().hex
    await db.users.insert_one({"id": token, "email": f"{role}@cms.invalid", "active": True,
                               "role": role, "divisions": divisions or []})
    await db.sessions.insert_one({"token": token, "user_id": token,
                                  "expires_at": datetime.now(timezone.utc) + timedelta(hours=1)})
    return {"tnl_session": token}


async def page(db, **changes):
    doc = PageDoc(id=uuid4().hex, slug=uuid4().hex, title="Routing laboratory research",
                  blocks=[{"id": "original", "type": "rich_text", "props": {"html": "<p>Approved network research.</p>"}}]).model_dump()
    doc.update(changes)
    await db.pages.insert_one(doc)
    return doc


async def post(db, **changes):
    doc = Post(id=uuid4().hex, title="Network routing measurement workshop", slug=uuid4().hex,
               body="<p>Participants measure routing convergence using the laboratory network and compare the recorded observations.</p>").model_dump()
    doc.update(changes)
    await db.posts.insert_one(doc)
    return doc


async def test_public_projection_never_exposes_editorial_internal_or_hidden_content():
    doc = {"id": "p", "slug": "p", "status": "published", "title": "Page", "meta_description": "Public laboratory description", "saved_by": "private",
           "revisions": [{"saved_by": "private", "blocks": ["secret"]}], "draft": {"title": "Secret"},
           "blocks": [{"id": "hide", "type": "rich_text", "hidden": True, "props": {"html": "Hidden"}},
                      {"id": "show", "type": "html", "props": {"html": '<p onclick="evil()">Safe<img src="x" onerror="evil()"></p>'}}]}
    projected = public_page_projection(doc)
    assert not {"saved_by", "revisions", "draft"}.intersection(projected)
    assert projected["meta_description"] == doc["meta_description"]
    assert [b["id"] for b in projected["blocks"]] == ["show"]
    assert "onerror" not in str(projected) and "onclick" not in str(projected)
    assert "draft" not in public_content_projection(doc)
    assert doc["revisions"][0]["saved_by"] == "private"


@pytest.mark.parametrize("markup", [
    '<img src="javascript:alert(1)" onerror="evil()"><script>evil()</script>',
    '<svg><a xlink:href="javascript:evil()">bad</a></svg><p>Safe</p>',
    '<a href="jav&#x61;script:evil()">bad</a><div style="background:url(javascript:evil())" onmouseover="evil()">Safe</div>',
    '<math><mtext><table><mglyph><style><!--</style><img title="--><img src=x onerror=evil()>">',
])
async def test_parser_sanitizer_rejects_executable_markup(markup):
    cleaned = sanitize_html(markup)
    assert "javascript:" not in cleaned.lower()
    assert "onerror=" not in cleaned.lower() and "onmouseover=" not in cleaned.lower()
    assert "<script" not in cleaned.lower() and "<svg" not in cleaned.lower() and "style=" not in cleaned.lower()


async def test_contributor_body_only_edits_stage_draft_and_cannot_publish(async_client, cms_db):
    contributor = await session(cms_db, "contributor")
    editor = await session(cms_db)
    original = await post(cms_db, status="published")
    staged = await async_client.put(f"/admin/content/posts/{original['id']}", cookies=contributor,
                                    json={"body": "<p>Lorem ipsum</p>"})
    assert staged.status_code == 200
    assert staged.json()["status"] == "draft" and staged.json()["has_draft"] is True
    raw = await cms_db.posts.find_one({"id": original["id"]})
    assert raw["body"] == original["body"] and raw["status"] == "published"
    assert raw["draft"]["needs_review"] is True
    assert raw["revisions"][-1]["body"] == original["body"]
    denied = await async_client.put(f"/admin/content/posts/{original['id']}", cookies=contributor, json={"status": "published"})
    assert denied.status_code == 403
    blocked = await async_client.put(f"/admin/content/posts/{original['id']}", cookies=editor, json={"status": "published"})
    assert blocked.status_code == 422
    approved = await async_client.put(f"/admin/content/posts/{original['id']}", cookies=editor,
                                      json={"status": "published", "body": original["body"] + "<p>Editor approved.</p>"})
    assert approved.status_code == 200 and approved.json()["has_draft"] is False
    assert "Editor approved" in (await cms_db.posts.find_one({"id": original["id"]}))["body"]


async def test_page_final_title_gate_and_live_edit_snapshot_preview_restore(async_client, cms_db):
    editor, viewer = await session(cms_db), await session(cms_db, "viewer")
    original = await page(cms_db, status="published")
    url = f"/admin/pages/{original['id']}"
    blocked = await async_client.patch(url, cookies=editor, json={"title": "Lorem ipsum", "status": "published"})
    assert blocked.status_code == 422
    staged = await async_client.patch(url + "/blocks/original", cookies=editor,
                                    json={"props": {"html": "<p>Lorem ipsum</p>"}})
    assert staged.status_code == 200 and staged.json()["has_draft"] is True
    stored = await cms_db.pages.find_one({"id": original["id"]})
    assert stored["blocks"] == original["blocks"]
    assert stored["revisions"][-1]["blocks"] == original["blocks"]
    assert (await async_client.get(url + "/preview")).status_code == 401
    assert (await async_client.get(url + "/preview", cookies=viewer)).status_code == 403
    preview = await async_client.get(url + "/preview", cookies=editor)
    assert preview.status_code == 200 and "no-store" in preview.headers["cache-control"]
    assert "Lorem ipsum" in str(preview.json()["blocks"])
    assert "revisions" not in preview.json()
    assert (await async_client.patch(url, cookies=editor, json={"status": "published"})).status_code == 422
    revision = stored["revisions"][-1]["id"]
    restored = await async_client.post(url + f"/revisions/{revision}/restore", cookies=editor)
    assert restored.status_code == 200 and restored.json()["has_draft"] is True
    assert (await async_client.patch(url, cookies=editor, json={"status": "published"})).status_code == 200


async def test_bulk_publish_uses_pending_final_content_and_contributor_cannot_unpublish(async_client, cms_db):
    editor, contributor = await session(cms_db), await session(cms_db, "contributor")
    original = await post(cms_db, status="published")
    await async_client.put(f"/admin/content/posts/{original['id']}", cookies=contributor, json={"title": "Lorem ipsum"})
    payload = {"ids": [original["id"]], "action": "publish"}
    failed = await async_client.post("/admin/content/posts/bulk", cookies=editor, json=payload)
    assert failed.status_code == 200 and failed.json()["updated"] == 0 and len(failed.json()["skipped"]) == 1
    assert (await cms_db.posts.find_one({"id": original["id"]}))["title"] == original["title"]
    denied = await async_client.post("/admin/content/posts/bulk", cookies=contributor, json={**payload, "action": "unpublish"})
    assert denied.status_code == 403


async def test_figma_cannot_overwrite_system_and_does_not_replace_live_page(async_client, cms_db):
    editor = await session(cms_db)
    system = await page(cms_db, slug="home", status="published", is_system=True)
    denied = await async_client.post("/admin/figma/sync-frame", cookies=editor, json={"title": "Import", "slug": "home"})
    assert denied.status_code == 409
    assert (await cms_db.pages.find_one({"id": system["id"]}))["is_system"] is True
    original = await page(cms_db, status="published")
    synced = await async_client.post("/admin/figma/sync-frame", cookies=editor,
                                     json={"title": "Imported laboratory showcase", "slug": original["slug"], "subheading": "Measurements", "cards": [{"title": "Routing", "description": "Convergence measurements", "link": "/activity"}]})
    assert synced.status_code == 200
    stored = await cms_db.pages.find_one({"id": original["id"]})
    assert stored["blocks"] == original["blocks"] and stored["status"] == "published"
    assert stored["draft"]["blocks"][0]["props"]["description"] == "Measurements"
    assert stored["draft"]["blocks"][1]["props"]["tiles"][0]["href"] == "/activity"
    assert stored["revisions"][-1]["blocks"] == original["blocks"]


async def test_figma_explicit_html_is_sanitized_and_invalid_schemas_rejected(async_client, cms_db):
    editor = await session(cms_db)
    payload = {"title": "Laboratory workshop", "slug": "safe-import", "blocks": [{"type": "rich_text", "props": {"html": '<p>Measurements<img src="/api/media-files/a.webp" alt="Router" onerror="evil()"></p><script>evil()</script>'}}]}
    synced = await async_client.post("/admin/figma/sync-frame", cookies=editor, json=payload)
    assert synced.status_code == 200
    page_id = synced.json()["page_id"]
    stored = await cms_db.pages.find_one({"id": page_id})
    assert "onerror" not in str(stored["blocks"]) and "<script" not in str(stored["blocks"])
    published = await async_client.patch(f"/admin/pages/{page_id}", cookies=editor, json={"status": "published"})
    assert published.status_code == 200
    public_page = await async_client.get("/public/pages/safe-import")
    assert public_page.status_code == 200
    assert "onerror" not in str(public_page.json()) and "<script" not in str(public_page.json())
    assert "revisions" not in public_page.json() and "draft" not in public_page.json()
    for bad in [{"type": "unknown", "props": {}}, {"type": "feature_tiles", "props": {"tiles": "[object Object]"}},
                {"type": "image", "props": {"url": "javascript:evil()"}}]:
        rejected = await async_client.post("/admin/figma/sync-frame", cookies=editor, json={**payload, "blocks": [bad]})
        assert rejected.status_code == 422


@pytest.mark.parametrize("collection,document", [
    ("pages", {"blocks": [{"type": "image", "props": {"url": "/api/media-files/pages/photo-480.webp"}}]}),
    ("pages", {"revisions": [{"blocks": [{"props": {"html": '<img src="/api/media-files/pages/photo.webp" alt="Router">'}}]}]}),
    ("posts", {"draft": {"body": '<p><img src="/api/media-files/pages/photo-960.webp?size=1"></p>'}}),
    ("projects", {"images": [{"url": "/api/media-files/pages/photo.webp"}]}),
    ("practicum", {"resources": [{"file_url": "/api/media-files/pages/photo.webp"}]}),
    ("collection_items", {"values": {"cover": "/api/media-files/pages/photo.webp"}}),
    ("saved_blocks", {"block": {"props": {"url": "/api/media-files/pages/photo.webp"}}}),
])
async def test_nested_derivative_and_revision_media_references_protect_delete(async_client, cms_db, monkeypatch, collection, document):
    editor = await session(cms_db)
    asset = {"id": "protected", "url": "/api/media-files/pages/photo.png", "key": "pages/photo.png", "webp_url": "/api/media-files/pages/photo.webp"}
    await cms_db.media.insert_one(asset)
    await cms_db[collection].insert_one({"id": uuid4().hex, **document})
    deleted = []
    monkeypatch.setattr(media, "delete_object", lambda key: deleted.append(key))
    assert await media.usage_count(asset["url"]) == 1
    response = await async_client.delete("/admin/media/protected", cookies=editor)
    assert response.status_code == 400 and not deleted
    assert await cms_db.media.find_one({"id": "protected"})


async def test_collection_full_crud_types_and_editorial_permissions(async_client, cms_db):
    editor, contributor = await session(cms_db), await session(cms_db, "contributor")
    payload = {"name": "Awards", "fields": [{"key": "title", "type": "text", "required": True}, {"key": "year", "type": "number"}], "template": "cards"}
    assert (await async_client.post("/admin/collections", cookies=contributor, json=payload)).status_code == 403
    created = await async_client.post("/admin/collections", cookies=editor, json=payload)
    assert created.status_code == 201
    key, definition_id = created.json()["key"], created.json()["id"]
    url = f"/admin/collections/{key}/items"
    draft = await async_client.post(url, cookies=contributor, json={"values": {"title": "Network research award", "year": 2026}, "status": "published"})
    assert draft.status_code == 201 and draft.json()["status"] == "draft"
    item_url = url + "/" + draft.json()["id"]
    assert (await async_client.put(item_url, cookies=contributor, json={"status": "published"})).status_code == 403
    assert (await async_client.put(item_url, cookies=editor, json={"status": "published"})).status_code == 200
    changed = await async_client.patch(item_url, cookies=contributor, json={"values": {"title": "Updated network award", "year": 2026}})
    assert changed.status_code == 200 and changed.json()["has_draft"] is True
    stored = await cms_db.collection_items.find_one({"id": draft.json()["id"]})
    assert stored["values"]["title"] == "Network research award"
    await async_client.patch(item_url, cookies=contributor, json={"values": {"title": "Lorem ipsum"}})
    assert (await async_client.patch(item_url, cookies=editor, json={"status": "published"})).status_code == 422
    assert (await cms_db.collection_items.find_one({"id": draft.json()["id"]}))["values"]["title"] == "Network research award"
    assert (await async_client.put(item_url, cookies=editor, json={"values": {"title": "Network", "year": "wrong"}})).status_code == 422
    assert (await async_client.get(item_url, cookies=editor)).status_code == 200
    renamed = await async_client.patch(f"/admin/collections/{definition_id}", cookies=editor, json={"name": "Research awards", "template": "table"})
    assert renamed.status_code == 200
    assert (await async_client.delete(item_url, cookies=editor)).status_code == 200
    assert (await async_client.delete(f"/admin/collections/{definition_id}", cookies=editor)).status_code == 200


async def test_reusable_block_crud_apply_uses_independent_ids_and_stages_live(async_client, cms_db):
    editor = await session(cms_db)
    original = await page(cms_db, status="published")
    created = await async_client.post("/admin/saved-blocks", cookies=editor,
                                     json={"name": "Research copy", "block": {"type": "rich_text", "props": {"html": '<p onclick="evil()">Reusable laboratory description.</p>'}}})
    assert created.status_code == 201 and "onclick" not in str(created.json())
    block_id = created.json()["id"]
    assert (await async_client.put(f"/admin/saved-blocks/{block_id}", cookies=editor, json={"name": "Lab description"})).status_code == 200
    applied = await async_client.post(f"/admin/pages/{original['id']}/saved-blocks/{block_id}", cookies=editor)
    assert applied.status_code == 200 and applied.json()["has_draft"] is True
    assert len(applied.json()["blocks"]) == 2
    assert applied.json()["blocks"][-1]["id"] != created.json()["block"]["id"]
    assert len((await cms_db.pages.find_one({"id": original["id"]}))["blocks"]) == 1
    assert (await async_client.delete(f"/admin/saved-blocks/{block_id}", cookies=editor)).status_code == 200


async def test_event_editor_can_roundtrip_private_link_but_viewer_cannot_read(async_client, cms_db):
    editor, viewer = await session(cms_db, divisions=["event"]), await session(cms_db, "viewer")
    from models.content import Event
    event = Event(id="event-private", title="Laboratory routing workshop", whatsapp_group_url="https://chat.whatsapp.com/example").model_dump()
    await cms_db.events.insert_one(event)
    url = "/admin/content/events/event-private"
    readable = await async_client.get(url, cookies=editor)
    assert readable.json()["whatsapp_group_url"] == event["whatsapp_group_url"]
    assert "whatsapp_group_url" not in (await async_client.get(url, cookies=viewer)).json()
    saved = await async_client.put(url, cookies=editor, json={"title": "Updated routing workshop", "whatsapp_group_url": readable.json()["whatsapp_group_url"]})
    assert saved.status_code == 200
    assert (await cms_db.events.find_one({"id": event["id"]}))["whatsapp_group_url"] == event["whatsapp_group_url"]


async def test_theme_contrast_preview_and_atomic_publish_latest_tokens(async_client, cms_db):
    editor = await session(cms_db)
    theme = (await async_client.get("/admin/theme", cookies=editor)).json()["draft"]
    updated = {**theme, "gsm_edition_label": "Pending laboratory theme"}
    preview = await async_client.post("/admin/theme/contrast", cookies=editor, json=updated)
    assert preview.status_code == 200
    assert (await cms_db.settings.find_one({"id": "settings"}))["theme_tokens"]["gsm_edition_label"] != updated["gsm_edition_label"]
    published = await async_client.post("/admin/theme/publish", cookies=editor, json=updated)
    assert published.status_code == 200 and published.json()["published"]["gsm_edition_label"] == updated["gsm_edition_label"]
    invalid = await async_client.put("/admin/theme/draft", cookies=editor, json={**updated, "color_body": "#wrong!"})
    assert invalid.status_code == 422


async def test_figma_tokens_never_publish_theme_directly(async_client, cms_db):
    editor = await session(cms_db)
    await async_client.get("/admin/theme", cookies=editor)
    before = (await cms_db.settings.find_one({"id": "settings"}))["theme_tokens"]
    imported = await async_client.post("/admin/figma/import-tokens", cookies=editor, json={"primary_color": "#112233"})
    assert imported.status_code == 200
    current = await cms_db.settings.find_one({"id": "settings"})
    assert current["theme_tokens"] == before and current["theme"]["draft"]["primary_color"] == "#112233"


async def test_partial_patch_boolean_resource_preserves_live_and_needs_review_queue(async_client, cms_db):
    from models.content import Member
    editor, contributor = await session(cms_db), await session(cms_db, "contributor")
    member = Member(id="member-live", name="Laboratory Researcher", published=True).model_dump()
    await cms_db.members.insert_one(member)
    response = await async_client.patch("/admin/content/members/member-live", cookies=contributor, json={"bio": "Lorem ipsum"})
    assert response.status_code == 200 and response.json()["published"] is False
    stored = await cms_db.members.find_one({"id": member["id"]})
    assert stored["published"] is True and stored["status"] == "active" and stored["bio"] == member["bio"]
    for status in ("draft", "needs_review"):
        listed = await async_client.get(f"/admin/content/members?status={status}&q=Lorem", cookies=editor)
        # Search covers configured fields, not biography. A plain queue still includes the pending record.
        assert listed.status_code == 200
        listed = await async_client.get(f"/admin/content/members?status={status}", cookies=editor)
        assert listed.json()["total"] == 1
    dashboard = await async_client.get("/admin/dashboard", cookies=editor)
    assert dashboard.json()["needs_review"] == 1


async def test_content_revision_restore_stages_previous_version_and_publish_uses_draft(async_client, cms_db):
    editor = await session(cms_db)
    original = await post(cms_db, status="published")
    url = f"/admin/content/posts/{original['id']}"
    changed = await async_client.patch(url, cookies=editor, json={"title": "Updated routing workshop", "save_as_draft": True})
    assert changed.status_code == 200
    revisions = (await async_client.get(url + "/revisions", cookies=editor)).json()["items"]
    restored = await async_client.post(url + f"/revisions/{revisions[0]['id']}/restore", cookies=editor)
    assert restored.status_code == 200 and restored.json()["title"] == original["title"]
    assert restored.json()["has_draft"] is True
    approved = await async_client.post("/admin/content/posts/bulk", cookies=editor, json={"ids": [original["id"]], "action": "publish"})
    assert approved.status_code == 200 and approved.json()["updated"] == 1
    assert "draft" not in await cms_db.posts.find_one({"id": original["id"]})


async def test_collection_partial_values_and_division_scope(async_client, cms_db):
    editor = await session(cms_db)
    outsider = await session(cms_db, "contributor", divisions=["media"])
    created = await async_client.post("/admin/collections", cookies=editor,
                                     json={"name": "Academic resources", "divisions": ["academics"], "fields": [{"key": "title", "type": "text", "required": True}, {"key": "year", "type": "number"}]})
    key = created.json()["key"]
    url = f"/admin/collections/{key}/items"
    assert (await async_client.post(url, cookies=outsider, json={"values": {"title": "Network experiment"}})).status_code == 403
    item = (await async_client.post(url, cookies=editor, json={"values": {"title": "Network experiment", "year": 2026}})).json()
    patched = await async_client.patch(url + "/" + item["id"], cookies=editor, json={"values": {"year": 2027}})
    assert patched.status_code == 200 and patched.json()["values"] == {"title": "Network experiment", "year": 2027}


@pytest.mark.parametrize("props", [{"title": {"html": "bad"}}, {"tiles": ["not an object"]}, {"images": "[object Object]"}, {"url": "https://[broken"}, {"url": "/%5C%5Cevil.invalid"}])
async def test_block_schema_invalid_props_fail_closed(async_client, cms_db, props):
    editor = await session(cms_db)
    original = await page(cms_db)
    response = await async_client.post(f"/admin/pages/{original['id']}/blocks", cookies=editor, json={"type": "image", "props": props})
    assert response.status_code == 422


async def test_event_capacity_change_checked_only_when_publishing(async_client, cms_db):
    from models.content import Event
    editor = await session(cms_db)
    event = Event(id="capacity-event", title="Network routing workshop", capacity=2, status="published").model_dump()
    await cms_db.events.insert_one(event)
    await cms_db.workflow_events.insert_one({"_id": event["id"], "version": 1, "capacity": 2,
                                             "entries": [{"id": "r1", "status": "accepted", "eligible": True}, {"id": "r2", "status": "accepted", "eligible": True}]})
    url = f"/admin/content/events/{event['id']}"
    staged = await async_client.patch(url, cookies=editor, json={"capacity": 1, "save_as_draft": True})
    assert staged.status_code == 200
    assert (await cms_db.workflow_events.find_one({"_id": event["id"]}))["capacity"] == 2
    published = await async_client.patch(url, cookies=editor, json={"status": "published"})
    assert published.status_code == 409
    assert (await cms_db.events.find_one({"id": event["id"]}))["capacity"] == 2


async def test_stale_editorial_compare_and_swap_cannot_overwrite_newer_save(cms_db):
    from fastapi import HTTPException
    from lib.publishing import editorial_document, replace_editorial
    original = await post(cms_db)
    first = editorial_document(original, {**original, "title": "First editor version"}, "first@cms.invalid")
    second = editorial_document(original, {**original, "title": "Stale editor version"}, "second@cms.invalid")
    await replace_editorial(cms_db.posts, original, first)
    with pytest.raises(HTTPException) as exc:
        await replace_editorial(cms_db.posts, original, second)
    assert exc.value.status_code == 409
    assert (await cms_db.posts.find_one({"id": original["id"]}))["title"] == "First editor version"


async def test_page_metadata_create_stage_publish_and_restore(async_client, cms_db):
    editor = await session(cms_db)
    created = await async_client.post("/admin/pages", cookies=editor,
                                     json={"slug": "routing-measurements", "title": "Routing measurements", "meta_description": "Laboratory routing measurements", "meta_description_id": "Pengukuran perutean laboratorium"})
    assert created.status_code == 201
    page_id = created.json()["id"]
    url = f"/admin/pages/{page_id}"
    await async_client.post(url + "/blocks", cookies=editor, json={"type": "rich_text", "props": {"html": "<p>Laboratory network measurements.</p>"}})
    assert (await async_client.patch(url, cookies=editor, json={"status": "published"})).status_code == 200
    changed = await async_client.patch(url, cookies=editor, json={"meta_description": "Updated laboratory description"})
    assert changed.status_code == 200 and changed.json()["has_draft"] is True
    stored = await cms_db.pages.find_one({"id": page_id})
    assert public_page_projection(stored)["meta_description"] == "Laboratory routing measurements"
    last_revision = stored["revisions"][-1]["id"]
    restored = await async_client.post(url + f"/revisions/{last_revision}/restore", cookies=editor)
    assert restored.status_code == 200 and restored.json()["meta_description"] == "Laboratory routing measurements"


async def test_seeded_public_page_projection_keeps_every_visible_shipped_block(mock_db):
    pages = await mock_db.pages.find({"is_system": True}).to_list(100)
    assert pages
    for stored in pages:
        visible = [b for b in stored.get("blocks", []) if not b.get("hidden")]
        projected = public_page_projection(stored)
        assert [b["id"] for b in projected["blocks"]] == [b["id"] for b in visible], stored["slug"]


async def capacity_fixture(db):
    from models.content import Event
    event = Event(id="publish-capacity", title="Routing workshop", status="published", capacity=10).model_dump()
    event["_cms_version"] = 0
    await db.events.insert_one(event)
    await db.workflow_events.insert_one({"_id": event["id"], "version": 0, "capacity": 10,
                                         "entries": [{"id": f"existing-{i}", "status": "accepted", "eligible": True} for i in range(4)]})
    return event


def capacity_candidate(event, capacity):
    from lib.publishing import editorial_document
    return editorial_document(event, {**event, "capacity": capacity}, "editor@cms.invalid", publish=True)


async def capacity_admissions(db, event_id, prefix, count):
    from lib.registration_workflow import change_registration
    rows = [{"id": f"{prefix}-{i}", "event_id": event_id, "status": "processing", "uploads_ready": True,
             "created_at": datetime.now(timezone.utc)} for i in range(count)]
    await db.registrations.insert_many(rows)
    return await asyncio.gather(*(change_registration(event_id, row["id"], add=True) for row in rows))


async def test_two_publishers_cannot_overwrite_pending_admission_constraint(cms_db, monkeypatch):
    from fastapi import HTTPException
    from lib import registration_workflow as workflow
    event = await capacity_fixture(cms_db)
    prepared, commit = asyncio.Event(), asyncio.Event()
    prepare = workflow._prepare_event_publication

    async def pause_after_prepare(event_id, publication):
        await prepare(event_id, publication)
        prepared.set()
        await commit.wait()

    monkeypatch.setattr(workflow, "_prepare_event_publication", pause_after_prepare)
    publisher_a = asyncio.create_task(content._persist_content("events", event, capacity_candidate(event, 5), publish=True))
    await asyncio.wait_for(prepared.wait(), 5)
    try:
        with pytest.raises(HTTPException) as second:
            await content._persist_content("events", event, capacity_candidate(event, 8), publish=True)
        assert second.value.status_code == 409
        with pytest.raises(HTTPException) as setter:
            await workflow.set_event_capacity(event["id"], 8)
        assert setter.value.status_code == 409
        for operation in (
            content._persist_content("events", event, capacity_candidate(event, 10)),
            content._delete_content("events", event),
        ):
            with pytest.raises(HTTPException) as busy:
                await operation
            assert busy.value.status_code == 409
        await capacity_admissions(cms_db, event["id"], "new", 4)
        pending = await cms_db.workflow_events.find_one({"_id": event["id"]})
        assert pending["capacity_transition"]["capacity"] == 5
        assert sum(e["status"] in workflow.OCCUPIED for e in pending["entries"]) == 5
    finally:
        commit.set()
        await asyncio.wait_for(publisher_a, 5)
    live = await cms_db.events.find_one({"id": event["id"]})
    ledger = await workflow.event_ledger(event["id"])
    assert live["capacity"] == ledger["capacity"] == 5
    assert "_capacity_publication" not in live and "capacity_transition" not in ledger
    assert sum(e["status"] in workflow.OCCUPIED for e in ledger["entries"]) == 5
    assert sum(e["status"] == "waitlisted" for e in ledger["entries"]) == 3


async def test_expired_publisher_is_fenced_before_release_and_cannot_rollback_successor(cms_db, monkeypatch):
    from fastapi import HTTPException
    from lib import registration_workflow as workflow
    event = await capacity_fixture(cms_db)
    a_ready, b_ready, a_commit, b_commit = (asyncio.Event() for _ in range(4))
    prepare = workflow._prepare_event_publication

    async def pause_prepared(event_id, publication):
        await prepare(event_id, publication)
        (a_ready if publication["capacity"] == 5 else b_ready).set()
        await (a_commit if publication["capacity"] == 5 else b_commit).wait()

    monkeypatch.setattr(workflow, "_prepare_event_publication", pause_prepared)
    a = asyncio.create_task(content._persist_content("events", event, capacity_candidate(event, 5), publish=True))
    await asyncio.wait_for(a_ready.wait(), 5)
    reservation = (await cms_db.events.find_one({"id": event["id"]}))["_capacity_publication"]
    assert await workflow.recover_event_publication(event["id"], now=reservation["expires_at"].replace(tzinfo=timezone.utc) + timedelta(seconds=1))
    successor = await cms_db.events.find_one({"id": event["id"]})
    assert successor["capacity"] == 10 and successor["_cms_version"] > reservation["version"]
    b = asyncio.create_task(content._persist_content("events", successor, capacity_candidate(successor, 8), publish=True))
    await asyncio.wait_for(b_ready.wait(), 5)
    successor_token = (await cms_db.workflow_events.find_one({"_id": event["id"]}))["capacity_transition"]["token"]
    a_commit.set()
    with pytest.raises(HTTPException) as stale:
        await asyncio.wait_for(a, 5)
    assert stale.value.status_code == 409
    pending = await cms_db.workflow_events.find_one({"_id": event["id"]})
    assert pending["capacity_transition"]["token"] == successor_token
    assert pending["capacity_transition"]["capacity"] == 8
    await capacity_admissions(cms_db, event["id"], "after-recovery", 6)
    b_commit.set()
    await asyncio.wait_for(b, 5)
    live, ledger = await cms_db.events.find_one({"id": event["id"]}), await workflow.event_ledger(event["id"])
    assert live["capacity"] == ledger["capacity"] == 8
    assert sum(e["status"] in workflow.OCCUPIED for e in ledger["entries"]) == 8


@pytest.mark.parametrize("crash_phase", ["before_constraint", "after_constraint", "after_commit"])
async def test_crashed_publication_worker_recovers_without_blind_capacity_rollback(cms_db, monkeypatch, crash_phase):
    from lib import registration_workflow as workflow
    event = await capacity_fixture(cms_db)
    prepare, finish = workflow._prepare_event_publication, workflow._finish_event_publication

    async def crash_prepare(event_id, publication):
        if crash_phase == "after_constraint":
            await prepare(event_id, publication)
        raise asyncio.CancelledError()

    async def crash_finish(_event):
        raise asyncio.CancelledError()

    monkeypatch.setattr(workflow, "_prepare_event_publication", prepare if crash_phase == "after_commit" else crash_prepare)
    monkeypatch.setattr(workflow, "_finish_event_publication", crash_finish if crash_phase == "after_commit" else finish)
    with pytest.raises(asyncio.CancelledError):
        await content._persist_content("events", event, capacity_candidate(event, 5), publish=True)
    interrupted = await cms_db.events.find_one({"id": event["id"]})
    token = interrupted["_capacity_publication"]["token"]
    if crash_phase != "after_commit":
        await cms_db.events.update_one({"id": event["id"], "_capacity_publication.token": token},
                                      {"$set": {"_capacity_publication.expires_at": datetime.now(timezone.utc) - timedelta(seconds=1)}})
    monkeypatch.setattr(workflow, "_prepare_event_publication", prepare)
    monkeypatch.setattr(workflow, "_finish_event_publication", finish)
    await workflow.reconcile_registrations()
    live, ledger = await cms_db.events.find_one({"id": event["id"]}), await workflow.event_ledger(event["id"])
    assert "_capacity_publication" not in live and "capacity_transition" not in ledger
    assert live["capacity"] == ledger["capacity"] == (5 if crash_phase == "after_commit" else 10)
    assert live["_cms_version"] > interrupted["_cms_version"]
    assert not await workflow.recover_event_publication(event["id"])
    delayed = await cms_db.events.replace_one({"id": event["id"], "_cms_version": interrupted["_capacity_publication"]["version"],
                                               "_capacity_publication.token": token, "_capacity_publication.state": "preparing"},
                                              capacity_candidate(event, 5))
    assert delayed.matched_count == 0


async def test_recovery_cannot_remove_constraint_installed_after_its_old_event_snapshot(cms_db, monkeypatch):
    from lib import registration_workflow as workflow
    event = await capacity_fixture(cms_db)
    stale_read, resume_recovery, prepared, commit = (asyncio.Event() for _ in range(4))
    collection_type = type(cms_db.events)
    find_one = collection_type.find_one
    prepare = workflow._prepare_event_publication

    async def pause_event_snapshot(collection, *args, **kwargs):
        result = await find_one(collection, *args, **kwargs)
        if collection.name == "events" and asyncio.current_task().get_name() == "stale-recovery" and not stale_read.is_set():
            stale_read.set()
            await resume_recovery.wait()
        return result

    async def pause_prepared(event_id, publication):
        await prepare(event_id, publication)
        prepared.set()
        await commit.wait()

    monkeypatch.setattr(collection_type, "find_one", pause_event_snapshot)
    monkeypatch.setattr(workflow, "_prepare_event_publication", pause_prepared)
    recovery = asyncio.create_task(workflow.recover_event_publication(event["id"]), name="stale-recovery")
    await asyncio.wait_for(stale_read.wait(), 5)
    publisher = asyncio.create_task(content._persist_content("events", event, capacity_candidate(event, 5), publish=True))
    await asyncio.wait_for(prepared.wait(), 5)
    resume_recovery.set()
    await asyncio.wait_for(recovery, 5)
    pending = await cms_db.workflow_events.find_one({"_id": event["id"]})
    assert pending["capacity_transition"]["capacity"] == 5
    await capacity_admissions(cms_db, event["id"], "stale-read", 4)
    commit.set()
    await asyncio.wait_for(publisher, 5)
    ledger = await workflow.event_ledger(event["id"])
    assert sum(e["status"] in workflow.OCCUPIED for e in ledger["entries"]) == 5


async def test_unpublish_republish_cannot_bypass_occupied_capacity_gate(async_client, cms_db):
    from models.content import Event
    editor = await session(cms_db)
    event = Event(id="republish-capacity", title="Laboratory routing workshop", capacity=2, status="published").model_dump()
    await cms_db.events.insert_one(event)
    await cms_db.workflow_events.insert_one({"_id": event["id"], "version": 0, "capacity": 2,
                                             "entries": [{"id": f"r{i}", "status": "accepted", "eligible": True} for i in range(2)]})
    url = f"/admin/content/events/{event['id']}"
    assert (await async_client.patch(url, cookies=editor, json={"capacity": 1, "save_as_draft": True})).status_code == 200
    assert (await async_client.patch(url, cookies=editor, json={"status": "draft"})).status_code == 200
    assert (await cms_db.events.find_one({"id": event["id"]}))["capacity"] == 1
    assert (await async_client.patch(url, cookies=editor, json={"status": "published"})).status_code == 409
    assert (await cms_db.events.find_one({"id": event["id"]}))["status"] == "draft"
    assert (await cms_db.workflow_events.find_one({"_id": event["id"]}))["capacity"] == 2


@pytest.mark.parametrize("remove", [True, False])
async def test_missing_entry_erasure_tombstone_fences_delayed_admission(cms_db, monkeypatch, remove):
    from fastapi import HTTPException
    from lib import registration_workflow as workflow
    await cms_db.events.insert_one({"id": "erasure-race", "capacity": 1, "status": "published"})
    await workflow.event_ledger("erasure-race")
    await cms_db.registrations.insert_one({"id": "erased-id", "event_id": "erasure-race", "status": "processing",
                                           "uploads_ready": True, "created_at": datetime.now(timezone.utc)})
    before_cas, resume = asyncio.Event(), asyncio.Event()
    collection_type = type(cms_db.workflow_events)
    update_one = collection_type.update_one

    async def pause_admission(collection, *args, **kwargs):
        if collection.name == "workflow_events" and asyncio.current_task().get_name() == "late-admission" and not before_cas.is_set():
            before_cas.set()
            await resume.wait()
        return await update_one(collection, *args, **kwargs)

    monkeypatch.setattr(collection_type, "update_one", pause_admission)
    admission = asyncio.create_task(workflow.change_registration("erasure-race", "erased-id", add=True), name="late-admission")
    await asyncio.wait_for(before_cas.wait(), 5)
    await workflow.change_registration("erasure-race", "erased-id", remove=remove, eligible=False)
    if remove:
        await cms_db.registrations.delete_one({"id": "erased-id"})
    else:
        await cms_db.registrations.update_one({"id": "erased-id"}, {"$set": {"anonymized": True, "uploads_ready": False}})
    resume.set()
    with pytest.raises(HTTPException) as erased:
        await asyncio.wait_for(admission, 5)
    assert erased.value.status_code == 409
    ledger = await workflow.event_ledger("erasure-race")
    assert ledger["entries"] == [] and ledger["cancelled_ids"] == ["erased-id"]
    with pytest.raises(HTTPException) as retry:
        await workflow.change_registration("erasure-race", "erased-id", add=True)
    assert retry.value.status_code == 409


@pytest.mark.parametrize("row", [None, {"uploads_ready": False}, {"anonymized": True}, {"privacy_pending": True}])
async def test_admission_requires_existing_ready_non_erased_registration(cms_db, row):
    from fastapi import HTTPException
    from lib import registration_workflow as workflow
    await cms_db.events.insert_one({"id": "eligible", "capacity": 1})
    if row is not None:
        await cms_db.registrations.insert_one({"id": "not-ready", "event_id": "eligible", "status": "processing", **row})
    with pytest.raises(HTTPException) as refused:
        await workflow.change_registration("eligible", "not-ready", add=True)
    assert refused.value.status_code == 409
    assert not (await workflow.event_ledger("eligible"))["entries"]


async def test_reconcile_fairly_repairs_ledgers_beyond_first_batch(cms_db):
    from lib import registration_workflow as workflow
    await cms_db.events.insert_many([{"id": f"fair-{i:03}", "capacity": 1} for i in range(101)])
    await cms_db.workflow_events.insert_many([{"_id": f"fair-{i:03}", "version": 1, "capacity": 1,
        "entries": [{"id": "last-row", "status": "accepted", "eligible": True}] if i == 100 else []} for i in range(101)])
    await cms_db.registrations.insert_one({"id": "last-row", "event_id": "fair-100", "status": "pending"})
    await workflow.reconcile_registrations(limit=100)
    assert (await cms_db.registrations.find_one({"id": "last-row"}))["status"] == "pending"
    await workflow.reconcile_registrations(limit=100)
    assert (await cms_db.registrations.find_one({"id": "last-row"}))["status"] == "accepted"
    assert (await cms_db.workflow_events.find_one({"_id": "fair-100"})).get("reconciled_at")


async def test_cancelled_acceptance_notification_can_be_reissued_but_not_delivered_or_expired(cms_db):
    from lib import registration_workflow as workflow
    await cms_db.outbox.create_index("id", unique=True)
    await cms_db.events.insert_one({"id": "notify", "title": "Routing workshop", "capacity": 1})
    await cms_db.registrations.insert_one({"id": "notify-row", "event_id": "notify", "status": "accepted",
        "email": "participant@cms.invalid", "created_at": datetime.now(timezone.utc)})
    ledger = await workflow.event_ledger("notify")
    await workflow.queue_registration_notifications(ledger)
    job_id = "registration:notify-row:accepted"
    await cms_db.outbox.update_one({"id": job_id}, {"$set": {"status": "cancelled"}, "$unset": {"payload": ""}})
    await workflow.queue_registration_notifications(ledger)
    reissued = await cms_db.outbox.find_one({"id": job_id})
    assert reissued["status"] == "queued" and reissued.get("payload")
    await cms_db.outbox.update_one({"id": job_id}, {"$set": {"status": "delivered"}})
    await workflow.queue_registration_notifications(ledger)
    assert (await cms_db.outbox.find_one({"id": job_id}))["status"] == "delivered"
    await cms_db.outbox.update_one({"id": job_id}, {"$set": {"status": "cancelled", "expires_at": datetime.now(timezone.utc) - timedelta(seconds=1)}})
    await workflow.queue_registration_notifications(ledger)
    assert (await cms_db.outbox.find_one({"id": job_id}))["status"] == "cancelled"


async def test_active_publishers_cannot_starve_expired_publication_recovery(cms_db):
    from lib import registration_workflow as workflow
    now = datetime.now(timezone.utc)
    active = [{"id": f"busy-{i:03}", "capacity": 10, "_cms_version": 1,
               "_capacity_publication": {"token": f"owner-{i}", "state": "preparing", "version": 1,
                   "capacity": 5, "expires_at": now + timedelta(minutes=5)}} for i in range(101)]
    expired = {"id": "crashed-after-active", "capacity": 10, "_cms_version": 1,
               "_capacity_publication": {"token": "expired-owner", "state": "preparing", "version": 1,
                   "capacity": 5, "expires_at": now - timedelta(seconds=1)}}
    await cms_db.events.insert_many([*active, expired])
    await cms_db.workflow_events.insert_many([{"_id": event["id"], "version": 1, "capacity": 10, "entries": [],
        "capacity_transition": event["_capacity_publication"]} for event in [*active, expired]])
    await workflow.reconcile_registrations(limit=100)
    recovered = await cms_db.events.find_one({"id": expired["id"]})
    assert "_capacity_publication" not in recovered and recovered["_cms_version"] == 2
    assert "capacity_transition" not in await cms_db.workflow_events.find_one({"_id": expired["id"]})
    assert (await cms_db.events.find_one({"id": active[0]["id"]}))["_capacity_publication"]["token"] == "owner-0"
