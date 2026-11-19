"""SEO surfaces: sitemap.xml, robots.txt, JSON-LD, and dynamic server-side OG meta injector."""

import html
import os
import re
from datetime import datetime

from fastapi import APIRouter, Query
from fastapi.responses import HTMLResponse, Response

from lib.db import db
from lib.settings import get_settings

router = APIRouter(tags=["seo"])

# Cached HTML template with mtime check
_CACHED_INDEX_HTML: str | None = None
_CACHED_INDEX_MTIME: float = 0.0
_CACHED_INDEX_PATH: str | None = None


def find_index_html_path() -> str | None:
    global _CACHED_INDEX_PATH  # noqa: PLW0603
    if _CACHED_INDEX_PATH and os.path.isfile(_CACHED_INDEX_PATH):
        return _CACHED_INDEX_PATH

    candidates = [
        os.environ.get("FRONTEND_INDEX_PATH", ""),
        "/opt/tnl/frontend/dist/index.html",
        "/var/www/tnl/index.html",
        os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist", "index.html")),
        os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend", "dist", "index.html")),
    ]
    for c in candidates:
        if c and os.path.isfile(c):
            _CACHED_INDEX_PATH = c
            return c
    return None


def get_base_index_html() -> str:
    global _CACHED_INDEX_HTML, _CACHED_INDEX_MTIME  # noqa: PLW0603
    path = find_index_html_path()
    if not path:
        return "<!doctype html><html><head><title>TNL Laboratory</title></head><body><div id='root'></div></body></html>"

    try:
        mtime = os.path.getmtime(path)
        if _CACHED_INDEX_HTML is None or mtime > _CACHED_INDEX_MTIME:
            with open(path, "r", encoding="utf-8") as f:
                _CACHED_INDEX_HTML = f.read()
            _CACHED_INDEX_MTIME = mtime
        return _CACHED_INDEX_HTML
    except Exception:
        if _CACHED_INDEX_HTML:
            return _CACHED_INDEX_HTML
        return "<!doctype html><html><head><title>TNL Laboratory</title></head><body><div id='root'></div></body></html>"


def site_base() -> str:
    return (os.environ.get("PUBLIC_SITE_URL") or os.environ.get("APP_URL") or "https://labtnl.site").rstrip("/")


@router.get("/seo/render", response_class=HTMLResponse)
async def render_ssr_shell(path: str = Query("/")) -> HTMLResponse:
    """Dynamic server-side Open Graph and meta tag injector for React SPA shell."""
    base = site_base()
    raw_html = get_base_index_html()

    clean_path = "/" + path.strip().lstrip("/").split("?")[0]
    canonical_url = f"{base}{clean_path if clean_path != '/' else ''}"

    # Default fallback metadata
    title = "Laboratorium Jaringan Telekomunikasi — Institut Teknologi Sepuluh Nopember"
    desc = (
        "Laboratorium Jaringan Telekomunikasi (TNL) Departemen Teknik Elektro FTEIC ITS Surabaya. "
        "Riset, praktikum, pelatihan, dan inovasi jaringan telekomunikasi modern."
    )
    image_url = f"{base}/assets/brand/tnl-logo-badge.png"
    og_type = "website"

    try:
        if clean_path in ("/", ""):
            s = await get_settings()
            if s.get("site_title"):
                title = f"{s.get('site_title')} — Institut Teknologi Sepuluh Nopember"
            if (s.get("seo") or {}).get("default_description"):
                desc = s["seo"]["default_description"]

        elif clean_path == "/open-house":
            ev = await db.events.find_one({"slug": "open-house-tnl", "status": "published"})
            if not ev:
                ev = await db.events.find_one({"status": "published", "type": {"$in": ["open_house", "recruitment"]}})
            if ev:
                t = ev.get("title") or "Open House Laboratorium TNL 2026"
                title = f"Pendaftaran {t} — Laboratorium Jaringan Telekomunikasi ITS"
                desc = ev.get("description") or desc
                if ev.get("cover_image"):
                    image_url = ev["cover_image"]
                elif ev.get("poster_urls") and len(ev["poster_urls"]) > 0:
                    image_url = ev["poster_urls"][0]
            else:
                title = "Pendaftaran Open House TNL 2026 — Laboratorium Jaringan Telekomunikasi ITS"
                desc = "Pendaftaran Open House Laboratorium Jaringan Telekomunikasi ITS. Eksplorasi fasilitas testbed, riset telekomunikasi, dan konsultasi asisten lab."

        elif clean_path.startswith("/news/"):
            slug = clean_path[len("/news/"):].strip("/")
            post = await db.posts.find_one({"slug": slug, "status": "published"})
            if post:
                title = f"{post.get('title')} — Kabar Lab TNL ITS"
                desc = post.get("excerpt") or desc
                if post.get("cover_url"):
                    image_url = post["cover_url"]
                og_type = "article"
            else:
                title = "Berita & Pengumuman — Laboratorium Jaringan Telekomunikasi ITS"

        elif clean_path == "/news":
            title = "Berita & Pengumuman — Laboratorium Jaringan Telekomunikasi ITS"
            desc = "Kabar terbaru seputar riset, pengumuman praktikum, open recruitment asisten, dan prestasi Lab TNL ITS."

        elif clean_path == "/member":
            title = "Tim & Peneliti — Laboratorium Jaringan Telekomunikasi ITS"
            desc = "Profil dosen pembina, asisten laboratorium, dan alumni Laboratorium Jaringan Telekomunikasi Teknik Elektro ITS Surabaya."

        elif clean_path == "/activity":
            title = "Aktivitas & Fasilitas — Laboratorium Jaringan Telekomunikasi ITS"
            desc = "Kegiatan riset, praktikum jaringan telekomunikasi, fasilitas testbed B-301, dan sertifikasi industri di Lab TNL ITS."

        elif clean_path == "/publications":
            title = "Publikasi Ilmiah — Laboratorium Jaringan Telekomunikasi ITS"
            desc = "Daftar publikasi jurnal, prosiding konferensi internasional IEEE/Scopus oleh peneliti Lab TNL ITS."

        elif clean_path == "/contact":
            title = "Kontak & Lokasi — Laboratorium Jaringan Telekomunikasi ITS"
            desc = "Hubungi Laboratorium Jaringan Telekomunikasi ITS. Ruang B-301 Gedung B Lantai 3 Teknik Elektro ITS Surabaya."

        elif clean_path == "/verify":
            title = "Verifikasi e-Sertifikat — Laboratorium Jaringan Telekomunikasi ITS"
            desc = "Sistem validasi keaslian sertifikat kegiatan, pelatihan, dan praktikum resmi dari Laboratorium Jaringan Telekomunikasi ITS."

        elif clean_path.startswith("/verify/"):
            code = clean_path[len("/verify/"):].strip("/")
            title = f"Verifikasi Sertifikat {code} — Laboratorium Jaringan Telekomunikasi ITS"
            desc = f"Validasi keaslian e-sertifikat resmi #{code} di Laboratorium Jaringan Telekomunikasi ITS."

        elif clean_path == "/terms":
            title = "Syarat & Ketentuan — Laboratorium Jaringan Telekomunikasi ITS"
            desc = "Syarat dan ketentuan penggunaan layanan dan informasi situs web Laboratorium Jaringan Telekomunikasi ITS."

        elif clean_path == "/privacy":
            title = "Kebijakan Privasi (UU PDP) — Laboratorium Jaringan Telekomunikasi ITS"
            desc = "Kebijakan perlindungan data pribadi pengunjung dan pendaftar kegiatan sesuai UU Nomor 27 Tahun 2022 (UU PDP)."

        else:
            page_slug = clean_path.lstrip("/")
            page = await db.pages.find_one({"slug": page_slug, "status": "published"})
            if page:
                title = f"{page.get('title')} — Laboratorium Jaringan Telekomunikasi ITS"
                if page.get("meta_description"):
                    desc = page["meta_description"]
    except Exception:
        pass

    if image_url.startswith("/"):
        image_url = f"{base}{image_url}"

    safe_title = html.escape(title)
    safe_desc = html.escape(desc)
    safe_img = html.escape(image_url)
    safe_url = html.escape(canonical_url)

    rendered = raw_html

    # Replace <title>...</title>
    rendered = re.sub(
        r"<title>.*?</title>",
        f"<title>{safe_title}</title>",
        rendered,
        count=1,
        flags=re.DOTALL | re.IGNORECASE,
    )

    # Replace or insert meta description
    if re.search(r'<meta\s+name=["\']description["\']', rendered, flags=re.IGNORECASE):
        rendered = re.sub(
            r'<meta\s+name=["\']description["\']\s+content=["\'].*?["\']\s*/?>',
            f'<meta name="description" content="{safe_desc}" />',
            rendered,
            count=1,
            flags=re.IGNORECASE | re.DOTALL,
        )
    else:
        rendered = rendered.replace("</head>", f'  <meta name="description" content="{safe_desc}" />\n  </head>')

    # Replace or insert Open Graph tags
    if re.search(r'<meta\s+property=["\']og:title["\']', rendered, flags=re.IGNORECASE):
        rendered = re.sub(
            r'<meta\s+property=["\']og:title["\']\s+content=["\'].*?["\']\s*/?>',
            f'<meta property="og:title" content="{safe_title}" />',
            rendered,
            count=1,
            flags=re.IGNORECASE,
        )
    else:
        rendered = rendered.replace("</head>", f'  <meta property="og:title" content="{safe_title}" />\n  </head>')

    if re.search(r'<meta\s+property=["\']og:description["\']', rendered, flags=re.IGNORECASE):
        rendered = re.sub(
            r'<meta\s+property=["\']og:description["\']\s+content=["\'].*?["\']\s*/?>',
            f'<meta property="og:description" content="{safe_desc}" />',
            rendered,
            count=1,
            flags=re.IGNORECASE,
        )
    else:
        rendered = rendered.replace("</head>", f'  <meta property="og:description" content="{safe_desc}" />\n  </head>')

    if re.search(r'<meta\s+property=["\']og:image["\']', rendered, flags=re.IGNORECASE):
        rendered = re.sub(
            r'<meta\s+property=["\']og:image["\']\s+content=["\'].*?["\']\s*/?>',
            f'<meta property="og:image" content="{safe_img}" />',
            rendered,
            count=1,
            flags=re.IGNORECASE,
        )
    else:
        rendered = rendered.replace("</head>", f'  <meta property="og:image" content="{safe_img}" />\n  </head>')

    if re.search(r'<meta\s+property=["\']og:type["\']', rendered, flags=re.IGNORECASE):
        rendered = re.sub(
            r'<meta\s+property=["\']og:type["\']\s+content=["\'].*?["\']\s*/?>',
            f'<meta property="og:type" content="{og_type}" />',
            rendered,
            count=1,
            flags=re.IGNORECASE,
        )
    else:
        rendered = rendered.replace("</head>", f'  <meta property="og:type" content="{og_type}" />\n  </head>')

    # Extra tags: canonical, og:url, twitter cards
    extra_tags = [
        f'<link rel="canonical" href="{safe_url}" />',
        f'<meta property="og:url" content="{safe_url}" />',
        '<meta name="twitter:card" content="summary_large_image" />',
        f'<meta name="twitter:title" content="{safe_title}" />',
        f'<meta name="twitter:description" content="{safe_desc}" />',
        f'<meta name="twitter:image" content="{safe_img}" />',
    ]
    rendered = re.sub(r'<link\s+rel=["\']canonical["\'].*?>', "", rendered, flags=re.IGNORECASE)
    rendered = re.sub(r'<meta\s+property=["\']og:url["\'].*?>', "", rendered, flags=re.IGNORECASE)
    rendered = re.sub(r'<meta\s+name=["\']twitter:.*?["\'].*?>', "", rendered, flags=re.IGNORECASE)

    extra_str = "\n    " + "\n    ".join(extra_tags) + "\n  "
    rendered = rendered.replace("</head>", f"{extra_str}</head>")

    return HTMLResponse(
        content=rendered,
        headers={
            "Cache-Control": "no-cache, must-revalidate",
            "X-Robots-Tag": "index, follow",
        },
    )


@router.api_route("/sitemap.xml", methods=["GET", "HEAD"])
async def sitemap():
    base = site_base()
    urls: list[tuple[str, str | None]] = [
        ("/", None), ("/member", None), ("/activity", None), ("/open-house", None), ("/news", None),
        ("/contact", None), ("/publications", None), ("/verify", None), ("/terms", None), ("/privacy", None),
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
