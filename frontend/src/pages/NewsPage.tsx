// News index and article pages.

import { Link, useLocation, useParams } from "react-router-dom";
import { ArrowLeft, Copy } from "lucide-react";
import { toast } from "sonner";
import { usePost } from "@/lib/hooks";
import { pick, useLocale } from "@/lib/i18n";
import { Breadcrumb, EmptyState, Spinner, formatDate } from "@/components/site/Primitives";
import { CmsPage } from "@/pages/Home";
import "./editorial-content.css";

export default function NewsPage() {
    return <div className="editorial-content editorial-news-index"><CmsPage slug="news" testId="news-page" /></div>;
}

export function NewsArticlePage() {
    const { slug } = useParams<{ slug: string }>();
    const location = useLocation();
    const { locale, t } = useLocale();
    const { data: post, isLoading, isError } = usePost(slug);

    if (isLoading) {
        return (
            <div className="tnl-container tnl-section">
                <Spinner label={t("loading")} />
            </div>
        );
    }

    if (isError || !post) {
        return (
            <div className="tnl-container tnl-section" data-testid="article-not-found">
                <EmptyState title={t("not_found_title")} body={t("not_found_body")} testId="article-empty-state" />
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
            <header className="editorial-masthead">
                <div className="tnl-container py-14 lg:py-20">
                    <Breadcrumb items={[{ label: t("nav_home"), to: "/" }, { label: t("nav_news"), to: "/news" }, { label: title }]} />
                    <p className="editorial-eyebrow">
                        {post.category}
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
                        className="mt-3 inline-flex items-center gap-2 text-sm font-semibold"
                        style={{ color: "var(--tnl-link)" }}
                        data-testid="article-copy-link-button"
                    >
                        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                        {locale === "id" ? "Salin tautan" : "Copy link"}
                    </button>
                </div>
            </header>

            <div className="tnl-section" style={{ background: "var(--tnl-surface)" }}>
                <div className="tnl-container editorial-reading-column">
                    {post.cover_url ? (
                        <div className="editorial-article-cover mb-8 w-full overflow-hidden" style={{ maxHeight: 440 }}>
                            <img
                                src={post.cover_url}
                                alt={post.cover_alt || title}
                                className="w-full object-cover"
                                style={{
                                    maxHeight: 440,
                                    viewTransitionName: `news-cover-${(post.slug || post.id || "post").replace(/[^a-zA-Z0-9_-]/g, "-")}`,
                                }}
                            />
                        </div>
                    ) : null}
                    <div className="editorial-article-body">
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
                                        <span className="tnl-count-chip">{rel.category}</span>
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
        </article>
    );
}
