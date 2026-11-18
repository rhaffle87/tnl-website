// Public chrome: sticky white header with dropdown nav, Join Us CTA and the ITS
// mark; black four-column footer fed by the single Settings record; dismissible
// announcement popup. Everything renders without a backend (static preview safe).

import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ChevronDown, Globe, Instagram, Mail, MapPin, Menu, Moon, Sun, X } from "lucide-react";
import { useLocale, pick } from "@/lib/i18n";
import { useSettings } from "@/lib/hooks";
import { cn } from "@/lib/utils";

const NAV = [
    { key: "nav_home", to: "/" },
    { key: "nav_member", to: "/member" },
    {
        key: "nav_activity",
        to: "/activity",
        children: [
            { key: "nav_rd", to: "/activity?tab=rd" },
            { key: "nav_practicum", to: "/activity?tab=practicum" },
            { key: "nav_training", to: "/activity?tab=training" },
            { key: "nav_assistant", to: "/activity?tab=assistant" },
        ],
    },
    { key: "nav_news", to: "/news" },
    { key: "nav_publications", to: "/publications" },
    { key: "nav_contact", to: "/contact" },
] as const;

function LogoMark({ short }: { short: string }) {
    return (
        <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] text-sm font-bold tracking-tight text-white"
            style={{ background: "linear-gradient(135deg, #111518 0%, #43594A 100%)" }}
            aria-hidden="true"
        >
            {short}
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
        localStorage.setItem("tnl-theme", next ? "dark" : "light");
    };

    const title = settings ? pick(locale, settings.site_title, settings.site_title_id) : "Telecommunication Network Laboratory";
    const short = settings?.short_name ?? "TNL";

    return (
        <header
            className="sticky top-0 z-50 border-b backdrop-blur-xl"
            style={{ background: "color-mix(in srgb, var(--background) 95%, transparent)", borderColor: "var(--tnl-border)" }}
            data-testid="site-header"
        >
            <div className="tnl-container flex h-[72px] items-center justify-between gap-4">
                <Link to="/" className="flex items-center gap-3" data-testid="header-logo-link">
                    <LogoMark short={short} />
                    <span className="hidden flex-col leading-tight sm:flex">
                        <span className="text-[15px] font-bold tracking-tight">{title}</span>
                        <span className="text-xs" style={{ color: "var(--tnl-tan-text)" }}>
                            {t("footer_institution").split(",")[0]}
                        </span>
                    </span>
                </Link>

                <nav className="hidden items-center gap-1 lg:flex" aria-label="Main navigation">
                    {NAV.map((item) => {
                        const active = location.pathname === item.to;
                        const children = "children" in item ? item.children : undefined;
                        return (
                            <div key={item.key} className="group relative">
                                <Link
                                    to={item.to}
                                    className={cn(
                                        "flex items-center gap-1 rounded-[6px] px-3 py-2 text-[15px] font-medium transition-colors",
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

                <div className="flex items-center gap-2">
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
                        to="/activity?tab=training"
                        className="tnl-btn tnl-btn-primary hidden h-10 min-h-[40px] text-sm sm:inline-flex"
                        data-testid="header-join-us-button"
                    >
                        {t("join_us")}
                    </Link>
                    <a
                        href="https://www.its.ac.id"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hidden h-10 items-center gap-1.5 rounded-[6px] border px-3 text-xs font-bold tracking-wider transition-colors hover:border-[var(--tnl-green)] hover:text-[var(--tnl-green)] xl:flex"
                        style={{ borderColor: "var(--tnl-border)", color: "var(--tnl-tan-text)" }}
                        data-testid="header-its-logo-link"
                    >
                        <span>ITS</span>
                        <span className="text-[10px] font-medium opacity-80">Surabaya</span>
                    </a>
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
                            to="/activity?tab=training"
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

export function SiteFooter() {
    const { t, locale } = useLocale();
    const { data: settings } = useSettings();
    const contact = settings?.contact;
    const focus = settings?.focus_areas ?? [];

    return (
        <footer className="mt-auto" style={{ background: "#111518", color: "#ffffff" }} data-testid="site-footer">
            <div className="tnl-container grid gap-10 py-14 md:grid-cols-2 lg:grid-cols-4">
                <div>
                    <div className="mb-4 flex items-center gap-3">
                        <LogoMark short={settings?.short_name ?? "TNL"} />
                        <span className="text-[15px] font-bold">{settings ? pick(locale, settings.site_title, settings.site_title_id) : "TNL"}</span>
                    </div>
                    <p className="text-sm leading-relaxed" style={{ color: "#c8ccd0" }}>
                        {settings?.seo?.default_description ??
                            "Telecommunication Network Laboratory, Department of Electrical Engineering, ITS Surabaya."}
                    </p>
                    {settings?.social?.instagram ? (
                        <a
                            href={settings.social.instagram}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-4 inline-flex items-center gap-2 text-sm transition-colors"
                            style={{ color: "var(--tnl-tan)" }}
                            data-testid="footer-instagram-link"
                        >
                            <Instagram className="h-4 w-4" aria-hidden="true" />
                            @tnllab_its
                        </a>
                    ) : null}
                </div>

                <div>
                    <h3 className="mb-4 text-sm font-bold uppercase tracking-wider" style={{ color: "var(--tnl-tan)" }}>
                        {t("footer_navigate")}
                    </h3>
                    <ul className="space-y-2.5 text-sm">
                        {NAV.map((item) => (
                            <li key={item.key}>
                                <Link
                                    to={item.to}
                                    className="transition-colors hover:text-[var(--tnl-tan)]"
                                    data-testid={`footer-${item.key.replace("nav_", "")}-link`}
                                >
                                    {t(item.key)}
                                </Link>
                            </li>
                        ))}
                    </ul>
                </div>

                <div>
                    <h3 className="mb-4 text-sm font-bold uppercase tracking-wider" style={{ color: "var(--tnl-tan)" }}>
                        {t("footer_research")}
                    </h3>
                    <ul className="space-y-2.5 text-sm" style={{ color: "#c8ccd0" }}>
                        {focus.length ? (
                            focus.map((f) => <li key={f.name}>{pick(locale, f.name, f.name_id)}</li>)
                        ) : (
                            <li>{t("coming_soon")}</li>
                        )}
                    </ul>
                </div>

                <div>
                    <h3 className="mb-4 text-sm font-bold uppercase tracking-wider" style={{ color: "var(--tnl-tan)" }}>
                        {t("footer_contact")}
                    </h3>
                    <ul className="space-y-3 text-sm" style={{ color: "#c8ccd0" }}>
                        {contact?.address || contact?.address_id ? (
                            <li className="flex gap-2">
                                <MapPin className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--tnl-tan)" }} aria-hidden="true" />
                                <span data-testid="footer-address">{pick(locale, contact.address, contact.address_id)}</span>
                            </li>
                        ) : null}
                        {contact?.email ? (
                            <li className="flex gap-2">
                                <Mail className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--tnl-tan)" }} aria-hidden="true" />
                                <a href={`mailto:${contact.email}`} className="hover:text-[var(--tnl-tan)]" data-testid="footer-email-link">
                                    {contact.email}
                                </a>
                            </li>
                        ) : null}
                    </ul>
                </div>
            </div>

            <div className="border-t" style={{ borderColor: "#262c33" }}>
                <div className="tnl-container flex flex-col items-center justify-between gap-3 py-6 text-xs sm:flex-row" style={{ color: "#7f715c" }}>
                    <p data-testid="footer-institution-line">
                        © {new Date().getFullYear()} {t("footer_institution")}. {t("all_rights")}
                    </p>
                    <div className="flex items-center gap-4">
                        <Link to="/terms" className="hover:text-[var(--tnl-tan)]" data-testid="footer-terms-link">
                            {t("terms")}
                        </Link>
                        <Link to="/privacy" className="hover:text-[var(--tnl-tan)]" data-testid="footer-privacy-link">
                            {t("privacy")}
                        </Link>
                    </div>
                </div>
            </div>
        </footer>
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
                        <Link to="/activity?tab=training" className="tnl-btn tnl-btn-primary flex-1" data-testid="announcement-cta-button">
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
