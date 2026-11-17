// Utility public pages: legal pages (CMS-driven), certificate verification, 404.

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { BadgeCheck, Download, ShieldAlert } from "lucide-react";
import { apiGet } from "@/lib/api";
import { useLocale } from "@/lib/i18n";
import { EmptyState, Spinner } from "@/components/site/Primitives";
import { CmsPage } from "@/pages/Home";

export function TermsPage() {
    return <CmsPage slug="terms" testId="terms-page" />;
}

export function PrivacyPage() {
    return <CmsPage slug="privacy" testId="privacy-page" />;
}

/** Any page the admin creates renders here via its slug. */
export function DynamicCmsPage() {
    const { slug } = useParams<{ slug: string }>();
    return <CmsPage slug={slug ?? ""} testId={`cms-page-${slug ?? "unknown"}`} />;
}

interface VerifyResponse {
    valid: boolean;
    name?: string;
    event_title?: string;
    event_date?: string;
    status?: string;
    code?: string;
    issued_at?: string;
    message: string;
}

export function VerifyPage() {
    const { code } = useParams<{ code: string }>();
    const { t } = useLocale();
    const [data, setData] = useState<VerifyResponse | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        apiGet<VerifyResponse>(`/verify/${code}`)
            .then((res) => {
                if (!cancelled) setData(res);
            })
            .catch(() => {
                if (!cancelled) setData({ valid: false, message: t("certificate_invalid") });
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [code, t]);

    return (
        <div data-testid="verify-page">
            <section className="tnl-hero-gradient">
                <div className="tnl-container py-14">
                    <h1 className="tnl-hero-title font-bold" style={{ color: "#ffffff" }}>
                        {t("verify_certificate")}
                    </h1>
                </div>
            </section>
            <section className="tnl-section" style={{ background: "var(--tnl-surface)" }}>
                <div className="tnl-container max-w-xl">
                    {loading ? (
                        <Spinner label={t("loading")} />
                    ) : data?.valid ? (
                        <div className="tnl-card p-8 text-center" data-testid="verify-valid">
                            <BadgeCheck className="mx-auto h-12 w-12" style={{ color: "var(--tnl-green)" }} aria-hidden="true" />
                            <h2 className="tnl-h5 mt-4 text-[20px]">{t("certificate_valid")}</h2>
                            <p className="mt-4 text-xl font-bold" style={{ color: "var(--tnl-green)" }}>{data.name}</p>
                            <p className="mt-1 text-sm font-medium text-[var(--tnl-body)]">{data.event_title}</p>
                            {data.event_date && (
                                <p className="mt-1 text-xs" style={{ color: "var(--tnl-tan-text)" }}>
                                    Date: {data.event_date}
                                </p>
                            )}
                            <div className="my-4 border-t border-dashed" style={{ borderColor: "var(--tnl-border)" }} />
                            <p className="font-mono text-xs font-semibold tracking-wider" style={{ color: "var(--tnl-tan)" }}>
                                {data.code}
                            </p>
                            <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
                                <a
                                    href={`/api/certificates/${data.code}/pdf`}
                                    download
                                    className="tnl-btn tnl-btn-primary inline-flex items-center gap-2"
                                    data-testid="download-certificate-btn"
                                >
                                    <Download className="h-4 w-4" aria-hidden="true" />
                                    Download PDF Certificate
                                </a>
                            </div>
                        </div>
                    ) : (
                        <div className="tnl-card p-8 text-center" data-testid="verify-invalid">
                            <ShieldAlert className="mx-auto h-12 w-12" style={{ color: "var(--tnl-tan-text)" }} aria-hidden="true" />
                            <h2 className="tnl-h5 mt-4 text-[20px]">{t("certificate_invalid")}</h2>
                            <p className="mt-2 text-sm text-[var(--tnl-body)]">{data?.message}</p>
                        </div>
                    )}
                </div>
            </section>
        </div>
    );
}

export function NotFoundPage() {
    const { t } = useLocale();
    return (
        <div className="tnl-container tnl-section" data-testid="not-found-page">
            <EmptyState title={t("not_found_title")} body={t("not_found_body")} testId="not-found-empty-state" />
            <div className="mt-6 text-center">
                <Link to="/" className="tnl-btn tnl-btn-primary" data-testid="not-found-home-button">
                    {t("back_home")}
                </Link>
            </div>
        </div>
    );
}
