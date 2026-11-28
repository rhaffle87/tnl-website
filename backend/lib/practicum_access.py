"""Practicum access control: what of a practicum module may leave the server.

The catalog is public so a visitor can read what the laboratory teaches — code, bilingual
title, semester, summary, cover image, module count. Downloadable module files are gated
per module by the CMS `available_to_download` flag (default False), and shift schedules
remain restricted to signed-in laboratory assistants.

`backend/routers/media.py` uses the same rule to refuse or allow direct `academic/` file
downloads so hiding the URL and gating the file stay in step.
"""

# URL fields on a PracticumResource that point at a downloadable module file.
MODULE_URL_FIELDS = ("file_url",)

# Media-library folders that hold assistant-only material by default. `academic/` is where
# the practicum module PDFs, Packet Tracer labs and helper scripts live.
RESTRICTED_MEDIA_PREFIXES = ("academic/",)

RESTRICTED_MEDIA_NOTE = "Practicum modules are restricted to laboratory assistants."


def public_practicum_doc(doc: dict, can_access: bool) -> dict:
    """Return `doc` with module URLs and shifts kept or stripped, plus explicit flags.

    `available_to_download` controls whether module resource `file_url` links are exposed.
    `can_access` controls whether assistant-only shift schedules are included.
    """
    out = dict(doc)
    resources = [r for r in (out.get("resources") or []) if isinstance(r, dict)]
    shifts = [s for s in (out.get("shifts") or []) if isinstance(s, dict)]
    downloadable = bool(out.get("available_to_download", False))

    out["available_to_download"] = downloadable
    out["resources_count"] = len(resources)
    out["shifts_count"] = len(shifts)
    out["can_access_modules"] = bool(can_access)
    out["resources_restricted"] = not downloadable

    if not downloadable:
        out["resources"] = [
            {k: v for k, v in resource.items() if k not in MODULE_URL_FIELDS} for resource in resources
        ]
    else:
        out["resources"] = resources

    out["shifts"] = shifts if can_access else []
    return out


def media_path_is_restricted(path: str) -> bool:
    """True when a media key lives under an assistant-only folder."""
    cleaned = (path or "").lstrip("/")
    return any(cleaned.startswith(prefix) for prefix in RESTRICTED_MEDIA_PREFIXES)


def media_url_candidates(path: str) -> list[str]:
    """Return possible stored URL forms referencing a media path."""
    cleaned = (path or "").lstrip("/")
    return [f"/api/media-files/{cleaned}", f"/media-files/{cleaned}"]
