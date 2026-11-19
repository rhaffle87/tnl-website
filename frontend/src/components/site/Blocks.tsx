// Block renderer: every public page is a list of blocks authored in TNL Studio.
// Each block type here matches an entry in the admin's block library.

import { useState } from "react";
import { Link } from "react-router-dom";
import {
    Activity as ActivityIcon,
    ArrowRight,
    Building2,
    CheckCircle2,
    ChevronLeft,
    ChevronRight,
    Download,
    GraduationCap,
    Mail,
    MapPin,
    Minus,
    Plus,
    Radio,
    Server,
    Target,
    Users,
    Wrench,
} from "lucide-react";
import { pick, pickProp, useLocale } from "@/lib/i18n";
import { useMembers, usePartners, usePosts, useSettings, useStats } from "@/lib/hooks";
import { EmptyState, SectionHeading, formatDate } from "@/components/site/Primitives";
import { MemberSections } from "@/components/site/MemberSections";
import { ContactForm } from "@/components/site/ContactForm";
import type { Block } from "@/lib/types";

const ICONS = [Radio, Wrench, GraduationCap, Users, ActivityIcon];

interface Tile {
    name?: string;
    name_id?: string;
    title?: string;
    title_id?: string;
    description?: string;
    description_id?: string;
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
    const { locale, t } = useLocale();
    const badge = str(props, "badge");
    const [imgError, setImgError] = useState(false);
    return (
        <section className="tnl-hero-gradient relative overflow-hidden" data-testid="block-hero">
            <div
                className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full opacity-20 blur-3xl"
                style={{ background: "var(--tnl-tan)" }}
                aria-hidden="true"
            />
            <div className="tnl-container relative grid items-center gap-12 py-16 lg:grid-cols-[1.15fr_0.85fr] lg:py-24">
                <div className="animate-fade-up">
                    {badge ? (
                        <span
                            className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-bold tracking-wider"
                            style={{ background: "rgba(168,151,123,0.18)", color: "var(--tnl-tan)" }}
                            data-testid="hero-badge"
                        >
                            <MapPin className="h-4 w-4" aria-hidden="true" />
                            {badge}
                        </span>
                    ) : null}
                    <h1 className="tnl-hero-title mt-5 font-bold text-white" style={{ color: "#ffffff" }} data-testid="hero-title">
                        {pickProp(locale, props, "title_before")}{" "}
                        <span style={{ color: "var(--tnl-tan)" }}>{pickProp(locale, props, "title_accent")}</span>{" "}
                        {pickProp(locale, props, "title_after")}
                    </h1>
                    <p className="mt-6 max-w-2xl text-base leading-relaxed sm:text-lg" style={{ color: "#dfe2e5" }} data-testid="hero-intro">
                        {pickProp(locale, props, "intro")}
                    </p>
                    <div className="mt-8 flex flex-wrap gap-3">
                        <Link
                            to={str(props, "primary_url", "/activity")}
                            className="tnl-btn tnl-btn-tan text-[#111613]"
                            data-testid="hero-primary-cta-button"
                        >
                            {pickProp(locale, props, "primary_label") || t("see_all")}
                            <ArrowRight className="h-4 w-4" aria-hidden="true" />
                        </Link>
                        <Link
                            to={str(props, "secondary_url", "/contact")}
                            className="tnl-btn tnl-btn-ghost-light"
                            data-testid="hero-secondary-cta-button"
                        >
                            {pickProp(locale, props, "secondary_label") || t("join_us")}
                        </Link>
                    </div>
                </div>
                <div className="hidden lg:flex lg:justify-center">
                    {!imgError && str(props, "image_url") ? (
                        <figure className="w-full max-w-md" data-testid="hero-image-figure">
                            <img
                                src={str(props, "image_url")}
                                alt={str(props, "image_alt")}
                                loading="eager"
                                fetchPriority="high"
                                className="h-64 w-full rounded-[28px] border object-cover"
                                style={{ borderColor: "rgba(168,151,123,0.35)" }}
                                data-testid="hero-image"
                                onError={(e) => {
                                    const target = e.currentTarget;
                                    if (!target.dataset.retried) {
                                        target.dataset.retried = "true";
                                        target.src = target.src + (target.src.includes("?") ? "&" : "?") + "retry=" + Date.now();
                                    } else {
                                        setImgError(true);
                                    }
                                }}
                            />
                            {pickProp(locale, props, "image_caption") &&
                            !pickProp(locale, props, "image_caption").toLowerCase().includes("illustrative") &&
                            !pickProp(locale, props, "image_caption").toLowerCase().includes("foto ilustrasi") ? (
                                <figcaption
                                    className="mt-2 text-xs italic text-center"
                                    style={{ color: "#c9ccd1" }}
                                    data-testid="hero-image-caption"
                                >
                                    {pickProp(locale, props, "image_caption")}
                                </figcaption>
                            ) : null}
                        </figure>
                    ) : (
                        <div
                            className="flex h-64 w-64 items-center justify-center rounded-[28px] border text-7xl font-bold shadow-2xl"
                            style={{ borderColor: "rgba(168,151,123,0.35)", background: "rgba(255,255,255,0.04)", color: "var(--tnl-tan)" }}
                            aria-hidden="true"
                        >
                            TNL
                        </div>
                    )}
                </div>
            </div>
        </section>
    );
}

function InnerHeroBlock({ props }: { props: Record<string, unknown> }) {
    const { locale } = useLocale();
    const eyebrow = pickProp(locale, props, "eyebrow");
    return (
        <section className="tnl-hero-gradient" data-testid="block-inner-hero">
            <div className="tnl-container py-14 lg:py-20">
                {eyebrow ? (
                    <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em]" style={{ color: "var(--tnl-tan)" }} data-testid="inner-hero-eyebrow">
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
        <section className="border-y" style={{ background: "#111518", borderColor: "#262c33" }} data-testid="block-stats">
            <div className="tnl-container grid grid-cols-2 gap-8 py-10 lg:grid-cols-4">
                {items.map((item) => (
                    <div key={item.key} className="flex flex-col items-center justify-center text-center" data-testid={`stat-${item.key}`}>
                        <div className="text-[40px] font-bold leading-none lg:text-[56px]" style={{ color: "var(--tnl-tan)" }}>
                            {isError && !data ? "—" : item.value}
                        </div>
                        <div className="mt-2 text-sm text-center" style={{ color: "#c8ccd0" }}>
                            {item.label}
                        </div>
                    </div>
                ))}
            </div>
        </section>
    );
}

// ---------------------------------------------------------------- about + feature tiles
function AboutBlock({ props }: { props: Record<string, unknown> }) {
    const { locale } = useLocale();
    const list = tiles(props, "tiles");
    const aboutIcons = [Target, Server, Radio, Building2];

    return (
        <section className="tnl-section" data-testid="block-about">
            <div className="tnl-container">
                <SectionHeading title={pickProp(locale, props, "heading")} testId="about-heading" />
                <div className="grid items-start gap-10 lg:grid-cols-2">
                    <div className="flex flex-col justify-between space-y-6">
                        <p className="text-base leading-[1.8] text-[var(--tnl-body)] sm:text-lg" data-testid="about-body">
                            {pickProp(locale, props, "body")}
                        </p>
                        <div
                            className="flex flex-col gap-3 rounded-[18px] border p-5 sm:flex-row sm:items-center sm:justify-between"
                            style={{ borderColor: "var(--tnl-border)", background: "var(--tnl-surface)" }}
                        >
                            <div className="flex items-center gap-3">
                                <div
                                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px]"
                                    style={{ background: "color-mix(in srgb, var(--tnl-green) 12%, transparent)" }}
                                    aria-hidden="true"
                                >
                                    <MapPin className="h-5 w-5" style={{ color: "var(--tnl-green)" }} />
                                </div>
                                <div>
                                    <div className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--tnl-tan-text)" }}>
                                        {locale === "id" ? "Lokasi Fasilitas" : "Lab Location"}
                                    </div>
                                    <div className="text-sm font-semibold">Gedung B Lt. 3, Ruang B-301</div>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 border-t pt-2 text-xs font-medium text-[var(--tnl-muted)] sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0">
                                <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: "var(--tnl-green)" }} />
                                <span>{locale === "id" ? "Departemen Teknik Elektro ITS" : "Dept. of Electrical Engineering"}</span>
                            </div>
                        </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-1">
                        {list.map((tile, i) => {
                            const Icon = aboutIcons[i % aboutIcons.length];
                            return (
                                <div
                                    key={tile.name ?? tile.title ?? i}
                                    className="tnl-card tnl-card-hover border-l-4 p-6"
                                    style={{ borderLeftColor: i % 2 === 0 ? "var(--tnl-green)" : "var(--tnl-tan)" }}
                                    data-testid={`about-tile-${i}`}
                                >
                                    <div className="flex items-center gap-3">
                                        <div
                                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px]"
                                            style={{
                                                background:
                                                    i % 2 === 0
                                                        ? "color-mix(in srgb, var(--tnl-green) 12%, transparent)"
                                                        : "color-mix(in srgb, var(--tnl-tan) 15%, transparent)",
                                            }}
                                            aria-hidden="true"
                                        >
                                            <Icon
                                                className="h-5 w-5"
                                                style={{ color: i % 2 === 0 ? "var(--tnl-green)" : "var(--tnl-tan-text)" }}
                                            />
                                        </div>
                                        <h3 className="text-[18px] font-bold">
                                            {pick(locale, tile.title ?? tile.name, tile.title_id ?? tile.name_id)}
                                        </h3>
                                    </div>
                                    <p className="mt-3 text-sm leading-relaxed text-[var(--tnl-body)]">
                                        {pick(locale, tile.description, tile.description_id)}
                                    </p>
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
                            <div key={i} className="tnl-card tnl-card-hover p-6" data-testid={`feature-tile-${i}`}>
                                <Icon className="mb-3 h-6 w-6" style={{ color: "var(--tnl-green)" }} aria-hidden="true" />
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
        <section className="tnl-section" style={{ background: "var(--tnl-surface)" }} data-testid="block-numbered-cards">
            <div className="tnl-container">
                <SectionHeading
                    title={pickProp(locale, props, "heading")}
                    count={cards.length}
                    countLabel={locale === "id" ? "bidang" : "tracks"}
                    testId="numbered-cards-heading"
                />
                <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                    {cards.map((card, i) => (
                        <article
                            key={i}
                            className="tnl-card tnl-card-hover border-l-4 p-6"
                            style={{ borderLeftColor: "var(--tnl-tan)" }}
                            data-testid={`numbered-card-${i}`}
                        >
                            <span className="block text-[34px] font-bold leading-none" style={{ color: "var(--tnl-tan)" }}>
                                {String(i + 1).padStart(2, "0")}
                            </span>
                            <h3 className="mt-3 text-[19px] font-bold">{pick(locale, card.title ?? card.name, card.title_id ?? card.name_id)}</h3>
                            <p className="mt-2 text-sm leading-relaxed text-[var(--tnl-body)]">
                                {pick(locale, card.description, card.description_id)}
                            </p>
                        </article>
                    ))}
                    <Link
                        to={str(props, "see_all_url", "/activity")}
                        className="tnl-hero-gradient tnl-card tnl-card-hover flex flex-col justify-between p-6"
                        data-testid="numbered-cards-see-all-card"
                    >
                        <span className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--tnl-tan)" }}>
                            {t("see_all")}
                        </span>
                        <span className="mt-6 flex items-center gap-2 text-[19px] font-bold text-white" style={{ color: "#ffffff" }}>
                            {pickProp(locale, props, "see_all_label") || t("see_all")}
                            <ArrowRight className="h-5 w-5" aria-hidden="true" />
                        </span>
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
    const go = (delta: number) => setIndex((i) => (i + delta + slides.length) % slides.length);
    const slide = slides[index];
    return (
        <section className="tnl-section" data-testid="block-carousel">
            <div className="tnl-container">
                <div className="flex items-end justify-between gap-4">
                    <SectionHeading title={pickProp(locale, props, "heading")} testId="carousel-heading" />
                    <div className="mb-8 flex shrink-0 gap-2 sm:mb-10">
                        <button
                            type="button"
                            onClick={() => go(-1)}
                            className="flex h-11 w-11 items-center justify-center rounded-full border transition-colors hover:border-[var(--tnl-green)] hover:text-[var(--tnl-green)]"
                            style={{ borderColor: "var(--tnl-border)" }}
                            aria-label="Previous slide"
                            data-testid="carousel-prev-button"
                        >
                            <ChevronLeft className="h-5 w-5" />
                        </button>
                        <button
                            type="button"
                            onClick={() => go(1)}
                            className="flex h-11 w-11 items-center justify-center rounded-full border transition-colors hover:border-[var(--tnl-green)] hover:text-[var(--tnl-green)]"
                            style={{ borderColor: "var(--tnl-border)" }}
                            aria-label="Next slide"
                            data-testid="carousel-next-button"
                        >
                            <ChevronRight className="h-5 w-5" />
                        </button>
                    </div>
                </div>
                <div className="tnl-card overflow-hidden p-0" data-testid="carousel-slide">
                    <div className="grid gap-0 md:grid-cols-[0.4fr_0.6fr]">
                        <div className="tnl-hero-gradient flex items-center justify-center p-10">
                            <span className="text-[64px] font-bold leading-none" style={{ color: "var(--tnl-tan)" }} aria-hidden="true">
                                {String(index + 1).padStart(2, "0")}
                            </span>
                        </div>
                        <div className="p-8 sm:p-10">
                            <h3 className="tnl-h4 text-[22px] sm:text-[25px]">{pick(locale, slide.title ?? slide.name, slide.title_id ?? slide.name_id)}</h3>
                            <p className="mt-3 text-base leading-relaxed text-[var(--tnl-body)]">
                                {pick(locale, slide.description, slide.description_id)}
                            </p>
                        </div>
                    </div>
                </div>
                <div className="mt-5 flex justify-center gap-2" role="tablist" aria-label="Slides">
                    {slides.map((_, i) => (
                        <button
                            key={i}
                            type="button"
                            role="tab"
                            aria-selected={i === index}
                            aria-label={`Go to slide ${i + 1}`}
                            onClick={() => setIndex(i)}
                            className="h-2.5 rounded-full transition-all duration-200"
                            style={{
                                width: i === index ? 28 : 10,
                                background: i === index ? "var(--tnl-green)" : "var(--tnl-border)",
                            }}
                            data-testid={`carousel-dot-${i}`}
                        />
                    ))}
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
                            className="tnl-card tnl-card-hover group flex flex-col p-7"
                            data-testid={`quick-link-card-${i}`}
                        >
                            <h3 className="text-[21px] font-bold">{pick(locale, card.title, card.title_id)}</h3>
                            <p className="mt-2 flex-1 text-sm text-[var(--tnl-body)]">{pick(locale, card.description, card.description_id)}</p>
                            <span
                                className="mt-5 inline-flex items-center gap-2 text-sm font-semibold transition-transform group-hover:translate-x-1"
                                style={{ color: "var(--tnl-green)" }}
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
    const [search, setSearch] = useState("");
    const { data, isLoading } = usePosts({ limit: count, category: category || undefined, q: search || undefined });
    const posts = data?.items ?? [];
    const categories = Array.from(new Set(posts.map((p) => p.category))).filter(Boolean);

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
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder={t("search_news")}
                            className="tnl-field sm:max-w-sm"
                            aria-label={t("search_news")}
                            data-testid="news-search-input"
                        />
                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                onClick={() => setCategory("")}
                                className="rounded-full border px-4 py-2 text-sm font-medium transition-colors"
                                style={
                                    category === ""
                                        ? { background: "var(--tnl-green)", color: "#fff", borderColor: "var(--tnl-green)" }
                                        : { borderColor: "var(--tnl-border)" }
                                }
                                data-testid="news-category-all-button"
                            >
                                {t("all_categories")}
                            </button>
                            {categories.map((c) => (
                                <button
                                    key={c}
                                    type="button"
                                    onClick={() => setCategory(c)}
                                    className="rounded-full border px-4 py-2 text-sm font-medium transition-colors"
                                    style={
                                        category === c
                                            ? { background: "var(--tnl-green)", color: "#fff", borderColor: "var(--tnl-green)" }
                                            : { borderColor: "var(--tnl-border)" }
                                    }
                                    data-testid={`news-category-${c.toLowerCase().replace(/\s+/g, "-")}-button`}
                                >
                                    {c}
                                </button>
                            ))}
                        </div>
                    </div>
                ) : null}

                {!isLoading && posts.length === 0 ? (
                    <EmptyState title={t("coming_soon")} body={t("empty_news")} testId="news-empty-state" />
                ) : (
                    <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                        {posts.map((post) => (
                            <Link
                                key={post.id}
                                to={`/news/${post.slug}`}
                                className="tnl-card tnl-card-hover group flex flex-col overflow-hidden p-0"
                                data-testid={`news-card-${post.slug}`}
                            >
                                {post.cover_url ? (
                                    <img
                                        src={post.cover_url}
                                        alt={post.cover_alt ?? pick(locale, post.title, post.title_id)}
                                        className="h-44 w-full object-cover"
                                        loading="lazy"
                                    />
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
                                        style={{ color: "var(--tnl-green)" }}
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

    return (
        <section className="tnl-section" style={{ background: "var(--tnl-surface)" }} data-testid="block-partners">
            <div className="tnl-container">
                <SectionHeading title={pickProp(locale, props, "heading") || t("partners")} testId="partners-heading" />
                {!isLoading && list.length === 0 ? (
                    <EmptyState title={t("coming_soon")} body={t("coming_soon_body")} testId="partners-empty-state" />
                ) : (
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
                        {list.map((p) => {
                            const category = getCategory(p.name);
                            const content = (
                                <>
                                    <div className="flex h-12 w-full items-center justify-center p-1">
                                        {p.logo_url ? (
                                            <img
                                                src={p.logo_url}
                                                alt={`${p.name} logo`}
                                                className="h-10 max-w-[150px] w-auto object-contain transition-transform duration-200 group-hover:scale-105"
                                                loading="lazy"
                                            />
                                        ) : (
                                            <span className="text-center text-[15px] font-bold tracking-tight">{p.name}</span>
                                        )}
                                    </div>
                                    <span className="mt-2 text-center text-xs font-bold leading-tight line-clamp-1">
                                        {p.name.replace("Institut Teknologi Sepuluh Nopember", "ITS Surabaya")}
                                    </span>
                                    <span
                                        className="mt-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider"
                                        style={{ background: "color-mix(in srgb, var(--tnl-tan) 18%, transparent)", color: "var(--tnl-tan-text)" }}
                                    >
                                        {category}
                                    </span>
                                </>
                            );
                            return p.url ? (
                                <a
                                    key={p.id}
                                    href={p.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="tnl-card tnl-card-hover group flex min-h-[120px] flex-col items-center justify-between p-4 transition-all duration-200"
                                    data-testid={`partner-${p.name.toLowerCase().replace(/\s+/g, "-")}`}
                                >
                                    {content}
                                </a>
                            ) : (
                                <div
                                    key={p.id}
                                    className="tnl-card group flex min-h-[120px] flex-col items-center justify-between p-4"
                                    data-testid={`partner-${p.name.toLowerCase().replace(/\s+/g, "-")}`}
                                >
                                    {content}
                                </div>
                            );
                        })}
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
                            <Icon className="h-5 w-5" style={{ color: "var(--tnl-green)" }} />
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
                    <MapPin className="h-8 w-8" style={{ color: "var(--tnl-green)" }} aria-hidden="true" />
                    <span className="text-[17px] font-bold">{label}</span>
                    <span className="text-sm" style={{ color: "var(--tnl-green)" }}>
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
                <div className="tnl-prose max-w-3xl" dangerouslySetInnerHTML={{ __html: html }} />
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
    const { locale } = useLocale();
    const images = Array.isArray(props.images) ? (props.images as { url: string; alt: string; caption?: string; caption_id?: string }[]) : [];
    const [lightbox, setLightbox] = useState<number | null>(null);
    if (!images.length) return null;

    const gridCols =
        images.length === 4
            ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-2"
            : images.length % 3 === 0
              ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
              : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-2";

    return (
        <section className="tnl-section" data-testid="block-gallery">
            <div className="tnl-container">
                {pickProp(locale, props, "heading") ? (
                    <SectionHeading title={pickProp(locale, props, "heading")} testId="gallery-heading" />
                ) : null}
                <div className={`grid gap-5 ${gridCols}`}>
                    {images.map((img, i) => {
                        const label = pick(locale, img.caption || img.alt, img.caption_id || img.alt);
                        return (
                            <button
                                key={i}
                                type="button"
                                onClick={() => setLightbox(i)}
                                className="group relative overflow-hidden rounded-[18px] border bg-[#141C17] transition-all duration-300 hover:-translate-y-1 hover:shadow-xl text-left"
                                style={{ borderColor: "var(--tnl-border)" }}
                                data-testid={`gallery-item-${i}`}
                            >
                                <img
                                    src={img.url}
                                    alt={label}
                                    className="h-64 w-full object-cover transition-transform duration-500 group-hover:scale-105 sm:h-72"
                                    loading="lazy"
                                    onError={(e) => {
                                        const target = e.currentTarget;
                                        if (!target.dataset.retried) {
                                            target.dataset.retried = "true";
                                            target.src = target.src + (target.src.includes("?") ? "&" : "?") + "retry=" + Date.now();
                                        } else {
                                            target.style.display = "none";
                                        }
                                    }}
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-80 transition-opacity group-hover:opacity-95" />
                                
                                {/* Clean Pill Badge on Bottom Left */}
                                <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between gap-2">
                                    <span className="inline-flex items-center rounded-full bg-black/60 px-3 py-1.5 text-xs font-bold tracking-wide text-white backdrop-blur-md border border-white/20 shadow-sm">
                                        {label}
                                    </span>
                                    <span className="text-[11px] font-medium text-white/70 opacity-0 transition-opacity group-hover:opacity-100 hidden sm:inline-block">
                                        {locale === "id" ? "Klik perbesar" : "Click to view"}
                                    </span>
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>
            {lightbox !== null ? (
                <div
                    className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/90 p-4"
                    role="dialog"
                    aria-modal="true"
                    onClick={() => setLightbox(null)}
                    data-testid="gallery-lightbox"
                >
                    <img
                        src={images[lightbox].url}
                        alt={pick(locale, images[lightbox].caption || images[lightbox].alt, images[lightbox].caption_id || images[lightbox].alt)}
                        className="max-h-[80vh] max-w-full rounded-[15px] object-contain shadow-2xl"
                    />
                    <div className="mt-4 flex items-center gap-2 rounded-full bg-black/60 px-4 py-2 text-sm text-white border border-white/20 backdrop-blur-md">
                        {pick(locale, images[lightbox].caption || images[lightbox].alt, images[lightbox].caption_id || images[lightbox].alt)}
                    </div>
                </div>
            ) : null}
        </section>
    );
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
        <section className="tnl-section" data-testid="block-timeline">
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
        <section className="tnl-section" data-testid="block-accordion">
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
                                {open === i ? <Minus className="h-5 w-5 shrink-0" style={{ color: "var(--tnl-green)" }} /> : <Plus className="h-5 w-5 shrink-0" style={{ color: "var(--tnl-green)" }} />}
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
        <section className="tnl-section" data-testid="block-download-list">
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
                                <Download className="h-5 w-5 shrink-0" style={{ color: "var(--tnl-green)" }} aria-hidden="true" />
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
