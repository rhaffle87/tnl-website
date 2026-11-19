// Utility public pages: legal pages (CMS-driven), certificate verification, 404.

import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { BadgeCheck, Download, QrCode, RotateCcw, Search, ShieldAlert, ShieldCheck } from "lucide-react";
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
    const navigate = useNavigate();
    const { locale, t } = useLocale();
    const [inputCode, setInputCode] = useState(code || "");
    const [data, setData] = useState<VerifyResponse | null>(null);
    const [loading, setLoading] = useState(Boolean(code));
    const [searched, setSearched] = useState(Boolean(code));

    const runVerification = (targetCode: string) => {
        const clean = targetCode.trim();
        if (!clean) return;
        setLoading(true);
        setSearched(true);
        apiGet<VerifyResponse>(`/verify/${encodeURIComponent(clean)}`)
            .then((res) => {
                setData(res);
            })
            .catch(() => {
                setData({
                    valid: false,
                    message: locale === "id"
                        ? "Sertifikat dengan kode tersebut tidak ditemukan dalam sistem validasi resmi Lab TNL ITS."
                        : "No valid certificate matched this verification code in the official TNL ITS records.",
                });
            })
            .finally(() => {
                setLoading(false);
            });
    };

    useEffect(() => {
        if (code) {
            setInputCode(code);
            runVerification(code);
        } else {
            setData(null);
            setLoading(false);
            setSearched(false);
        }
    }, [code]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const clean = inputCode.trim();
        if (!clean) return;
        navigate(`/verify/${encodeURIComponent(clean)}`);
    };

    const handleReset = () => {
        setInputCode("");
        setData(null);
        setSearched(false);
        navigate("/verify");
    };

    return (
        <div data-testid="verify-page">
            <section className="tnl-hero-gradient">
                <div className="tnl-container py-14 lg:py-16 text-center">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold tracking-wider uppercase bg-white/10 text-[var(--tnl-tan,#C4B393)] border border-white/15 mb-3">
                        <ShieldCheck className="h-3.5 w-3.5" />
                        {locale === "id" ? "Portal Verifikasi Resmi" : "Official Verification Portal"}
                    </span>
                    <h1 className="tnl-hero-title font-bold text-[28px] sm:text-[36px] text-white">
                        {locale === "id" ? "Verifikasi e-Sertifikat Lab TNL" : "TNL Lab e-Certificate Verification"}
                    </h1>
                    <p className="mt-3 text-sm sm:text-base text-gray-200 max-w-2xl mx-auto">
                        {locale === "id"
                            ? "Sistem validasi keaslian sertifikat kegiatan, pelatihan, dan praktikum resmi dari Laboratorium Jaringan Telekomunikasi ITS."
                            : "Authenticity validation system for official activity, training, and practicum certificates issued by Telecommunication Network Laboratory ITS."}
                    </p>
                </div>
            </section>

            <section className="tnl-section" style={{ background: "var(--tnl-surface)" }}>
                <div className="tnl-container max-w-xl">
                    {/* Search Form Card */}
                    <div className="tnl-card p-6 sm:p-8 mb-6 shadow-sm">
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-2">
                                    {locale === "id" ? "Masukkan Kode Sertifikat / Hasil Scan QR" : "Enter Certificate Code / QR Scan"}
                                </label>
                                <div className="relative">
                                    <input
                                        type="text"
                                        value={inputCode}
                                        onChange={(e) => setInputCode(e.target.value)}
                                        placeholder="cth: TNL-2026-A1B2C3D4"
                                        className="tnl-field pr-10 font-mono text-sm uppercase"
                                        aria-label="Certificate Code"
                                        data-testid="verify-input-code"
                                    />
                                    <QrCode className="absolute right-3 top-3 h-5 w-5 text-gray-400 pointer-events-none" />
                                </div>
                                <p className="mt-1.5 text-[11px] text-gray-500">
                                    {locale === "id"
                                        ? "Kode tertera di bagian bawah lembar sertifikat fisik/PDF atau di URL hasil pemindaian QR code."
                                        : "The code is printed at the bottom of the certificate or inside the scanned QR code URL."}
                                </p>
                            </div>

                            <button
                                type="submit"
                                disabled={!inputCode.trim() || loading}
                                className="tnl-btn tnl-btn-primary w-full h-11 min-h-[44px] text-sm font-semibold flex items-center justify-center gap-2"
                                data-testid="verify-submit-button"
                            >
                                <Search className="h-4 w-4" />
                                {loading
                                    ? (locale === "id" ? "Memeriksa Validitas..." : "Verifying...")
                                    : (locale === "id" ? "Verifikasi Sekarang" : "Verify Certificate")}
                            </button>
                        </form>
                    </div>

                    {/* Result Card */}
                    {loading ? (
                        <div className="py-8">
                            <Spinner label={t("loading")} />
                        </div>
                    ) : searched && data ? (
                        data.valid ? (
                            <div className="tnl-card p-8 text-center animate-fade-in shadow-md border-emerald-500/20" data-testid="verify-valid">
                                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-black/10 dark:border-white/10 bg-[#111613] p-2.5 shadow-md">
                                    <img
                                        src="/assets/brand/tnl-logo-white.png"
                                        alt="Logo Laboratorium Jaringan Telekomunikasi ITS"
                                        className="h-full w-full object-contain"
                                    />
                                </div>
                                <div className="inline-flex items-center gap-1.5 rounded-full bg-[#5D8A6B]/15 px-3 py-1 text-xs font-semibold text-[#2E583A] dark:text-[#8AB597]">
                                    <BadgeCheck className="h-4 w-4" aria-hidden="true" />
                                    <span>{t("certificate_valid")}</span>
                                </div>
                                <p className="mt-4 text-xl font-bold" style={{ color: "var(--tnl-green)" }}>{data.name}</p>
                                <p className="mt-1 text-sm font-medium text-[var(--tnl-body)]">{data.event_title}</p>
                                {data.event_date && (
                                    <p className="mt-1 text-xs" style={{ color: "var(--tnl-tan-text)" }}>
                                        {locale === "id" ? "Tanggal Kegiatan:" : "Event Date:"} {data.event_date}
                                    </p>
                                )}
                                <div className="my-4 border-t border-dashed" style={{ borderColor: "var(--tnl-border)" }} />
                                <p className="font-mono text-xs font-semibold tracking-wider text-[var(--tnl-tan)]">
                                    {data.code}
                                </p>
                                <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
                                    <a
                                        href={`/api/certificates/${data.code}/pdf`}
                                        download
                                        className="tnl-btn tnl-btn-primary inline-flex items-center gap-2 h-11 min-h-[44px]"
                                        data-testid="download-certificate-btn"
                                    >
                                        <Download className="h-4 w-4" aria-hidden="true" />
                                        {locale === "id" ? "Unduh PDF Resmi" : "Download PDF Certificate"}
                                    </a>
                                    <button
                                        type="button"
                                        onClick={handleReset}
                                        className="tnl-btn tnl-btn-outline inline-flex items-center gap-1.5 h-11 min-h-[44px] text-xs font-medium"
                                    >
                                        <RotateCcw className="h-3.5 w-3.5" />
                                        {locale === "id" ? "Verifikasi Sertifikat Lain" : "Check Another Code"}
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="tnl-card p-8 text-center animate-fade-in shadow-md border-red-500/20" data-testid="verify-invalid">
                                <ShieldAlert className="mx-auto h-12 w-12 text-red-500" aria-hidden="true" />
                                <h2 className="tnl-h5 mt-4 text-[20px] text-red-600 dark:text-red-400">
                                    {t("certificate_invalid")}
                                </h2>
                                <p className="mt-2 text-sm text-[var(--tnl-body)]">{data.message}</p>
                                <div className="mt-6">
                                    <button
                                        type="button"
                                        onClick={handleReset}
                                        className="tnl-btn tnl-btn-outline inline-flex items-center gap-1.5 text-xs font-medium"
                                    >
                                        <RotateCcw className="h-3.5 w-3.5" />
                                        {locale === "id" ? "Coba Kode Lain" : "Try Another Code"}
                                    </button>
                                </div>
                            </div>
                        )
                    ) : null}
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
