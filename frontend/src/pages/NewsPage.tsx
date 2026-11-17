// News index and article pages.

import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { usePost } from "@/lib/hooks";
import { pick, useLocale } from "@/lib/i18n";
import { Breadcrumb, EmptyState, Spinner, formatDate } from "@/components/site/Primitives";
import { CmsPage } from "@/pages/Home";

export default function NewsPage() {
    return <CmsPage slug="news" testId="news-page" />;
}

export function NewsArticlePage() {
    const { slug } = useParams<{ slug: string }>();
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

    return (
        <article data-testid="news-article-page">
            <header className="tnl-hero-gradient">
                <div className="tnl-container py-14 lg:py-20">
                    <Breadcrumb items={[{ label: t("nav_home"), to: "/" }, { label: t("nav_news"), to: "/news" }, { label: title }]} />
                    <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em]" style={{ color: "var(--tnl-tan)" }}>
                        {post.category}
                    </p>
                    <h1 className="tnl-hero-title font-bold" style={{ color: "#ffffff" }} data-testid="article-title">
                        {title}
                    </h1>
                    <p className="mt-4 text-sm" style={{ color: "#dfe2e5" }} data-testid="article-date">
                        {t("published_on")} {formatDate(post.published_at, locale)}
                        {post.author ? ` · ${post.author}` : ""}
                    </p>
                </div>
            </header>

            <div className="tnl-section" style={{ background: "var(--tnl-surface)" }}>
                <div className="tnl-container">
                    {post.cover_url ? (
                        <img
                            src={post.cover_url}
                            alt={post.cover_alt || title}
                            className="mb-8 w-full rounded-[15px] object-cover"
                            style={{ maxHeight: 440 }}
                        />
                    ) : null}
                    <div className="tnl-card p-7 sm:p-10">
                        {/* Sanitized server-side before storage. */}
                        <div className="tnl-prose max-w-none" dangerouslySetInnerHTML={{ __html: body }} data-testid="article-body" />
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
                        <div className="mt-10">
                            <h2 className="tnl-h4 mb-5 text-[22px]">{t("related_news")}</h2>
                            <div className="grid gap-5 md:grid-cols-3">
                                {post.related.map((rel) => (
                                    <Link
                                        key={rel.id}
                                        to={`/news/${rel.slug}`}
                                        className="tnl-card tnl-card-hover p-6"
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
                        <Link to="/news" className="tnl-btn tnl-btn-outline" data-testid="article-back-link">
                            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                            {t("back_to_news")}
                        </Link>
                    </div>
                </div>
            </div>
        </article>
    );
}
