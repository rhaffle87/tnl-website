"""Publication import.

SINTA blocks automated access (HTTP 403) and Google Scholar publishes no API and forbids
scraping, so neither can be read directly. Crossref's public REST API is used instead: it is
free, needs no key, and returns the authoritative DOI plus the full author list and venue for
work published by IEEE, Elsevier, Springer and most Indonesian journals (Sewagati and Jurnal
RESTI among them).

Imported records always arrive as DRAFT so an editor confirms them before they appear, and a
DOI already present is reported as a duplicate rather than inserted twice.
"""

import re
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from lib.auth import audit, require
from lib.cache import invalidate_public_cache
from lib.db import db
from lib.quality import publish_blockers, run_scan
from lib.serialize import jsonable
from models.content import Publication

router = APIRouter(tags=["publication-import"])

CROSSREF = "https://api.crossref.org/works"
# Crossref asks callers to identify themselves; a contact address earns the faster pool.
MAILTO = "telconnetlab@gmail.com"
UA = "TNL-Studio/1.0 (https://riset.its.ac.id/lab-tnl; mailto:telconnetlab@gmail.com)"

TITLES = [
    r"\bprof\b\.?", r"\bdr\b\.?", r"\bir\b\.?", r"\bdrs\b\.?", r"\bdra\b\.?",
    r"\bdr\.techn\b\.?", r"\bph\.?d\b\.?", r"\bdea\b\.?", r"\bs\.?t\b\.?",
    r"\bm\.?t\b\.?", r"\bs\.?kom\b\.?", r"\bm\.?kom\b\.?", r"\bb\.?eng\b\.?",
    r"\bm\.?eng\b\.?", r"\bm\.?sc\b\.?", r"\bb\.?sc\b\.?", r"\bipm\b\.?",
    r"\basean\s+eng\b\.?",
]


def clean_person_name(name: str) -> str:
    cleaned = (name or "").strip()
    for t in TITLES:
        cleaned = re.sub(t, "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"[^a-zA-Z\s]", " ", cleaned)
    return " ".join(cleaned.lower().split())


def author_matches_member(author_text: str, member_name: str) -> bool:
    clean_author = clean_person_name(author_text)
    clean_member = clean_person_name(member_name)
    if not clean_author or not clean_member:
        return False

    author_words = clean_author.split()
    member_words = clean_member.split()
    if not member_words:
        return False

    # Exact full name match
    if clean_member in clean_author:
        return True

    last_name = member_words[-1]
    first_name = member_words[0]
    initial = first_name[0]

    if last_name in author_words and len(last_name) >= 3:
        if first_name in author_words:
            return True
        for i, w in enumerate(author_words):
            if w == last_name:
                # Check initial before or after last name
                if i > 0 and (author_words[i - 1] == initial or initial in author_words[:i]):
                    return True
                if i + 1 < len(author_words) and author_words[i + 1] == initial:
                    return True

    return False


def match_authors_to_members(authors_str: str, members: list[dict]) -> list[str]:
    if not authors_str:
        return []
    matched: list[str] = []
    for m in members:
        if author_matches_member(authors_str, m.get("name") or ""):
            matched.append(m["id"])
    return matched


# Crossref type -> the publication types this CMS uses (journal | conference | book | other).
TYPE_MAP = {
    "journal-article": "journal",
    "proceedings-article": "conference",
    "book-chapter": "book",
    "book": "book",
    "monograph": "book",
    "posted-content": "other",
    "dataset": "other",
    "report": "other",
}


class ImportRequest(BaseModel):
    model_config = {"extra": "forbid"}
    dois: list[str] = Field(default_factory=list, max_length=25)


def _authors(item: dict) -> str:
    """Crossref author objects -> 'A. B. Surname, C. Surname' (et al. past six)."""
    names: list[str] = []
    for a in (item.get("author") or [])[:6]:
        family = (a.get("family") or "").strip()
        given = (a.get("given") or "").strip()
        if not family:
            if a.get("name"):
                names.append(a["name"].strip())
            continue
        initials = " ".join(f"{p[0]}." for p in given.replace("-", " ").split() if p)
        names.append(f"{initials} {family}".strip())
    if len(item.get("author") or []) > 6:
        names.append("et al.")
    return ", ".join(names)


def _year(item: dict) -> int | None:
    for field in ("issued", "published-print", "published-online", "created"):
        parts = ((item.get(field) or {}).get("date-parts") or [[None]])[0]
        if parts and parts[0]:
            return int(parts[0])
    return None


def _venue(item: dict) -> str:
    venue = (item.get("container-title") or [""])[0] or item.get("publisher") or ""
    vol, page = item.get("volume"), item.get("page")
    if vol:
        venue = f"{venue}, vol. {vol}"
    if item.get("issue"):
        venue = f"{venue}, no. {item['issue']}"
    if page:
        venue = f"{venue}, pp. {page}"
    return venue


def _normalise(item: dict) -> dict:
    title = (item.get("title") or [""])[0] or ""
    return {
        "doi": (item.get("DOI") or "").lower(),
        "title": " ".join(title.split()),
        "authors": _authors(item),
        "venue": _venue(item),
        "year": _year(item),
        "ptype": TYPE_MAP.get(item.get("type", ""), "other"),
        "abstract": "",
        "citations": item.get("is-referenced-by-count", 0),
    }


async def _crossref(params: dict) -> dict:
    try:
        async with httpx.AsyncClient(timeout=25, follow_redirects=True) as client:
            res = await client.get(CROSSREF, params={**params, "mailto": MAILTO},
                                   headers={"User-Agent": UA})
    except httpx.HTTPError:
        raise HTTPException(status_code=503,
                            detail="Could not reach Crossref just now. Please try again in a moment.")
    if res.status_code != 200:
        raise HTTPException(status_code=502, detail="Crossref returned an unexpected response.")
    return res.json().get("message", {})


@router.get("/admin/publications/search", dependencies=[Depends(require("content:create"))])
async def search_publications(q: str = "", author: str = "", year_from: int | None = None,
                              rows: int = 20):
    """Search Crossref by title text and/or author name. Results are marked when their DOI
    is already in the library so nothing is imported twice."""
    q, author = q.strip(), author.strip()
    if not q and not author:
        raise HTTPException(status_code=422, detail="Enter a title, keyword or author name to search.")
    params: dict = {
        "rows": max(1, min(rows, 50)),
        "select": "DOI,title,container-title,issued,published-print,published-online,created,"
                  "type,author,volume,issue,page,publisher,is-referenced-by-count",
        "sort": "issued", "order": "desc",
    }
    if q:
        params["query.bibliographic"] = q
    if author:
        params["query.author"] = author
    if year_from:
        params["filter"] = f"from-pub-date:{year_from}-01-01"

    message = await _crossref(params)
    items = [_normalise(i) for i in message.get("items", [])]
    items = [i for i in items if i["doi"] and i["title"]]

    existing = {
        (d.get("doi") or "").lower()
        for d in await db.publications.find({}, {"doi": 1}).to_list(2000)
        if d.get("doi")
    }
    for i in items:
        i["already_imported"] = i["doi"] in existing
    return jsonable({"items": items, "total": message.get("total-results", len(items))})


@router.post("/admin/publications/import", dependencies=[Depends(require("content:create"))])
async def import_publications(payload: ImportRequest, request: Request):
    """Import the chosen DOIs as drafts. Each DOI is re-fetched from Crossref directly so
    the stored record always matches the registered metadata, not a stale search hit."""
    dois = [d.strip().lower() for d in payload.dois if d.strip()]
    if not dois:
        raise HTTPException(status_code=422, detail="Select at least one paper to import.")

    imported: list[dict] = []
    duplicates: list[str] = []
    failed: list[str] = []

    all_members = await db.members.find({}, {"id": 1, "name": 1}).to_list(1000)

    for doi in dois:
        if await db.publications.find_one({"doi": doi}):
            duplicates.append(doi)
            continue
        try:
            async with httpx.AsyncClient(timeout=25, follow_redirects=True) as client:
                res = await client.get(f"{CROSSREF}/{doi}", params={"mailto": MAILTO},
                                       headers={"User-Agent": UA})
            if res.status_code != 200:
                failed.append(doi)
                continue
            data = _normalise(res.json().get("message", {}))
        except httpx.HTTPError:
            failed.append(doi)
            continue
        if not data["title"] or not data["year"]:
            failed.append(doi)
            continue

        matched_member_ids = match_authors_to_members(data["authors"], all_members)
        pub = Publication(
            title=data["title"], authors=data["authors"], venue=data["venue"],
            year=data["year"], ptype=data["ptype"], doi=data["doi"],
            abstract=data["abstract"], tags=[],
            linked_member_ids=matched_member_ids,
            status="draft",  # never auto-publish: an editor confirms every import
        ).model_dump()
        issues = run_scan("publications", pub)
        pub["issues"] = issues
        pub["needs_review"] = bool(issues)
        pub["imported_from"] = "crossref"
        pub["imported_at"] = datetime.now(timezone.utc)
        await db.publications.insert_one(pub)
        imported.append({"id": pub["id"], "title": pub["title"], "year": pub["year"],
                         "doi": pub["doi"], "blocking_issues": len(publish_blockers(issues)),
                         "linked_members_count": len(matched_member_ids)})

    if imported:
        await invalidate_public_cache("publications")
    await audit(request, "import", "publications", "crossref",
                {"imported": len(imported), "duplicates": len(duplicates), "failed": len(failed)})
    return jsonable({
        "imported": imported, "duplicates": duplicates, "failed": failed,
        "message": (f"{len(imported)} imported as draft"
                    + (f", {len(duplicates)} already in the library" if duplicates else "")
                    + (f", {len(failed)} could not be read" if failed else "")),
    })


@router.post("/admin/publications/relink-authors", dependencies=[Depends(require("content:create"))])
async def relink_publication_authors(request: Request):
    """Re-scan all publications and automatically match authors with internal lab members."""
    all_members = await db.members.find({}, {"id": 1, "name": 1}).to_list(1000)
    pubs = await db.publications.find({}).to_list(5000)
    updated_count = 0
    total_linked = 0

    for p in pubs:
        authors_str = p.get("authors") or ""
        matched_ids = match_authors_to_members(authors_str, all_members)
        existing_ids = p.get("linked_member_ids") or []
        # Update if changed or missing
        if set(matched_ids) != set(existing_ids):
            await db.publications.update_one(
                {"id": p["id"]},
                {"$set": {"linked_member_ids": matched_ids, "updated_at": datetime.now(timezone.utc)}},
            )
            updated_count += 1
        if matched_ids or existing_ids:
            total_linked += 1

    if updated_count:
        await invalidate_public_cache("publications")
    await audit(request, "relink-authors", "publications", None,
                {"updated_publications": updated_count, "total_with_links": total_linked})
    return {"ok": True, "updated": updated_count, "total_with_links": total_linked, "total": len(pubs)}

