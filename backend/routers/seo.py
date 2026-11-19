"""SEO surfaces: sitemap.xml, robots.txt and JSON-LD, all base-path aware."""

import os
from datetime import datetime

from fastapi import APIRouter
from fastapi.responses import Response

from lib.db import db
from lib.settings import get_settings

router = APIRouter(tags=["seo"])


def site_base() -> str:
    return (os.environ.get("PUBLIC_SITE_URL") or os.environ.get("APP_URL") or "").rstrip("/")


@router.api_route("/sitemap.xml", methods=["GET", "HEAD"])
async def sitemap():
    base = site_base()
    urls: list[tuple[str, str | None]] = [
        ("/", None), ("/member", None), ("/activity", None), ("/open-house", None), ("/news", None),
        ("/contact", None), ("/publications", None), ("/terms", None), ("/privacy", None),
    ]
    for post in await db.posts.find({"status": "published"}, {"slug": 1, "published_at": 1}).to_list(1000):
        when = post.get("published_at")
        urls.append((f"/news/{post.get('slug')}",
                     when.date().isoformat() if hasattr(when, "date") else None))
    for ev in await db.events.find({"status": "published"}, {"slug": 1}).to_list(500):
        urls.append((f"/activity/event/{ev.get('slug')}", None))
    for page in await db.pages.find({"status": "published"}, {"slug": 1}).to_list(200):
        slug = page.get("slug")
        if slug and slug not in ("home",):
            urls.append((f"/{slug}", None))

    body = ['<?xml version="1.0" encoding="UTF-8"?>',
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for path, lastmod in urls:
        body.append("  <url>")
        body.append(f"    <loc>{base}{path}</loc>")
        if lastmod:
            body.append(f"    <lastmod>{lastmod}</lastmod>")
        body.append("  </url>")
    body.append("</urlset>")
    return Response(content="\n".join(body), media_type="application/xml")


@router.api_route("/robots.txt", methods=["GET", "HEAD"])
async def robots():
    base = site_base()
    s = await get_settings()
    lines = ["User-agent: *"]
    if s.get("maintenance_mode"):
        lines.append("Disallow: /")
    else:
        lines += ["Disallow: /admin", "Disallow: /api/admin", "Allow: /"]
    lines.append(f"Sitemap: {base}/sitemap.xml")
    return Response(content="\n".join(lines) + "\n", media_type="text/plain")


@router.get("/jsonld")
async def jsonld():
    """Organization + ItemList JSON-LD, injected by the frontend shell."""
    s = await get_settings()
    base = site_base()
    contact = s.get("contact") or {}
    social = [v for v in (s.get("social") or {}).values() if v]
    return {
        "@context": "https://schema.org",
        "@type": "ResearchOrganization",
        "name": s.get("site_title"),
        "alternateName": s.get("short_name"),
        "url": base or None,
        "logo": "https://labtnl.site/assets/brand/tnl-logo-badge.png",
        "email": contact.get("email"),
        "sameAs": social,
        "parentOrganization": {
            "@type": "CollegeOrUniversity",
            "name": "Institut Teknologi Sepuluh Nopember",
            "url": "https://www.its.ac.id",
        },
        "address": {
            "@type": "PostalAddress",
            "streetAddress": contact.get("address"),
            "addressLocality": "Surabaya",
            "addressCountry": "ID",
        },
        "dateModified": datetime.utcnow().date().isoformat(),
    }
