// Public chrome uses CMS settings with static-preview-safe defaults.

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent, RefObject } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "react-router-dom";
import {
    ArrowRight,
    ArrowUp,
    ArrowUpRight,
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
import { TnlLogo } from "@/components/site/TnlLogo";
import { useSmoothScroll } from "@/components/site/SmoothScrollProvider";
import type { SiteSettings } from "@/lib/types";
import "./signal-chrome.css";

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

const DESKTOP_NAV_WIDTH = 1280;
const JOIN_ROUTE = "/activity?tab=events";
const ACTIVITY = NAV[2];

function activityTab(location: ReturnType<typeof useLocation>) {
    return location.pathname === "/activity" ? new URLSearchParams(location.search).get("tab") : null;
}

function MobileNav({ id, title, onClose, triggerRef, desktopFocusRef }: {
    id: string;
    title: string;
    onClose: () => void;
    triggerRef: RefObject<HTMLButtonElement | null>;
    desktopFocusRef: RefObject<HTMLAnchorElement | null>;
}) {
    const { t, locale } = useLocale();
    const location = useLocation();
    const tab = activityTab(location);
    const dialogRef = useRef<HTMLDialogElement>(null);
    const closeRef = useRef<HTMLButtonElement>(null);

    useLayoutEffect(() => {
        const dialog = dialogRef.current!;
        const { body } = document;
        const overflow = body.style.getPropertyValue("overflow");
        const priority = body.style.getPropertyPriority("overflow");
        const trigger = triggerRef.current;
        const desktopFocus = desktopFocusRef.current;

        dialog.showModal();
        closeRef.current?.focus();
        // Native modality also covers nodes added to the background while open.
        const background = Array.from(body.children).filter(
            (element) => element !== dialog && !element.hasAttribute("inert"),
        );
        background.forEach((element) => element.setAttribute("inert", ""));
        body.style.setProperty("overflow", "hidden", priority);

        return () => {
            background.forEach((element) => element.removeAttribute("inert"));
            body.style.setProperty("overflow", overflow, priority);
            if (dialog.open) dialog.close();
            const focusTarget = window.innerWidth >= DESKTOP_NAV_WIDTH ? desktopFocus : trigger;
            focusTarget?.focus({ preventScroll: true });
        };
    }, [desktopFocusRef, triggerRef]);

    function handleKeyDown(event: KeyboardEvent<HTMLDialogElement>) {
        if (event.key === "Escape") {
            event.preventDefault();
            onClose();
        } else if (event.key === "Tab") {
            const links = event.currentTarget.querySelectorAll<HTMLAnchorElement>("a[href]");
            const first = closeRef.current;
            const last = links[links.length - 1];
            if (event.shiftKey ? document.activeElement === first : document.activeElement === last) {
                event.preventDefault();
                (event.shiftKey ? last : first)?.focus();
            }
        }
    }

    return createPortal(
        <dialog
            ref={dialogRef}
            id={id}
            className="signal-mobile-dialog"
            aria-modal="true"
            aria-labelledby={`${id}-title`}
            onCancel={(event) => { event.preventDefault(); onClose(); }}
            onKeyDown={handleKeyDown}
            data-testid="mobile-nav-panel"
            data-lenis-prevent
        >
            <div className="signal-mobile-top">
                <div className="tnl-container signal-mobile-heading">
                    <div className="signal-mobile-masthead">
                        <h2 id={`${id}-title`} className="signal-chrome-kicker">{locale === "id" ? "Navigasi" : "Navigation"}</h2>
                        <p>{title}</p>
                    </div>
                    <button ref={closeRef} type="button" className="signal-control signal-close" onClick={onClose}>
                        {locale === "id" ? "Tutup" : "Close"}
                        <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                </div>
            </div>
            <nav className="tnl-container signal-mobile-index" aria-label={locale === "id" ? "Navigasi seluler" : "Mobile navigation"}>
                <ul className="signal-mobile-primary" role="list">
                    {NAV.map((item, index) => (
                        <li key={item.key}>
                            <Link
                                to={item.to}
                                onClick={onClose}
                                viewTransition
                                aria-current={location.pathname === item.to ? (tab ? "location" : "page") : undefined}
                                className="signal-mobile-link"
                                data-testid={`mobile-nav-${item.key.slice(4)}-link`}
                            >
                                <span className="signal-chrome-kicker" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                                <span className="signal-mobile-label">{t(item.key)}</span>
                                <ArrowRight className="signal-mobile-arrow" aria-hidden="true" />
                            </Link>
                        </li>
                    ))}
                </ul>
                <div className="signal-mobile-aside">
                    <div role="group" aria-labelledby={`${id}-activity`}>
                        <h3 id={`${id}-activity`} className="signal-chrome-kicker">{t("nav_activity")}</h3>
                        <ul className="signal-mobile-subnav" role="list">
                            {ACTIVITY.children.map((child) => (
                                <li key={child.key}>
                                    <Link
                                        to={child.to}
                                        onClick={onClose}
                                        viewTransition
                                        aria-current={child.to === `/activity?tab=${tab}` ? "page" : undefined}
                                        data-testid={`mobile-nav-${child.key.slice(4)}-link`}
                                    >
                                        {t(child.key)}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </div>
                    <Link to={JOIN_ROUTE} onClick={onClose} viewTransition className="signal-join" data-testid="mobile-join-us-button">
                        {t("join_us")} <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                </div>
            </nav>
        </dialog>,
        document.body,
    );
}

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
    const tab = activityTab(location);
    const dialogId = useId();
    const triggerRef = useRef<HTMLButtonElement>(null);
    const logoRef = useRef<HTMLAnchorElement>(null);
    const [mobileOpen, setMobileOpen] = useState(false);
    const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));

    useEffect(() => setMobileOpen(false), [location.key]);

    useEffect(() => {
        if (!mobileOpen) return;
        const closeOnDesktop = () => {
            if (window.innerWidth >= DESKTOP_NAV_WIDTH) setMobileOpen(false);
        };
        closeOnDesktop();
        window.addEventListener("resize", closeOnDesktop);
        return () => window.removeEventListener("resize", closeOnDesktop);
    }, [mobileOpen]);

    const toggleDark = () => {
        const next = !dark;
        setDark(next);
        document.documentElement.classList.toggle("dark", next);
        const meta = document.querySelector('meta[name="color-scheme"]');
        if (meta) meta.setAttribute("content", next ? "dark" : "light");
        localStorage.setItem("tnl-theme", next ? "dark" : "light");
    };

    const title = pick(locale, settings?.site_title, settings?.site_title_id).trim() ||
        (locale === "id" ? "Laboratorium Jaringan Telekomunikasi" : "Telecommunication Network Laboratory");


    return (
        <>
            <header className="signal-header" data-testid="site-header">
                <div className="tnl-container signal-header-row">
                    <Link ref={logoRef} to="/" viewTransition className="signal-brand" data-testid="header-logo-link">
                        <LogoMark short={settings?.short_name ?? "TNL"} />
                        <span className="signal-brand-copy">
                            <span className="signal-brand-title">{title}</span>
                            <span className="signal-brand-meta">
                                {locale === "id" ? "Departemen Teknik Elektro · ITS" : "Electrical Engineering · ITS"}
                            </span>
                        </span>
                    </Link>
                    <nav className="signal-desktop-nav signal-main-nav" aria-label={locale === "id" ? "Navigasi utama" : "Main navigation"}>
                        {NAV.map((item) => (
                            <Link
                                key={item.key}
                                to={item.to}
                                viewTransition
                                aria-current={location.pathname === item.to ? (tab ? "location" : "page") : undefined}
                                data-testid={`nav-${item.key.slice(4)}-link`}
                            >
                                {t(item.key)}
                            </Link>
                        ))}
                    </nav>
                    <div className="signal-header-controls">
                        <button
                            type="button"
                            onClick={() => setLocale(locale === "en" ? "id" : "en")}
                            className="signal-control signal-language"
                            aria-label={`${t("language")}: ${locale === "en" ? "English" : "Bahasa Indonesia"}`}
                            data-testid="language-toggle-button"
                        >
                            <Globe className="h-4 w-4" aria-hidden="true" />
                            {locale.toUpperCase()}
                        </button>
                        <button
                            type="button"
                            onClick={toggleDark}
                            className="signal-control"
                            aria-label={dark ? t("light_mode") : t("dark_mode")}
                            data-testid="theme-toggle-button"
                        >
                            {dark ? <Sun className="h-4 w-4" aria-hidden="true" /> : <Moon className="h-4 w-4" aria-hidden="true" />}
                        </button>
                        <Link to={JOIN_ROUTE} viewTransition className="signal-join signal-header-join" data-testid="header-join-us-button">
                            {t("join_us")} <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                        </Link>
                        <button
                            ref={triggerRef}
                            type="button"
                            onClick={() => { if (window.innerWidth < DESKTOP_NAV_WIDTH) setMobileOpen(true); }}
                            className="signal-control signal-menu-trigger"
                            aria-label={locale === "id" ? "Buka menu navigasi" : "Open navigation menu"}
                            aria-haspopup="dialog"
                            aria-expanded={mobileOpen}
                            aria-controls={mobileOpen ? dialogId : undefined}
                            data-testid="mobile-menu-button"
                        >
                            <span>Menu</span>
                            <Menu className="h-5 w-5" aria-hidden="true" />
                        </button>
                    </div>
                </div>
                <nav
                    className="tnl-container signal-desktop-nav signal-desktop-subnav"
                    aria-label={t("nav_activity")}
                    hidden={location.pathname !== ACTIVITY.to}
                >
                    {ACTIVITY.children.map((child) => (
                        <Link
                            key={child.key}
                            to={child.to}
                            viewTransition
                            aria-current={child.to === `/activity?tab=${tab}` ? "page" : undefined}
                            data-testid={`nav-${child.key.slice(4)}-link`}
                        >
                            {t(child.key)}
                        </Link>
                    ))}
                </nav>
            </header>
            {mobileOpen && <MobileNav id={dialogId} title={title} onClose={() => setMobileOpen(false)} triggerRef={triggerRef} desktopFocusRef={logoRef} />}
        </>
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
            { label: "Research & Testbeds", to: "/activity?tab=rd" },
            { label: "Practicum & Shifts", to: "/activity?tab=practicum" },
            { label: "Events & Registration", to: "/activity?tab=events" },
            { label: "Lab Equipment (B-301)", to: "/activity?tab=rd#equipment" },
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
            { label: "Riset & Testbed", to: "/activity?tab=rd" },
            { label: "Praktikum & Shift", to: "/activity?tab=practicum" },
            { label: "Event & Registrasi", to: "/activity?tab=events" },
            { label: "Perangkat Lab (B-301)", to: "/activity?tab=rd#equipment" },
            { label: "Verifikasi Sertifikat", to: "/verify" },
        ],
    },
} as const;

export function SiteCollaborationBand({ lang: propLang, show = true }: CollaborationBandProps) {
    const { locale } = useLocale();
    const lang = propLang ?? (locale === "id" ? "id" : "en");
    const t = FOOTER_COPY[lang];

    if (!show) return null;

    return (
        <section className="signal-collaboration" data-testid="section-collaboration-cta">
            <div className="tnl-container signal-collaboration-inner">
                <div>
                    <span className="signal-chrome-kicker">{t.badge}</span>
                    <h2 className="signal-collaboration-title">{t.ctaTitle}</h2>
                    <p className="signal-collaboration-note">{t.ctaDesc}</p>
                </div>
                <Link to="/contact" className="signal-join" data-testid="footer-collab-cta-button">
                    {t.ctaBtn} <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                </Link>
            </div>
        </section>
    );
}

export function SiteFooter({
    lang: propLang,
    settings: propSettings,
    showCollaborationBand = false,
}: FooterProps = {}) {
    const { locale } = useLocale();
    const { data: fetchedSettings } = useSettings();
    const lang = propLang ?? locale;
    const settings: FooterProps["settings"] = propSettings !== undefined ? propSettings : fetchedSettings;
    const t = FOOTER_COPY[lang];
    const title = pick(lang, settings?.site_title, settings?.site_title_id).trim() ||
        pick(lang, settings?.site_name?.en, settings?.site_name?.id).trim() || t.labName;
    const email = settings?.contact_email || settings?.contact?.email || "telconnetlab@gmail.com";
    const address = settings?.contact_address?.[lang] ||
        pick(lang, settings?.contact?.address, settings?.contact?.address_id).trim() ||
        (lang === "id"
            ? "Gedung B, Ruang B-301, Departemen Teknik Elektro, ITS, Surabaya"
            : "Building B, Room B-301, Dept. of Electrical Engineering, ITS, Surabaya");
    const instagram = settings?.social?.instagram?.trim();
    const igUrl = settings?.instagram_url || instagram || "https://www.instagram.com/tnlab_its/";
    const igHandle = settings?.instagram_handle ||
        (instagram ? "@" + instagram.replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/\/$/, "").replace(/^@/, "") : "@tnlab_its");
    const { scrollTo } = useSmoothScroll();

    return (
        <>
            {showCollaborationBand && <SiteCollaborationBand lang={lang} />}
            <footer className="signal-footer" data-testid="site-footer">
                <div className="tnl-container">
                    <div className="signal-footer-grid">
                        <div className="signal-footer-brand">
                            <h2 className="signal-footer-title">
                                <Link to="/" viewTransition className="signal-footer-home">
                                    <span className="signal-footer-mark" aria-hidden="true">
                                        <TnlLogo variant="light" className="h-7 w-7" />
                                    </span>
                                    <span className="signal-footer-name">{title}</span>
                                </Link>
                            </h2>
                            <p className="signal-footer-description">{t.labShortDesc}</p>
                        </div>

                        <nav className="signal-footer-group" aria-label={t.exploreTitle}>
                            <h3 className="signal-footer-group-label">{t.exploreTitle}</h3>
                            <ul>
                                {t.navLinks.map((item) => (
                                    <li key={item.to}>
                                        <Link
                                            to={item.to}
                                            viewTransition
                                            className="signal-footer-link"
                                            data-testid={`footer-${item.to === "/" ? "home" : item.to.slice(1)}-link`}
                                        >
                                            {item.label}
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </nav>

                        <nav className="signal-footer-group" aria-label={t.resourcesTitle}>
                            <h3 className="signal-footer-group-label">{t.resourcesTitle}</h3>
                            <ul>
                                {t.resourceLinks.map((item) => (
                                    <li key={item.to}>
                                        <Link to={item.to} viewTransition className="signal-footer-link">{item.label}</Link>
                                    </li>
                                ))}
                            </ul>
                        </nav>

                        <div className="signal-footer-contact">
                            <h3 className="signal-footer-group-label">{t.contactTitle}</h3>
                            <div className="signal-footer-address">
                                <MapPin className="h-4 w-4" aria-hidden="true" />
                                <span data-testid="footer-address">{address}</span>
                            </div>
                            <a href={`mailto:${email}`} className="signal-footer-icon-link" data-testid="footer-email-link">
                                <Mail className="h-4 w-4" aria-hidden="true" />
                                <span>{email}</span>
                            </a>
                            <a
                                href={igUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label={`Instagram ${igHandle}`}
                                className="signal-footer-icon-link"
                                data-testid="footer-instagram-link"
                            >
                                <Instagram className="h-4 w-4" aria-hidden="true" />
                                <span>{igHandle}</span>
                            </a>
                        </div>
                    </div>

                    <div className="signal-footer-utility">
                        <p className="signal-footer-institution" data-testid="footer-institution-line">
                            © {new Date().getFullYear()} Departemen Teknik Elektro, ITS Surabaya.
                        </p>
                        <div className="signal-footer-legal">
                            <Link to="/terms" viewTransition className="signal-footer-link" data-testid="footer-terms-link">{t.terms}</Link>
                            <Link to="/privacy" viewTransition className="signal-footer-link" data-testid="footer-privacy-link">{t.privacy}</Link>
                        </div>
                        <button type="button" className="signal-footer-top" onClick={() => scrollTo(0, {
                            duration: 0.8,
                            immediate: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
                        })} data-testid="footer-back-to-top-button">
                            {t.backToTop} <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                    </div>
                </div>
            </footer>
        </>
    );
}

// The label has to match the destination: "Register now" is only honest when the
// button actually opens a registration page. An announcement whose CMS label was
// left blank must not promise sign-ups on a page that has none.
export function isRegistrationTarget(target: string): boolean {
    const path = (target || "").split("?")[0].replace(/\/+$/, "");
    return /^\/(?:activity|events|join|open-house)(?:\/|$)/i.test(path);
}

export function AnnouncementPopup() {
    const { t, locale } = useLocale();
    const { data: settings } = useSettings();
    const announcement = settings?.announcement;
    const key = announcement ? `tnl-announcement-${announcement.version}` : "";
    const [open, setOpen] = useState(false);
    // A floating card is not a dialog: it must never swallow Escape, block the
    // page behind it, or blur the content the visitor came for.
    const asCard = announcement?.style === "card";

    useEffect(() => {
        if (!announcement?.enabled || !key) return;
        if (localStorage.getItem(key) === "dismissed") return;
        const timer = window.setTimeout(() => setOpen(true), 900);
        return () => window.clearTimeout(timer);
    }, [announcement?.enabled, key]);

    const dismiss = useCallback(() => {
        if (key) localStorage.setItem(key, "dismissed");
        setOpen(false);
    }, [key]);

    // Escape is the third exit path a blocking dialog owes the visitor
    // (alongside the close button and the backdrop).
    useEffect(() => {
        if (!open || asCard) return;
        const onKeyDown = (event: globalThis.KeyboardEvent) => {
            if (event.key === "Escape") dismiss();
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [open, asCard, dismiss]);

    if (!announcement?.enabled || !open) return null;

    const ctaTarget = announcement.url || "/activity?tab=events";
    const ctaLabel =
        pick(locale, announcement.cta_label, announcement.cta_label_id) ||
        (isRegistrationTarget(ctaTarget) ? t("register_now") : t("read_more"));
    const title = pick(locale, announcement.title, announcement.title_id);
    const body = pick(locale, announcement.body, announcement.body_id);

    // One continuous editorial surface — no hard two-tone split, one accent rule.
    const panel = (
        <div className="relative z-10 w-full max-w-[460px] overflow-hidden rounded-2xl border border-[var(--tnl-border)] bg-[var(--tnl-surface)] shadow-2xl animate-pop">
            <span
                aria-hidden="true"
                className="absolute inset-x-0 top-0 h-[3px]"
                style={{ background: "linear-gradient(90deg, var(--gsm-primary, var(--tnl-green)), var(--gsm-accent, #F4C26C))" }}
            />

            <div className="flex items-start justify-between gap-4 px-6 pt-6 sm:px-7">
                <span className="inline-flex items-center gap-2 rounded-full border border-[var(--tnl-border)] bg-[var(--tnl-surface-2)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-[var(--tnl-body)]">
                    <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[var(--tnl-green)]" />
                    {t("announcement")}
                </span>
                <button
                    type="button"
                    onClick={dismiss}
                    aria-label={pick(locale, "Close announcement", "Tutup pengumuman")}
                    className="-mr-2 -mt-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--tnl-body)] transition-colors hover:bg-[var(--tnl-surface-2)] hover:text-[var(--tnl-heading)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--tnl-green)]"
                    data-testid="announcement-close-button"
                >
                    <X className="h-4 w-4" aria-hidden="true" />
                </button>
            </div>

            <div className="px-6 pb-6 pt-4 sm:px-7 sm:pb-7">
                <h2
                    id="announcement-title"
                    className="text-xl font-semibold leading-snug tracking-tight text-[var(--tnl-heading)]"
                >
                    {title}
                </h2>
                {body && (
                    <p className="mt-3 text-sm leading-relaxed text-[var(--tnl-body)]">
                        {body}
                    </p>
                )}

                <div className="mt-6 flex flex-col-reverse gap-2.5 sm:flex-row sm:items-center sm:justify-end">
                    <button
                        type="button"
                        onClick={dismiss}
                        className="tnl-btn tnl-btn-outline w-full sm:w-auto"
                        data-testid="announcement-dismiss-button"
                    >
                        {t("dismiss")}
                    </button>
                    <Link
                        to={ctaTarget}
                        viewTransition
                        className="tnl-btn tnl-btn-primary inline-flex w-full items-center justify-center gap-1.5 sm:w-auto"
                        data-testid="announcement-cta-button"
                    >
                        {ctaLabel}
                        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </Link>
                </div>
            </div>
        </div>
    );

    if (asCard) {
        return (
            <aside
                className="pointer-events-none fixed inset-x-3 bottom-3 z-[95] flex justify-end sm:inset-x-auto sm:right-6 sm:bottom-6"
                aria-live="polite"
                data-testid="announcement-popup"
                data-announcement-style="card"
            >
                <div className="pointer-events-auto w-full max-w-[400px] animate-fade-up">
                    {panel}
                </div>
            </aside>
        );
    }

    return (
        <div
            className="fixed inset-0 z-[100] flex items-end justify-center p-4 sm:items-center"
            role="dialog"
            aria-modal="true"
            aria-labelledby="announcement-title"
            data-testid="announcement-popup"
            data-announcement-style="modal"
            data-lenis-prevent
        >
            <div className="absolute inset-0 bg-black/45 backdrop-blur-[3px] animate-fade-in" onClick={dismiss} aria-hidden="true" />
            {panel}
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

    if (
        !activeEvent ||
        activeEvent.registration_closed ||
        activeEvent.is_full ||
        activeEvent.reg_status === "full" ||
        activeEvent.reg_status === "closed" ||
        activeEvent.reg_status === "past"
    ) {
        return null;
    }

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
            className="fixed inset-x-0 bottom-0 z-40 border-t border-white/15 bg-[var(--gsm-obsidian,#111613)]/95 backdrop-blur-md px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-2xl md:hidden animate-fade-up"
            data-testid="mobile-registration-bar"
        >
            <div className="flex items-center justify-between gap-3">
                <div className="flex flex-col min-w-0 pr-1">
                    <span className="tnl-eyebrow text-[10px] text-[var(--tnl-tan,#C4B393)] flex items-center gap-1.5 font-bold">
                        <span className="h-2 w-2 rounded-full bg-[var(--gsm-emerald,#10b981)] animate-pulse" />
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
