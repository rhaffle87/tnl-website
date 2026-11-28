"""Tests for auth & permissions, registration uniqueness, the block renderer
contract and the content quality gates. These hit the live uvicorn process."""

import os
import sys
import time
import uuid

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from lib.quality import normalize_phone, publish_blockers, run_scan, scan_social_reuse  # noqa: E402
from lib.sanitize import sanitize_html  # noqa: E402
from routers.siteadmin import _sanitize_props  # noqa: E402

ADMIN_EMAIL = os.environ.get("SEED_ADMIN_EMAIL", "rhaffle87@gmail.com")
ADMIN_PASSWORD = os.environ.get("SEED_ADMIN_PASSWORD", "TnlStudio2026!")


# Login is rate limited to 10 attempts / 5 min per account (a real protection we do not
# weaken for tests), so each worker process signs in once per account and reuses the cookie.
_SESSION_CACHE: dict[tuple[str, str], dict] = {}


def login(client, email=ADMIN_EMAIL, password=ADMIN_PASSWORD):
    key = (email, password)
    cached = _SESSION_CACHE.get(key)
    if cached:
        client.cookies.update(cached)
        return client.cookies
    res = client.post("/auth/login", json={"email": email, "password": password})
    assert res.status_code == 200, res.text
    _SESSION_CACHE[key] = dict(res.cookies)
    return res.cookies


# ---------------------------------------------------------------- auth & permissions
def test_admin_routes_require_sign_in(client):
    for path in ("/admin/dashboard", "/admin/users", "/admin/settings", "/admin/content/posts"):
        assert client.get(path).status_code == 401, path


def test_login_rejects_wrong_password(client):
    res = client.post("/auth/login", json={"email": ADMIN_EMAIL, "password": "definitely-wrong"})
    assert res.status_code == 401


def test_super_admin_can_read_dashboard_and_users(client):
    login(client)
    assert client.get("/admin/dashboard").status_code == 200
    assert client.get("/admin/users").status_code == 200


def test_viewer_cannot_create_content(client):
    login(client, "viewer@its.ac.id", "TnlStudio2026!")
    res = client.post("/admin/content/posts", json={"title": "Viewer attempt"})
    assert res.status_code == 403


def test_registrar_cannot_manage_users_but_can_read_registrations(client):
    login(client, "registrar@its.ac.id", "TnlStudio2026!")
    assert client.get("/admin/users").status_code == 403
    assert client.get("/admin/registrations").status_code == 200


def test_contributor_drafts_require_approval(client):
    """The seeded contributor is scoped to the Academics division, which manages
    Practicum — so that is where its publish restriction is observable."""
    login(client, "contributor@its.ac.id", "TnlStudio2026!")
    created = client.post("/admin/content/practicum", json={
        "name": "Contributor draft module on network measurement",
        "description": "A practicum module covering throughput, delay and loss measurement in B-301.",
        "published": True,
    })
    assert created.status_code == 201, created.text
    # Forced to draft regardless of what was requested.
    assert created.json()["published"] is False
    item_id = created.json()["id"]
    res = client.put(f"/admin/content/practicum/{item_id}", json={"published": True})
    assert res.status_code == 403
    login(client)
    client.delete(f"/admin/content/practicum/{item_id}")


def test_division_scoping_blocks_out_of_division_writes(client):
    """Academics contributor may not touch News (the Media division's content)."""
    login(client, "contributor@its.ac.id", "TnlStudio2026!")
    res = client.post("/admin/content/posts", json={"title": "Out of division attempt"})
    assert res.status_code == 403
    assert "division" in res.json()["detail"].lower()


def test_public_members_never_expose_private_fields(client):
    members = client.get("/public/members").json()
    assert members
    for m in members:
        assert "phone" not in m
        if not m.get("show_nim"):
            assert "nim" not in m
        if not m.get("show_personal_email"):
            assert "email_personal" not in m


# ---------------------------------------------------------------- registration uniqueness
@pytest.fixture
def open_event(client):
    ev = client.get("/public/events/cisco-packet-tracer-training")
    assert ev.status_code == 200
    return ev.json()


def _registration_form(email: str, nim: str) -> dict:
    return {
        "f_full-name": "Test Participant",
        "f_email": email,
        "f_whatsapp": "+628123456789",
        "f_nrp-nim": nim,
        "f_department": "Electrical Engineering",
        "f_experience-level": "No experience",
        "consent": "1",
    }


def test_registration_is_unique_per_email_and_nim(client, open_event):
    stamp = f"{int(time.time())}{uuid.uuid4().hex[:4]}"
    email = f"unique.{stamp}@student.its.ac.id"
    # The API enforces >= 7 DIGITS in NIM/NRP, so build it from uuid4's integer
    # (uuid4().hex can be all letters, which once made this test flake with 422).
    nim = f"07{str(uuid.uuid4().int)[:9]}"

    first = client.post(f"/registrations/{open_event['id']}", data=_registration_form(email, nim))
    assert first.status_code == 200, first.text
    assert first.json()["status"] in ("accepted", "pending", "waitlisted")

    # Same email, different NIM -> rejected.
    dup_email = client.post(f"/registrations/{open_event['id']}", data=_registration_form(email, f"08{str(uuid.uuid4().int)[:9]}"))
    assert dup_email.status_code == 409

    # Same NIM, different email -> rejected.
    dup_nim = client.post(f"/registrations/{open_event['id']}", data=_registration_form(f"other.{stamp}@its.ac.id", nim))
    assert dup_nim.status_code == 409


def test_registration_requires_consent(client, open_event):
    stamp = uuid.uuid4().hex[:8]
    form = _registration_form(f"noconsent.{stamp}@its.ac.id", f"09{stamp}")
    form.pop("consent")
    res = client.post(f"/registrations/{open_event['id']}", data=form)
    assert res.status_code == 422


def test_registration_rejects_missing_required_fields(client, open_event):
    res = client.post(f"/registrations/{open_event['id']}", data={"consent": "1"})
    assert res.status_code == 422
    assert "missing" in str(res.json()["detail"])


def test_registration_honeypot_blocks_bots(client, open_event):
    stamp = uuid.uuid4().hex[:8]
    form = _registration_form(f"bot.{stamp}@its.ac.id", f"10{stamp}")
    form["company_website"] = "https://spam.example"
    assert client.post(f"/registrations/{open_event['id']}", data=form).status_code == 400


def test_registration_closed_event_is_refused(client):
    recruitment = client.get("/public/events/open-recruitment-laboratory-assistant").json()
    assert recruitment["reg_status"] == "upcoming"
    stamp = uuid.uuid4().hex[:8]
    res = client.post(f"/registrations/{recruitment['id']}",
                      data=_registration_form(f"early.{stamp}@its.ac.id", f"11{stamp}"))
    assert res.status_code == 400


# ---------------------------------------------------------------- block renderer contract
def test_seeded_pages_are_published_with_known_block_types(client):
    known = {
        "hero", "inner_hero", "stats", "about", "feature_tiles", "numbered_cards", "carousel",
        "quick_links", "news_feed", "partners", "cta_band", "contact_panel", "contact_form",
        "map", "rich_text", "html", "image", "gallery", "video", "timeline", "accordion",
        "download_list", "member_sections", "activity_tabs", "publication_list",
    }
    for slug in ("home", "member", "activity", "news", "publications", "contact", "terms", "privacy"):
        page = client.get(f"/public/pages/{slug}")
        assert page.status_code == 200, slug
        body = page.json()
        assert body["blocks"], slug
        for block in body["blocks"]:
            assert block["type"] in known, f"{slug}: unknown block {block['type']}"
            assert "id" in block and "props" in block and "hidden" in block


def test_page_blocks_can_be_added_reordered_and_removed(client):
    login(client)
    pages = client.get("/admin/pages").json()["items"]
    home = next(p for p in pages if p["slug"] == "home")

    added = client.post(f"/admin/pages/{home['id']}/blocks", json={"type": "cta_band", "props": {"title": "Temp"}})
    assert added.status_code == 201
    blocks = added.json()["blocks"]
    new_id = blocks[-1]["id"]

    reversed_order = [b["id"] for b in blocks][::-1]
    reordered = client.post(f"/admin/pages/{home['id']}/reorder", json={"order": reversed_order})
    assert reordered.status_code == 200
    assert [b["id"] for b in reordered.json()["blocks"]] == reversed_order

    restored = client.post(f"/admin/pages/{home['id']}/reorder", json={"order": reversed_order[::-1]})
    assert restored.status_code == 200

    hidden = client.patch(f"/admin/pages/{home['id']}/blocks/{new_id}", json={"hidden": True})
    assert hidden.status_code == 200
    assert next(b for b in hidden.json()["blocks"] if b["id"] == new_id)["hidden"] is True

    assert client.delete(f"/admin/pages/{home['id']}/blocks/{new_id}").status_code == 200


def test_reorder_rejects_an_incomplete_order(client):
    login(client)
    home = next(p for p in client.get("/admin/pages").json()["items"] if p["slug"] == "home")
    assert client.post(f"/admin/pages/{home['id']}/reorder", json={"order": ["nope"]}).status_code == 422


# ---------------------------------------------------------------- quality gates (unit)
def test_gate_flags_lorem_ipsum_and_placeholder_phone():
    issues = run_scan("posts", {"title": "Lorem ipsum dolor sit", "body": "Call us on 555-0199"})
    codes = {i["code"] for i in issues}
    assert "placeholder_text" in codes
    assert "placeholder_phone" in codes
    assert publish_blockers(issues)


def test_gate_flags_empty_links_and_bad_emails():
    issues = run_scan("posts", {"url": "#", "email": "not-an-email"})
    codes = {i["code"] for i in issues}
    assert "empty_link" in codes
    assert "malformed_email" in codes


def test_gate_flags_images_without_alt_text():
    issues = run_scan("posts", {"cover": {"url": "/api/media-files/x.png", "alt": "   "}})
    assert "missing_alt" in {i["code"] for i in issues}


def test_gate_flags_unverified_statistics():
    issues = run_scan("projects", {"stat": {"label": "Grant funding", "value": "500000000"}})
    assert "unverified_claim" in {i["code"] for i in issues}


def test_gate_accepts_verified_statistics():
    issues = run_scan("projects", {
        "stat": {"label": "Grant funding", "value": "5", "verified_by": "Head of Laboratory",
                 "verified_date": "2026-01-15"},
    })
    assert "unverified_claim" not in {i["code"] for i in issues}


def test_gate_warns_on_non_indonesian_phone_format():
    issues = run_scan("events", {"phone": "0812-3456-789"})
    phone_issues = [i for i in issues if i["code"] == "phone_format"]
    assert phone_issues
    assert "+62" in phone_issues[0]["hint"]


def test_normalize_phone_converts_to_plus62():
    assert normalize_phone("08123456789") == "+628123456789"
    assert normalize_phone("628123456789") == "+628123456789"


def test_gate_detects_social_links_reused_across_members():
    reused = scan_social_reuse([
        {"name": "A", "social": {"instagram": "https://instagram.com/shared"}},
        {"name": "B", "social": {"instagram": "https://instagram.com/shared/"}},
    ])
    assert any(len(names) > 1 for names in reused.values())


def test_clean_content_produces_no_blockers():
    issues = run_scan("posts", {
        "title": "Laboratory opens registration for the Cisco Packet Tracer training",
        "body": "<p>Assistants of the laboratory will deliver a two-day training in Room B-301.</p>",
        "email": "telconnetlab@gmail.com",
        "url": "https://www.its.ac.id",
    })
    assert publish_blockers(issues) == []


def test_publishing_is_blocked_while_errors_remain(client):
    login(client)
    res = client.post("/admin/content/posts", json={
        "title": "Lorem ipsum placeholder article",
        "body": "<p>Lorem ipsum dolor sit amet.</p>",
        "status": "published",
    })
    assert res.status_code == 422
    assert "issues" in res.json()["detail"]


def test_social_url_must_match_its_platform(client):
    login(client)
    res = client.post("/admin/content/members", json={
        "name": "Mismatch Test Person",
        "role": "assistant",
        "bio": "A laboratory assistant working on the network testbed in Room B-301.",
        "social": {"instagram": "https://example.com/not-instagram"},
        "published": True,
    })
    assert res.status_code == 422
    codes = {i["code"] for i in res.json()["detail"]["issues"]}
    assert "social_domain_mismatch" in codes


# ---------------------------------------------------------------- sanitizer
def test_sanitizer_strips_scripts_and_event_handlers():
    dirty = '<p onclick="steal()">Hi</p><script>alert(1)</script><img src="javascript:bad()">'
    clean = sanitize_html(dirty)
    assert "script" not in clean.lower()
    assert "onclick" not in clean.lower()
    assert "javascript:" not in clean.lower()
    assert "Hi" in clean


def test_sanitizer_keeps_safe_formatting_and_links():
    clean = sanitize_html('<p>Visit <a href="https://www.its.ac.id">ITS</a></p><ul><li>One</li></ul>')
    assert "<a" in clean and "https://www.its.ac.id" in clean
    assert "<li>One</li>" in clean


def test_page_blocks_sanitize_indonesian_rich_text_too():
    block = _sanitize_props({
        "type": "rich_text",
        "props": {
            "html": "<p>English</p>",
            "html_id": '<p onclick="steal()">Indonesia<script>alert(1)</script></p>',
        },
    })
    assert "onclick" not in block["props"]["html_id"].lower()
    assert "script" not in block["props"]["html_id"].lower()
    assert "Indonesia" in block["props"]["html_id"]


# ---------------------------------------------------------------- public API keys
def test_v1_api_requires_a_key(client):
    assert client.get("/v1/news").status_code == 401


def test_v1_read_key_cannot_write(client):
    login(client)
    created = client.post("/admin/api-keys", json={"name": "test read key", "scopes": ["read"]})
    assert created.status_code == 201
    raw = created.json()["key"]

    assert client.get("/v1/news", headers={"X-API-Key": raw}).status_code == 200
    denied = client.post("/v1/news", json={"title": "x"}, headers={"X-API-Key": raw})
    assert denied.status_code == 403

    client.delete(f"/admin/api-keys/{created.json()['id']}")


def test_revoked_key_stops_working(client):
    login(client)
    created = client.post("/admin/api-keys", json={"name": "test revoke key", "scopes": ["read"]}).json()
    raw = created["key"]
    assert client.get("/v1/news", headers={"X-API-Key": raw}).status_code == 200
    client.delete(f"/admin/api-keys/{created['id']}")
    assert client.get("/v1/news", headers={"X-API-Key": raw}).status_code == 401


# ---------------------------------------------------------------- certificates
def test_certificate_issuing_and_verification(client):
    login(client)
    events = client.get("/admin/content/events").json().get("items", [])
    if not events:
        return
    ev_id = events[0]["id"]
    res = client.post("/admin/registrations/issue-certificates", json={"event_id": ev_id, "statuses": ["pending", "accepted", "attended"]})
    assert res.status_code == 200
    assert "issued" in res.json()

    regs = client.get(f"/admin/registrations?event_id={ev_id}").json().get("items", [])
    with_code = [r for r in regs if r.get("certificate_code")]
    if with_code:
        code = with_code[0]["certificate_code"]
        v_res = client.get(f"/verify/{code}")
        assert v_res.status_code == 200
        assert v_res.json().get("valid") is True

        pdf_res = client.get(f"/certificates/{code}/pdf")
        assert pdf_res.status_code == 200
        assert pdf_res.headers["content-type"] == "application/pdf"
        assert pdf_res.content.startswith(b"%PDF")


# ---------------------------------------------------------------- author linking
def test_author_normalization_and_matching():
    from routers.pubimport import author_matches_member, clean_person_name, match_authors_to_members

    # 1. Title stripping
    cleaned = clean_person_name("Prof. Dr. Ir. Achmad Affandi, DEA.")
    assert cleaned == "achmad affandi"

    cleaned_lecturer = clean_person_name("Prof. Eko Setijadi, S.T., M.T., Ph.D")
    assert cleaned_lecturer == "eko setijadi"

    # 2. Matching with full name and initial variants
    assert author_matches_member("Achmad Affandi, Tri Rahayu", "Dr. Ir. Achmad Affandi, DEA.")
    assert author_matches_member("A. Affandi, D. J. Suroso", "Dr. Ir. Achmad Affandi, DEA.")
    assert author_matches_member("Affandi, A.", "Dr. Ir. Achmad Affandi, DEA.")
    assert author_matches_member("T. Rahayu and E. Setijadi", "Tri Rahayu, S.T., M.Kom.")
    assert author_matches_member("P. E. Setijadi", "Prof. Eko Setijadi, S.T., M.T., Ph.D")
    assert not author_matches_member("John Doe, Jane Smith", "Dr. Ir. Achmad Affandi, DEA.")

    # 3. Match authors to member list
    members = [
        {"id": "m1", "name": "Dr. Ir. Achmad Affandi, DEA."},
        {"id": "m2", "name": "Tri Rahayu, S.T., M.Kom."},
        {"id": "m3", "name": "Unrelated Member"},
    ]
    matched = match_authors_to_members("A. Affandi, T. Rahayu, Someone Else", members)
    assert "m1" in matched
    assert "m2" in matched
    assert "m3" not in matched


def test_publication_author_relink_and_public_relations(client):
    login(client)
    # Trigger relink endpoint
    relink_res = client.post("/admin/publications/relink-authors")
    assert relink_res.status_code == 200
    assert relink_res.json().get("ok") is True

    # Check public publications endpoint returns linked_members
    pubs = client.get("/public/publications").json()
    assert isinstance(pubs, list)
    if pubs:
        assert "linked_members" in pubs[0]

    # Test member_id filtering on public publications
    members = client.get("/public/members").json()
    if members:
        mid = members[0]["id"]
        filtered = client.get(f"/public/publications?member_id={mid}").json()
        assert isinstance(filtered, list)
        for p in filtered:
            assert mid in p.get("linked_member_ids", [])


def test_practicum_resources_and_shifts(client):
    login(client)
    res = client.get("/public/practicum")
    assert res.status_code == 200
    items = res.json()
    assert isinstance(items, list)
    assert len(items) > 0
    # Seeded modules should include resources and shifts
    first = items[0]
    assert "resources" in first
    assert "shifts" in first
    assert isinstance(first["resources"], list)
    assert isinstance(first["shifts"], list)
    if first["resources"]:
        assert "title" in first["resources"][0]
        assert "file_type" in first["resources"][0]
        if first.get("available_to_download"):
            assert "file_url" in first["resources"][0]
        else:
            assert "file_url" not in first["resources"][0]
    if first["shifts"]:
        assert "day" in first["shifts"][0]
        assert "time_slot" in first["shifts"][0]
        assert "coordinator_name" in first["shifts"][0]


def test_equipment_crud_and_public_privacy(client):
    login(client)
    # 1. Create equipment as admin
    payload = {
        "name": "Testbed Edge Switch 10G",
        "name_id": "Switch Edge Testbed 10G",
        "category": "networking",
        "specs": "24-Port 10GbE SFP+ L3 Managed Switch",
        "specs_id": "Switch L3 Managed 24-Port 10GbE SFP+",
        "quantity": 1,
        "location": "Ruang B-301",
        "status": "available",
        "serial_number": "SEC-TNL-SWITCH-9999",
        "asset_code": "ASSET-ITS-DTE-9999",
        "internal_notes": "Private maintainer console password: secret-password",
        "order": 1,
        "published": True,
    }
    create_res = client.post("/admin/content/equipment", json=payload)
    assert create_res.status_code == 201
    eq_id = create_res.json()["id"]

    # 2. Check admin list contains private fields
    admin_item = client.get(f"/admin/content/equipment/{eq_id}").json()
    assert admin_item["serial_number"] == "SEC-TNL-SWITCH-9999"
    assert admin_item["asset_code"] == "ASSET-ITS-DTE-9999"
    assert "secret-password" in admin_item["internal_notes"]

    # 3. Check public equipment endpoint strips sensitive/internal fields
    public_res = client.get("/public/equipment")
    assert public_res.status_code == 200
    pub_items = public_res.json()
    created_pub = next((x for x in pub_items if x["id"] == eq_id), None)
    assert created_pub is not None
    assert "serial_number" not in created_pub
    assert "asset_code" not in created_pub
    assert "internal_notes" not in created_pub
    assert created_pub["name"] == "Testbed Edge Switch 10G"

    # 4. Check category filter
    filter_res = client.get("/public/equipment?category=networking")
    assert filter_res.status_code == 200
    assert any(x["id"] == eq_id for x in filter_res.json())

    empty_cat_res = client.get("/public/equipment?category=non_existent_category")
    assert empty_cat_res.status_code == 200
    assert len(empty_cat_res.json()) == 0


def test_document_media_upload_allowed(client):
    login(client)
    # Upload simulated Cisco Packet Tracer file (.pkt)
    dummy_pkt = b"PACKET_TRACER_BINARY_DATA_V8"
    files = {"file": ("network_topology.pkt", dummy_pkt, "application/octet-stream")}
    data = {"alt": "Network topology packet tracer simulation for lab 01", "folder": "academic"}
    res = client.post("/admin/media", data=data, files=files)
    assert res.status_code == 201
    out = res.json()
    assert out["kind"] == "document"
    assert out["url"].startswith("/api/media-files/academic/")
    assert "network_topology" in out["filename"]



