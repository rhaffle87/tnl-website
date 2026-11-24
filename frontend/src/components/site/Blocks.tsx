// Block renderer: every public page is a list of blocks authored in TNL Studio.
// Each block type here matches an entry in the admin's block library.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { m } from "motion/react";
import { handleSpotlightPointerMove } from "@/components/site/SpotlightCard";
import {
    Activity as ActivityIcon,
    ArrowRight,
    ChevronLeft,
    ChevronRight,
    Download,
    GraduationCap,
    Mail,
    MapPin,
    Minus,
    Plus,
    Radio,
    Users,
    Wrench,
} from "lucide-react";
import { pick, pickProp, useLocale } from "@/lib/i18n";
import { useMembers, usePartners, usePosts, useSettings, useStats } from "@/lib/hooks";
import { EmptyState, SectionHeading, formatDate } from "@/components/site/Primitives";
import { MemberSections } from "@/components/site/MemberSections";
import { ContactForm } from "@/components/site/ContactForm";
import { SignalHero } from "@/components/site/SignalHero";
import { SignalGallery } from "@/components/site/SignalGallery";
import type { Block } from "@/lib/types";

const ICONS = [Radio, Wrench, GraduationCap, Users, ActivityIcon];

interface Tile {
    name?: string;
    name_id?: string;
    title?: string;
    title_id?: string;
    description?: string;
    description_id?: string;
    eyebrow?: string;
    eyebrow_id?: string;
    items?: string[];
    items_id?: string[];
    url?: string;
}

function tiles(props: Record<string, unknown>, key: string): Tile[] {
    const value = props[key];
    return Array.isArray(value) ? (value as Tile[]) : [];
}

function str(props: Record<string, unknown>, key: string, fallback = ""): string {
    const v = props[key];
    return typeof v === "string" ? v : fallback;
}

function num(props: Record<string, unknown>, key: string, fallback: number): number {
    const v = props[key];
    return typeof v === "number" ? v : fallback;
}

// ---------------------------------------------------------------- hero
function HeroBlock({ props }: { props: Record<string, unknown> }) {
    return <SignalHero props={props} />;
}

function InnerHeroBlock({ props }: { props: Record<string, unknown> }) {
    const { locale } = useLocale();
    const eyebrow = pickProp(locale, props, "eyebrow");
    return (
        <section className="signal-inner-hero" data-testid="block-inner-hero">
            <div className="tnl-container py-14 lg:py-20">
                {eyebrow ? (
                    <p className="tnl-eyebrow mb-3 font-bold" style={{ color: "var(--tnl-tan)" }} data-testid="inner-hero-eyebrow">
                        {eyebrow}
                    </p>
                ) : null}
                <h1 className="tnl-hero-title font-bold" style={{ color: "#ffffff" }} data-testid="inner-hero-title">
                    {pickProp(locale, props, "title")}
                </h1>
                <p className="mt-4 max-w-3xl text-base sm:text-lg" style={{ color: "#dfe2e5" }} data-testid="inner-hero-description">
                    {pickProp(locale, props, "description")}
                </p>
            </div>
        </section>
    );
}

// ---------------------------------------------------------------- stats
function StatsBlock() {
    const { t } = useLocale();
    const { data, isError } = useStats();
    const items = [
        { label: t("stat_lecturers"), value: data ? String(data.lecturers) : "—", key: "lecturers" },
        { label: t("stat_assistants"), value: data ? String(data.assistants) : "—", key: "assistants" },
        { label: t("stat_tracks"), value: data ? String(data.research_tracks) : "—", key: "tracks" },
        { label: t("stat_room"), value: data?.room ?? "B-301", key: "room" },
    ];
    return (
        <section className="border-y" style={{ background: "#0C100E", borderColor: "rgba(255,255,255,0.08)" }} data-testid="block-stats">
            <div className="tnl-container grid grid-cols-2 divide-y sm:divide-y-0 sm:grid-cols-2 lg:grid-cols-4 lg:divide-x divide-white/[0.08] py-8 lg:py-10">
                {items.map((item) => (
                    <div key={item.key} className="tnl-scroll-reveal flex flex-col items-center justify-center text-center px-4 py-5 sm:py-2" data-testid={`stat-${item.key}`}>
                        <div className="text-[38px] lg:text-[52px] font-bold font-mono tracking-tight tabular-nums leading-none" style={{ color: "var(--tnl-tan)" }}>
                            {isError && !data ? "—" : item.value}
                        </div>
                        <div className="mt-2.5 text-xs lg:text-sm font-medium tracking-wide uppercase text-white/60 text-center">
                            {item.label}
                        </div>
                    </div>
                ))}
            </div>
        </section>
    );
}

// ---------------------------------------------------------------- about + feature tiles
function parseAboutSpecs(text: string): string[] {
    if (!text) return [];
    return text
        .replace(/^(integrated laboratory hosting|laboratorium terpadu yang dilengkapi)\s+/i, "")
        .split(/,|\band\b|\bdan\b/i)
        .map((part) => part.replace(/\s+/g, " ").replace(/^[\s.]+|[\s.]+$/g, ""))
        .filter((part) => part.length > 3 && part.length < 90)
        .slice(0, 6);
}

function AboutBlock({ props }: { props: Record<string, unknown> }) {
    const { locale } = useLocale();
    const list = tiles(props, "tiles");
    const location = pickProp(locale, props, "location");

    return (
        <section className="tnl-section signal-about" data-testid="block-about">
            <div className="tnl-container">
                <SectionHeading title={pickProp(locale, props, "heading")} testId="about-heading" />
                <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-12 lg:gap-14">
                    <div className="lg:col-span-7">
                        <p
                            className="signal-about-body max-w-[54ch] text-lg leading-[1.65] text-[var(--tnl-body)] sm:text-[1.15rem]"
                            data-testid="about-body"
                        >
                            {pickProp(locale, props, "body") || pickProp(locale, props, "description")}
                        </p>
                        {location ? (
                            <div className="mt-8 border-t border-[var(--tnl-border)] pt-5" data-testid="about-location">
                                <div
                                    className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[var(--tnl-muted)]"
                                    data-testid="about-location-line"
                                >
                                    <MapPin className="h-4 w-4 shrink-0" style={{ color: "var(--tnl-link)" }} aria-hidden="true" />
                                    <span>{location}</span>
                                </div>
                                <Link
                                    to="/contact"
                                    className="mt-2 inline-block text-xs font-medium text-[var(--tnl-link)] underline-offset-4 hover:underline"
                                >
                                    {locale === "id" ? "Lihat lokasi →" : "View location →"}
                                </Link>
                            </div>
                        ) : null}
                    </div>

                    <div className="space-y-7 divide-y divide-[var(--tnl-border)] lg:col-span-5">
                        {list.map((tile, i) => {
                            const heading = pick(locale, tile.title ?? tile.name, tile.title_id ?? tile.name_id);
                            const eyebrow = pickProp(locale, tile as Record<string, unknown>, "eyebrow") ||
                                `0${i + 1} · ${heading.toUpperCase()}`;
                            const isHardware = /testbed|facilit|fasilitas|hardware/i.test(heading);
                            const authored = locale === "id" && tile.items_id?.length ? tile.items_id : tile.items;
                            const description = pick(locale, tile.description, tile.description_id);
                            const items = isHardware
                                ? authored && authored.length
                                    ? authored
                                    : parseAboutSpecs(description)
                                : [];
                            return (
                                <div key={tile.name ?? tile.title ?? i} className="pt-6 first:pt-0" data-testid={`about-topic-${i}`}>
                                    <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--tnl-muted)]">
                                        {eyebrow}
                                    </div>
                                    <p className="mt-2 text-sm leading-relaxed text-[var(--tnl-body)]">{description}</p>
                                    {items.length ? (
                                        <ul className="mt-3 grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
                                            {items.map((item, j) => (
                                                <li
                                                    key={`${item}-${j}`}
                                                    className="flex items-start gap-2 text-sm leading-relaxed text-[var(--tnl-body)]"
                                                    data-testid={`about-testbed-item-${j}`}
                                                >
                                                    <span
                                                        className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--gsm-emerald,#5D8A6B)]"
                                                        aria-hidden="true"
                                                    />
                                                    <span>{item}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    ) : null}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </section>
    );
}

function FeatureTilesBlock({ props }: { props: Record<string, unknown> }) {
    const { locale } = useLocale();
    const list = tiles(props, "tiles");
    return (
        <section className="tnl-section" data-testid="block-feature-tiles">
            <div className="tnl-container">
                {pickProp(locale, props, "heading") ? (
                    <SectionHeading title={pickProp(locale, props, "heading")} testId="feature-tiles-heading" />
                ) : null}
                <div className={`grid gap-4 sm:grid-cols-2 ${list.length % 4 === 0 ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
                    {list.map((tile, i) => {
                        const Icon = ICONS[i % ICONS.length];
                        return (
                            <div
                                key={i}
                                className="signal-feature-tile"
                                onPointerMove={handleSpotlightPointerMove}
                                data-testid={`feature-tile-${i}`}
                            >
                                <Icon className="mb-3 h-6 w-6" style={{ color: "var(--tnl-link)" }} aria-hidden="true" />
                                <h3 className="text-[18px] font-bold">{pick(locale, tile.title ?? tile.name, tile.title_id ?? tile.name_id)}</h3>
                                <p className="mt-2 text-sm text-[var(--tnl-body)]">{pick(locale, tile.description, tile.description_id)}</p>
                            </div>
                        );
                    })}
                </div>
            </div>
        </section>
    );
}

// ---------------------------------------------------------------- numbered cards
function NumberedCardsBlock({ props }: { props: Record<string, unknown> }) {
    const { locale, t } = useLocale();
    const cards = tiles(props, "cards");
    return (
        <section className="tnl-section signal-research" data-testid="block-numbered-cards">
            <div className="tnl-container signal-research-layout">
                <SectionHeading title={pickProp(locale, props, "heading")} count={cards.length} countLabel={locale === "id" ? "bidang" : "tracks"} testId="numbered-cards-heading" />
                <div>
                    {cards.map((card, i) => (
                        <article key={i} className="signal-research-row" data-testid={`numbered-card-${i}`}>
                            <span className="signal-research-index">{String(i + 1).padStart(2, "0")}</span>
                            <div><h3>{pick(locale, card.title ?? card.name, card.title_id ?? card.name_id)}</h3><p>{pick(locale, card.description, card.description_id)}</p></div>
                        </article>
                    ))}
                    <Link to={str(props, "see_all_url", "/activity?tab=rd")} viewTransition className="signal-research-more" data-testid="numbered-cards-see-all-card">
                        {pickProp(locale, props, "see_all_label") || t("see_all")}<ArrowRight className="h-5 w-5" aria-hidden="true" />
                    </Link>
                </div>
            </div>
        </section>
    );
}

// ---------------------------------------------------------------- carousel
function CarouselBlock({ props }: { props: Record<string, unknown> }) {
    const { locale } = useLocale();
    const slides = tiles(props, "slides");
    const [index, setIndex] = useState(0);
    if (!slides.length) return null;
    const active = index % slides.length;
    const slide = slides[active];
    const go = (delta: number) => setIndex((active + delta + slides.length) % slides.length);
    return (
        <section className="tnl-section signal-study" data-testid="block-carousel">
            <div className="tnl-container">
                <SectionHeading title={pickProp(locale, props, "heading")} testId="carousel-heading" />
                <div className="signal-study-layout">
                    <nav className="signal-study-index" aria-label={locale === "id" ? "Pilih bidang keilmuan" : "Choose a study track"}>
                        {slides.map((item, i) => (
                            <button key={i} type="button" aria-pressed={i === active} onClick={() => setIndex(i)} data-testid={`carousel-dot-${i}`}>
                                <span aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
                                {pick(locale, item.title ?? item.name, item.title_id ?? item.name_id)}
                                <ArrowRight aria-hidden="true" className="h-4 w-4" />
                            </button>
                        ))}
                    </nav>
                    <div className="signal-study-reading">
                        <div className="signal-study-slide" data-testid="carousel-slide" aria-live="polite" aria-atomic="true">
                            <p className="signal-study-kicker">{locale === "id" ? "Bidang Keilmuan" : "Study track"}</p>
                            <h3>{pick(locale, slide.title ?? slide.name, slide.title_id ?? slide.name_id)}</h3>
                            <p>{pick(locale, slide.description, slide.description_id)}</p>
                        </div>
                        <div className="signal-study-controls">
                            <span data-testid="carousel-position">{String(active + 1).padStart(2, "0")} / {String(slides.length).padStart(2, "0")}</span>
                            <div>
                                <button type="button" aria-label={locale === "id" ? "Bidang sebelumnya" : "Previous slide"} onClick={() => go(-1)} data-testid="carousel-prev-button"><ChevronLeft aria-hidden="true" className="h-5 w-5" /></button>
                                <button type="button" aria-label={locale === "id" ? "Bidang berikutnya" : "Next slide"} onClick={() => go(1)} data-testid="carousel-next-button"><ChevronRight aria-hidden="true" className="h-5 w-5" /></button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}

// ---------------------------------------------------------------- quick links
function QuickLinksBlock({ props }: { props: Record<string, unknown> }) {
    const { locale, t } = useLocale();
    const cards = tiles(props, "cards");
    const heading = pickProp(locale, props, "heading");
    return (
        <section className="tnl-section" data-testid="block-quick-links">
            <div className="tnl-container">
                {heading ? <SectionHeading title={heading} testId="quick-links-heading" /> : null}
                <div className="grid gap-5 md:grid-cols-3">
                    {cards.map((card, i) => (
                        <Link
                            key={i}
                            to={card.url ?? "/"}
                            className="signal-directory-link group"
                            data-testid={`quick-link-card-${i}`}
                        >
                            <h3 className="text-[21px] font-bold">{pick(locale, card.title, card.title_id)}</h3>
                            <p className="mt-2 flex-1 text-sm text-[var(--tnl-body)]">{pick(locale, card.description, card.description_id)}</p>
                            <span
                                className="mt-5 inline-flex items-center gap-2 text-sm font-semibold transition-transform group-hover:translate-x-1"
                                style={{ color: "var(--tnl-link)" }}
                            >
                                {t("read_more")} <ArrowRight className="h-4 w-4" aria-hidden="true" />
                            </span>
                        </Link>
                    ))}
                </div>
            </div>
        </section>
    );
}

// ---------------------------------------------------------------- news feed
export function NewsFeedBlock({ props }: { props: Record<string, unknown> }) {
    const { locale, t } = useLocale();
    const count = num(props, "count", 3);
    const showFilters = props.show_filters === true;
    const [category, setCategory] = useState("");
    const [searchInput, setSearchInput] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(searchInput.trim());
        }, 250);
        return () => clearTimeout(timer);
    }, [searchInput]);

    const { data, isLoading, isFetching } = usePosts({
        limit: count,
        category: category || undefined,
        q: debouncedSearch || undefined,
    });
    const posts = data?.items ?? [];

    const [masterCategories, setMasterCategories] = useState<string[]>([]);
    useEffect(() => {
        if (data?.categories && data.categories.length > 0) {
            setMasterCategories((prev) => {
                const incoming = data.categories as string[];
                if (prev.length === incoming.length && prev.every((v, i) => v === incoming[i])) {
                    return prev;
                }
                return incoming;
            });
        } else if (posts.length > 0) {
            setMasterCategories((prev) => {
                const current = Array.from(new Set(posts.map((p) => p.category))).filter(Boolean);
                const merged = Array.from(new Set([...prev, ...current]));
                return merged.length > prev.length ? merged : prev;
            });
        }
    }, [data?.categories, posts]);

    const categories = masterCategories.length > 0
        ? masterCategories
        : Array.from(new Set(posts.map((p) => p.category))).filter(Boolean);

    return (
        <section className="tnl-section" data-testid="block-news-feed">
            <div className="tnl-container">
                <SectionHeading
                    title={pickProp(locale, props, "heading") || t("latest_news")}
                    testId="news-feed-heading"
                />
                {showFilters ? (
                    <div className="mb-8 flex flex-col gap-3 sm:flex-row">
                        <input
                            type="search"
                            value={searchInput}
                            onChange={(e) => setSearchInput(e.target.value)}
                            placeholder={t("search_news")}
                            className="tnl-field sm:max-w-sm"
                            aria-label={t("search_news")}
                            data-testid="news-search-input"
                        />
                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                onClick={() => setCategory("")}
                                className="relative rounded-full border px-4 py-2 text-sm font-medium transition-colors"
                                style={{ borderColor: category === "" ? "var(--tnl-green)" : "var(--tnl-border)" }}
                                data-testid="news-category-all-button"
                            >
                                {category === "" ? (
                                    <m.span
                                        layoutId="news-category-active-pill"
                                        className="absolute inset-0 rounded-full"
                                        style={{ background: "var(--tnl-green)" }}
                                        transition={{ type: "spring", stiffness: 420, damping: 34 }}
                                    />
                                ) : null}
                                <span className="relative z-10" style={{ color: category === "" ? "#fff" : "inherit" }}>
                                    {t("all_categories")}
                                </span>
                            </button>
                            {categories.map((c) => (
                                <button
                                    key={c}
                                    type="button"
                                    onClick={() => setCategory(c)}
                                    className="relative rounded-full border px-4 py-2 text-sm font-medium transition-colors"
                                    style={{ borderColor: category === c ? "var(--tnl-green)" : "var(--tnl-border)" }}
                                    data-testid={`news-category-${c.toLowerCase().replace(/\s+/g, "-")}-button`}
                                >
                                    {category === c ? (
                                        <m.span
                                            layoutId="news-category-active-pill"
                                            className="absolute inset-0 rounded-full"
                                            style={{ background: "var(--tnl-green)" }}
                                            transition={{ type: "spring", stiffness: 420, damping: 34 }}
                                        />
                                    ) : null}
                                    <span className="relative z-10" style={{ color: category === c ? "#fff" : "inherit" }}>
                                        {c}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>
                ) : null}

                {!isLoading && posts.length === 0 ? (
                    <EmptyState title={t("coming_soon")} body={t("empty_news")} testId="news-empty-state" />
                ) : (
                    <div className={`${showFilters ? "grid gap-5 md:grid-cols-2 lg:grid-cols-3" : "signal-news-grid"} ${isFetching && !isLoading ? "opacity-80 transition-opacity" : "transition-opacity"}`}>
                        {posts.map((post) => (
                            <Link
                                key={post.id}
                                to={`/news/${post.slug}`}
                                viewTransition
                                className="tnl-card tnl-card-hover tnl-card-spotlight tnl-scroll-reveal group flex flex-col overflow-hidden p-0"
                                onPointerMove={handleSpotlightPointerMove}
                                data-testid={`news-card-${post.slug}`}
                            >
                                {post.cover_url ? (
                                    <div className="tnl-parallax-media h-44 w-full">
                                        <img
                                            src={post.cover_url}
                                            alt={post.cover_alt ?? pick(locale, post.title, post.title_id)}
                                            className="h-full w-full object-cover"
                                            loading="lazy"
                                            style={{ viewTransitionName: `news-cover-${(post.slug || post.id || "post").replace(/[^a-zA-Z0-9_-]/g, "-")}` }}
                                        />
                                    </div>
                                ) : (
                                    <div className="tnl-hero-gradient h-44 w-full" aria-hidden="true" />
                                )}
                                <div className="flex flex-1 flex-col p-6">
                                    <div className="mb-2 flex items-center gap-2 text-xs">
                                        <span className="tnl-count-chip">{post.category}</span>
                                        <span style={{ color: "var(--tnl-body)" }}>{formatDate(post.published_at, locale)}</span>
                                    </div>
                                    <h3 className="text-[18px] font-bold leading-snug">{pick(locale, post.title, post.title_id)}</h3>
                                    <p className="mt-2 flex-1 text-sm text-[var(--tnl-body)]">{pick(locale, post.excerpt, post.excerpt_id)}</p>
                                    <span
                                        className="mt-4 inline-flex items-center gap-2 text-sm font-semibold transition-transform group-hover:translate-x-1"
                                        style={{ color: "var(--tnl-link)" }}
                                    >
                                        {t("read_more")} <ArrowRight className="h-4 w-4" aria-hidden="true" />
                                    </span>
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
                {!showFilters && posts.length > 0 ? (
                    <div className="mt-8">
                        <Link to="/news" className="tnl-btn tnl-btn-outline" data-testid="news-see-all-button">
                            {t("see_all_news")} <ArrowRight className="h-4 w-4" aria-hidden="true" />
                        </Link>
                    </div>
                ) : null}
            </div>
        </section>
    );
}

// ---------------------------------------------------------------- partners
function PartnersBlock({ props }: { props: Record<string, unknown> }) {
    const { locale, t } = useLocale();
    const { data: partners, isLoading } = usePartners();
    const list = partners ?? [];

    const getCategory = (name: string) => {
        const lower = name.toLowerCase();
        if (lower.includes("institut") || lower.includes("its")) return locale === "id" ? "Afiliasi Akademik" : "Academic Host";
        if (lower.includes("huawei") || lower.includes("zte")) return locale === "id" ? "Partner Teknologi" : "Technology Partner";
        return locale === "id" ? "Operator Telekomunikasi" : "Telco Operator";
    };

    const renderPartner = (p: (typeof list)[0], keySuffix: string | number, isDuplicate = false) => {
        const category = getCategory(p.name);
        const content = (
            <div className="flex flex-col items-center justify-center shrink-0 w-auto px-2 transition-transform duration-300 hover:scale-105">
                <div className="flex h-16 md:h-20 w-auto items-center justify-center p-1">
                    {p.logo_url ? (
                        <img
                            src={p.logo_url}
                            alt={`${p.name} logo`}
                            width="160"
                            height="64"
                            className="h-16 md:h-20 w-auto max-w-[190px] md:max-w-[230px] object-contain opacity-85 transition-opacity duration-200 hover:opacity-100"
                            loading="lazy"
                        />
                    ) : (
                        <span className="text-center text-sm md:text-base font-bold tracking-tight text-[#111613] dark:text-white whitespace-nowrap">
                            {p.name}
                        </span>
                    )}
                </div>
                <span className="mt-2 text-center text-xs font-semibold text-[var(--tnl-body)] dark:text-[#B8C0BA] whitespace-nowrap">
                    {p.name.replace("Institut Teknologi Sepuluh Nopember", "ITS Surabaya")}
                </span>
                <span
                    className="mt-1 rounded-full px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider whitespace-nowrap"
                    style={{
                        background: "color-mix(in srgb, var(--tnl-tan) 18%, transparent)",
                        color: "var(--tnl-tan-text)",
                    }}
                >
                    {category}
                </span>
            </div>
        );

        return p.url ? (
            <a
                key={`${p.id}-${keySuffix}`}
                href={p.url}
                target="_blank"
                rel="noopener noreferrer"
                tabIndex={isDuplicate ? -1 : undefined}
                className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C4B393] shrink-0"
                data-testid={`partner-${p.name.toLowerCase().replace(/\s+/g, "-")}`}
            >
                {content}
            </a>
        ) : (
            <div
                key={`${p.id}-${keySuffix}`}
                className="shrink-0"
                data-testid={`partner-${p.name.toLowerCase().replace(/\s+/g, "-")}`}
            >
                {content}
            </div>
        );
    };

    return (
        <section className="tnl-section overflow-hidden" style={{ background: "var(--tnl-surface)" }} data-testid="block-partners">
            <div className="tnl-container">
                <SectionHeading title={pickProp(locale, props, "heading") || t("partners")} testId="partners-heading" />
                {!isLoading && list.length === 0 ? (
                    <EmptyState title={t("coming_soon")} body={t("coming_soon_body")} testId="partners-empty-state" />
                ) : (
                    <div className="group relative mt-6 w-full overflow-hidden py-4 [mask-image:linear-gradient(to_right,transparent,black_6%,black_94%,transparent)]">
                        <div className="flex w-max items-center animate-marquee group-hover:[animation-play-state:paused] motion-reduce:[animation-play-state:paused]">
                            <div className="flex items-center gap-6 sm:gap-8 md:gap-10 pr-6 sm:pr-8 md:pr-10">
                                {list.map((p, idx) => renderPartner(p, `track1-${idx}`))}
                                {list.map((p, idx) => renderPartner(p, `track1-dup-${idx}`))}
                            </div>
                            <div className="flex items-center gap-6 sm:gap-8 md:gap-10 pr-6 sm:pr-8 md:pr-10" aria-hidden="true">
                                {list.map((p, idx) => renderPartner(p, `track2-${idx}`, true))}
                                {list.map((p, idx) => renderPartner(p, `track2-dup-${idx}`, true))}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </section>
    );
}

// ---------------------------------------------------------------- CTA band
// Disabled standalone rendering: CTA band is now integrated directly into SiteFooter
// to prevent duplicate stacked CTA bands and ensure consistent dark canvas rhythm.
function CtaBandBlock(_props?: { props?: Record<string, unknown> }) {
    return null;
}

// ---------------------------------------------------------------- contact panel + map
function ContactPanelBlock() {
    const { t, locale } = useLocale();
    const { data: settings } = useSettings();
    const contact = settings?.contact;
    const items = [
        {
            icon: MapPin,
            label: locale === "id" ? "Alamat" : "Address",
            value: pick(locale, contact?.address, contact?.address_id) || "Gedung B, Ruang B-301, ITS, Surabaya",
            href: contact?.maps_url ?? undefined,
            key: "address",
        },
        { icon: Mail, label: t("email"), value: contact?.email ?? "", href: contact?.email ? `mailto:${contact.email}` : undefined, key: "email" },
    ].filter((i) => i.value);

    return (
        <section className="tnl-section" data-testid="block-contact-panel">
            <div className="tnl-container grid gap-4 sm:grid-cols-2">
                {items.map(({ icon: Icon, label, value, href, key }) => (
                    <div key={key} className="tnl-card tnl-card-hover flex gap-4 p-6" data-testid={`contact-tile-${key}`}>
                        <div
                            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[10px]"
                            style={{ background: "color-mix(in srgb, var(--tnl-green) 12%, transparent)" }}
                            aria-hidden="true"
                        >
                            <Icon className="h-5 w-5" style={{ color: "var(--tnl-link)" }} />
                        </div>
                        <div>
                            <div className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--tnl-tan-text)" }}>
                                {label}
                            </div>
                            {href ? (
                                <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer" className="mt-1 block text-[15px] font-medium hover:underline">
                                    {value}
                                </a>
                            ) : (
                                <div className="mt-1 text-[15px] font-medium">{value}</div>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </section>
    );
}

function MapBlock({ props }: { props: Record<string, unknown> }) {
    const { data: settings } = useSettings();
    const label = str(props, "label", "Institut Teknologi Sepuluh Nopember, Surabaya");
    const href = settings?.contact?.maps_url ?? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(label)}`;
    return (
        <section className="tnl-section pt-0" data-testid="block-map">
            <div className="tnl-container">
                <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="tnl-card tnl-card-hover flex flex-col items-center justify-center gap-3 px-6 py-16 text-center"
                    data-testid="map-open-link"
                >
                    <MapPin className="h-8 w-8" style={{ color: "var(--tnl-link)" }} aria-hidden="true" />
                    <span className="text-[17px] font-bold">{label}</span>
                    <span className="text-sm" style={{ color: "var(--tnl-link)" }}>
                        Google Maps <ArrowRight className="inline h-4 w-4" aria-hidden="true" />
                    </span>
                </a>
            </div>
        </section>
    );
}

// ---------------------------------------------------------------- rich text / html / gallery / video
function RichTextBlock({ props }: { props: Record<string, unknown> }) {
    const { locale } = useLocale();
    const html = locale === "id" ? str(props, "html_id") || str(props, "html") : str(props, "html") || str(props, "html_id");
    return (
        <section className="tnl-section" data-testid="block-rich-text">
            <div className="tnl-container">
                {/* Sanitized server-side by lib/sanitize.py before storage. */}
                <div className="tnl-prose max-w-3xl text-justify [hyphens:auto]" dangerouslySetInnerHTML={{ __html: html }} />
            </div>
        </section>
    );
}

function ImageBlock({ props }: { props: Record<string, unknown> }) {
    const url = str(props, "url");
    const alt = str(props, "alt");
    if (!url) return null;
    return (
        <section className="tnl-section" data-testid="block-image">
            <div className="tnl-container">
                <img src={url} alt={alt} className="w-full rounded-[15px] object-cover" loading="lazy" />
                {str(props, "caption") ? (
                    <p className="mt-3 text-center text-sm" style={{ color: "var(--tnl-body)" }}>
                        {str(props, "caption")}
                    </p>
                ) : null}
            </div>
        </section>
    );
}

function GalleryBlock({ props }: { props: Record<string, unknown> }) {
    return <SignalGallery props={props} />;
}

function VideoBlock({ props }: { props: Record<string, unknown> }) {
    const url = str(props, "url");
    if (!url) return null;
    return (
        <section className="tnl-section" data-testid="block-video">
            <div className="tnl-container">
                <div className="overflow-hidden rounded-[15px]" style={{ aspectRatio: "16 / 9" }}>
                    <iframe
                        src={url}
                        title={str(props, "title", "Video")}
                        className="h-full w-full"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                    />
                </div>
            </div>
        </section>
    );
}

// ---------------------------------------------------------------- timeline / accordion / downloads
function TimelineBlock({ props }: { props: Record<string, unknown> }) {
    const { locale } = useLocale();
    const steps = tiles(props, "steps");
    if (!steps.length) return null;
    return (
        <section className="tnl-section signal-timeline" data-testid="block-timeline">
            <div className="tnl-container">
                {pickProp(locale, props, "heading") ? <SectionHeading title={pickProp(locale, props, "heading")} testId="timeline-heading" /> : null}
                <ol className="relative border-l-2 pl-8" style={{ borderColor: "var(--tnl-border)" }}>
                    {steps.map((step, i) => (
                        <li key={i} className="relative pb-8 last:pb-0" data-testid={`timeline-step-${i}`}>
                            <span
                                className="absolute -left-[41px] flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold text-white"
                                style={{ background: "var(--tnl-green)" }}
                                aria-hidden="true"
                            >
                                {i + 1}
                            </span>
                            <h3 className="text-[18px] font-bold">{pick(locale, step.title, step.title_id)}</h3>
                            <p className="mt-1.5 text-sm text-[var(--tnl-body)]">{pick(locale, step.description, step.description_id)}</p>
                        </li>
                    ))}
                </ol>
            </div>
        </section>
    );
}

function AccordionBlock({ props }: { props: Record<string, unknown> }) {
    const { locale } = useLocale();
    const items = tiles(props, "items");
    const [open, setOpen] = useState<number | null>(0);
    if (!items.length) return null;
    return (
        <section className="tnl-section signal-accordion" data-testid="block-accordion">
            <div className="tnl-container max-w-3xl">
                {pickProp(locale, props, "heading") ? <SectionHeading title={pickProp(locale, props, "heading")} testId="accordion-heading" /> : null}
                <div className="space-y-3">
                    {items.map((item, i) => (
                        <div key={i} className="tnl-card overflow-hidden p-0" data-testid={`accordion-item-${i}`}>
                            <button
                                type="button"
                                onClick={() => setOpen(open === i ? null : i)}
                                className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left"
                                aria-expanded={open === i}
                                data-testid={`accordion-trigger-${i}`}
                            >
                                <span className="text-[17px] font-bold">{pick(locale, item.title, item.title_id)}</span>
                                {open === i ? <Minus className="h-5 w-5 shrink-0" style={{ color: "var(--tnl-link)" }} /> : <Plus className="h-5 w-5 shrink-0" style={{ color: "var(--tnl-link)" }} />}
                            </button>
                            {open === i ? (
                                <div className="px-6 pb-5 text-sm leading-relaxed text-[var(--tnl-body)]">
                                    {pick(locale, item.description, item.description_id)}
                                </div>
                            ) : null}
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}

function DownloadListBlock({ props }: { props: Record<string, unknown> }) {
    const { locale } = useLocale();
    const files = Array.isArray(props.files) ? (props.files as { label: string; url: string }[]) : [];
    if (!files.length) return null;
    return (
        <section className="tnl-section signal-downloads" data-testid="block-download-list">
            <div className="tnl-container max-w-3xl">
                {pickProp(locale, props, "heading") ? <SectionHeading title={pickProp(locale, props, "heading")} testId="downloads-heading" /> : null}
                <ul className="space-y-3">
                    {files.map((file, i) => (
                        <li key={i}>
                            <a
                                href={file.url}
                                className="tnl-card tnl-card-hover flex items-center justify-between gap-4 px-6 py-4"
                                data-testid={`download-item-${i}`}
                            >
                                <span className="font-medium">{file.label}</span>
                                <Download className="h-5 w-5 shrink-0" style={{ color: "var(--tnl-link)" }} aria-hidden="true" />
                            </a>
                        </li>
                    ))}
                </ul>
            </div>
        </section>
    );
}

// ---------------------------------------------------------------- dispatcher
export function BlockRenderer({ blocks }: { blocks: Block[] }) {
    return (
        <>
            {blocks
                .filter((b) => !b.hidden)
                .map((block) => (
                    <BlockView key={block.id} block={block} />
                ))}
        </>
    );
}

function BlockView({ block }: { block: Block }) {
    const props = block.props ?? {};
    switch (block.type) {
        case "hero":
            return <HeroBlock props={props} />;
        case "inner_hero":
            return <InnerHeroBlock props={props} />;
        case "stats":
            return <StatsBlock />;
        case "about":
            return <AboutBlock props={props} />;
        case "feature_tiles":
            return <FeatureTilesBlock props={props} />;
        case "numbered_cards":
            return <NumberedCardsBlock props={props} />;
        case "carousel":
            return <CarouselBlock props={props} />;
        case "quick_links":
            return <QuickLinksBlock props={props} />;
        case "news_feed":
            return <NewsFeedBlock props={props} />;
        case "partners":
            return <PartnersBlock props={props} />;
        case "cta_band":
            return <CtaBandBlock props={props} />;
        case "contact_panel":
            return <ContactPanelBlock />;
        case "contact_form":
            return <ContactForm />;
        case "map":
            return <MapBlock props={props} />;
        case "rich_text":
        case "html":
            return <RichTextBlock props={props} />;
        case "image":
            return <ImageBlock props={props} />;
        case "gallery":
            return <GalleryBlock props={props} />;
        case "video":
            return <VideoBlock props={props} />;
        case "timeline":
            return <TimelineBlock props={props} />;
        case "accordion":
            return <AccordionBlock props={props} />;
        case "download_list":
            return <DownloadListBlock props={props} />;
        case "member_sections":
            return <MemberSections />;
        default:
            return null;
    }
}

export { MemberSectionsPlaceholder } from "@/components/site/MemberSections";
export function useMembersForBlocks() {
    return useMembers();
}
