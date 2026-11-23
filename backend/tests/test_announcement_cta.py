"""The announcement popup is CMS-driven and now carries an optional call to action.

Two contracts matter here:
1. Every announcement written before the CTA fields existed must keep the old popup
   behaviour (generic "Register now" button pointing at the events tab).
2. The CTA target is admin-supplied, so it must never be able to smuggle a
   `javascript:`/`data:` scheme into a rendered link.
"""

import pytest
from pydantic import ValidationError

from models.core import Announcement


def test_legacy_announcement_without_cta_keeps_defaults():
    legacy = Announcement(enabled=True, title="Cisco training", body="Room B-301.", version=3)
    assert legacy.url is None
    assert legacy.cta_label is None
    assert legacy.cta_label_id is None


@pytest.mark.parametrize(
    "url",
    ["/news", "/activity?tab=events", "https://labtnl.site/news", "mailto:lab@its.ac.id"],
)
def test_safe_cta_targets_are_accepted(url):
    assert Announcement(url=url).url == url


@pytest.mark.parametrize(
    "url",
    [
        "javascript:alert(1)",
        "JavaScript:alert(1)",
        "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
        "vbscript:msgbox(1)",
        "//evil.example.test/phish",
    ],
)
def test_unsafe_cta_targets_are_rejected(url):
    with pytest.raises(ValidationError):
        Announcement(url=url)


def test_blank_cta_target_normalises_to_none():
    assert Announcement(url="   ").url is None


async def test_settings_update_persists_cta_and_public_api_serves_it(async_client, admin_cookies):
    payload = {
        "announcement": {
            "enabled": True,
            "title": "Open House TNL 2026 registration is full",
            "title_id": "Kuota Open House TNL 2026 sudah penuh",
            "body": "Thank you for the enthusiasm.",
            "body_id": "Terima kasih atas antusiasmenya.",
            "cta_label": "Latest news",
            "cta_label_id": "Lihat berita",
            "url": "/news",
            "version": 1,
        }
    }
    res = await async_client.put("/admin/settings", json=payload, cookies=admin_cookies)
    assert res.status_code == 200, res.text

    public = await async_client.get("/public/settings")
    assert public.status_code == 200, public.text
    announcement = public.json()["announcement"]
    assert announcement["url"] == "/news"
    assert announcement["cta_label_id"] == "Lihat berita"
    assert announcement["cta_label"] == "Latest news"
    # The endpoint bumps the version so a dismissed popup reappears with the new copy.
    assert announcement["version"] >= 2


async def test_settings_update_rejects_a_dangerous_cta_target(async_client, admin_cookies):
    res = await async_client.put(
        "/admin/settings",
        json={"announcement": {"enabled": True, "url": "javascript:alert(1)"}},
        cookies=admin_cookies,
    )
    assert res.status_code == 422
