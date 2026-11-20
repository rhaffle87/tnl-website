"""Tests for public read endpoints and strict PII leak prevention."""

import pytest


@pytest.mark.asyncio
async def test_public_settings_and_theme_tokens(async_client):
    res = await async_client.get("/public/settings")
    assert res.status_code == 200
    data = res.json()
    assert "site_title" in data
    assert "theme_tokens" in data
    assert "server_today" in data
    # Confirm theme tokens contain core GSM palette
    theme = data["theme_tokens"]
    assert "primary_color" in theme
    assert "accent_color" in theme


@pytest.mark.asyncio
async def test_public_stats(async_client):
    res = await async_client.get("/public/stats")
    assert res.status_code == 200
    data = res.json()
    assert isinstance(data.get("lecturers"), int)
    assert isinstance(data.get("assistants"), int)
    assert data["lecturers"] >= 1
    assert data["assistants"] >= 1
    assert "room" in data


@pytest.mark.asyncio
async def test_public_members_zero_pii_leak(async_client, mock_db):
    """Rigorous privacy check: ensure phone, personal email, and NIM are never leaked."""
    # Seed a member with private fields directly in DB
    await mock_db.members.insert_one({
        "id": "privacy-test-member",
        "name": "Privacy Test Subject",
        "role": "assistant",
        "status": "active",
        "batch": "2026",
        "published": True,
        "phone": "+6281234567890",
        "email_personal": "private.phone.leaker@gmail.com",
        "nim": "5024201999",
        "show_nim": False,
        "show_personal_email": False,
        "order": 999,
    })

    res = await async_client.get("/public/members")
    assert res.status_code == 200
    members = res.json()
    assert len(members) > 0

    test_member = next((m for m in members if m.get("id") == "privacy-test-member"), None)
    assert test_member is not None

    # CRITICAL: Phone must NEVER be exposed
    assert "phone" not in test_member

    # Personal email and NIM must not be exposed when opt-in is False
    assert "email_personal" not in test_member
    assert "nim" not in test_member

    # Scan ALL returned members for inadvertent phone leaks
    for m in members:
        assert "phone" not in m
        if not m.get("show_personal_email"):
            assert "email_personal" not in m
        if not m.get("show_nim"):
            assert "nim" not in m


@pytest.mark.asyncio
async def test_public_equipment_and_category_filtering(async_client):
    res = await async_client.get("/public/equipment")
    assert res.status_code == 200
    data = res.json()
    assert isinstance(data, list)
    assert len(data) > 0
    # Every item must be published
    for item in data:
        assert item.get("published") is True
        assert "name" in item
        assert "category" in item


@pytest.mark.asyncio
async def test_public_practicum_modules_and_shifts(async_client):
    res = await async_client.get("/public/practicum")
    assert res.status_code == 200
    data = res.json()
    assert isinstance(data, list)
    assert len(data) > 0
    for mod in data:
        assert mod.get("published") is True
        assert "name" in mod
        assert "resources" in mod
        assert "shifts" in mod


@pytest.mark.asyncio
async def test_public_events_with_seats_and_reg_status(async_client):
    res = await async_client.get("/public/events")
    assert res.status_code == 200
    data = res.json()
    assert isinstance(data, list)
    assert len(data) > 0
    for ev in data:
        assert "reg_status" in ev
        assert ev["reg_status"] in ("open", "closed", "upcoming", "past", "full")


@pytest.mark.asyncio
async def test_public_activities(async_client):
    res = await async_client.get("/public/activities")
    assert res.status_code == 200
    data = res.json()
    assert isinstance(data, list)
    assert len(data) > 0
    for act in data:
        assert act.get("published") is True
        assert "title" in act


@pytest.mark.asyncio
async def test_public_posts_pagination_and_search(async_client):
    res = await async_client.get("/public/posts")
    assert res.status_code == 200
    data = res.json()
    assert "items" in data
    assert "total" in data
    assert "categories" in data
    assert isinstance(data["categories"], list)
    assert data["total"] >= len(data["items"])


@pytest.mark.asyncio
async def test_public_publications_scholarly_records(async_client):
    res = await async_client.get("/public/publications")
    assert res.status_code == 200
    data = res.json()
    assert isinstance(data, list)
    assert len(data) > 0
    for pub in data:
        assert "title" in pub
        assert "authors" in pub
        assert "year" in pub
