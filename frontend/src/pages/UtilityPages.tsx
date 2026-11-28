// Utility public pages: legal pages (CMS-driven), certificate verification, 404.

import { useCallback, useEffect, useState } from "react";
import "./utility-editorial.css";
import { Link, useNavigate, useParams } from "react-router-dom";
import { BadgeCheck, Download, QrCode, RotateCcw, Search, ShieldAlert, ShieldCheck } from "lucide-react";
import { apiGet, apiUrl } from "@/lib/api/api";
import { useLocale } from "@/lib/i18n/i18n";
import { Spinner } from "@/components/site/Primitives";
import { TnlLogo } from "@/components/site/TnlLogo";
import { CmsPage } from "@/pages/Home";
export { TermsPage, PrivacyPage } from "@/pages/LegalPages";

/** Any page the admin creates renders here via its slug. */
export function DynamicCmsPage() {
    const { slug } = useParams<{ slug: string }>();
    return <CmsPage slug={slug ?? ""} testId={`cms-page-${slug ?? "unknown"}`} missing="not-found" />;
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

    const runVerification = useCallback((targetCode: string) => {
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
    }, [locale]);

    useEffect(() => {
        if (code) {
            setInputCode(code);
            runVerification(code);
        } else {
            setData(null);
            setLoading(false);
            setSearched(false);
        }
    }, [code, runVerification]);

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
        <div className="utility-editorial verify-editorial" data-testid="verify-page">
            <section className="utility-masthead">
                <div className="tnl-container">
                    <span className="utility-kicker inline-flex items-center gap-2 mb-5">
                        <ShieldCheck className="h-3.5 w-3.5" />
                        {locale === "id" ? "Portal Verifikasi Resmi" : "Official Verification Portal"}
                    </span>
                    <h1 className="utility-title">
                        {locale === "id" ? "Verifikasi e-Sertifikat Lab TNL" : "TNL Lab e-Certificate Verification"}
                    </h1>
                    <p className="verify-intro">
                        {locale === "id"
                            ? "Sistem validasi keaslian sertifikat kegiatan, pelatihan, dan praktikum resmi dari Laboratorium Jaringan Telekomunikasi ITS."
                            : "Authenticity validation system for official activity, training, and practicum certificates issued by Telecommunication Network Laboratory ITS."}
                    </p>
                </div>
            </section>

            <section className="utility-section">
                <div className="tnl-container verify-desk">
                    {/* Search Form Card */}
                    <div className="verify-search">
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label htmlFor="verify-code" className="block font-bold uppercase mb-2">
                                    {locale === "id" ? "Masukkan Kode Sertifikat / Hasil Scan QR" : "Enter Certificate Code / QR Scan"}
                                </label>
                                <div className="relative">
                                    <input
                                        id="verify-code"
                                        aria-describedby="verify-code-help"
                                        type="text"
                                        value={inputCode}
                                        onChange={(e) => setInputCode(e.target.value)}
                                        placeholder="cth: TNL-2026-A1B2C3D4"
                                        className="tnl-field pr-10 font-mono text-sm uppercase"
                                        aria-label="Certificate Code"
                                        data-testid="verify-input-code"
                                    />
                                    <QrCode className="absolute right-3 top-3 h-5 w-5 text-[var(--tnl-body)] pointer-events-none" />
                                </div>
                                <p id="verify-code-help" className="mt-2 text-xs text-[var(--tnl-body)]">
                                    {locale === "id"
                                        ? "Kode tertera di bagian bawah lembar sertifikat fisik/PDF atau di URL hasil pemindaian QR code."
                                        : "The code is printed at the bottom of the certificate or inside the scanned QR code URL."}
                                </p>
                            </div>

                            <button
                                type="submit"
                                disabled={!inputCode.trim() || loading}
                                className="utility-button utility-button-primary w-full"
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
                        <div role="status" aria-live="polite" className="verify-result">
                            <Spinner label={t("loading")} />
                        </div>
                    ) : searched && data ? (
                        data.valid ? (
                            <div role="status" aria-live="polite" className="verify-result" data-testid="verify-valid">
                                <TnlLogo variant="auto" className="mb-4 h-12 w-12" />
                                <div className="inline-flex items-center gap-1.5 rounded-full bg-[var(--gsm-emerald)]/15 px-3 py-1 text-xs font-semibold text-[var(--tnl-body)]">
                                    <BadgeCheck className="h-4 w-4" aria-hidden="true" />
                                    <span>{t("certificate_valid")}</span>
                                </div>
                                <p className="utility-record-name mt-4">{data.name}</p>
                                <p className="mt-1 text-sm font-medium text-[var(--tnl-body)]">{data.event_title}</p>
                                {data.event_date && (
                                    <p className="mt-1 text-xs" style={{ color: "var(--tnl-tan-text)" }}>
                                        {locale === "id" ? "Tanggal Kegiatan:" : "Event Date:"} {data.event_date}
                                    </p>
                                )}
                                <div className="my-4 border-t border-dashed" style={{ borderColor: "var(--tnl-border)" }} />
                                {data.code ? <p className="verify-record-code">{data.code}</p> : null}
                                <div className="mt-6 flex flex-col items-start justify-start gap-3 sm:flex-row sm:items-center">
                                    {data.code ? (
                                        <a
                                            href={apiUrl(`/certificates/${encodeURIComponent(data.code)}/pdf`)}
                                            download
                                            className="utility-button utility-button-primary"
                                            data-testid="download-certificate-btn"
                                        >
                                            <Download className="h-4 w-4" aria-hidden="true" />
                                            {locale === "id" ? "Unduh PDF Resmi" : "Download PDF Certificate"}
                                        </a>
                                    ) : null}
                                    <button
                                        type="button"
                                        onClick={handleReset}
                                        className="utility-button"
                                    >
                                        <RotateCcw className="h-3.5 w-3.5" />
                                        {locale === "id" ? "Verifikasi Sertifikat Lain" : "Check Another Code"}
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div role="status" aria-live="polite" className="verify-result" data-testid="verify-invalid">
                                <ShieldAlert className="h-10 w-10 text-[var(--destructive)]" aria-hidden="true" />
                                <h2 className="utility-title mt-4">
                                    {t("certificate_invalid")}
                                </h2>
                                <p className="mt-2 text-sm text-[var(--tnl-body)]">{data.message}</p>
                                <div className="mt-6">
                                    <button
                                        type="button"
                                        onClick={handleReset}
                                        className="utility-button"
                                    >
                                        <RotateCcw className="h-3.5 w-3.5" />
                                        {locale === "id" ? "Coba Kode Lain" : "Try Another Code"}
                                    </button>
                                </div>
                            </div>
                        )
                    ) : (
                        <div className="verify-idle">
                            <p className="utility-kicker">TNL / ITS</p>
                            <h2 className="mt-3 text-2xl font-medium">{locale === "id" ? "Cara memverifikasi" : "How to verify"}</h2>
                            <ol className="mt-5 list-decimal pl-5 space-y-3 text-sm leading-relaxed">
                                <li>{locale === "id" ? "Temukan kode unik pada sertifikat atau tautan QR." : "Find the unique code on your certificate or QR link."}</li>
                                <li>{locale === "id" ? "Masukkan kode, lalu jalankan verifikasi." : "Enter the code and run verification."}</li>
                                <li>{locale === "id" ? "Cocokkan nama, kegiatan, dan tanggal dengan dokumen Anda." : "Match the name, event, and date against your document."}</li>
                            </ol>
                        </div>
                    )}
                </div>
            </section>
        </div>
    );
}

export function NotFoundPage() {
    const { t, locale } = useLocale();
    return (
        <div className="utility-editorial not-found-editorial" data-testid="not-found-page">
            <div className="tnl-container">
                <p className="utility-kicker">404 / TNL · ITS</p>
                <div data-testid="not-found-empty-state">
                    <h1 className="utility-title">{t("not_found_title")}</h1>
                    <p>{t("not_found_body")}</p>
                </div>
                <div className="not-found-actions">
                    <Link to="/" className="utility-button utility-button-primary" data-testid="not-found-home-button">
                        {t("back_home")}
                    </Link>
                    <Link to="/contact" className="utility-button">
                        {locale === "id" ? "Hubungi laboratorium" : "Contact the laboratory"}
                    </Link>
                </div>
            </div>
        </div>
    );
}
