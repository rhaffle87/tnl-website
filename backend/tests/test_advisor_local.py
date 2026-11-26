"""Tests for the local content advisor that replaced the external Jev/TypeSafe calls.

The advisor must be deterministic, offline and contract-compatible with the module it
replaced: same keys, same `ai_ok` semantics, same issue codes.
"""

import socket
import sys

import pytest

from lib import advisor


def test_typesafe_sdk_is_not_a_dependency_anymore():
    assert "typesafe_sdk" not in sys.modules
    assert not hasattr(advisor, "get_jev_client")


def test_review_draft_flags_placeholder_text():
    result = advisor.review_draft(
        "posts",
        "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sample text here. "
        "TODO: replace this placeholder copy before the site goes live. Lorem ipsum again.",
    )
    assert result["ai_ok"] is True
    assert result["placeholder_probability"] > 0.7
    codes = [issue["code"] for issue in result["ai_issues"]]
    assert "ai_placeholder" in codes
    error = next(i for i in result["ai_issues"] if i["code"] == "ai_placeholder")
    assert error["severity"] == "error"


def test_review_draft_flags_thin_but_real_text():
    result = advisor.review_draft("activities", "Kami membuka pendaftaran asisten laboratorium.")
    assert result["ai_ok"] is True
    assert result["substance_level"] == 0
    codes = [issue["code"] for issue in result["ai_issues"]]
    assert "ai_thin" in codes
    assert "ai_placeholder" not in codes


def test_review_draft_accepts_detailed_specific_content():
    text = (
        "Laboratorium Telekomunikasi Jaringan melayani praktikum modul routing dan switching "
        "bagi 120 mahasiswa setiap semester. Praktikum memakai 24 router Cisco dan 12 switch "
        "yang terhubung ke server cloud internal. Setiap modul berisi 4 sesi, masing-masing "
        "3 jam, dengan modul pengantar jaringan optik pada pertemuan pertama. Asisten "
        "laboratorium mendampingi maksimal 8 mahasiswa per sesi dan mencatat presensi digital. "
        "Penelitian laboratorium mencakup pengukuran daya sinyal pada frekuensi 2.4 GHz dan "
        "evaluasi jaringan fiber optik sepanjang 5 km di lingkungan kampus ITS Surabaya."
    )
    result = advisor.review_draft("pages", text)
    assert result["ai_ok"] is True
    assert result["substance_level"] >= 2
    assert result["placeholder_probability"] < 0.6
    assert result["ai_issues"] == []


def test_review_draft_flags_unverified_claim():
    result = advisor.review_draft(
        "posts",
        "Laboratorium kami meraih peringkat 1 nasional dengan hibah Rp 2.500.000.000 pada 2024 "
        "dan memenangkan 3 award internasional.",
    )
    codes = [issue["code"] for issue in result["ai_issues"]]
    assert "ai_unverified_claim" in codes
    assert result["claim_probability"] > 0.7


def test_review_draft_softens_claim_when_source_is_named():
    hedged = advisor.review_draft(
        "posts",
        "Menurut data sumber BPS, capaian laboratorium naik 12% pada 2024 dibanding tahun sebelumnya.",
    )
    assert hedged["claim_probability"] < 0.7
    assert "ai_unverified_claim" not in [i["code"] for i in hedged["ai_issues"]]


def test_review_draft_returns_not_ok_for_nothing_to_judge():
    assert advisor.review_draft("posts", "Halo") == {"ai_ok": False}
    assert advisor.review_draft("posts", "") == {"ai_ok": False}


def test_review_draft_is_deterministic():
    text = "Modul praktikum jaringan nirkabel berisi 3 sesi, setiap sesi 2 jam."
    assert advisor.review_draft("practicum", text) == advisor.review_draft("practicum", text)


def test_triage_detects_spam():
    result = advisor.triage_message("SEO Team", "Boost your website", "Cheap backlink guest post and casino seo services. Buy now!")
    assert result["ai_ok"] is True
    assert result["category"] == "spam"
    assert result["spam_probability"] > 0.7


def test_triage_categorizes_collaboration_with_urgency():
    result = advisor.triage_message(
        "PT Telkom",
        "Kerjasama penelitian",
        "Kami ingin membahas kerjasama penelitian dan MoU. Mohon dibalas segera, deadline akhir bulan ini.",
    )
    assert result["category"] == "collaboration"
    assert result["urgency_level"] >= 2
    assert result["urgency_label"] in advisor.URGENCY_LEVELS
    assert 0 <= result["category_confidence"] <= 1


def test_triage_categorizes_student_question():
    result = advisor.triage_message(
        "Mahasiswa Baru",
        "Praktikum",
        "Bagaimana cara mengikuti praktikum dan seperti apa penilaian asistensi? Nim saya 5024211001.",
    )
    assert result["category"] == "student"


def test_triage_categorizes_training_and_visit():
    training = advisor.triage_message("Peserta", "Pelatihan", "Apakah ada jadwal pelatihan dan sertifikasi bulan depan?")
    visit = advisor.triage_message("SMK Negeri 5", "Kunjungan", "Kami ingin kunjungan laboratorium dan tour fasilitas.")
    assert training["category"] == "training"
    assert visit["category"] == "visit"


def test_triage_defaults_to_other_and_no_rush():
    result = advisor.triage_message("Budi", "Halo", "Halo, saya hanya ingin menyapa. Kapan saja boleh dibalas, tidak mendesak.")
    assert result["category"] == "other"
    assert result["urgency_level"] == 0


def test_triage_returns_not_ok_when_message_is_empty():
    assert advisor.triage_message("", "", "") == {"ai_ok": False}


def test_advisor_makes_no_network_calls(monkeypatch):
    def boom(*args, **kwargs):  # pragma: no cover - only runs on a regression
        raise AssertionError("the local advisor must never open a socket")

    monkeypatch.setattr(socket.socket, "connect", boom)
    monkeypatch.setattr(socket.socket, "connect_ex", boom)

    draft = advisor.review_draft("posts", "Modul praktikum jaringan berisi 3 sesi dan 2 modul tambahan.")
    triage = advisor.triage_message("Tamu", "Kunjungan", "Kami ingin kunjungan laboratorium minggu ini.")
    assert draft["ai_ok"] is True
    assert triage["ai_ok"] is True


@pytest.mark.asyncio
async def test_triage_endpoint_uses_local_advisor(async_client, mock_db, admin_cookies):
    from uuid import uuid4

    msg_id = str(uuid4())
    await mock_db.messages.insert_one({
        "id": msg_id, "name": "PT Telkom", "email": "partner@telkom.co.id",
        "subject": "Kerjasama penelitian", "body": "Kami ingin membahas kerjasama penelitian dan MoU.",
        "status": "new",
    })

    res = await async_client.post(f"/admin/messages/{msg_id}/triage", cookies=admin_cookies)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["ai_ok"] is True
    assert body["category"] == "collaboration"

    stored = await mock_db.messages.find_one({"id": msg_id})
    assert stored["triage"]["category"] == "collaboration"


@pytest.mark.asyncio
async def test_triage_endpoint_rejects_empty_message(async_client, mock_db, admin_cookies):
    from uuid import uuid4

    msg_id = str(uuid4())
    await mock_db.messages.insert_one({
        "id": msg_id, "name": "", "email": "empty@its.ac.id", "subject": "", "body": "", "status": "new",
    })

    res = await async_client.post(f"/admin/messages/{msg_id}/triage", cookies=admin_cookies)
    assert res.status_code == 422


def test_review_draft_issue_field_follows_resource_review_text():
    """K7: issues must point at the first field of REVIEW_TEXT for the resource."""
    from routers.content import REVIEW_TEXT

    text = "Short draft about lab equipment."
    resources = ("posts", "members")
    fields = []
    for resource in resources:
        result = advisor.review_draft(resource, text)
        assert result["ai_issues"], resource
        expected_field = REVIEW_TEXT[resource][0]
        assert all(issue["field"] == expected_field for issue in result["ai_issues"])
        fields.append(result["ai_issues"][0]["field"])
    assert fields[0] != fields[1]
