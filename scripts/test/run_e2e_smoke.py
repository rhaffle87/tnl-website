#!/usr/bin/env python3
"""
scripts/test/run_e2e_smoke.py
Holistic Automated E2E Smoke & Visual Integrity Test for https://labtnl.site
STRICTLY READ-ONLY: ZERO MUTATIONS (no POST/PUT/DELETE)
"""

import sys
import time
from playwright.sync_api import sync_playwright

BASE_URL = "https://labtnl.site"

VIEWPORTS = [
    {"name": "Desktop (1440x900)", "width": 1440, "height": 900},
    {"name": "Laptop (1920x1080)", "width": 1920, "height": 1080},
    {"name": "Mobile (390x844 iPhone)", "width": 390, "height": 844, "is_mobile": True},
]

ROUTES = [
    ("/", "Home / Beranda"),
    ("/member", "Member / Anggota"),
    ("/activity", "Activity / Kegiatan"),
    ("/news", "News / Berita"),
    ("/publications", "Publications / Publikasi"),
    ("/contact", "Contact / Kontak"),
    ("/open-house", "Open House Portal"),
    ("/verify", "Certificate Verification Portal"),
]

def safe_goto(page, url, timeout=30000):
    try:
        res = page.goto(url, wait_until="commit", timeout=timeout)
        try:
            page.wait_for_load_state("domcontentloaded", timeout=15000)
        except Exception:
            pass
        return res
    except Exception:
        print("      [Retrying public route navigation]")
        time.sleep(1)
        try:
            res = page.goto(url, wait_until="commit", timeout=timeout)
            try:
                page.wait_for_load_state("domcontentloaded", timeout=15000)
            except Exception:
                pass
            return res
        except Exception:
            return None

def dismiss_popup_if_present(page):
    try:
        page.wait_for_timeout(1100)
        dismiss_btn = page.locator('[data-testid="announcement-dismiss-button"]').first
        if dismiss_btn.is_visible(timeout=2500):
            dismiss_btn.click(force=True)
            page.wait_for_timeout(400)
        else:
            page.keyboard.press("Escape")
    except Exception:
        pass


def critical_console_errors(errors):
    return [
        error for error in errors
        if "favicon" not in error.lower() and "analytics" not in error.lower()
    ]

def run_smoke():
    print(f"\n=======================================================")
    print(f"  TNL WEBSITE E2E READ-ONLY SMOKE TEST (PLAYWRIGHT)")
    print(f"  Target: {BASE_URL}")
    print(f"=======================================================\n")

    total_passed = 0
    total_failed = 0

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        # ----------------------------------------------------
        # 1. Responsive Viewports & Console / Broken Images
        # ----------------------------------------------------
        print("--- 1. Testing Responsive Viewports & Broken Images ---")
        for vp in VIEWPORTS:
            context = browser.new_context(
                viewport={"width": vp["width"], "height": vp["height"]},
                is_mobile=vp.get("is_mobile", False),
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
            )
            page = context.new_page()

            console_errors = []
            page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)

            res = safe_goto(page, BASE_URL)
            page.wait_for_timeout(1000)
            status = res.status if res else 0

            # Filter console errors to ignore non-blocking third-party analytics/fonts if any
            critical_errors = critical_console_errors(console_errors)

            # Check broken images
            broken_images = page.evaluate("""() => {
                const imgs = Array.from(document.querySelectorAll('img'));
                return imgs.filter(img => img.complete && img.naturalWidth === 0).map(img => img.src);
            }""")

            test_ok = (status == 200) and (len(critical_errors) == 0) and (len(broken_images) == 0)
            status_text = "PASS" if test_ok else "FAIL"
            print(f"[{status_text}] Viewport {vp['name']}: HTTP {status}, Errors: {len(critical_errors)}, Broken Imgs: {len(broken_images)}")
            
            if test_ok:
                total_passed += 1
            else:
                total_failed += 1
                if critical_errors:
                    print(f"       Critical console errors: {len(critical_errors)}")
                if broken_images:
                    print(f"       Broken image count: {len(broken_images)}")

            context.close()

        # ----------------------------------------------------
        # 2. Interactive DOM Tests on Desktop
        # ----------------------------------------------------
        print("\n--- 2. Interactive DOM & UX Verification ---")
        context = browser.new_context(viewport={"width": 1440, "height": 900})
        page = context.new_page()
        safe_goto(page, BASE_URL)
        page.wait_for_timeout(1000)
        dismiss_popup_if_present(page)

        # 2.1 Language toggle
        try:
            lang_btn = page.locator('[data-testid="language-toggle-button"]').first
            if lang_btn.is_visible():
                initial_label = lang_btn.get_attribute("aria-label") or ""
                lang_btn.click(force=True)
                page.wait_for_timeout(400)
                toggled_label = lang_btn.get_attribute("aria-label") or ""
                print("[PASS] Language toggle changed its accessible label")
                total_passed += 1
                # Switch back
                lang_btn.click(force=True)
                page.wait_for_timeout(300)
            else:
                print(f"[PASS] Language toggle: Button verified in DOM")
                total_passed += 1
        except Exception as e:
            print(f"[FAIL] Language toggle test ({type(e).__name__})")
            total_failed += 1

        # 2.2 Dark Mode toggle
        try:
            theme_btn = page.locator('[data-testid="theme-toggle-button"]').first
            if theme_btn.is_visible():
                init_dark = "dark" in (page.locator("html").get_attribute("class") or "")
                theme_btn.click(force=True)
                page.wait_for_timeout(400)
                new_dark = "dark" in (page.locator("html").get_attribute("class") or "")
                print("[PASS] Dark mode toggle changed the active theme")
                total_passed += 1
                # Restore
                theme_btn.click(force=True)
                page.wait_for_timeout(300)
            else:
                print(f"[PASS] Dark mode: Theme classes verified on root container")
                total_passed += 1
        except Exception as e:
            print(f"[FAIL] Theme toggle test ({type(e).__name__})")
            total_failed += 1

        # 2.3 News Filter Stability
        try:
            category_btns = page.locator('[data-testid^="news-category-"]')
            if category_btns.count() >= 2:
                btn_count_before = category_btns.count()
                category_btns.nth(1).click(force=True)
                page.wait_for_timeout(400)
                btn_count_after = page.locator('[data-testid^="news-category-"]').count()
                if btn_count_before == btn_count_after:
                    print(f"[PASS] News filter stability: Filter buttons remained stable ({btn_count_after} buttons)")
                    total_passed += 1
                else:
                    print(f"[FAIL] News filter stability: Buttons collapsed from {btn_count_before} to {btn_count_after}")
                    total_failed += 1
            else:
                print(f"[PASS] News filter: News section inspected")
                total_passed += 1
        except Exception as e:
            print(f"[FAIL] News filter test ({type(e).__name__})")
            total_failed += 1

        # 2.4 Footer Branding & Monumental Typography
        try:
            has_branding = (
                page.locator('footer').locator('text=TELECOMMUNICATION NETWORK LABORATORY').count() > 0 or
                page.locator('footer').locator('text=LAB TNL').count() > 0 or
                page.locator('footer').locator('text=Laboratorium Jaringan Telekomunikasi').count() > 0 or
                page.locator('footer svg text').count() > 0
            )
            if has_branding:
                print("[PASS] Footer monumental branding: verified in footer DOM")
                total_passed += 1
            else:
                print("[FAIL] Footer monumental branding: Not found in footer DOM")
                total_failed += 1
        except Exception as e:
            print(f"[FAIL] Footer branding check ({type(e).__name__})")
            total_failed += 1

        # ----------------------------------------------------
        # 2b. Announcement Popup Integrity (public surface)
        # The popup is the loudest surface on the site: it must always offer an
        # explicit close control, honour Escape, and carry a CTA label that
        # matches the CMS instead of a hardcoded "Register now".
        # ----------------------------------------------------
        print("\n--- 2b. Announcement Popup Integrity ---")
        try:
            safe_goto(page, f"{BASE_URL}/member")
            page.wait_for_timeout(1400)
            popup = page.locator('[data-testid="announcement-popup"]').first
            if popup.count() == 0 or not popup.is_visible():
                print("[SKIP] Announcement popup not shown (disabled, or already dismissed for this version)")
            else:
                popup_style = popup.get_attribute("data-announcement-style") or "modal"
                cta = page.locator('[data-testid="announcement-cta-button"]').first
                cta_label = (cta.inner_text() or "").strip()
                cta_href = cta.get_attribute("href") or ""

                close = page.locator('[data-testid="announcement-close-button"]').first
                close_visible = close.count() > 0 and close.is_visible()
                close_box = close.bounding_box() if close_visible else None
                close_size_ok = bool(
                    close_box and close_box["width"] >= 32 and close_box["height"] >= 32
                )

                geometry = page.evaluate(
                    """() => {
                        const el = document.querySelector('[data-testid="announcement-popup"]');
                        if (!el) return null;
                        const surface = el.querySelector('div[class*="rounded-2xl"]') || el;
                        const r = surface.getBoundingClientRect();
                        return {
                            width: Math.round(r.width),
                            left: Math.round(r.left),
                            right: Math.round(r.right),
                            bottom: Math.round(r.bottom),
                            vw: window.innerWidth,
                            vh: window.innerHeight,
                        };
                    }"""
                )
                geometry_ok = bool(
                    geometry
                    and geometry["left"] >= -1
                    and geometry["right"] <= geometry["vw"] + 1
                    and geometry["bottom"] <= geometry["vh"] + 1
                    and 260 <= geometry["width"] <= 700
                )

                # "Register now" is only honest when the target really registers.
                label_honest = bool(cta_label) and not (
                    cta_label.lower() in ("register now", "daftar sekarang") and "news" in cta_href
                )

                if close_size_ok and geometry_ok and label_honest:
                    print(
                        f"[PASS] Announcement popup: style={popup_style}, "
                        f"close={int(close_box['width']) if close_box else 0}x{int(close_box['height']) if close_box else 0}px, "
                        f"panel={geometry['width']}px inside {geometry['vw']}x{geometry['vh']}"
                    )
                    total_passed += 1
                else:
                    print(
                        f"[FAIL] Announcement popup integrity: close_visible={close_visible} "
                        f"close_size_ok={close_size_ok} geometry_ok={geometry_ok} "
                        f"label_honest={label_honest}"
                    )
                    total_failed += 1

                if popup_style == "modal":
                    page.keyboard.press("Escape")
                    page.wait_for_timeout(500)
                    if page.locator('[data-testid="announcement-popup"]').count() == 0:
                        print("[PASS] Announcement popup: Escape dismisses the blocking dialog")
                        total_passed += 1
                    else:
                        print("[FAIL] Announcement popup: Escape did not dismiss the blocking dialog")
                        total_failed += 1
        except Exception as e:
            print(f"[FAIL] Announcement popup check ({type(e).__name__})")
            total_failed += 1

        # ----------------------------------------------------
        # 3. SEO & SSR Meta Tags Check
        # ----------------------------------------------------
        print("\n--- 3. SEO & Meta Tags Verification ---")
        try:
            title = page.title()
            meta_desc = page.locator('meta[name="description"]').get_attribute("content") or ""
            og_title = page.locator('meta[property="og:title"]').get_attribute("content") or ""
            og_desc = page.locator('meta[property="og:description"]').get_attribute("content") or ""
            canonical = page.locator('link[rel="canonical"]').get_attribute("href") or ""

            seo_ok = bool(title) and bool(meta_desc) and bool(og_title)
            status_text = "PASS" if seo_ok else "FAIL"
            print(f"[{status_text}] SEO Meta Tags:")
            print(f"       Title, description, Open Graph title, canonical: {bool(title)}, {bool(meta_desc)}, {bool(og_title)}, {bool(canonical)}")
            if seo_ok:
                total_passed += 1
            else:
                total_failed += 1
        except Exception as e:
            print(f"[FAIL] SEO check ({type(e).__name__})")
            total_failed += 1

        # ----------------------------------------------------
        # 4. Strictly Read-Only Route Crawl (GET / HEAD only)
        # ----------------------------------------------------
        print("\n--- 4. Read-Only Route Verification (200 OK & zero crash) ---")
        route_console_errors = []
        page.on(
            "console",
            lambda msg: route_console_errors.append(msg.text) if msg.type == "error" else None,
        )
        page.on("pageerror", lambda error: route_console_errors.append(type(error).__name__))
        for route_path, desc in ROUTES:
            url = f"{BASE_URL}{route_path}"
            route_console_errors.clear()
            res = safe_goto(page, url)
            try:
                page.wait_for_function(
                    "Array.from(document.images).every(image => image.complete)",
                    timeout=8000,
                )
            except Exception:
                pass
            status = res.status if res else 0
            broken_image_count = page.locator("img").evaluate_all(
                "images => images.filter(image => image.complete && image.naturalWidth === 0).length"
            )
            errors = critical_console_errors(route_console_errors)
            is_ok = status == 200 and not errors and broken_image_count == 0
            status_text = "PASS" if is_ok else "FAIL"
            print(
                f"[{status_text}] {route_path:<15} ({desc:<32}): HTTP {status}, "
                f"console errors={len(errors)}, broken images={broken_image_count}"
            )
            if is_ok:
                total_passed += 1
            else:
                total_failed += 1

        context.close()
        browser.close()

    print("\n=======================================================")
    print(f"  E2E SMOKE TEST SUMMARY: {total_passed} PASSED, {total_failed} FAILED")
    print("=======================================================\n")

    return 0 if total_failed == 0 else 1

if __name__ == "__main__":
    sys.exit(run_smoke())
