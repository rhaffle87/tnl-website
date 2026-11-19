// Public site shell: locale provider, chrome, announcement popup, SEO head tags,
// and the maintenance notice. Renders fully without a backend.

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { AnnouncementPopup, SiteCollaborationBand, SiteFooter, SiteHeader } from "@/components/site/Chrome";
import { LOCALE_STORAGE_KEY, LocaleContext, STRINGS, type Locale, type StringKey } from "@/lib/i18n";
import { useSettings } from "@/lib/hooks";

function useHeadTags() {
    const { data: settings } = useSettings();
    const location = useLocation();
    useEffect(() => {
        if (!settings) return;
        const description = settings.seo?.default_description ?? "";
        document.title = settings.seo?.title_template
            ? settings.seo.title_template.replace("{title}", settings.short_name || "TNL")
            : settings.site_title;
        const ensure = (selector: string, create: () => HTMLElement): HTMLElement => {
            let el = document.head.querySelector(selector) as HTMLElement | null;
            if (!el) {
                el = create();
                document.head.appendChild(el);
            }
            return el;
        };
        const meta = ensure('meta[name="description"]', () => {
            const m = document.createElement("meta");
            m.setAttribute("name", "description");
            return m;
        });
        meta.setAttribute("content", description);
        for (const [prop, value] of [
            ["og:title", document.title],
            ["og:description", description],
            ["og:type", "website"],
            ["og:url", window.location.href],
        ] as const) {
            const tag = ensure(`meta[property="${prop}"]`, () => {
                const m = document.createElement("meta");
                m.setAttribute("property", prop);
                return m;
            });
            tag.setAttribute("content", value);
        }
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
            email: settings.contact?.email ?? undefined,
            parentOrganization: {
                "@type": "CollegeOrUniversity",
                name: "Institut Teknologi Sepuluh Nopember",
                url: "https://www.its.ac.id",
            },
        });
    }, [settings, location.pathname]);
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
    if (!settings?.maintenance_mode) return null;
    return (
        <div
            className="px-4 py-3 text-center text-sm font-medium"
            style={{ background: "var(--tnl-tan)", color: "#111518" }}
            data-testid="maintenance-banner"
        >
            Maintenance mode is on — visitors see a maintenance notice. Turn it off in Settings.
        </div>
    );
}

export default function SiteLayout() {
    useHeadTags();
    const location = useLocation();

    useEffect(() => {
        window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    }, [location.pathname]);

    useEffect(() => {
        const stored = localStorage.getItem("tnl-theme");
        const isDark = stored === "dark" || (!stored && window.matchMedia("(prefers-color-scheme: dark)").matches);
        if (isDark) {
            document.documentElement.classList.add("dark");
        } else {
            document.documentElement.classList.remove("dark");
        }
        const meta = document.querySelector('meta[name="color-scheme"]');
        if (meta) meta.setAttribute("content", stored ? (stored === "dark" ? "dark" : "light") : "light dark");
    }, []);

    return (
        <div className="flex min-h-svh flex-col" style={{ background: "var(--background)" }}>
            <MaintenanceNotice />
            <SiteHeader />
            <main className="flex-1">
                <Outlet />
            </main>
            <SiteCollaborationBand />
            <SiteFooter />
            <AnnouncementPopup />
        </div>
    );
}
