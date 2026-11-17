"""Content quality gates.

`run_scan` flags placeholder/unsafe content on every save (stored on the document,
shown as the "Needs review" queue). `publish_blockers` returns only the
severity="error" issues and is enforced by the admin publish routes — a document
with errors cannot go live. Severity: error (blocks publish) / warning / info.
"""

import re
from datetime import datetime

LOREM = re.compile(r"lorem\s+ipsum", re.I)
PLACEHOLDER_PHONE = re.compile(r"\b555[-\s]?\d{3,4}\b")
EMAIL_OK = re.compile(r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$")
MAILTO_OK = re.compile(r"^mailto:[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$", re.I)

LINK_KEYS = ("url", "link", "href", "website", "maps_url", "cv_url")
IMAGE_KEYS = ("image", "photo", "poster", "cover", "logo", "thumbnail", "avatar")
EMAIL_KEYS = ("email",)
PHONE_KEYS = ("phone", "wa", "whatsapp")
STAT_VALUE_KEYS = ("value", "count", "amount", "number")
CLAIM_KEYS = ("funding", "grant_amount", "verified_by", "verified_date")

TYPO_HINTS = {
    "recieve": "receive", "seperator": "separator", "adress": "address",
    "labolatory": "laboratory", "acomodate": "accommodate", "mendaftarakan": "mendaftarkan",
    "pendaftaranakan": "pendaftaran",
}

TITLE_KEYS = ("title", "name")


def normalize_phone(raw: str) -> str:
    digits = re.sub(r"[^\d+]", "", raw or "")
    if digits.startswith("0"):
        return "+62" + digits[1:]
    if digits.startswith("62"):
        return "+62" + digits[2:]
    return digits


def _walk(node, path: str = ""):
    """Yield (path, key, value) for every string leaf; recurse dicts and lists."""
    if isinstance(node, dict):
        for k, v in node.items():
            yield from _walk(v, f"{path}.{k}" if path else str(k))
    elif isinstance(node, list):
        for i, v in enumerate(node):
            yield from _walk(v, f"{path}[{i}]")
    elif isinstance(node, str):
        key = path.rsplit(".", 1)[-1].split("[")[0].lower()
        yield path, key, node


def run_scan(resource: str, doc: dict) -> list[dict]:
    issues: list[dict] = []

    def add(field: str, severity: str, code: str, message: str, hint: str = "") -> None:
        issues.append({"field": field, "severity": severity, "code": code, "message": message, "hint": hint})

    for path, key, text in _walk(doc):
        if not text:
            continue
        if LOREM.search(text):
            add(path, "error", "placeholder_text", "Placeholder text (lorem ipsum) found. Replace it with real content.")
        if PLACEHOLDER_PHONE.search(text):
            add(path, "error", "placeholder_phone", "Placeholder phone number (555-xxxx) found. Use a real, reachable number.")
        if any(k in key for k in EMAIL_KEYS) and not key.startswith("_"):
            if text.strip() and not EMAIL_OK.match(text.strip()) and not text.strip().startswith("mailto:"):
                add(path, "error", "malformed_email", "This email address does not look valid.")
        if any(k in key for k in LINK_KEYS):
            val = text.strip()
            if val in ("", "#"):
                add(path, "error", "empty_link", "This link is empty. Remove it or paste the full URL (https://…).")
            elif val.startswith("mailto:") and not MAILTO_OK.match(val):
                add(path, "error", "malformed_email", "This mailto link has an invalid email address.")
        if any(k in key for k in PHONE_KEYS):
            digits = re.sub(r"\D", "", text)
            if digits and not (text.strip().startswith("+62") or digits.startswith("628") or digits.startswith("6221")):
                norm = normalize_phone(text)
                add(path, "warning", "phone_format", "Phone numbers should use the +62 international format.",
                    hint=f"Suggested: {norm}")
        lower = text.lower()
        for bad, good in TYPO_HINTS.items():
            if bad in lower:
                add(path, "info", "typo_hint", f"Possible typo: “{bad}” — did you mean “{good}”?")

    # Alt text on media items: every {url, alt} pair must describe its image.
    for path, key, node in _walk_nodes(doc):
        if isinstance(node, dict) and "url" in node and "alt" in node:
            if node.get("url") and not (node.get("alt") or "").strip():
                add(f"{path}.alt", "error", "missing_alt", "Every image needs alt text that describes it.")
        # Unverified statistics / funding claims.
        if isinstance(node, dict):
            has_stat = any(k in node for k in STAT_VALUE_KEYS) and any(k in node for k in ("label", "title"))
            has_claim = any(k in node for k in CLAIM_KEYS if k != "verified_by")
            if (has_stat or has_claim) and not (node.get("verified_by") and node.get("verified_date")):
                if not node.get("verified"):
                    add(path, "error", "unverified_claim",
                        "Statistics and funding claims must be verified. Add “verified by <role> on <date>” "
                        "or mark the item as verified.")

    # EN/ID bilingual hint: identical EN and ID text usually means one language was left untranslated.
    for base in ("title", "name", "excerpt", "description", "bio"):
        en, idn = doc.get(base), doc.get(f"{base}_id")
        if en and idn and en.strip() == idn.strip():
            add(base, "info", "untranslated_hint", "The English and Indonesian texts are identical — check that both are translated.")

    return issues


def _walk_nodes(node, path: str = ""):
    if isinstance(node, dict):
        yield path, "", node
        for k, v in node.items():
            yield from _walk_nodes(v, f"{path}.{k}" if path else str(k))
    elif isinstance(node, list):
        for i, v in enumerate(node):
            yield from _walk_nodes(v, f"{path}[{i}]")


def scan_social_reuse(members: list[dict]) -> dict[str, list[str]]:
    """Map social URL -> member names reusing it (warning: one account per person)."""
    seen: dict[str, list[str]] = {}
    for m in members:
        social = m.get("social") or {}
        for platform, url in social.items():
            if isinstance(url, str) and url.strip():
                key = url.strip().rstrip("/").lower()
                seen.setdefault(key, []).append(m.get("name", "?"))
    return {url: names for url, names in seen.items() if len(names) > 1}


def publish_blockers(issues: list[dict]) -> list[dict]:
    return [i for i in issues if i.get("severity") == "error"]
