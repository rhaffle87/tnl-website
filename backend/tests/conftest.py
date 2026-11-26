"""Holistic pytest configuration and fixtures for TNL Studio backend.

ZERO PRODUCTION POLLUTION:
All tests run against an in-memory mongomock_motor client and ASGI TestClient.
Production MongoDB (CT 116 / 100.111.32.102) is NEVER connected to or modified.
"""

import asyncio
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

# Test-only signing value generated at runtime: never committed, never used in production.
os.environ.setdefault("UPLOAD_SIGNING_SECRET", "pytest-upload-" + uuid4().hex)

import httpx
import pytest
import pytest_asyncio
from mongomock_motor import AsyncMongoMockClient

# Ensure backend root is on sys.path
BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

# Global in-memory test database client
_MOCK_CLIENT = AsyncMongoMockClient()
_MOCK_DB = _MOCK_CLIENT["tnl_test_isolated"]

# Patch lib.db before any router imports
import lib.db  # noqa: E402
lib.db.client = _MOCK_CLIENT
lib.db.db = _MOCK_DB

# Import server and routers
from server import app  # noqa: E402
from starlette.testclient import TestClient  # noqa: E402
import lib.auth  # noqa: E402
import lib.settings  # noqa: E402
import lib.storage  # noqa: E402
import seed  # noqa: E402
from routers import (  # noqa: E402
    apiv1, auth, content, figma, google_auth, labphotos, media, public, pubimport, registrar, seo, siteadmin,
)

# Bind all module db references to the mock DB
for mod in (
    lib.auth, lib.settings, lib.db, seed,
    apiv1, auth, content, figma, google_auth, labphotos, media, public, pubimport, registrar, seo, siteadmin,
):
    setattr(mod, "db", _MOCK_DB)
    if hasattr(mod, "client"):
        setattr(mod, "client", _MOCK_CLIENT)

SEED_PASSWORD = os.environ.get("SEED_ADMIN_PASSWORD", "ChangeMe2026!")
ADMIN_EMAILS = [
    "admin@its.ac.id",
    os.environ.get("SEED_ADMIN_EMAIL", "admin@its.ac.id"),
    "rhaffle87@gmail.com",
]


@pytest.fixture(autouse=True)
def reset_rate_limits():
    """Clear in-memory rate limit buckets before every test."""
    if hasattr(lib.auth, "_buckets"):
        lib.auth._buckets.clear()


async def _init_test_database():
    """Seed test database with full baseline fixtures for comprehensive test coverage."""
    # Ensure indexes on mock db
    await lib.db.ensure_indexes()

    # Seed core data
    await seed.seed_settings()
    await seed.seed_admin()
    await seed.seed_pages()
    await seed.seed_members()
    await seed.seed_activities()
    await seed.seed_practicum()
    await seed.seed_equipment()
    await seed.seed_partners()
    await seed.seed_events()
    await seed.seed_publications()
    await seed.seed_posts()

    # Ensure all configured admin emails exist with super_admin role
    p_hash = lib.auth.hash_password(SEED_PASSWORD)
    for email in ADMIN_EMAILS:
        norm_email = email.strip().lower()
        existing = await _MOCK_DB.users.find_one({"email": norm_email})
        if not existing:
            await _MOCK_DB.users.insert_one({
                "id": str(uuid4()),
                "name": "TNL Test Administrator",
                "email": norm_email,
                "role": "super_admin",
                "divisions": [],
                "active": True,
                "password_hash": p_hash,
                "totp_secret": None,
                "totp_enabled": False,
                "invite_token": None,
                "created_at": datetime.now(timezone.utc),
                "last_login_at": None,
            })
        else:
            await _MOCK_DB.users.update_one(
                {"email": norm_email},
                {"$set": {"role": "super_admin", "active": True, "password_hash": p_hash}}
            )


# Initialize DB once per session
asyncio.run(_init_test_database())


@pytest.fixture(scope="session")
def mock_db():
    return _MOCK_DB


@pytest.fixture(scope="session")
def mock_client():
    return _MOCK_CLIENT


@pytest.fixture
def client():
    """In-process sync TestClient rooted at http://test/api."""
    with TestClient(app, base_url="http://test/api") as c:
        yield c


@pytest_asyncio.fixture
async def async_client():
    """In-process async httpx client rooted at http://test/api."""
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test/api") as ac:
        yield ac


@pytest_asyncio.fixture
async def admin_user():
    admin = await _MOCK_DB.users.find_one({"role": "super_admin", "active": True})
    return admin


@pytest_asyncio.fixture
async def admin_token(admin_user):
    token = await lib.auth.create_session(admin_user["id"])
    return token


@pytest_asyncio.fixture
async def admin_cookies(admin_token):
    return {"tnl_session": admin_token}


@pytest_asyncio.fixture
async def admin_headers(admin_token):
    return {"Cookie": f"tnl_session={admin_token}"}


@pytest.fixture
def temp_media_dir(tmp_path, monkeypatch):
    """Overrides MEDIA_DIR with a local isolated tmp_path."""
    test_media = tmp_path / "media"
    test_media.mkdir(parents=True, exist_ok=True)
    monkeypatch.setattr(lib.storage, "MEDIA_DIR", str(test_media))
    monkeypatch.setattr(media, "MEDIA_DIR", str(test_media))
    return test_media



