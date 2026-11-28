// News index and article pages.

import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { ArrowLeft, Copy, X } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api/api";
import { usePost } from "@/lib/api/hooks";
import { pick, useLocale } from "@/lib/i18n/i18n";
import { localizeCategory } from "@/lib/i18n/categoryLabels";
import { Breadcrumb, EmptyState, formatDate } from "@/components/site/Primitives";
import { PublicRequestError } from "@/components/site/PublicRequestError";
import { CmsPage } from "@/pages/Home";
import "./editorial-content.css";

export default function NewsPage() {
    return <div className="editorial-content editorial-news-index"><CmsPage slug="news" testId="news-page" /></div>;
}

export function NewsArticlePage() {
    const { slug } = useParams<{ slug: string }>();
    const location = useLocation();
    const { locale, t } = useLocale();
    const { data: post, isLoading, isError, isFetching, error, refetch } = usePost(slug);
    const [activeLightboxImage, setActiveLightboxImage] = useState<string | null>(null);
    const bodyRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!activeLightboxImage) return;
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setActiveLightboxImage(null);
        };
        window.addEventListener("keydown", handleKey);
        return () => window.removeEventListener("keydown", handleKey);
    }, [activeLightboxImage]);

    // Sanitized article HTML is injected as markup; enhance inline images after mount.
    useEffect(() => {
        const container = bodyRef.current;
        if (!container) return;
        const images = Array.from(container.querySelectorAll("img"));
        images.forEach((image) => {
            image.setAttribute("role", "button");
            image.tabIndex = 0;
            if (!image.hasAttribute("width") && !image.hasAttribute("height")) {
                image.style.aspectRatio = "16 / 9";
            }
        });
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            const target = event.target;
            if (!(target instanceof HTMLImageElement) || target.getAttribute("role") !== "button") return;
            event.preventDefault();
            setActiveLightboxImage(target.currentSrc || target.src);
        };
        container.addEventListener("keydown", handleKeyDown);
        return () => container.removeEventListener("keydown", handleKeyDown);
    }, [post?.body, post?.body_id, locale, activeLightboxImage]);

    if (isLoading && !post) {
        return (
            <div className="tnl-container tnl-section animate-pulse space-y-6" data-testid="article-loading-skeleton">
                <div className="h-4 w-32 bg-black/10 dark:bg-white/10 rounded" />
                <div className="h-10 w-3/4 bg-black/10 dark:bg-white/10 rounded" />
                <div className="h-4 w-48 bg-black/5 dark:bg-white/5 rounded" />
                <div className="h-64 w-full bg-black/5 dark:bg-white/5 rounded-xl" />
                <div className="space-y-3 pt-4">
                    <div className="h-4 w-full bg-black/5 dark:bg-white/5 rounded" />
                    <div className="h-4 w-full bg-black/5 dark:bg-white/5 rounded" />
                    <div className="h-4 w-2/3 bg-black/5 dark:bg-white/5 rounded" />
                </div>
            </div>
        );
    }

    if (isError && !post && !(error instanceof ApiError && error.status === 404)) {
        return (
            <div className="tnl-container tnl-section" data-testid="article-request-error">
                <PublicRequestError onRetry={() => void refetch()} retrying={isFetching} locale={locale} testId="article-request-failure" />
                <div className="mt-6">
                    <Link to="/news" className="tnl-btn tnl-btn-outline" data-testid="article-back-button">
                        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                        {t("back_to_news")}
                    </Link>
                </div>
            </div>
        );
    }

    if (!post) {
        return (
            <div className="tnl-container tnl-section" data-testid="article-not-found">
                <EmptyState {...({ as: "h1" } as { as?: "h1" })} title={t("not_found_title")} body={t("not_found_body")} testId="article-empty-state" />
                <div className="mt-6">
                    <Link to="/news" className="tnl-btn tnl-btn-outline" data-testid="article-back-button">
                        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                        {t("back_to_news")}
                    </Link>
                </div>
            </div>
        );
    }

    const title = pick(locale, post.title, post.title_id);
    const body = locale === "id" ? post.body_id || post.body : post.body || post.body_id;

    const copyLink = async () => {
        try {
            const canonical = `${window.location.origin}${location.pathname}`;
            await navigator.clipboard.writeText(canonical);
            toast.success(locale === "id" ? "Tautan artikel disalin." : "Article link copied.");
        } catch {
            toast.error(locale === "id" ? "Gagal menyalin tautan." : "Failed to copy link.");
        }
    };

    return (
        <article className="editorial-content editorial-article" data-testid="news-article-page">
            {isError ? (
                <div className="tnl-container pt-4">
                    <PublicRequestError onRetry={() => void refetch()} retrying={isFetching} locale={locale} testId="article-request-failure" stale />
                </div>
            ) : null}
            <header className="editorial-masthead">
                <div className="tnl-container py-14 lg:py-20">
                    <Breadcrumb items={[{ label: t("nav_home"), to: "/" }, { label: t("nav_news"), to: "/news" }, { label: title }]} />
                    <p className="editorial-eyebrow">
                        {localizeCategory(post.category, locale)}
                    </p>
                    <h1 className="editorial-article-title" data-testid="article-title">
                        {title}
                    </h1>
                    <p className="mt-4 editorial-meta" data-testid="article-date">
                        {t("published_on")} <time dateTime={post.published_at || undefined}>{formatDate(post.published_at, locale)}</time>
                        {post.author ? ` · ${post.author}` : ""}
                    </p>
                    <button
                        type="button"
                        onClick={copyLink}
                        className="mt-3 inline-flex min-h-[44px] items-center gap-2 text-sm font-semibold hover:underline underline-offset-4"
                        style={{ color: "var(--tnl-link)" }}
                        data-testid="article-copy-link-button"
                    >
                        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                        {locale === "id" ? "Salin tautan" : "Copy link"}
                    </button>
                </div>
            </header>

            <div className="tnl-section" style={{ background: "var(--background)" }}>
                <div className="tnl-container editorial-reading-column">
                    {post.cover_url ? (
                        <button
                            type="button"
                            aria-label={locale === "id" ? "Perbesar gambar sampul artikel" : "Zoom article cover image"}
                            className="editorial-article-cover mb-8 block w-full cursor-zoom-in overflow-hidden rounded-xl border border-[var(--tnl-border)] text-left"
                            style={{ maxHeight: 440 }}
                            onClick={() => setActiveLightboxImage(post.cover_url!)}
                            data-testid="article-cover-zoom"
                        >
                            <img
                                src={post.cover_url}
                                alt={post.cover_alt || title}
                                width="1600"
                                height="900"
                                className="w-full object-cover"
                                style={{
                                    maxHeight: 440,
                                    aspectRatio: "16 / 9",
                                    viewTransitionName: `news-cover-${(post.slug || post.id || "post").replace(/[^a-zA-Z0-9_-]/g, "-")}`,
                                }}
                            />
                        </button>
                    ) : null}
                    <div
                        ref={bodyRef}
                        className="editorial-article-body"
                        onClick={(e) => {
                            const target = e.target as HTMLElement;
                            if (target.tagName === "IMG") {
                                setActiveLightboxImage((target as HTMLImageElement).src);
                            }
                        }}
                    >
                        {/* Sanitized server-side before storage. */}
                        <div className="tnl-prose editorial-prose max-w-none" dangerouslySetInnerHTML={{ __html: body }} data-testid="article-body" />
                        {post.tags?.length ? (
                            <div className="mt-8 flex flex-wrap gap-2 border-t pt-6" style={{ borderColor: "var(--tnl-border)" }}>
                                {post.tags.map((tag) => (
                                    <span key={tag} className="tnl-count-chip" data-testid={`article-tag-${tag}`}>
                                        #{tag}
                                    </span>
                                ))}
                            </div>
                        ) : null}
                    </div>

                    {post.related?.length ? (
                        <div className="editorial-related mt-10">
                            <h2 className="mb-5 text-[22px]">{t("related_news")}</h2>
                            <div>
                                {post.related.map((rel) => (
                                    <Link
                                        key={rel.id}
                                        to={`/news/${rel.slug}`}
                                        viewTransition
                                        className="editorial-related-link"
                                        data-testid={`related-article-${rel.slug}`}
                                    >
                                        <span className="tnl-count-chip">{localizeCategory(rel.category, locale)}</span>
                                        <h3 className="mt-3 text-[17px] font-bold leading-snug">{pick(locale, rel.title, rel.title_id)}</h3>
                                    </Link>
                                ))}
                            </div>
                        </div>
                    ) : null}

                    <div className="mt-10">
                        <Link to="/news" viewTransition className="tnl-btn tnl-btn-outline" data-testid="article-back-link">
                            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                            {t("back_to_news")}
                        </Link>
                    </div>
                </div>
            </div>

            {activeLightboxImage ? (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in-0"
                    onClick={() => setActiveLightboxImage(null)}
                    data-testid="article-lightbox"
                >
                    <button
                        type="button"
                        className="absolute top-4 right-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20 transition-colors"
                        onClick={() => setActiveLightboxImage(null)}
                        aria-label="Close lightbox"
                        data-testid="article-lightbox-close"
                    >
                        <X className="h-6 w-6" />
                    </button>
                    <img
                        src={activeLightboxImage}
                        alt="Enlarged view"
                        className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                        data-testid="article-lightbox-img"
                    />
                </div>
            ) : null}
        </article>
    );
}
