"""Practicum access control: what of a practicum module may leave the server.

The catalog is public so a visitor can read what the laboratory teaches — code, bilingual
title, semester, summary, cover image, module count. The module files themselves, the lab
guides and the shift schedules belong to the laboratory assistants, so they are stripped
from every non-assistant response (anonymous, `viewer` role, or a plain API key).

`backend/routers/media.py` uses the same restricted-prefix rule to refuse a direct file
download, so hiding the URL and blocking the file stay in step.
"""

# URL fields on a PracticumResource that point at a downloadable module file.
MODULE_URL_FIELDS = ("file_url",)

# Media-library folders that hold assistant-only material. `academic/` is where the
# practicum module PDFs, Packet Tracer labs and helper scripts live.
RESTRICTED_MEDIA_PREFIXES = ("academic/",)

RESTRICTED_MEDIA_NOTE = "Practicum modules are restricted to laboratory assistants."


def public_practicum_doc(doc: dict, can_access: bool) -> dict:
    """Return `doc` with module URLs and shifts kept or stripped, plus explicit flags.

    `can_access` is True only for a signed-in laboratory assistant. The flags let the client
    render the locked state without inferring it from missing keys.
    """
    out = dict(doc)
    resources = [r for r in (out.get("resources") or []) if isinstance(r, dict)]
    shifts = [s for s in (out.get("shifts") or []) if isinstance(s, dict)]

    out["resources_count"] = len(resources)
    out["shifts_count"] = len(shifts)
    out["can_access_modules"] = bool(can_access)
    out["resources_restricted"] = not can_access

    if can_access:
        return out

    out["resources"] = [
        {k: v for k, v in resource.items() if k not in MODULE_URL_FIELDS} for resource in resources
    ]
    out["shifts"] = []
    return out


def media_path_is_restricted(path: str) -> bool:
    """True when a media key lives under an assistant-only folder."""
    cleaned = (path or "").lstrip("/")
    return any(cleaned.startswith(prefix) for prefix in RESTRICTED_MEDIA_PREFIXES)
