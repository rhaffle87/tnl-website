// Block-driven public pages. Each reads its page record from the CMS and renders
// the authored blocks; static chrome renders even when the fetch fails.

import { Link, useSearchParams } from "react-router-dom";
import { ApiError } from "@/lib/api/api";
import { usePage, usePagePreview } from "@/lib/api/hooks";
import { useLocale } from "@/lib/i18n/i18n";
import { BlockRenderer } from "@/components/site/Blocks";
import { EmptyState, Spinner } from "@/components/site/Primitives";
import { PublicRequestError } from "@/components/site/PublicRequestError";

export function CmsPage({ slug, testId, missing = "coming-soon" }: {
    slug: string;
    testId: string;
    missing?: "coming-soon" | "not-found";
}) {
    const { locale, t } = useLocale();
    const [searchParams] = useSearchParams();
    const previewId = searchParams.get("preview") || undefined;
    const preview = Boolean(previewId);
    const publicPage = usePage(slug, { enabled: !preview });
    const previewPage = usePagePreview(slug, previewId);
    const query = preview ? previewPage : publicPage;
    const { data: page, isLoading, isError, error, isFetching, refetch } = query;

    if (isLoading && !page) {
        return (
            <div className="tnl-container tnl-section" data-testid={`${testId}-loading`}>
                <Spinner label={t("loading")} />
            </div>
        );
    }

    if (isError && !page) {
        if (preview && error instanceof ApiError && [401, 403].includes(error.status)) {
            return (
                <div className="tnl-container tnl-section" data-testid={`${testId}-preview-login`}>
                    <EmptyState
                        title={locale === "id" ? "Masuk untuk melihat pratinjau" : "Sign in to preview this page"}
                        body={locale === "id" ? "Pratinjau hanya tersedia bagi pengguna Studio yang berwenang." : "Preview is available only to authorized Studio users."}
                        testId={`${testId}-preview-login-state`}
                    />
                    <div className="mt-5 text-center">
                        <Link to="/admin/login" className="tnl-btn tnl-btn-primary" data-testid={`${testId}-preview-login-link`}>
                            {locale === "id" ? "Masuk ke Studio" : "Sign in to Studio"}
                        </Link>
                    </div>
                </div>
            );
        }

        const missingPage = error instanceof ApiError && error.status === 404;
        if (missingPage && !preview && missing === "not-found") {
            return (
                <div className="tnl-container tnl-section" data-testid={`${testId}-empty`}>
                    <EmptyState title={t("not_found_title")} body={t("not_found_body")} testId={`${testId}-empty-state`} />
                </div>
            );
        }
        if (missingPage && !preview) {
            return (
                <div className="tnl-container tnl-section" data-testid={`${testId}-empty`}>
                    <EmptyState title={t("coming_soon")} body={t("coming_soon_body")} testId={`${testId}-empty-state`} />
                </div>
            );
        }

        return (
            <div className="tnl-container tnl-section" data-testid={`${testId}-error`}>
                <PublicRequestError onRetry={() => void refetch()} retrying={isFetching} locale={locale} testId={`${testId}-request-error`} />
            </div>
        );
    }

    if (!page) {
        return (
            <div className="tnl-container tnl-section" data-testid={`${testId}-empty`}>
                <EmptyState title={t("coming_soon")} body={t("coming_soon_body")} testId={`${testId}-empty-state`} />
            </div>
        );
    }

    return (
        <div data-testid={testId}>
            {preview ? (
                <div className="tnl-container pt-4" data-testid={`${testId}-preview-banner`}>
                    <p role="status" className="rounded-lg border border-[var(--tnl-border)] bg-[var(--tnl-surface)] px-4 py-3 text-sm text-[var(--tnl-body)]">
                        {locale === "id" ? "Pratinjau Studio. Perubahan ini belum dipublikasikan." : "Studio preview. These changes are not published."}
                    </p>
                </div>
            ) : null}
            {isError ? (
                <div className="tnl-container pt-4">
                    <PublicRequestError onRetry={() => void refetch()} retrying={isFetching} locale={locale} testId={`${testId}-request-error`} stale />
                </div>
            ) : null}
            <BlockRenderer blocks={page.blocks ?? []} />
        </div>
    );
}

export default function Home() {
    return <CmsPage slug="home" testId="home-page" />;
}
