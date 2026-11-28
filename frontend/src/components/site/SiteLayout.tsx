// Public site shell: locale provider, chrome, announcement popup, SEO head tags,
// and the maintenance notice. Renders fully without a backend.

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { AnnouncementPopup, MobileRegistrationBar, SiteCollaborationBand, SiteFooter, SiteHeader } from "@/components/site/Chrome";
import { ReadingProgressBar } from "@/components/site/ReadingProgressBar";
import { SmoothScrollProvider } from "@/components/site/SmoothScrollProvider";
import { LOCALE_STORAGE_KEY, LocaleContext, STRINGS, pick, useLocale, type Locale, type StringKey } from "@/lib/i18n/i18n";
import { useApplyThemeTokens, useThemeMode } from "@/lib/theme/theme";
import { useEvent, usePage, usePagePreview, usePost, useSettings } from "@/lib/api/hooks";

const ROUTE_META: Record<string, { titleId: string; titleEn: string; descId: string; descEn: string }> = {
    "/": {
        titleId: "Laboratorium Jaringan Telekomunikasi — Institut Teknologi Sepuluh Nopember",
        titleEn: "Telecommunication Network Laboratory — Institut Teknologi Sepuluh Nopember",
        descId: "Laboratorium Jaringan Telekomunikasi (TNL) Departemen Teknik Elektro FTEIC ITS Surabaya. Riset, praktikum, pelatihan, dan inovasi jaringan modern.",
        descEn: "Telecommunication Network Laboratory (TNL), Department of Electrical Engineering, ITS Surabaya. Research, practicum, and network engineering.",
    },
    "/member": {
        titleId: "Tim & Peneliti — Laboratorium Jaringan Telekomunikasi ITS",
        titleEn: "People & Researchers — Telecommunication Network Laboratory ITS",
        descId: "Profil dosen pembina, asisten laboratorium, dan alumni Laboratorium Jaringan Telekomunikasi Teknik Elektro ITS Surabaya.",
        descEn: "Faculty advisors, laboratory assistants, and alumni of the Telecommunication Network Laboratory, ITS Surabaya.",
    },
    "/activity": {
        titleId: "Aktivitas & Fasilitas — Laboratorium Jaringan Telekomunikasi ITS",
        titleEn: "Activities & Facilities — Telecommunication Network Laboratory ITS",
        descId: "Kegiatan riset, praktikum jaringan telekomunikasi, fasilitas testbed B-301, dan sertifikasi industri di Lab TNL ITS.",
        descEn: "Research activities, network engineering practicum, B-301 testbed facilities, and industrial certifications.",
    },
    "/open-house": {
        titleId: "Pendaftaran Open House TNL 2026 — Laboratorium Jaringan Telekomunikasi ITS",
        titleEn: "TNL Open House 2026 Registration — Telecommunication Network Laboratory ITS",
        descId: "Pendaftaran Open House Laboratorium Jaringan Telekomunikasi ITS. Eksplorasi fasilitas testbed, riset telekomunikasi, dan konsultasi asisten lab.",
        descEn: "Register for TNL Open House 2026. Explore laboratory testbed facilities, research initiatives, and talk with lab assistants.",
    },
    "/news": {
        titleId: "Berita & Pengumuman — Laboratorium Jaringan Telekomunikasi ITS",
        titleEn: "News & Announcements — Telecommunication Network Laboratory ITS",
        descId: "Kabar terbaru seputar riset, pengumuman praktikum, open recruitment asisten, dan prestasi Lab TNL ITS.",
        descEn: "Latest updates on telecommunications research, practicum schedules, recruitment, and lab achievements.",
    },
    "/publications": {
        titleId: "Publikasi Ilmiah — Laboratorium Jaringan Telekomunikasi ITS",
        titleEn: "Scientific Publications — Telecommunication Network Laboratory ITS",
        descId: "Daftar publikasi jurnal, prosiding konferensi internasional IEEE/Scopus oleh peneliti Lab TNL ITS.",
        descEn: "Academic journals, IEEE conference proceedings, and research papers from TNL researchers.",
    },
    "/contact": {
        titleId: "Kontak & Lokasi — Laboratorium Jaringan Telekomunikasi ITS",
        titleEn: "Contact & Location — Telecommunication Network Laboratory ITS",
        descId: "Hubungi Laboratorium Jaringan Telekomunikasi ITS. Ruang B-301 Gedung B Lantai 3 Teknik Elektro ITS Surabaya.",
        descEn: "Contact Telecommunication Network Laboratory ITS. Room B-301, 3rd Floor Electrical Engineering Building, ITS Surabaya.",
    },
    "/verify": {
        titleId: "Verifikasi e-Sertifikat — Laboratorium Jaringan Telekomunikasi ITS",
        titleEn: "Verify e-Certificate — Telecommunication Network Laboratory ITS",
        descId: "Sistem validasi keaslian sertifikat kegiatan, pelatihan, dan praktikum resmi dari Laboratorium Jaringan Telekomunikasi ITS.",
        descEn: "Authenticity validation system for official activity, training, and practicum certificates issued by Telecommunication Network Laboratory ITS.",
    },
    "/terms": {
        titleId: "Ketentuan Penggunaan — Laboratorium Jaringan Telekomunikasi ITS",
        titleEn: "Terms of Use — Telecommunication Network Laboratory ITS",
        descId: "Ketentuan hukum penggunaan situs, modul praktikum, dan portal verifikasi sertifikat Laboratorium Jaringan Telekomunikasi ITS.",
        descEn: "Terms and conditions of using the Telecommunication Network Laboratory ITS website, practicum modules, and certificate verification portals.",
    },
    "/privacy": {
        titleId: "Kebijakan Privasi (UU PDP No. 27/2022) — Laboratorium Jaringan Telekomunikasi ITS",
        titleEn: "Privacy Policy (Indonesian PDP Law) — Telecommunication Network Laboratory ITS",
        descId: "Kebijakan perlindungan data pribadi sesuai UU No. 27 Tahun 2022 (UU PDP) di Laboratorium Jaringan Telekomunikasi ITS.",
        descEn: "Comprehensive personal data protection policy under Indonesian Law No. 27/2022 (UU PDP) at Telecommunication Network Laboratory ITS.",
    },
};

function useHeadTags() {
    const { data: settings } = useSettings();
    const location = useLocation();
    const { locale } = useLocale();
    const postSlug = routeSlug(location.pathname, /^\/news\/([^/]+)\/?$/);
    const eventSlug = routeSlug(location.pathname, /^\/activity\/events\/([^/]+)\/?$/);
    const pageSlug = routeSlug(location.pathname, /^\/p\/([^/]+)\/?$/);
    const previewId = pageSlug ? new URLSearchParams(location.search).get("preview") || undefined : undefined;
    const postQuery = usePost(postSlug);
    const eventQuery = useEvent(eventSlug);
    const pageQuery = usePage(pageSlug, { enabled: !previewId });
    const previewQuery = usePagePreview(pageSlug, previewId);

    useEffect(() => {
        if (!settings) return;
        const dynamicLoading = postSlug
            ? postQuery.isLoading && !postQuery.data
            : eventSlug
                ? eventQuery.isLoading && !eventQuery.data
                : pageSlug && (previewId ? previewQuery.isLoading && !previewQuery.data : pageQuery.isLoading && !pageQuery.data);
        if (dynamicLoading) return;

        const dynamicPage = previewId ? previewQuery.data : pageQuery.data;
        const metaInfo = postSlug && postQuery.data ? {
            titleId: postQuery.data.seo?.title || `${pick("id", postQuery.data.title, postQuery.data.title_id)} — Kabar Lab TNL ITS`,
            titleEn: postQuery.data.seo?.title || `${postQuery.data.title} — Kabar Lab TNL ITS`,
            descId: postQuery.data.seo?.description || pick("id", postQuery.data.excerpt, postQuery.data.excerpt_id) || settings.seo?.default_description || "",
            descEn: postQuery.data.seo?.description || postQuery.data.excerpt || settings.seo?.default_description || "",
        } : eventSlug && eventQuery.data ? {
            titleId: `${pick("id", eventQuery.data.title, eventQuery.data.title_id)} — Laboratorium Jaringan Telekomunikasi ITS`,
            titleEn: `${eventQuery.data.title} — Telecommunication Network Laboratory ITS`,
            descId: pick("id", eventQuery.data.description, eventQuery.data.description_id) || settings.seo?.default_description || "",
            descEn: eventQuery.data.description || settings.seo?.default_description || "",
        } : pageSlug && dynamicPage ? {
            titleId: `${pick("id", dynamicPage.title, dynamicPage.title_id)} — Laboratorium Jaringan Telekomunikasi ITS`,
            titleEn: `${dynamicPage.title} — Telecommunication Network Laboratory ITS`,
            descId: dynamicPage.meta_description || settings.seo?.default_description || "",
            descEn: dynamicPage.meta_description || settings.seo?.default_description || "",
        } : ROUTE_META[location.pathname] || {
            titleId: settings.site_title,
            titleEn: settings.site_title,
            descId: settings.seo?.default_description ?? "",
            descEn: settings.seo?.default_description ?? "",
        };

        const pageTitle = locale === "id" ? metaInfo.titleId : metaInfo.titleEn;
        const pageDesc = locale === "id" ? metaInfo.descId : metaInfo.descEn;

        document.title = pageTitle;

        const ensure = (selector: string, create: () => HTMLElement): HTMLElement => {
            let el = document.head.querySelector(selector) as HTMLElement | null;
            if (!el) {
                el = create();
                document.head.appendChild(el);
            }
            return el;
        };

        const metaDesc = ensure('meta[name="description"]', () => {
            const m = document.createElement("meta");
            m.setAttribute("name", "description");
            return m;
        });
        metaDesc.setAttribute("content", pageDesc);

        // Canonical URL
        const canonicalOrigin = new URL(
            document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href || "https://labtnl.site",
        ).origin;
        const basePath = import.meta.env.BASE_URL.endsWith("/") ? import.meta.env.BASE_URL.slice(0, -1) : import.meta.env.BASE_URL;
        const canonicalPath = `${basePath}${location.pathname === "/" ? "" : location.pathname}`;
        const canonicalUrl = `${canonicalOrigin}${canonicalPath || "/"}`;
        const canonicalTag = ensure('link[rel="canonical"]', () => {
            const l = document.createElement("link");
            l.setAttribute("rel", "canonical");
            return l;
        });
        canonicalTag.setAttribute("href", canonicalUrl);

        // Open Graph
        const socialImage = postQuery.data?.cover_url || postQuery.data?.seo?.og_image_url || eventQuery.data?.cover_image || eventQuery.data?.poster_urls?.[0] || settings.seo?.og_image_url || "https://labtnl.site/assets/brand/tnl-logo-badge.png";
        const absoluteSocialImage = socialImage.startsWith("http") ? socialImage : `${canonicalOrigin}${socialImage.startsWith("/") ? "" : "/"}${socialImage}`;
        for (const [prop, value] of [
            ["og:title", pageTitle],
            ["og:description", pageDesc],
            ["og:type", postSlug ? "article" : "website"],
            ["og:url", canonicalUrl],
            ["og:image", absoluteSocialImage],
        ] as const) {
            const tag = ensure(`meta[property="${prop}"]`, () => {
                const m = document.createElement("meta");
                m.setAttribute("property", prop);
                return m;
            });
            tag.setAttribute("content", value);
        }

        // Twitter Cards
        for (const [name, value] of [
            ["twitter:card", "summary_large_image"],
            ["twitter:title", pageTitle],
            ["twitter:description", pageDesc],
            ["twitter:image", absoluteSocialImage],
        ] as const) {
            const tag = ensure(`meta[name="${name}"]`, () => {
                const m = document.createElement("meta");
                m.setAttribute("name", name);
                return m;
            });
            tag.setAttribute("content", value);
        }

        const previewRobots = document.head.querySelector('meta[name="robots"][data-tnl-preview="1"]');
        if (previewId) {
            const robots = ensure('meta[name="robots"]', () => {
                const meta = document.createElement("meta");
                meta.setAttribute("name", "robots");
                meta.dataset.tnlPreview = "1";
                return meta;
            });
            robots.setAttribute("content", "noindex,nofollow,noarchive");
        } else {
            previewRobots?.remove();
        }

        // JSON-LD Structured Data
        const ld = ensure('script[data-tnl-jsonld="1"]', () => {
            const s = document.createElement("script");
            s.setAttribute("type", "application/ld+json");
            s.setAttribute("data-tnl-jsonld", "1");
            return s;
        });
        ld.textContent = JSON.stringify({
            "@context": "https://schema.org",
            "@type": "ResearchOrganization",
            name: settings.site_title,
            alternateName: settings.short_name,
            url: "https://labtnl.site",
            logo: "https://labtnl.site/assets/brand/tnl-logo-badge.png",
            email: settings.contact?.email ?? undefined,
            parentOrganization: {
                "@type": "CollegeOrUniversity",
                name: "Institut Teknologi Sepuluh Nopember",
                url: "https://www.its.ac.id",
            },
            address: {
                "@type": "PostalAddress",
                streetAddress: settings.contact?.address ?? "Ruang B-301, Gedung B Lantai 3 Teknik Elektro ITS",
                addressLocality: "Surabaya",
                addressRegion: "Jawa Timur",
                postalCode: "60111",
                addressCountry: "ID",
            },
        });
    }, [settings, location.pathname, location.search, locale, postSlug, eventSlug, pageSlug, previewId, postQuery.data, postQuery.isLoading, eventQuery.data, eventQuery.isLoading, pageQuery.data, pageQuery.isLoading, previewQuery.data, previewQuery.isLoading]);
}

function routeSlug(pathname: string, pattern: RegExp): string | undefined {
    const match = pathname.match(pattern);
    if (!match) return undefined;
    try {
        return decodeURIComponent(match[1]);
    } catch {
        return match[1];
    }
}

export function LocaleProvider({ children }: { children: ReactNode }) {
    const { data: settings } = useSettings();
    const [locale, setLocaleState] = useState<Locale>(() => {
        const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
        return stored === "en" || stored === "id" ? stored : "id";
    });

    useEffect(() => {
        if (!localStorage.getItem(LOCALE_STORAGE_KEY) && settings?.language_default) {
            const def = settings.language_default === "en" ? "en" : "id";
            setLocaleState(def);
        }
    }, [settings?.language_default]);

    useEffect(() => {
        document.documentElement.lang = locale;
    }, [locale]);

    const value = useMemo(
        () => ({
            locale,
            setLocale: (l: Locale) => {
                setLocaleState(l);
                localStorage.setItem(LOCALE_STORAGE_KEY, l);
            },
            t: (key: StringKey) => STRINGS[locale][key] ?? STRINGS.en[key],
        }),
        [locale],
    );

    return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

function MaintenanceNotice() {
    const { data: settings } = useSettings();
    const { t } = useLocale();
    if (!settings?.maintenance_mode) return null;
    return (
        <div
            className="px-4 py-3 text-center text-sm font-medium"
            style={{ background: "var(--tnl-tan)", color: "var(--gsm-accent-ink)" }}
            data-testid="maintenance-banner"
        >
            {t("maintenance_notice")}
        </div>
    );
}

export default function SiteLayout() {
    useHeadTags();
    useSettings();
    const location = useLocation();
    const isHome = location.pathname === "/";
    // The announcement card and registration bar share the same fixed bottom
    // surface on small screens; only one of them may be mounted at a time.
    const [announcementOpen, setAnnouncementOpen] = useState(false);

    useEffect(() => {
        window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    }, [location.pathname]);

    useApplyThemeTokens();
    useThemeMode();

    return (
        <SmoothScrollProvider>
            <div className="flex min-h-svh flex-col" style={{ background: "var(--background)" }}>
                <MaintenanceNotice />
                <SiteHeader />
                <ReadingProgressBar />
                <main className="flex-1">
                    <Outlet />
                </main>
                {isHome ? <SiteCollaborationBand /> : null}
                <SiteFooter />
                <AnnouncementPopup onOpenChange={setAnnouncementOpen} />
                <MobileRegistrationBar announcementOpen={announcementOpen} />
            </div>
        </SmoothScrollProvider>
    );
}
