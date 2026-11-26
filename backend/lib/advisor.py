"""Local content advisor — the in-repo replacement for the external Jev/TypeSafe calls.

Everything here is deterministic, offline and dependency-free: no API key, no network
call, no third-party SDK. Two decisions, one per call site:

  • review_draft()    — is a draft real lab content, or filler/placeholder?  (content saves)
  • triage_message()  — contact-inbox bucket + urgency + spam probability    (message inbox)

The return contract is unchanged from the module it replaces: the same keys, the same
`ai_ok` flag and the same issue `code`s, so stored `ai_review` / `triage` documents and
the CMS UI that reads them keep working. `ai_ok: False` still means "there was nothing to
judge" (empty text), never "the content is fine".

Tuning lives in the module constants below — treat them as the advisor's rulebook.
"""

import re

# ---------------------------------------------------------------- 1. draft review
CONTENT_LEVELS = ["placeholder or filler", "very thin", "acceptable", "detailed and specific"]

# Phrases that only ever appear in filler, sample or un-finished copy.
FILLER_MARKERS = (
    "lorem ipsum", "lorem", "dummy text", "sample text", "placeholder", "your text here",
    "coming soon", "to be announced", "todo", "tbd", "xxx", "yyy", "abc abc", "asdf",
    "teks contoh", "isi teks", "contoh teks", "keterangan singkat", "belum diisi",
)

# Vocabulary that shows the author actually knows this laboratory.
LAB_MARKERS = (
    "laboratorium", "lab", "praktikum", "asisten", "modul", "router", "switch", "routing",
    "switching", "jaringan", "telekomunikasi", "telecommunication", "network", "fiber",
    "optik", "optical", "antenna", "antena", "sdr", "iot", "5g", "lte", "wifi", "cisco",
    "packet tracer", "vmware", "linux", "server", "cloud", "sinyal", "signal",
    "mahasiswa", "penelitian", "research", "pengabdian", "kolaborasi", "pelatihan",
)

# Numbers, units and years: the fingerprint of concrete, checkable writing.
SPECIFIC_PATTERN = re.compile(
    r"(\d+(?:[.,]\d+)?\s*(?:%|mhz|ghz|khz|dbm|db|mbps|gbps|ms|km|watt|volt|meter|orang|peserta|modul|tahun|unit))"
    r"|(\b(?:19|20)\d{2}\b)|(\brp\s?[\d.,]+)|(\b\d+\s*(?:x|kali)\b)",
    re.IGNORECASE,
)

# Claims a reader would want verified before this goes on a university website.
CLAIM_PATTERN = re.compile(
    r"\b(?:peringkat|ranking|rank|akreditasi|award|penghargaan|juara|winner|paten|"
    r"hibah|grant|funding|pendanaan|dana|investasi|kerjasama strategis|mou|top\s?\d+)\b"
    r"|\b\d+(?:[.,]\d+)?\s?%|\brp\s?[\d.,]+",
    re.IGNORECASE,
)

# Hedges that show the author already attributed or scoped the claim.
HEDGE_MARKERS = ("sumber", "menurut", "berdasarkan", "source", "according to", "per ", "target", "rencana", "plan")


def _words(text: str) -> list[str]:
    return re.findall(r"[^\W_]+", text, re.UNICODE)


def _sentences(text: str) -> list[str]:
    return [s.strip() for s in re.split(r"[.!?\n]+", text) if s.strip()]


def _clamp(value: float, low: float = 0.0, high: float = 0.99) -> float:
    return max(low, min(high, value))


def review_draft(resource: str, text: str) -> dict:
    """Judge whether a draft reads as real lab content. Adds `ai_issues` to the review queue.

    Offline and synchronous by design: a content save must never wait on a network round-trip.
    """
    snippet = (text or "").strip()[:3000]
    if len(snippet) < 15:
        return {"ai_ok": False}

    # Point issues at the first field this resource is actually reviewed by.
    # Imported lazily to avoid a module-level cycle with the content router.
    from routers.content import REVIEW_TEXT

    issue_field = REVIEW_TEXT.get(resource, ("body",))[0]

    low = snippet.lower()
    words = _words(low)
    word_count = len(words)
    sentences = _sentences(low)
    unique_ratio = (len(set(words)) / word_count) if word_count else 0.0

    filler_hits = sum(1 for marker in FILLER_MARKERS if marker in low)
    lab_hits = sum(1 for marker in LAB_MARKERS if marker in low)
    specific_hits = len(SPECIFIC_PATTERN.findall(snippet))
    # Three or more sentences that are all near-identical is copy-paste padding, not writing.
    unique_sentences = {s for s in sentences if len(s) > 12}
    repetitive = len(sentences) >= 3 and len(unique_sentences) <= max(1, len(sentences) // 3)

    placeholder_p = 0.05
    placeholder_p += 0.25 * min(filler_hits, 3)
    if word_count < 15:
        placeholder_p += 0.25
    if unique_ratio < 0.45:
        placeholder_p += 0.2
    if repetitive:
        placeholder_p += 0.25
    if word_count >= 15 and not lab_hits and not specific_hits:
        placeholder_p += 0.15
    if word_count >= 60 and unique_ratio >= 0.55 and (lab_hits + specific_hits) >= 3:
        placeholder_p -= 0.35
    placeholder_p = _clamp(placeholder_p)

    level = 0 if word_count < 15 else 1 if word_count < 40 else 2 if word_count < 120 else 3
    if placeholder_p > 0.6 or (word_count >= 40 and not lab_hits and not specific_hits):
        level -= 1
    elif word_count >= 15 and (lab_hits + specific_hits) >= 3 and unique_ratio >= 0.55:
        level += 1
    level = max(0, min(3, level))
    label = CONTENT_LEVELS[level]

    claim_hits = len(CLAIM_PATTERN.findall(snippet))
    claim_p = 0.05
    if claim_hits:
        claim_p = min(0.15 + 0.3 * claim_hits, 0.95)
        if any(marker in low for marker in HEDGE_MARKERS):
            claim_p -= 0.35
        if "terverifikasi" in low or "verified" in low:
            claim_p -= 0.2
    claim_p = _clamp(claim_p)

    issues: list[dict] = []
    if placeholder_p > 0.75:
        issues.append({
            "field": issue_field, "severity": "error", "code": "ai_placeholder",
            "message": "This reads like placeholder or sample text rather than real content about the lab.",
            "hint": f"Local check confidence {round(placeholder_p * 100)}%",
        })
    elif level == 0:
        issues.append({
            "field": issue_field, "severity": "warning", "code": "ai_thin",
            "message": "This text looks very thin. Add a few specific details before publishing.",
            "hint": f"Assessed as “{label}”",
        })
    if claim_p > 0.7:
        issues.append({
            "field": issue_field, "severity": "warning", "code": "ai_unverified_claim",
            "message": "This mentions a statistic or claim that should be verified before publishing.",
            "hint": f"Local check confidence {round(claim_p * 100)}%",
        })
    return {
        "ai_ok": True, "substance_level": level, "substance_label": label,
        "placeholder_probability": round(placeholder_p, 3),
        "claim_probability": round(claim_p, 3), "ai_issues": issues,
    }


# ---------------------------------------------------------------- 2. contact-inbox triage
URGENCY_LEVELS = ["no rush", "normal", "soon", "urgent"]
MESSAGE_CATEGORIES = {
    "collaboration": "Research collaboration, industry partnership, joint project or funding enquiry",
    "student": "A student asking about practicum, assistant recruitment, grades or lab access",
    "training": "An enquiry about training, workshops, certification or registration",
    "visit": "A request to visit, tour or use the laboratory facilities",
    "other": "Anything else, including vendor pitches and general enquiries",
    "spam": "Unsolicited advertising, scams, SEO offers or nonsense text",
}

# Weighted keyword sets. A subject-line hit counts double.
CATEGORY_KEYWORDS: dict[str, dict[str, int]] = {
    "collaboration": {
        "kerjasama": 3, "kerja sama": 3, "kolaborasi": 3, "collaboration": 3, "mou": 3,
        "partnership": 3, "kemitraan": 3, "joint research": 3, "penelitian bersama": 3,
        "riset": 2, "research": 2, "industri": 2, "industry": 2, "hibah": 2, "grant": 2,
        "funding": 2, "pendanaan": 2, "pengabdian": 2, "community service": 2,
    },
    "student": {
        "praktikum": 3, "asistensi": 3, "asisten": 3, "assistant": 3, "nilai": 3, "grade": 2,
        "krs": 2, "mahasiswa": 2, "student": 2, "akses lab": 3, "lab access": 3,
        "modul": 2, "ujian": 2, "kelas": 2, "recruitment": 2, "rekrutmen": 2, "nim": 2,
    },
    "training": {
        "pelatihan": 3, "training": 3, "workshop": 3, "lokakarya": 3, "sertifikasi": 3,
        "certification": 3, "sertifikat": 3, "course": 2, "kursus": 2, "kelas pelatihan": 3,
        "pendaftaran": 2, "registration": 2, "bootcamp": 2, "webinar": 2,
    },
    "visit": {
        "kunjungan": 3, "berkunjung": 3, "visit": 3, "tour": 3, "tour lab": 3, "observasi": 3,
        "study tour": 3, "open house": 3, "mengunjungi": 3, "field trip": 3, "temu": 2,
    },
}

SPAM_MARKERS = (
    "seo", "backlink", "guest post", "link building", "increase traffic", "buy followers",
    "casino", "judi", "gacor", "toto", "slot", "crypto", "bitcoin", "forex", "loan",
    "pinjaman", "viagra", "escort", "porn", "betting", "pasang iklan", "jual followers",
    "unlimited smtp", "mass email", "seo services", "rank higher",
)

URGENCY_MARKERS: dict[str, int] = {
    "urgent": 3, "asap": 3, "segera": 3, "secepatnya": 3, "hari ini": 3, "today": 3,
    "besok": 3, "tomorrow": 3, "deadline": 3, "batas waktu": 3, "penting": 2, "important": 2,
    "minggu ini": 2, "this week": 2, "soon": 2, "akhir bulan": 2, "week": 1,
}

NO_RUSH_MARKERS = ("no rush", "no hurry", "kapan saja", "kapan pun", "santai", "whenever", "tidak mendesak", "no urgency")


def _keyword_score(text: str, keywords: dict[str, int], subject_boost: str = "") -> float:
    score = 0.0
    for keyword, weight in keywords.items():
        if keyword in text:
            score += weight
            if keyword in subject_boost:
                score += weight
    return score


def triage_message(name: str, subject: str, body: str) -> dict:
    """Sort a contact-form message into a bucket, score urgency, flag spam. Offline."""
    haystack = " ".join(part for part in (name, subject, body) if part).strip()
    if not haystack:
        return {"ai_ok": False}

    low = haystack.lower()
    subject_low = (subject or "").lower()
    words = _words(haystack)
    letters = [c for c in haystack if c.isalpha()]
    shout_ratio = (sum(1 for c in letters if c.isupper()) / len(letters)) if letters else 0.0
    link_hits = low.count("http://") + low.count("https://") + low.count("www.")

    spam_p = 0.05
    spam_p += 0.3 * min(sum(1 for marker in SPAM_MARKERS if marker in low), 3)
    if shout_ratio > 0.6 and len(letters) > 20:
        spam_p += 0.2
    if link_hits >= 2:
        spam_p += 0.15
    if any(ord(c) > 0x2500 for c in haystack):
        spam_p += 0.1
    spam_p = _clamp(spam_p)

    scores = {cat: _keyword_score(low, kwargs, subject_low) for cat, kwargs in CATEGORY_KEYWORDS.items()}
    ranked = sorted(scores.items(), key=lambda kv: kv[1], reverse=True)
    best_cat, best_score = ranked[0]
    runner_up = ranked[1][1] if len(ranked) > 1 else 0.0

    if spam_p > 0.6 or (best_score == 0 and spam_p > 0.4):
        category, confidence = "spam", round(spam_p, 3)
    elif best_score > 0:
        margin = (best_score - runner_up) / (best_score + runner_up) if (best_score + runner_up) else 0.0
        category = best_cat
        confidence = round(min(0.55 + 0.4 * margin, 0.95), 3)
    else:
        category, confidence = "other", 0.35

    urgency_level = max((weight for marker, weight in URGENCY_MARKERS.items() if marker in low), default=1)
    if any(marker in low for marker in NO_RUSH_MARKERS):
        urgency_level = 0
    urgency_level = max(0, min(3, urgency_level))

    return {
        "ai_ok": True,
        "category": category,
        "category_confidence": confidence,
        "urgency_level": urgency_level,
        "urgency_label": URGENCY_LEVELS[urgency_level],
        "spam_probability": round(spam_p, 3),
    }
