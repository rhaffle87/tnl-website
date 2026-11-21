// Public chrome: sticky white header with dropdown nav, Join Us CTA and the ITS
// mark; black four-column footer fed by the single Settings record; dismissible
// announcement popup. Everything renders without a backend (static preview safe).

import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
    ArrowUp,
    ArrowUpRight,
    ChevronDown,
    Globe,
    Instagram,
    Mail,
    MapPin,
    Menu,
    Moon,
    Sun,
    X,
} from "lucide-react";
import { useLocale, pick } from "@/lib/i18n";
import { useEvents, useSettings } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { TnlLogo } from "@/components/site/TnlLogo";
import { useSmoothScroll } from "@/components/site/SmoothScrollProvider";
import type { SiteSettings } from "@/lib/types";

const NAV = [
    { key: "nav_home", to: "/" },
    { key: "nav_member", to: "/member" },
    {
        key: "nav_activity",
        to: "/activity",
        children: [
            { key: "nav_rd", to: "/activity?tab=rd" },
            { key: "nav_practicum", to: "/activity?tab=practicum" },
            { key: "nav_events", to: "/activity?tab=events" },
            { key: "nav_assistant", to: "/activity?tab=assistant" },
        ],
    },
    { key: "nav_news", to: "/news" },
    { key: "nav_publications", to: "/publications" },
    { key: "nav_contact", to: "/contact" },
] as const;

function LogoMark({ short }: { short?: string }) {
    return (
        <span className="flex shrink-0 items-center justify-center" aria-label={short || "TNL"}>
            <TnlLogo variant="auto" className="h-9 w-9 sm:h-10 sm:w-10" />
        </span>
    );
}

export function SiteHeader() {
    const { t, locale, setLocale } = useLocale();
    const { data: settings } = useSettings();
    const location = useLocation();
    const [mobileOpen, setMobileOpen] = useState(false);
    const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));

    useEffect(() => {
        setMobileOpen(false);
    }, [location.pathname, location.search]);

    const toggleDark = () => {
        const next = !dark;
        setDark(next);
        document.documentElement.classList.toggle("dark", next);
        const meta = document.querySelector('meta[name="color-scheme"]');
        if (meta) meta.setAttribute("content", next ? "dark" : "light");
        localStorage.setItem("tnl-theme", next ? "dark" : "light");
    };

    const title = settings ? pick(locale, settings.site_title, settings.site_title_id) : "Telecommunication Network Laboratory";
    const short = settings?.short_name ?? "TNL";

    return (
        <header
            className="sticky top-0 z-50 border-b backdrop-blur-md"
            style={{ background: "color-mix(in srgb, var(--background) 88%, transparent)", borderColor: "var(--tnl-border)" }}
            data-testid="site-header"
        >
            <div className="tnl-container flex h-[72px] items-center justify-between gap-4">
                <Link to="/" viewTransition className="flex shrink-0 items-center gap-3" data-testid="header-logo-link">
                    <LogoMark short={short} />
                    <span className="hidden flex-col leading-tight sm:flex">
                        <span className="text-[14px] xl:text-[15px] font-bold tracking-tight whitespace-nowrap">
                            {locale === "id" ? "Laboratorium Jaringan Telekomunikasi" : "Telecommunication Network Lab"}
                        </span>
                        <span className="text-[11px] font-medium tracking-normal whitespace-nowrap" style={{ color: "var(--tnl-tan-text)" }}>
                            {locale === "id" ? "Departemen Teknik Elektro · ITS" : "Electrical Engineering · ITS"}
                        </span>
                    </span>
                </Link>

                <nav className="hidden items-center gap-1 xl:gap-2 lg:flex" aria-label="Main navigation">
                    {NAV.map((item) => {
                        const active = location.pathname === item.to;
                        const children = "children" in item ? item.children : undefined;
                        return (
                            <div key={item.key} className="group relative">
                                <Link
                                    to={item.to}
                                    viewTransition
                                    className={cn(
                                        "flex items-center gap-1 rounded-[6px] px-2.5 py-2 text-[14px] xl:text-[15px] font-medium transition-colors whitespace-nowrap",
                                        active ? "text-[var(--tnl-green)]" : "hover:text-[var(--tnl-green)]",
                                    )}
                                    style={active ? { color: "var(--tnl-green)" } : undefined}
                                    data-testid={`nav-${item.key.replace("nav_", "")}-link`}
                                >
                                    {t(item.key)}
                                    {children ? <ChevronDown className="h-4 w-4" aria-hidden="true" /> : null}
                                </Link>
                                {children ? (
                                    <div
                                        className="invisible absolute left-0 top-full z-50 w-60 translate-y-1 rounded-[12px] border p-2 opacity-0 shadow-[0_20px_60px_rgba(17,21,24,0.18)] transition-all duration-200 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
                                        style={{ background: "var(--card)", borderColor: "var(--tnl-border)" }}
                                    >
                                        {children.map((child) => (
                                            <Link
                                                key={child.key}
                                                to={child.to}
                                                viewTransition
                                                className="block rounded-[6px] px-3 py-2 text-sm transition-colors hover:bg-[var(--tnl-surface)] hover:text-[var(--tnl-green)]"
                                                data-testid={`nav-${child.key.replace("nav_", "")}-link`}
                                            >
                                                {t(child.key)}
                                            </Link>
                                        ))}
                                    </div>
                                ) : null}
                            </div>
                        );
                    })}
                </nav>

                <div className="flex shrink-0 items-center gap-2 sm:gap-3">
                    <button
                        type="button"
                        onClick={() => setLocale(locale === "en" ? "id" : "en")}
                        className="flex h-10 items-center gap-1.5 rounded-[6px] border px-3 text-sm font-medium transition-colors hover:border-[var(--tnl-green)] hover:text-[var(--tnl-green)]"
                        style={{ borderColor: "var(--tnl-border)" }}
                        aria-label={`${t("language")}: ${locale === "en" ? "English" : "Bahasa Indonesia"}`}
                        data-testid="language-toggle-button"
                    >
                        <Globe className="h-4 w-4" aria-hidden="true" />
                        {locale.toUpperCase()}
                    </button>
                    <button
                        type="button"
                        onClick={toggleDark}
                        className="flex h-10 w-10 items-center justify-center rounded-[6px] border transition-colors hover:border-[var(--tnl-green)] hover:text-[var(--tnl-green)]"
                        style={{ borderColor: "var(--tnl-border)" }}
                        aria-label={dark ? t("light_mode") : t("dark_mode")}
                        data-testid="theme-toggle-button"
                    >
                        {dark ? <Sun className="h-4 w-4" aria-hidden="true" /> : <Moon className="h-4 w-4" aria-hidden="true" />}
                    </button>
                    <Link
                        to="/activity?tab=events"
                        viewTransition
                        className="tnl-btn tnl-btn-primary hidden h-10 min-h-[40px] shrink-0 whitespace-nowrap px-4 py-2 text-sm sm:inline-flex"
                        data-testid="header-join-us-button"
                    >
                        {t("join_us")}
                    </Link>
                    <button
                        type="button"
                        onClick={() => setMobileOpen((v) => !v)}
                        className="flex h-10 w-10 items-center justify-center rounded-[6px] border lg:hidden"
                        style={{ borderColor: "var(--tnl-border)" }}
                        aria-label="Toggle navigation menu"
                        aria-expanded={mobileOpen}
                        data-testid="mobile-menu-button"
                    >
                        {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                    </button>
                </div>
            </div>

            {mobileOpen ? (
                <div
                    className="border-t lg:hidden"
                    style={{ borderColor: "var(--tnl-border)", background: "var(--background)" }}
                    data-testid="mobile-nav-panel"
                >
                    <nav className="tnl-container flex flex-col py-3" aria-label="Mobile navigation">
                        {NAV.map((item) => (
                            <div key={item.key}>
                                <Link
                                    to={item.to}
                                    className="block py-2.5 text-[15px] font-medium"
                                    data-testid={`mobile-nav-${item.key.replace("nav_", "")}-link`}
                                >
                                    {t(item.key)}
                                </Link>
                                {"children" in item && item.children
                                    ? item.children.map((child) => (
                                        <Link
                                            key={child.key}
                                            to={child.to}
                                            className="block py-2 pl-4 text-sm"
                                            style={{ color: "var(--tnl-body)" }}
                                            data-testid={`mobile-nav-${child.key.replace("nav_", "")}-link`}
                                        >
                                            {t(child.key)}
                                        </Link>
                                    ))
                                    : null}
                            </div>
                        ))}
                        <Link
                            to="/activity?tab=events"
                            className="tnl-btn tnl-btn-primary mt-3"
                            data-testid="mobile-join-us-button"
                        >
                            {t("join_us")}
                        </Link>
                    </nav>
                </div>
            ) : null}
        </header>
    );
}

export interface FooterProps {
    lang?: "en" | "id";
    settings?: (Partial<SiteSettings> & {
        site_name?: { en?: string; id?: string };
        contact_email?: string;
        contact_address?: { en?: string; id?: string };
        instagram_handle?: string;
        instagram_url?: string;
        copyright?: { en?: string; id?: string };
    }) | null;
    showCollaborationBand?: boolean;
}

export interface CollaborationBandProps {
    lang?: "en" | "id";
    show?: boolean;
}

const FOOTER_COPY = {
    en: {
        badge: "ROOM B-301 · SURABAYA",
        ctaTitle: "Interested in collaborating with Laboratory TNL?",
        ctaDesc:
            "We welcome joint research, industrial testbed partnerships, certified training, and academic initiatives at Institut Teknologi Sepuluh Nopember.",
        ctaBtn: "Collaborate with us",
        labName: "Telecommunication Network Laboratory",
        labShortDesc:
            "Teaching, research, and network engineering innovation under the Department of Electrical Engineering, ITS Surabaya.",
        exploreTitle: "EXPLORE",
        resourcesTitle: "LAB & RESOURCES",
        contactTitle: "LOCATION & DESK",
        verifyBadge: "Verify e-Certificate",
        backToTop: "Back to top",
        rights:
            "Department of Electrical Engineering, Institut Teknologi Sepuluh Nopember, Surabaya. All rights reserved.",
        terms: "Terms of Use",
        privacy: "Privacy Policy",
        navLinks: [
            { label: "Home", to: "/" },
            { label: "Member", to: "/member" },
            { label: "Activity", to: "/activity" },
            { label: "News", to: "/news" },
            { label: "Publications", to: "/publications" },
            { label: "Contact", to: "/contact" },
        ],
        resourceLinks: [
            { label: "Research & Testbeds", to: "/activity?tab=research" },
            { label: "Practicum & Shifts", to: "/activity?tab=practicum" },
            { label: "Events & Registration", to: "/activity?tab=events" },
            { label: "Lab Equipment (B-301)", to: "/activity?tab=research#equipment" },
            { label: "Verify Certificate", to: "/verify" },
        ],
    },
    id: {
        badge: "RUANG B-301 · SURABAYA",
        ctaTitle: "Tertarik berkolaborasi dengan Laboratorium TNL?",
        ctaDesc:
            "Kami terbuka untuk riset bersama, kemitraan testbed industri, pelatihan tersertifikasi, dan inisiatif akademik di Institut Teknologi Sepuluh Nopember.",
        ctaBtn: "Kolaborasi Riset",
        labName: "Laboratorium Jaringan Telekomunikasi",
        labShortDesc:
            "Pendidikan, penelitian, dan inovasi rekayasa jaringan di bawah Departemen Teknik Elektro, ITS Surabaya.",
        exploreTitle: "JELAJAHI",
        resourcesTitle: "LAB & SUMBER DAYA",
        contactTitle: "LOKASI & KONTAK",
        verifyBadge: "Verifikasi e-Sertifikat",
        backToTop: "Kembali ke atas",
        rights:
            "Departemen Teknik Elektro, Institut Teknologi Sepuluh Nopember, Surabaya. Hak cipta dilindungi.",
        terms: "Ketentuan Penggunaan",
        privacy: "Kebijakan Privasi",
        navLinks: [
            { label: "Beranda", to: "/" },
            { label: "Anggota", to: "/member" },
            { label: "Kegiatan", to: "/activity" },
            { label: "Berita", to: "/news" },
            { label: "Publikasi", to: "/publications" },
            { label: "Kontak", to: "/contact" },
        ],
        resourceLinks: [
            { label: "Riset & Testbed", to: "/activity?tab=research" },
            { label: "Praktikum & Shift", to: "/activity?tab=practicum" },
            { label: "Event & Registrasi", to: "/activity?tab=events" },
            { label: "Perangkat Lab (B-301)", to: "/activity?tab=research#equipment" },
            { label: "Verifikasi Sertifikat", to: "/verify" },
        ],
    },
} as const;

export function SiteCollaborationBand({ lang: propLang, show = true }: CollaborationBandProps) {
    const { locale } = useLocale();
    const lang = propLang ?? (locale === "id" ? "id" : "en");
    const t = FOOTER_COPY[lang];

    if (!show) return null;

    const focusRing =
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gsm-accent-glow,#C4B393)] focus-visible:ring-offset-2 focus-visible:ring-offset-[#111613]";

    return (
        <section
            className="w-full border-t border-black/[0.06] bg-[#F7F7F5] pt-14 pb-16 dark:border-white/[0.06] dark:bg-[#0D110F] transition-colors duration-200"
            data-testid="section-collaboration-cta"
        >
            <div className="tnl-container max-w-7xl px-6 lg:px-8">
                <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-[#223027] via-[#1C2821] to-[#141C17] p-8 shadow-xl md:p-10">
                    <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
                        <div className="max-w-2xl space-y-2">
                            <span className="inline-flex items-center gap-2 rounded-full border border-[#C4B393]/30 bg-[#111613]/60 px-3 py-1 text-[11px] font-semibold tracking-widest text-[#C4B393]">
                                {t.badge}
                            </span>
                            <h2 className="text-2xl font-bold tracking-tight text-[#F4F4F0] md:text-3xl">
                                {t.ctaTitle}
                            </h2>
                            <p className="text-sm leading-relaxed text-[#D1D5DB] md:text-base">
                                {t.ctaDesc}
                            </p>
                        </div>
                        <div className="flex shrink-0 flex-wrap items-center gap-3">
                            <Link
                                to="/contact"
                                className={`inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[#A8977B] px-6 py-3 text-sm font-semibold text-[#111613] transition-colors hover:bg-[#C2B091] ${focusRing}`}
                                data-testid="footer-collab-cta-button"
                            >
                                <span>{t.ctaBtn}</span>
                                <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}

function WatermarkSection() {
    const watermarkRef = useRef<HTMLDivElement>(null);
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        const el = watermarkRef.current;
        if (!el) return;

        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
            setIsVisible(true);
            return;
        }

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setIsVisible(true);
                    observer.disconnect();
                }
            },
            { threshold: 0.1 }
        );

        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    return (
        <div
            ref={watermarkRef}
            aria-hidden="true"
            className="relative pointer-events-none select-none pt-8 pb-4"
        >
            {/* Subtle Backlight Lighting (Ambient Glow) */}
            <div
                className={cn(
                    "pointer-events-none absolute inset-x-0 bottom-0 h-48 sm:h-64 transition-opacity duration-[2000ms] delay-200 ease-out",
                    isVisible ? "opacity-100" : "opacity-0",
                    "motion-reduce:opacity-100 motion-reduce:transition-none"
                )}
            >
                {/* Forest Green & Warm Gold Ambient Glow */}
                <div
                    className="absolute inset-0 blur-3xl"
                    style={{
                        background:
                            "radial-gradient(ellipse 85% 75% at 50% 62%, rgba(93, 138, 107, 0.30) 0%, rgba(67, 89, 74, 0.14) 48%, transparent 78%)",
                    }}
                />
            </div>

            {/* Monumental Watermark Text with Full-Width Gradient & Slow Fade-in */}
            <div
                className={cn(
                    "relative z-10 transition-all duration-[1600ms] ease-[cubic-bezier(0.16,1,0.3,1)]",
                    isVisible
                        ? "opacity-100 translate-y-0 scale-100"
                        : "opacity-0 translate-y-6 scale-[0.99]",
                    "motion-reduce:opacity-100 motion-reduce:translate-y-0 motion-reduce:scale-100 motion-reduce:transition-none"
                )}
            >
                <svg
                    viewBox="0 0 760 190"
                    className="block h-auto w-full select-none"
                    aria-hidden="true"
                >
                    <defs>
                        <linearGradient id="tnlWatermarkGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="var(--gsm-emerald, #7EA88B)" stopOpacity="0.95" />
                            <stop offset="55%" stopColor="var(--gsm-primary, #43634E)" stopOpacity="0.55" />
                            <stop offset="93%" stopColor="var(--gsm-obsidian, #111613)" stopOpacity="0" />
                        </linearGradient>
                    </defs>
                    <text
                        x="380"
                        y="158"
                        textAnchor="middle"
                        textLength="756"
                        lengthAdjust="spacing"
                        fontWeight="900"
                        fontSize="178"
                        letterSpacing="-4"
                        fill="url(#tnlWatermarkGrad)"
                        className="font-sans"
                    >
                        LAB TNL
                    </text>
                </svg>
            </div>
        </div>
    );
}

export function SiteFooter({
    lang: propLang,
    settings: propSettings,
    showCollaborationBand = false,
}: FooterProps = {}) {
    const { locale } = useLocale();
    const { data: fetchedSettings } = useSettings();
    const lang = propLang ?? (locale === "id" ? "id" : "en");
    const settings = propSettings !== undefined ? propSettings : fetchedSettings;
    const t = FOOTER_COPY[lang];

    const email =
        (settings as any)?.contact_email ||
        settings?.contact?.email ||
        "telconnetlab@gmail.com";

    const address =
        (settings as any)?.contact_address?.[lang] ||
        (settings?.contact?.address || settings?.contact?.address_id
            ? pick(lang, settings.contact.address, settings.contact.address_id)
            : lang === "id"
            ? "Gedung B, Ruang B-301, Departemen Teknik Elektro, ITS, Surabaya"
            : "Building B, Room B-301, Dept. of Electrical Engineering, ITS, Surabaya");

    const igHandle =
        (settings as any)?.instagram_handle ||
        (settings?.social?.instagram
            ? "@" + settings.social.instagram.trim().replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/\/$/, "").replace(/^@/, "")
            : "@tnlab_its") ||
        "@tnlab_its";

    const igUrl =
        (settings as any)?.instagram_url ||
        settings?.social?.instagram ||
        "https://www.instagram.com/tnlab_its/";

    const { scrollTo } = useSmoothScroll();
    const scrollToTop = () => {
        scrollTo(0, { duration: 0.8 });
    };

    const focusRing =
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gsm-accent-glow,#C4B393)] focus-visible:ring-offset-2 focus-visible:ring-offset-[#111613]";

    return (
        <>
            {showCollaborationBand && <SiteCollaborationBand lang={lang} />}
            <footer
                className="mt-auto relative overflow-hidden border-t border-white/10 bg-[#0C100E] text-[#F4F4F0]"
                data-testid="site-footer"
            >
                <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-[#223027]/35 via-[#18221C]/15 to-transparent"
                />
                <div className="relative mx-auto max-w-7xl px-6 lg:px-8">
                    {/* 4-column balanced flat grid with even spacing & subtle dividers */}
                    <div className="grid grid-cols-1 gap-8 py-10 sm:grid-cols-2 lg:grid-cols-[0.95fr_1fr_1fr_1.15fr] lg:gap-0 lg:divide-x lg:divide-white/[0.08]">
                        {/* Column 1: Logo & Instagram */}
                        <div className="flex flex-col items-start justify-center gap-4 lg:items-center lg:pr-8">
                            <Link
                                to="/"
                                className={`inline-block rounded-2xl transition-transform hover:scale-[1.02] ${focusRing}`}
                                aria-label="Laboratorium Jaringan Telekomunikasi ITS"
                            >
                                <TnlLogo
                                    variant="light"
                                    className="h-28 w-28 md:h-32 md:w-32"
                                    imgClassName="drop-shadow-[0_8px_24px_rgba(0,0,0,0.5)]"
                                />
                            </Link>
                            <a
                                href={igUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label={`Instagram ${igHandle}`}
                                className={`inline-flex min-h-[44px] md:min-h-[38px] items-center gap-2 rounded-lg border border-white/15 bg-white/[0.03] px-3.5 text-sm font-medium text-[#D1D5DB] transition-colors hover:border-[#C4B393]/50 hover:text-[#F4F4F0] ${focusRing}`}
                                data-testid="footer-instagram-link"
                            >
                                <Instagram className="h-4 w-4 text-[#C4B393]" aria-hidden="true" />
                                <span>{igHandle}</span>
                            </a>
                        </div>

                        {/* Column 2: Explore */}
                        <nav aria-label={t.exploreTitle} className="min-w-0 space-y-2 lg:px-10">
                            <h3 className="text-xs font-bold tracking-[0.14em] text-[#C4B393]">
                                {t.exploreTitle}
                            </h3>
                            <ul className="space-y-0.5">
                                {t.navLinks.map((item) => (
                                    <li key={item.to}>
                                        <Link
                                            to={item.to}
                                            viewTransition
                                            className={`inline-flex min-h-[44px] md:min-h-[34px] py-1 items-center text-sm text-[#D1D5DB] underline-offset-4 transition-colors hover:text-[#F4F4F0] hover:underline ${focusRing}`}
                                            data-testid={`footer-${item.to === "/" ? "home" : item.to.replace("/", "")}-link`}
                                        >
                                            {item.label}
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </nav>

                        {/* Column 3: Lab & Resources */}
                        <nav aria-label={t.resourcesTitle} className="min-w-0 space-y-2 lg:px-10">
                            <h3 className="text-xs font-bold tracking-[0.14em] text-[#C4B393]">
                                {t.resourcesTitle}
                            </h3>
                            <ul className="space-y-0.5">
                                {t.resourceLinks.map((item) => (
                                    <li key={item.to}>
                                        <Link
                                            to={item.to}
                                            viewTransition
                                            className={`inline-flex min-h-[44px] md:min-h-[34px] py-1 items-center text-sm text-[#D1D5DB] underline-offset-4 transition-colors hover:text-[#F4F4F0] hover:underline ${focusRing}`}
                                        >
                                            {item.label}
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </nav>

                        {/* Column 4: Location & Desk */}
                        <div className="min-w-0 space-y-3 lg:pl-10">
                            <h3 className="text-xs font-bold tracking-[0.14em] text-[#C4B393]">
                                {t.contactTitle}
                            </h3>
                            <div className="space-y-2 text-sm text-[#D1D5DB]">
                                <div className="flex items-start gap-2.5 leading-relaxed">
                                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#C4B393]" aria-hidden="true" />
                                    <span className="text-[13px] leading-snug break-words" data-testid="footer-address">{address}</span>
                                </div>
                                <a
                                    href={`mailto:${email}`}
                                    className={`inline-flex min-h-[44px] items-center gap-2.5 text-[13px] text-[#D1D5DB] underline-offset-4 transition-colors hover:text-[#F4F4F0] hover:underline break-words min-w-0 ${focusRing}`}
                                    data-testid="footer-email-link"
                                >
                                    <Mail className="h-4 w-4 shrink-0 text-[#C4B393]" aria-hidden="true" />
                                    <span className="truncate">{email}</span>
                                </a>
                            </div>
                        </div>
                    </div>
                    {/* Monumental Typographic Watermark with Slow Fade-in & Ambient Glow */}
                    <WatermarkSection />
                    {/* Utility & Legal Bar (3-part balanced layout ala s4ras) */}
                    <div className="grid grid-cols-1 md:grid-cols-3 items-center gap-4 border-t border-white/10 py-5 pb-20 md:pb-5 text-xs text-[#9FA8A2]">
                        <p className="md:text-left" data-testid="footer-institution-line">
                            © {new Date().getFullYear()} Departemen Teknik Elektro, ITS Surabaya.
                        </p>
                        <div className="flex items-center gap-4 md:justify-center">
                            <Link
                                to="/terms"
                                className={`text-[#9FA8A2] underline-offset-4 transition-colors hover:text-[#F4F4F0] hover:underline ${focusRing}`}
                                data-testid="footer-terms-link"
                            >
                                {t.terms}
                            </Link>
                            <span aria-hidden="true" className="text-white/20">·</span>
                            <Link
                                to="/privacy"
                                className={`text-[#9FA8A2] underline-offset-4 transition-colors hover:text-[#F4F4F0] hover:underline ${focusRing}`}
                                data-testid="footer-privacy-link"
                            >
                                {t.privacy}
                            </Link>
                        </div>
                        <div className="flex md:justify-end">
                            <button
                                type="button"
                                onClick={scrollToTop}
                                className={`inline-flex items-center gap-1.5 text-xs font-medium text-[#C4B393] hover:text-[#F4F4F0] transition-colors ${focusRing}`}
                                data-testid="footer-back-to-top-button"
                            >
                                <span>{lang === "id" ? "Kembali ke atas" : "Back to top"}</span>
                                <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                        </div>
                    </div>
                </div>
            </footer>
        </>
    );
}

export function AnnouncementPopup() {
    const { t, locale } = useLocale();
    const { data: settings } = useSettings();
    const announcement = settings?.announcement;
    const key = announcement ? `tnl-announcement-${announcement.version}` : "";
    const [open, setOpen] = useState(false);

    useEffect(() => {
        if (!announcement?.enabled || !key) return;
        if (localStorage.getItem(key) === "dismissed") return;
        const timer = window.setTimeout(() => setOpen(true), 900);
        return () => window.clearTimeout(timer);
    }, [announcement?.enabled, key]);

    if (!announcement?.enabled || !open) return null;

    const dismiss = () => {
        if (key) localStorage.setItem(key, "dismissed");
        setOpen(false);
    };

    return (
        <div
            className="fixed inset-0 z-[100] flex items-end justify-center p-4 sm:items-center"
            role="dialog"
            aria-modal="true"
            aria-labelledby="announcement-title"
            data-testid="announcement-popup"
            data-lenis-prevent
        >
            <div className="absolute inset-0 bg-black/55 backdrop-blur-sm animate-fade-in" onClick={dismiss} aria-hidden="true" />
            <div className="tnl-card relative z-10 w-full max-w-lg overflow-hidden p-0 animate-pop">
                <div className="tnl-hero-gradient px-7 py-6">
                    <span className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--tnl-tan)" }}>
                        {t("announcement")}
                    </span>
                    <h2 id="announcement-title" className="tnl-h4 mt-2 text-[22px] text-white" style={{ color: "#ffffff" }}>
                        {pick(locale, announcement.title, announcement.title_id)}
                    </h2>
                </div>
                <div className="px-7 py-6">
                    <p className="text-sm leading-relaxed text-[var(--tnl-body)]">
                        {pick(locale, announcement.body, announcement.body_id)}
                    </p>
                    <div className="mt-6 flex flex-wrap gap-3">
                        <Link to="/activity?tab=events" className="tnl-btn tnl-btn-primary flex-1" data-testid="announcement-cta-button">
                            {t("register_now")}
                        </Link>
                        <button type="button" onClick={dismiss} className="tnl-btn tnl-btn-outline" data-testid="announcement-dismiss-button">
                            {t("dismiss")}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export function MobileRegistrationBar() {
    const location = useLocation();
    const { locale } = useLocale();
    const { data: events } = useEvents();
    const [dismissed, setDismissed] = useState(() => {
        try {
            return sessionStorage.getItem("tnl-dismiss-reg-bar") === "true";
        } catch {
            return false;
        }
    });

    if (
        dismissed ||
        location.pathname === "/open-house" ||
        location.pathname.startsWith("/admin")
    ) {
        return null;
    }

    const list = events ?? [];
    const openHouse = list.find((e) => e.slug === "open-house-tnl" && e.status === "published");
    const activeEvent = openHouse || list.find((e) => e.status === "published");

    if (!activeEvent) return null;

    const eventTitle = pick(locale, activeEvent.title, activeEvent.title_id) || "Open House TNL";
    const targetUrl = activeEvent.slug === "open-house-tnl" ? "/open-house" : "/activity?tab=events";

    const handleDismiss = () => {
        setDismissed(true);
        try {
            sessionStorage.setItem("tnl-dismiss-reg-bar", "true");
        } catch {}
    };

    return (
        <aside
            aria-label="Informasi Pendaftaran Kegiatan"
            className="fixed inset-x-0 bottom-0 z-40 border-t border-white/15 bg-[#111613]/95 backdrop-blur-md px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-2xl md:hidden animate-fade-up"
            data-testid="mobile-registration-bar"
        >
            <div className="flex items-center justify-between gap-3">
                <div className="flex flex-col min-w-0 pr-1">
                    <span className="tnl-eyebrow text-[10px] text-[var(--tnl-tan,#C4B393)] flex items-center gap-1.5 font-bold">
                        <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                        {locale === "id" ? "Pendaftaran Dibuka" : "Registration Open"}
                    </span>
                    <p className="truncate text-xs font-semibold text-white mt-0.5">
                        {eventTitle}
                    </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <Link
                        to={targetUrl}
                        className="inline-flex h-9 min-h-[36px] items-center justify-center rounded-lg px-3.5 text-xs font-bold transition-transform active:scale-95 shadow-sm"
                        style={{
                            background: "var(--tnl-tan, #A8977B)",
                            color: "#111613",
                        }}
                        data-testid="mobile-reg-cta-button"
                    >
                        {locale === "id" ? "Daftar →" : "Register →"}
                    </Link>
                    <button
                        type="button"
                        onClick={handleDismiss}
                        className="flex h-8 w-8 items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                        aria-label="Tutup bar pendaftaran"
                        data-testid="mobile-reg-close-button"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>
            </div>
        </aside>
    );
}
