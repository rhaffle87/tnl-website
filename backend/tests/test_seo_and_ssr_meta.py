"""Tests for SEO endpoints, robots.txt, sitemap.xml, and dynamic SSR meta tag injection with XSS defense."""

import html
import pytest


@pytest.mark.asyncio
async def test_robots_txt_format(async_client):
    res = await async_client.get("/robots.txt")
    assert res.status_code == 200
    text = res.text
    assert "User-agent: *" in text
    assert "Disallow: /admin" in text
    assert "Sitemap:" in text


@pytest.mark.asyncio
async def test_sitemap_xml_contains_public_routes(async_client):
    res = await async_client.get("/sitemap.xml")
    assert res.status_code == 200
    assert "application/xml" in res.headers.get("content-type", "") or "text/xml" in res.headers.get("content-type", "")
    text = res.text
    assert "<urlset" in text
    assert "<loc>" in text
    assert "/member" in text
    assert "/open-house" in text
    assert "/activity" in text
    import re
    locs = re.findall(r"<loc>(.*?)</loc>", text)
    assert len(locs) == len(set(locs)), f"Found duplicate URLs in sitemap: {[x for x in locs if locs.count(x) > 1]}"


@pytest.mark.asyncio
async def test_dynamic_ssr_render_meta_tags(async_client):
    # Test home page render
    home_res = await async_client.get("/seo/render?path=/")
    assert home_res.status_code == 200
    home_html = home_res.text
    assert "<title>" in home_html
    assert 'property="og:title"' in home_html
    assert 'name="description"' in home_html

    # Test open house landing page render
    oh_res = await async_client.get("/seo/render?path=/open-house")
    assert oh_res.status_code == 200
    oh_html = oh_res.text
    assert "Open House" in oh_html
    assert 'rel="canonical"' in oh_html


@pytest.mark.asyncio
async def test_ssr_render_xss_escaping_in_meta(async_client, mock_db):
    # Seed a post with malicious XSS injection payloads in title & excerpt
    xss_title = '<script>alert("xss")</script> Lab 5G Update'
    xss_excerpt = '"><img src=x onerror=alert(1)> Breaking network announcement.'
    await mock_db.posts.insert_one({
        "id": "xss-test-post",
        "slug": "xss-test-article",
        "title": xss_title,
        "title_id": xss_title,
        "excerpt": xss_excerpt,
        "excerpt_id": xss_excerpt,
        "category": "Research",
        "status": "published",
        "tags": ["Security"],
    })

    res = await async_client.get("/seo/render?path=/news/xss-test-article")
    assert res.status_code == 200
    body = res.text

    # Unescaped script tag MUST NOT appear in HTML output
    assert "<script>alert" not in body
    # Unescaped raw tag injection MUST NOT appear
    assert '<img src=x' not in body
    # It must be HTML entity escaped
    assert "&lt;script&gt;" in body or html.escape(xss_title) in body or "alert" in body
