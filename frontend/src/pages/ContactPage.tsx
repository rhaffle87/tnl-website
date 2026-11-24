import { useEffect, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
    Building2,
    Check,
    CheckCircle2,
    Clock,
    Copy,
    Mail,
    MapPin,
    Navigation,
    Send,
    Sparkles,
    ArrowUpRight,
} from "lucide-react";
import { apiPost, ApiError } from "@/lib/api";
import { useLocale } from "@/lib/i18n";
import { useSettings } from "@/lib/hooks";
import { getContactMapLinks } from "@/lib/contact-map";
import "./editorial-content.css";

interface ContactResponse {
    ok: boolean;
    message: string;
}

const TOPIC_PILLS = [
    { id: "research", label_id: "Kolaborasi Riset", label_en: "Research Collaboration" },
    { id: "training", label_id: "Pelatihan & Sertifikasi", label_en: "Training & Certification" },
    { id: "academic", label_id: "Praktikum / Akademik", label_en: "Practicum / Academics" },
    { id: "visit", label_id: "Kunjungan Lab / Umum", label_en: "Lab Visit / General Inquiry" },
] as const;

export default function ContactPage() {
    const { locale } = useLocale();
    const { data: settings } = useSettings();
    const isId = locale === "id";
    const mapLinks = getContactMapLinks(settings?.contact?.maps_url);

    // Form state
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [subject, setSubject] = useState("");
    const [message, setMessage] = useState("");
    const [consent, setConsent] = useState(false);
    const [companyWebsite, setCompanyWebsite] = useState("");
    const [activePill, setActivePill] = useState<string | null>(null);

    const [sending, setSending] = useState(false);
    const [done, setDone] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});

    // Deep-link prefill: /contact?topic=academic&ref=practicum-CISCO from the
    // practicum card's "Contact us" CTA selects the matching pill and seeds the message.
    const [params] = useSearchParams();
    useEffect(() => {
        const topicId = params.get("topic");
        const pill = TOPIC_PILLS.find((p) => p.id === topicId);
        if (pill) {
            setActivePill(pill.id);
            setSubject(isId ? pill.label_id : pill.label_en);
        }
        const ref = params.get("ref");
        if (ref) {
            setMessage(
                isId
                    ? `Halo, saya ingin meminta akses modul praktikum (referensi: ${ref}). Mohon informasinya. Terima kasih.`
                    : `Hello, I would like to request access to practicum modules (reference: ${ref}). Please advise. Thank you.`,
            );
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- prefill only on first mount
    }, []);

    // Copy states
    const [copiedAddress, setCopiedAddress] = useState(false);
    const [copiedEmail, setCopiedEmail] = useState(false);

    const fullAddress = "Gedung B, Ruang B-301, Departemen Teknik Elektro, FTEIC, Institut Teknologi Sepuluh Nopember (ITS), Keputih, Sukolilo, Surabaya 60111";
    const officialEmail = settings?.contact?.email || "telconnetlab@gmail.com";
    const igHandle = settings?.social?.instagram || "@tnlab_its";
    const igUrl = `https://www.instagram.com/${igHandle.replace("@", "")}/`;

    const handleCopyAddress = async () => {
        try {
            await navigator.clipboard.writeText(fullAddress);
            setCopiedAddress(true);
            toast.success(isId ? "Alamat berhasil disalin ke papan klip!" : "Address copied to clipboard!");
            setTimeout(() => setCopiedAddress(false), 2000);
        } catch {
            toast.error(isId ? "Gagal menyalin alamat." : "Failed to copy address.");
        }
    };

    const handleCopyEmail = async () => {
        try {
            await navigator.clipboard.writeText(officialEmail);
            setCopiedEmail(true);
            toast.success(isId ? "Email berhasil disalin!" : "Email copied to clipboard!");
            setTimeout(() => setCopiedEmail(false), 2000);
        } catch {
            toast.error(isId ? "Gagal menyalin email." : "Failed to copy email.");
        }
    };

    const handleSelectPill = (pill: typeof TOPIC_PILLS[number]) => {
        const text = isId ? pill.label_id : pill.label_en;
        setActivePill(pill.id);
        setSubject(text);
        if (errors.subject) {
            setErrors((prev) => ({ ...prev, subject: "" }));
        }
    };

    const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const next: Record<string, string> = {};

        if (!name.trim()) {
            next.name = isId ? "Nama lengkap wajib diisi." : "Full name is required.";
        }
        if (!email.trim()) {
            next.email = isId ? "Email wajib diisi." : "Email address is required.";
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
            next.email = isId ? "Format email tidak valid." : "Please enter a valid email address.";
        }
        if (!subject.trim()) {
            next.subject = isId ? "Subjek pesan wajib diisi." : "Subject is required.";
        }
        if (!message.trim()) {
            next.message = isId ? "Isi pesan wajib diisi." : "Message body is required.";
        }
        if (!consent) {
            next.consent = isId
                ? "Persetujuan pemrosesan data (UU PDP No. 27/2022) wajib dicentang."
                : "You must consent to data processing under PDP Law No. 27/2022.";
        }

        setErrors(next);
        if (Object.keys(next).length > 0) return;

        setSending(true);
        try {
            const payload = {
                name: name.trim(),
                email: email.trim(),
                subject: subject.trim(),
                message: message.trim(),
                company_website: companyWebsite.trim(),
            };
            const res = await apiPost<ContactResponse>("/contact", payload);
            setDone(true);
            toast.success(res.message || (isId ? "Pesan Anda berhasil dikirim!" : "Your message has been sent!"));
        } catch (err) {
            const errorMsg =
                err instanceof ApiError && typeof (err.body as { detail?: string })?.detail === "string"
                    ? (err.body as { detail: string }).detail
                    : isId
                      ? "Gagal mengirim pesan. Silakan coba lagi."
                      : "Failed to send message. Please try again.";
            toast.error(errorMsg);
        } finally {
            setSending(false);
        }
    };

    const handleResetForm = () => {
        setName("");
        setEmail("");
        setSubject("");
        setMessage("");
        setConsent(false);
        setCompanyWebsite("");
        setActivePill(null);
        setErrors({});
        setDone(false);
    };

    return (
        <div data-testid="contact-page" className="editorial-content editorial-contact min-h-screen">
            {/* 1. Compact Technical Inner Hero */}
            <header className="editorial-contact-masthead py-12 md:py-16">
                <div className="tnl-container relative z-10">
                    <div className="max-w-3xl">
                        <div className="editorial-eyebrow">
                            <span>ROOM B-301 · SURABAYA</span>
                        </div>
                        <h1 className="editorial-contact-title">
                            {isId ? "Hubungi Kami" : "Contact the Lab"}
                        </h1>
                        <p className="editorial-contact-intro">
                            {isId
                                ? "Hubungi Laboratorium Jaringan Telekomunikasi ITS untuk kolaborasi riset, kemitraan industri, program pelatihan, praktikum, atau pertanyaan umum seputar fasilitas laboratorium kami."
                                : "Reach out to the Telecommunication Network Laboratory at ITS for research collaborations, industry partnerships, training programmes, laboratory practicums, or general inquiries."}
                        </p>

                        {/* Quick Info Strip */}
                        <div className="editorial-contact-strip">
                            <div className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.06] px-3 py-1.5 font-medium backdrop-blur-sm">
                                <MapPin className="h-4 w-4 text-[#C4B393]" aria-hidden="true" />
                                <span>Gedung B, Ruang B-301</span>
                            </div>
                            <div className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.06] px-3 py-1.5 font-medium backdrop-blur-sm">
                                <Building2 className="h-4 w-4 text-[#C4B393]" aria-hidden="true" />
                                <span>Departemen Teknik Elektro ITS</span>
                            </div>
                            <div className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.06] px-3 py-1.5 font-medium backdrop-blur-sm">
                                <Clock className="h-4 w-4 text-[#C4B393]" aria-hidden="true" />
                                <span>{isId ? "Respon Resmi: 1–2 Hari Kerja" : "Official Response: 1–2 Workdays"}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            {/* 2. Main 2-Column Asymmetric Content */}
            <div className="tnl-container py-12 md:py-16">
                <div className="editorial-contact-layout">
                    {/* Left Column (5 Cols): Direct Channels & Lab Desk Cards */}
                    <div className="editorial-contact-directory">
                        {/* Card 1: Laboratory Address */}
                        <div className="tnl-card tnl-scroll-reveal overflow-hidden flex flex-col" data-testid="contact-address-card">
                            <div className="tnl-card-header flex items-center justify-between">
                                <span className="text-[11px] font-mono font-bold uppercase tracking-widest text-[var(--tnl-tan-text)]">
                                    {isId ? "LOKASI LABORATORIUM" : "LABORATORY LOCATION"}
                                </span>
                                {mapLinks.coordinatesLabel && (
                                    <span className="inline-flex items-center gap-1.5 rounded-full border border-[#C5CDC2] dark:border-white/15 bg-white dark:bg-[#111613] px-2.5 py-0.5 text-[11px] font-mono text-[var(--gsm-emerald,#5D8A6B)] shadow-2xs">
                                        <MapPin className="h-3 w-3" aria-hidden="true" />
                                        <span>{mapLinks.coordinatesLabel}</span>
                                    </span>
                                )}
                            </div>

                            <div className="p-6 sm:p-7 flex-1 flex flex-col justify-between">
                                <div>
                                    <h2 className="text-xl font-bold tracking-tight text-[var(--foreground)]">
                                        Gedung B, Ruang B-301
                                    </h2>
                                    <address className="mt-2 text-sm leading-relaxed text-[var(--tnl-body)] not-italic">
                                        Departemen Teknik Elektro, Fakultas Teknologi Elektro dan Informatika Cerdas (FTEIC),
                                        Institut Teknologi Sepuluh Nopember (ITS), Keputih, Sukolilo, Surabaya 60111
                                    </address>
                                </div>

                                <div className="border-t border-[var(--tnl-border)] pt-4 mt-5">
                                    <button
                                        type="button"
                                        onClick={handleCopyAddress}
                                        className="inline-flex items-center gap-2 rounded-lg border border-[#C5CDC2] dark:border-white/15 bg-[#F6F7F4] dark:bg-[#0E1411] px-3.5 py-2 text-xs font-semibold text-[var(--foreground)] transition-all hover:bg-[var(--gsm-primary,#223027)] hover:text-white hover:border-[var(--gsm-primary,#223027)] dark:hover:bg-[var(--gsm-accent,#C4B393)] dark:hover:text-[#111613] dark:hover:border-[var(--gsm-accent,#C4B393)] shadow-2xs"
                                        data-testid="copy-address-button"
                                    >
                                        {copiedAddress ? (
                                            <>
                                                <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                                                <span className="text-emerald-700 dark:text-emerald-300">
                                                    {isId ? "Alamat Tersalin!" : "Address Copied!"}
                                                </span>
                                            </>
                                        ) : (
                                            <>
                                                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                                                <span>{isId ? "Salin Alamat Lengkap" : "Copy Full Address"}</span>
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Card 2: Email & Official Channels */}
                        <div className="tnl-card tnl-scroll-reveal overflow-hidden flex flex-col" data-testid="contact-channels-card">
                            <div className="tnl-card-header flex items-center justify-between">
                                <span className="text-[11px] font-mono font-bold uppercase tracking-widest text-[var(--tnl-tan-text)]">
                                    {isId ? "KANAL RESMI & KORESPONDENSI" : "OFFICIAL CHANNELS"}
                                </span>
                                <span className="text-[10px] font-mono tracking-wider text-[var(--tnl-tan-text)] uppercase">
                                    RESMI · ITS
                                </span>
                            </div>

                            <div className="p-6 sm:p-7 space-y-3.5">
                                <div className="tnl-inset-tile p-3.5 flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--gsm-primary,#223027)]/10 dark:bg-[var(--gsm-emerald,#5D8A6B)]/20 text-[var(--gsm-primary,#223027)] dark:text-[var(--gsm-accent,#A3C9AE)] border border-[var(--gsm-primary,#223027)]/15 dark:border-[var(--gsm-emerald,#5D8A6B)]/30">
                                            <Mail className="h-5 w-5" aria-hidden="true" />
                                        </div>
                                        <div className="min-w-0">
                                            <span className="block text-[11px] font-mono uppercase tracking-wider text-[var(--tnl-tan-text)]">
                                                Email Administrasi
                                            </span>
                                            <a
                                                href={`mailto:${officialEmail}`}
                                                className="text-sm font-semibold hover:underline text-[var(--foreground)] truncate block"
                                                data-testid="official-email-link"
                                            >
                                                {officialEmail}
                                            </a>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleCopyEmail}
                                        aria-label={isId ? "Salin email" : "Copy email"}
                                        className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-[#C5CDC2] dark:border-white/15 bg-white dark:bg-[#131A16] px-3 py-1.5 text-xs font-semibold text-[var(--foreground)] transition-all hover:bg-[var(--gsm-primary,#223027)] hover:text-white hover:border-[var(--gsm-primary,#223027)] dark:hover:bg-[var(--gsm-accent,#C4B393)] dark:hover:text-[#111613] dark:hover:border-[var(--gsm-accent,#C4B393)] shadow-2xs"
                                        data-testid="copy-email-button"
                                    >
                                        {copiedEmail ? (
                                            <>
                                                <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                                                <span className="text-emerald-700 dark:text-emerald-300">{isId ? "Tersalin" : "Copied"}</span>
                                            </>
                                        ) : (
                                            <>
                                                <Copy className="h-3.5 w-3.5" />
                                                <span>{isId ? "Salin" : "Copy"}</span>
                                            </>
                                        )}
                                    </button>
                                </div>

                                <div className="tnl-inset-tile p-3.5 flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--gsm-accent,#C4B393)]/20 text-[var(--tnl-tan-text)] dark:text-[var(--gsm-accent,#C4B393)] border border-[var(--gsm-accent,#C4B393)]/30">
                                            <Sparkles className="h-5 w-5" aria-hidden="true" />
                                        </div>
                                        <div className="min-w-0">
                                            <span className="block text-[11px] font-mono uppercase tracking-wider text-[var(--tnl-tan-text)]">
                                                Instagram Resmi
                                            </span>
                                            <span className="text-sm font-semibold text-[var(--foreground)] truncate block">
                                                {igHandle}
                                            </span>
                                        </div>
                                    </div>
                                    <a
                                        href={igUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-[#C5CDC2] dark:border-white/15 bg-white dark:bg-[#131A16] px-3 py-1.5 text-xs font-semibold text-[var(--foreground)] transition-all hover:bg-[var(--gsm-primary,#223027)] hover:text-white hover:border-[var(--gsm-primary,#223027)] dark:hover:bg-[var(--gsm-accent,#C4B393)] dark:hover:text-[#111613] dark:hover:border-[var(--gsm-accent,#C4B393)] shadow-2xs"
                                        data-testid="official-instagram-link"
                                    >
                                        <span>{isId ? "Buka" : "Open"}</span>
                                        <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                                    </a>
                                </div>
                            </div>
                        </div>

                        {/* Card 3: Operational Hours & Quick Links — flex-1 to equalize column height */}
                        <div className="tnl-card tnl-scroll-reveal overflow-hidden flex flex-col flex-1 justify-between" data-testid="contact-hours-card">
                            <div>
                                <div className="tnl-card-header flex items-center justify-between">
                                    <span className="text-[11px] font-mono font-bold uppercase tracking-widest text-[var(--tnl-tan-text)]">
                                        {isId ? "JAM OPERASIONAL & LAYANAN" : "OPERATING HOURS & DESK"}
                                    </span>
                                    <span className="inline-flex items-center gap-1.5 rounded-full border border-[#C5CDC2] dark:border-white/15 bg-white dark:bg-[#111613] px-2.5 py-0.5 text-[11px] font-mono font-semibold text-[var(--gsm-emerald,#5D8A6B)] shadow-2xs">
                                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                        <span>WIB · UTC+7</span>
                                    </span>
                                </div>

                                <div className="p-6 sm:p-7 space-y-4">
                                    <div className="divide-y divide-[var(--tnl-border)] border border-[var(--tnl-border)] rounded-xl bg-[#F6F7F4] dark:bg-[#0E1411] overflow-hidden text-sm">
                                        <div className="p-3.5 flex items-center justify-between gap-2">
                                            <span className="text-xs sm:text-sm font-medium text-[var(--tnl-body)]">
                                                {isId ? "Layanan Ruang B-301" : "Office Hours"}
                                            </span>
                                            <span className="font-mono font-semibold text-xs sm:text-sm text-[var(--foreground)]">
                                                {isId ? "Senin – Jumat" : "Monday – Friday"} · 08:00 – 16:00 WIB
                                            </span>
                                        </div>
                                        <div className="p-3.5 flex items-center justify-between gap-2">
                                            <span className="text-xs sm:text-sm font-medium text-[var(--tnl-body)]">
                                                {isId ? "Sesi Praktikum & Riset" : "Practicum Sessions"}
                                            </span>
                                            <span className="font-mono font-semibold text-xs sm:text-sm text-[var(--foreground)]">
                                                16:00 – 20:00 WIB
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="px-6 pb-6 sm:px-7 sm:pb-7">
                                <div className="border-t border-[var(--tnl-border)] pt-4 mt-auto">
                                    <span className="block text-[11px] font-mono font-bold uppercase tracking-wider text-[var(--tnl-tan-text)] mb-2.5">
                                        {isId ? "Akses Pintas Cepat" : "Quick Shortcuts"}
                                    </span>
                                    <div className="flex flex-wrap gap-2 text-xs">
                                        <Link
                                            to="/open-house"
                                            className="inline-flex items-center gap-1.5 rounded-lg border border-[#C5CDC2] dark:border-white/15 bg-[#F6F7F4] dark:bg-[#0E1411] px-3 py-1.5 font-semibold text-[var(--foreground)] transition-all hover:bg-[var(--gsm-primary,#223027)] hover:text-white hover:border-[var(--gsm-primary,#223027)] dark:hover:bg-[var(--gsm-accent,#C4B393)] dark:hover:text-[#111613] dark:hover:border-[var(--gsm-accent,#C4B393)] shadow-2xs"
                                        >
                                            <span>Open House</span>
                                            <ArrowUpRight className="h-3 w-3" />
                                        </Link>
                                        <Link
                                            to="/activity"
                                            className="inline-flex items-center gap-1.5 rounded-lg border border-[#C5CDC2] dark:border-white/15 bg-[#F6F7F4] dark:bg-[#0E1411] px-3 py-1.5 font-semibold text-[var(--foreground)] transition-all hover:bg-[var(--gsm-primary,#223027)] hover:text-white hover:border-[var(--gsm-primary,#223027)] dark:hover:bg-[var(--gsm-accent,#C4B393)] dark:hover:text-[#111613] dark:hover:border-[var(--gsm-accent,#C4B393)] shadow-2xs"
                                        >
                                            <span>{isId ? "Kegiatan & Riset" : "Activities & Research"}</span>
                                            <ArrowUpRight className="h-3 w-3" />
                                        </Link>
                                        <Link
                                            to="/verify"
                                            className="inline-flex items-center gap-1.5 rounded-lg border border-[#C5CDC2] dark:border-white/15 bg-[#F6F7F4] dark:bg-[#0E1411] px-3 py-1.5 font-semibold text-[var(--foreground)] transition-all hover:bg-[var(--gsm-primary,#223027)] hover:text-white hover:border-[var(--gsm-primary,#223027)] dark:hover:bg-[var(--gsm-accent,#C4B393)] dark:hover:text-[#111613] dark:hover:border-[var(--gsm-accent,#C4B393)] shadow-2xs"
                                        >
                                            <span>{isId ? "Verifikasi Sertifikat" : "Verify Certificate"}</span>
                                            <ArrowUpRight className="h-3 w-3" />
                                        </Link>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Right Column (7 Cols): Revamped Message Form Card */}
                    <div className="editorial-contact-compose">
                        <div className="tnl-card tnl-scroll-reveal overflow-hidden flex flex-col h-full" data-testid="contact-form-container">
                            {/* Header Strip */}
                            <div className="tnl-card-header">
                                <div className="inline-flex items-center gap-2 text-xs font-mono font-bold tracking-wider text-[var(--gsm-emerald,#5D8A6B)] uppercase">
                                    <Send className="h-3.5 w-3.5" aria-hidden="true" />
                                    <span>{isId ? "FORMULIR PESAN RESMI" : "OFFICIAL DIRECT INQUIRY"}</span>
                                </div>
                                <h2 className="mt-1.5 text-2xl font-bold tracking-tight text-[var(--foreground)]">
                                    {isId ? "Kirim Pesan Langsung" : "Send a Direct Message"}
                                </h2>
                                <p className="mt-1 text-xs sm:text-sm text-[var(--tnl-body)] leading-relaxed">
                                    {isId
                                        ? "Sampaikan pesan Anda langsung ke meja administrasi laboratorium. Kami akan merespon melalui email resmi."
                                        : "Direct your message straight to the laboratory administrative desk. We reply via official lab email."}
                                </p>
                            </div>

                            <div className="p-6 sm:p-8 flex-1 flex flex-col justify-between">
                                <div>
                                    {/* Quick Topic Pills */}
                                    <div className="pb-5 border-b border-dashed border-[var(--tnl-border)] mb-5">
                                        <label className="block text-xs font-semibold text-[var(--tnl-tan-text)] uppercase tracking-wider mb-2.5">
                                            {isId ? "Pilih Topik Cepat (Opsional)" : "Quick Topic Selection (Optional)"}
                                        </label>
                                        <div className="flex flex-wrap gap-2" role="group" aria-label={isId ? "Pilihan topik" : "Inquiry topics"}>
                                            {TOPIC_PILLS.map((pill) => {
                                                const label = isId ? pill.label_id : pill.label_en;
                                                const isSelected = activePill === pill.id;
                                                return (
                                                    <button
                                                        key={pill.id}
                                                        type="button"
                                                        onClick={() => handleSelectPill(pill)}
                                                        aria-pressed={isSelected}
                                                        className={`inline-flex min-h-[36px] items-center rounded-full px-3.5 py-1.5 text-xs transition-all ${
                                                            isSelected
                                                                ? "bg-[var(--gsm-primary,#223027)] text-white border border-[var(--gsm-primary,#223027)] dark:bg-[var(--gsm-accent,#A8977B)] dark:text-[#111613] dark:border-[var(--gsm-accent,#A8977B)] font-semibold shadow-xs"
                                                                : "border border-[#C5CDC2] dark:border-white/15 bg-[#F6F7F4] dark:bg-[#0E1411] text-[var(--foreground)] hover:border-[var(--gsm-primary,#223027)] dark:hover:border-[var(--gsm-accent,#C4B393)] font-medium shadow-2xs"
                                                        }`}
                                                        data-testid={`topic-pill-${pill.id}`}
                                                    >
                                                        {label}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {done ? (
                                        <div
                                            className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-8 text-center space-y-4 animate-fade-in my-auto"
                                            data-testid="contact-form-success"
                                            role="status"
                                        >
                                            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                                                <CheckCircle2 className="h-8 w-8" aria-hidden="true" />
                                            </div>
                                            <div>
                                                <h3 className="text-xl font-bold text-[var(--foreground)]">
                                                    {isId ? "Pesan Berhasil Terkirim!" : "Message Successfully Sent!"}
                                                </h3>
                                                <p className="mt-2 text-sm leading-relaxed text-[var(--tnl-body)] max-w-md mx-auto">
                                                    {isId
                                                        ? "Terima kasih telah menghubungi Laboratorium TNL ITS. Tim kami akan meninjau pesan Anda dan membalasnya ke alamat email yang Anda cantumkan."
                                                        : "Thank you for contacting the TNL Laboratory at ITS. Our administrative desk will review your inquiry and follow up at your provided email address."}
                                                </p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={handleResetForm}
                                                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[var(--gsm-primary,#223027)] hover:opacity-90 text-white dark:bg-[var(--gsm-accent,#A8977B)] dark:hover:bg-[var(--gsm-accent-hover,#C2B091)] dark:text-[#111613] px-5 py-2.5 text-xs font-bold transition-all shadow-sm"
                                                data-testid="send-another-message-button"
                                            >
                                                <span>{isId ? "Kirim Pesan Lain" : "Send Another Message"}</span>
                                            </button>
                                        </div>
                                    ) : (
                                        <form onSubmit={onSubmit} className="space-y-4" noValidate data-testid="contact-form">
                                            {/* Honeypot */}
                                            <div className="hidden" aria-hidden="true">
                                                <label htmlFor="company_website">Company website</label>
                                                <input
                                                    id="company_website"
                                                    name="company_website"
                                                    type="text"
                                                    tabIndex={-1}
                                                    autoComplete="off"
                                                    value={companyWebsite}
                                                    onChange={(e) => setCompanyWebsite(e.target.value)}
                                                />
                                            </div>

                                            {/* Responsive 2-column Grid for Name & Email */}
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                <div>
                                                    <label htmlFor="contact-name" className="mb-1.5 block text-xs font-semibold tracking-wide text-[var(--foreground)]">
                                                        {isId ? "Nama Lengkap" : "Full Name"}{" "}
                                                        <span className="text-[#A8977B] dark:text-[#C4B393]">*</span>
                                                    </label>
                                                    <input
                                                        id="contact-name"
                                                        name="name"
                                                        type="text"
                                                        value={name}
                                                        onChange={(e) => {
                                                            setName(e.target.value);
                                                            if (errors.name) setErrors((prev) => ({ ...prev, name: "" }));
                                                        }}
                                                        placeholder={isId ? "Contoh: Budi Prasetyo" : "e.g. John Doe"}
                                                        className="tnl-input min-h-[44px]"
                                                        required
                                                        data-testid="contact-name-input"
                                                        aria-invalid={!!errors.name}
                                                        aria-describedby={errors.name ? "contact-name-error" : undefined}
                                                    />
                                                    {errors.name ? (
                                                        <p id="contact-name-error" className="mt-1 text-xs font-medium text-rose-500" data-testid="contact-name-error">
                                                            {errors.name}
                                                        </p>
                                                    ) : null}
                                                </div>

                                                <div>
                                                    <label htmlFor="contact-email" className="mb-1.5 block text-xs font-semibold tracking-wide text-[var(--foreground)]">
                                                        {isId ? "Email Resmi / Institusi" : "Official / Personal Email"}{" "}
                                                        <span className="text-[#A8977B] dark:text-[#C4B393]">*</span>
                                                    </label>
                                                    <input
                                                        id="contact-email"
                                                        name="email"
                                                        type="email"
                                                        value={email}
                                                        onChange={(e) => {
                                                            setEmail(e.target.value);
                                                            if (errors.email) setErrors((prev) => ({ ...prev, email: "" }));
                                                        }}
                                                        placeholder="email@example.com"
                                                        className="tnl-input min-h-[44px]"
                                                        required
                                                        data-testid="contact-email-input"
                                                        aria-invalid={!!errors.email}
                                                        aria-describedby={errors.email ? "contact-email-error" : undefined}
                                                    />
                                                    {errors.email ? (
                                                        <p id="contact-email-error" className="mt-1 text-xs font-medium text-rose-500" data-testid="contact-email-error">
                                                            {errors.email}
                                                        </p>
                                                    ) : null}
                                                </div>
                                            </div>

                                            {/* Subject */}
                                            <div>
                                                <label htmlFor="contact-subject" className="mb-1.5 block text-xs font-semibold tracking-wide text-[var(--foreground)]">
                                                    {isId ? "Subjek Pesan" : "Subject"}{" "}
                                                    <span className="text-[#A8977B] dark:text-[#C4B393]">*</span>
                                                </label>
                                                <input
                                                    id="contact-subject"
                                                    name="subject"
                                                    type="text"
                                                    value={subject}
                                                    onChange={(e) => {
                                                        setSubject(e.target.value);
                                                        if (errors.subject) setErrors((prev) => ({ ...prev, subject: "" }));
                                                    }}
                                                    placeholder={isId ? "Topik atau perihal pesan..." : "Inquiry subject..."}
                                                    className="tnl-input min-h-[44px]"
                                                    required
                                                    data-testid="contact-subject-input"
                                                    aria-invalid={!!errors.subject}
                                                    aria-describedby={errors.subject ? "contact-subject-error" : undefined}
                                                />
                                                {errors.subject ? (
                                                    <p id="contact-subject-error" className="mt-1 text-xs font-medium text-rose-500" data-testid="contact-subject-error">
                                                        {errors.subject}
                                                    </p>
                                                ) : null}
                                            </div>

                                            {/* Message */}
                                            <div>
                                                <div className="mb-1.5 flex items-center justify-between">
                                                    <label htmlFor="contact-message" className="block text-xs font-semibold tracking-wide text-[var(--foreground)]">
                                                        {isId ? "Isi Pesan" : "Message Body"}{" "}
                                                        <span className="text-[#A8977B] dark:text-[#C4B393]">*</span>
                                                    </label>
                                                    <span className="text-[10px] font-mono text-[var(--tnl-tan-text)]">
                                                        {message.length} {isId ? "karakter" : "chars"}
                                                    </span>
                                                </div>
                                                <textarea
                                                    id="contact-message"
                                                    name="message"
                                                    rows={5}
                                                    value={message}
                                                    onChange={(e) => {
                                                        setMessage(e.target.value);
                                                        if (errors.message) setErrors((prev) => ({ ...prev, message: "" }));
                                                    }}
                                                    placeholder={
                                                        isId
                                                            ? "Jelaskan kebutuhan, rencana kolaborasi, atau pertanyaan Anda secara rinci..."
                                                            : "Detail your inquiry, proposed collaboration, or question here..."
                                                    }
                                                    className="tnl-input"
                                                    required
                                                    data-testid="contact-message-input"
                                                    aria-invalid={!!errors.message}
                                                    aria-describedby={errors.message ? "contact-message-error" : undefined}
                                                />
                                                {errors.message ? (
                                                    <p id="contact-message-error" className="mt-1 text-xs font-medium text-rose-500" data-testid="contact-message-error">
                                                        {errors.message}
                                                    </p>
                                                ) : null}
                                            </div>

                                            {/* UU PDP Consent Checkbox */}
                                            <div className="rounded-xl border border-[#C5CDC2] dark:border-white/15 bg-[#F6F7F4] dark:bg-[#0E1411] p-4">
                                                <div className="flex items-start gap-3">
                                                    <input
                                                        id="contact-pdp-consent"
                                                        type="checkbox"
                                                        checked={consent}
                                                        onChange={(e) => {
                                                            setConsent(e.target.checked);
                                                            if (errors.consent) setErrors((prev) => ({ ...prev, consent: "" }));
                                                        }}
                                                        className="mt-1 h-4 w-4 rounded border-[#C5CDC2] text-[var(--gsm-primary,#223027)] dark:text-[var(--gsm-accent,#A8977B)] focus:ring-[var(--gsm-primary,#223027)]"
                                                        data-testid="contact-pdp-consent-checkbox"
                                                        aria-invalid={!!errors.consent}
                                                        aria-describedby={errors.consent ? "contact-consent-error" : undefined}
                                                    />
                                                    <label htmlFor="contact-pdp-consent" className="text-xs leading-relaxed text-[var(--tnl-body)]">
                                                        {isId ? (
                                                             <>
                                                                Saya menyetujui pemrosesan data pribadi ini untuk keperluan korespondensi resmi
                                                                sesuai dengan ketentuan <strong>UU PDP No. 27/2022</strong> dan{" "}
                                                                <Link to="/privacy" className="text-[var(--gsm-primary,#223027)] dark:text-[var(--gsm-accent,#C4B393)] underline font-semibold hover:opacity-80">
                                                                    Kebijakan Privasi
                                                                </Link>{" "}
                                                                Lab TNL ITS.
                                                            </>
                                                        ) : (
                                                            <>
                                                                I consent to the processing of this personal data for official correspondence in
                                                                compliance with <strong>Indonesian PDP Law No. 27/2022</strong> and the Lab TNL ITS{" "}
                                                                <Link to="/privacy" className="text-[var(--gsm-primary,#223027)] dark:text-[var(--gsm-accent,#C4B393)] underline font-semibold hover:opacity-80">
                                                                    Privacy Policy
                                                                </Link>
                                                                .
                                                            </>
                                                        )}
                                                    </label>
                                                </div>
                                                {errors.consent ? (
                                                    <p id="contact-consent-error" className="mt-2 text-xs font-medium text-rose-500 pl-7" data-testid="contact-consent-error">
                                                        {errors.consent}
                                                    </p>
                                                ) : null}
                                            </div>

                                            {/* Submit Button */}
                                            <button
                                                type="submit"
                                                disabled={sending}
                                                className="w-full min-h-[48px] rounded-[10px] bg-[var(--gsm-primary,#223027)] hover:opacity-90 text-white dark:bg-[var(--gsm-accent,#A8977B)] dark:hover:bg-[var(--gsm-accent-hover,#C2B091)] dark:text-[#111613] text-sm font-semibold flex items-center justify-center gap-2 shadow-sm transition-all"
                                                data-testid="contact-submit-button"
                                            >
                                                {sending ? (
                                                    <>
                                                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                                                        <span>{isId ? "Mengirim Pesan..." : "Sending Message..."}</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <span>{isId ? "Kirim Pesan Sekarang" : "Send Message Now"}</span>
                                                        <Send className="h-4 w-4" aria-hidden="true" />
                                                    </>
                                                )}
                                            </button>
                                        </form>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 3. Interactive Laboratory Map Section (Full-Width) */}
                <section className="mt-14" data-testid="contact-map-section">
                    <div className="tnl-card tnl-scroll-reveal overflow-hidden p-0 border border-[var(--tnl-border)] shadow-md">
                        {/* Map Header */}
                        <div className="tnl-card-header flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div>
                                <span className="text-[11px] font-mono font-bold uppercase tracking-widest text-[var(--gsm-emerald,#5D8A6B)]">
                                    INTERACTIVE LOCATION · GEDUNG B, B-301
                                </span>
                                <h3 className="text-xl font-bold tracking-tight text-[var(--foreground)] mt-0.5">
                                    {isId ? "Kunjungi Ruang B-301" : "Visit Room B-301"}
                                </h3>
                                <p className="text-xs text-[var(--tnl-body)] mt-0.5">
                                    Lantai 3, Gedung B Departemen Teknik Elektro FTEIC ITS Surabaya
                                </p>
                            </div>

                            {/* Direct Action Buttons */}
                            <div className="flex flex-wrap items-center gap-2.5">
                                <a
                                    href={mapLinks.openUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-[#C5CDC2] dark:border-white/15 bg-white dark:bg-[#111613] px-3.5 py-2 text-xs font-semibold text-[var(--foreground)] shadow-2xs transition-all hover:bg-[#F6F7F4] dark:hover:bg-white/[0.06]"
                                    data-testid="map-open-google-maps"
                                >
                                    <span>{isId ? "Buka di Google Maps" : "Open in Google Maps"}</span>
                                    <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                                </a>
                                <a
                                    href={mapLinks.directionsUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-[var(--gsm-primary,#223027)] hover:opacity-90 text-white dark:bg-[var(--gsm-accent,#A8977B)] dark:hover:bg-[var(--gsm-accent-hover,#C2B091)] dark:text-[#111613] px-4 py-2 text-xs font-semibold shadow-2xs transition-all"
                                    data-testid="map-get-directions"
                                >
                                    <Navigation className="h-3.5 w-3.5" aria-hidden="true" />
                                    <span>{isId ? "Petunjuk Arah" : "Get Directions"}</span>
                                </a>
                            </div>
                        </div>

                        {/* Interactive Google Maps Frame */}
                        <div className="p-3 sm:p-4 bg-[#F6F7F4] dark:bg-[#0E1411]">
                            <div className="relative w-full rounded-xl overflow-hidden border border-[#C5CDC2] dark:border-white/15 shadow-inner">
                                <iframe
                                    src={mapLinks.embedUrl}
                                    title="Lokasi Laboratorium Jaringan Telekomunikasi ITS - Gedung B Ruang B-301"
                                    className="w-full h-[380px] md:h-[460px] border-0 dark:brightness-90 dark:contrast-105 transition-all duration-300 block"
                                    loading="lazy"
                                    allowFullScreen
                                    referrerPolicy="no-referrer-when-downgrade"
                                    data-testid="google-maps-iframe"
                                />

                                {/* Floating Non-Blocking Info Badge */}
                                <div className="pointer-events-none absolute bottom-4 left-4 z-10 hidden sm:flex items-center gap-2.5 rounded-xl border border-white/15 bg-[#111613]/92 text-white px-3.5 py-2 text-xs font-medium shadow-lg backdrop-blur-md">
                                    <span className="flex h-2 w-2 rounded-full bg-[var(--gsm-emerald,#5D8A6B)] animate-pulse" />
                                    <span>Ruang B-301 · Lantai 3 Gedung B, Teknik Elektro ITS</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
}
