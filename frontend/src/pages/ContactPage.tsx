import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
    Building2,
    Check,
    CheckCircle2,
    Clock,
    Copy,
    ExternalLink,
    Mail,
    MapPin,
    Navigation,
    Send,
    ShieldCheck,
    Sparkles,
    ArrowUpRight,
} from "lucide-react";
import { apiPost, ApiError } from "@/lib/api";
import { useLocale } from "@/lib/i18n";
import { useSettings } from "@/lib/hooks";

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
        <div data-testid="contact-page" className="min-h-screen">
            {/* 1. Compact Technical Inner Hero */}
            <header className="tnl-hero-gradient relative border-b border-black/10 dark:border-white/10 py-12 md:py-16 overflow-hidden">
                <div
                    aria-hidden="true"
                    className="pointer-events-none absolute -top-24 right-1/4 h-72 w-96 rounded-full bg-[#5D8A6B]/20 blur-3xl dark:bg-[#43594A]/25"
                />
                <div className="tnl-container relative z-10">
                    <div className="max-w-3xl">
                        <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3.5 py-1 text-xs font-mono font-bold tracking-widest text-[#E6E8E6] uppercase backdrop-blur-md">
                            <Sparkles className="h-3.5 w-3.5 text-[#C4B393]" aria-hidden="true" />
                            <span>ROOM B-301 · SURABAYA</span>
                        </div>
                        <h1 className="mt-4 text-3xl font-black tracking-tight text-white sm:text-5xl lg:text-6xl">
                            {isId ? "Hubungi Kami" : "Contact the Lab"}
                        </h1>
                        <p className="mt-4 text-base leading-relaxed text-[#D1D5DB] sm:text-lg">
                            {isId
                                ? "Hubungi Laboratorium Jaringan Telekomunikasi ITS untuk kolaborasi riset, kemitraan industri, program pelatihan, praktikum, atau pertanyaan umum seputar fasilitas laboratorium kami."
                                : "Reach out to the Telecommunication Network Laboratory at ITS for research collaborations, industry partnerships, training programmes, laboratory practicums, or general inquiries."}
                        </p>

                        {/* Quick Info Strip */}
                        <div className="mt-8 flex flex-wrap items-center gap-3 text-xs sm:text-sm text-[#F4F4F0]">
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
            <main className="tnl-container py-12 md:py-16">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                    {/* Left Column (5 Cols): Direct Channels & Lab Desk Cards */}
                    <div className="lg:col-span-5 space-y-6">
                        {/* Card 1: Laboratory Address */}
                        <div className="tnl-card p-6 sm:p-7 space-y-4" data-testid="contact-address-card">
                            <div className="flex items-center justify-between">
                                <span className="text-[11px] font-mono font-bold uppercase tracking-widest text-[var(--tnl-tan-text)]">
                                    {isId ? "LOKASI LABORATORIUM" : "LABORATORY LOCATION"}
                                </span>
                                <span className="inline-flex items-center gap-1 text-[11px] font-mono text-[#5D8A6B] dark:text-[#7EA88B]">
                                    <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                                    <span>7°17'02"S 112°47'47"E</span>
                                </span>
                            </div>

                            <div>
                                <h2 className="text-xl font-bold tracking-tight text-[var(--tnl-heading)]">
                                    Gedung B, Ruang B-301
                                </h2>
                                <p className="mt-2 text-sm leading-relaxed text-[var(--tnl-body)]">
                                    Departemen Teknik Elektro, Fakultas Teknologi Elektro dan Informatika Cerdas (FTEIC),
                                    Institut Teknologi Sepuluh Nopember (ITS), Keputih, Sukolilo, Surabaya 60111
                                </p>
                            </div>

                            <div className="pt-2">
                                <button
                                    type="button"
                                    onClick={handleCopyAddress}
                                    className="inline-flex items-center gap-2 rounded-lg border border-black/10 dark:border-white/15 bg-black/[0.02] dark:bg-white/[0.04] px-3.5 py-2 text-xs font-semibold text-[var(--tnl-heading)] transition-colors hover:bg-black/[0.06] dark:hover:bg-white/[0.08]"
                                    data-testid="copy-address-button"
                                >
                                    {copiedAddress ? (
                                        <>
                                            <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                                            <span className="text-emerald-700 dark:text-emerald-300">
                                                {isId ? "Tersalin!" : "Copied!"}
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

                        {/* Card 2: Email & Official Channels */}
                        <div className="tnl-card p-6 sm:p-7 space-y-5" data-testid="contact-channels-card">
                            <span className="text-[11px] font-mono font-bold uppercase tracking-widest text-[var(--tnl-tan-text)]">
                                {isId ? "KANAL RESMI & KORESPONDENSI" : "OFFICIAL CHANNELS"}
                            </span>

                            <div className="space-y-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex items-center gap-3">
                                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#5D8A6B]/15 text-[#2E583A] dark:text-[#8AB597]">
                                            <Mail className="h-5 w-5" aria-hidden="true" />
                                        </div>
                                        <div>
                                            <span className="block text-xs font-medium text-[var(--tnl-tan-text)]">
                                                Email Administrasi
                                            </span>
                                            <a
                                                href={`mailto:${officialEmail}`}
                                                className="text-sm font-semibold hover:underline text-[var(--tnl-heading)]"
                                                data-testid="official-email-link"
                                            >
                                                {officialEmail}
                                            </a>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleCopyEmail}
                                        aria-label="Salin email"
                                        className="shrink-0 p-2 text-[var(--tnl-body)] hover:text-[var(--tnl-heading)] transition-colors"
                                        data-testid="copy-email-button"
                                    >
                                        {copiedEmail ? (
                                            <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                                        ) : (
                                            <Copy className="h-4 w-4" />
                                        )}
                                    </button>
                                </div>

                                <div className="flex items-center justify-between gap-3 border-t border-black/5 dark:border-white/5 pt-3">
                                    <div className="flex items-center gap-3">
                                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#C4B393]/20 text-[#7F715C] dark:text-[#C4B393]">
                                            <Sparkles className="h-5 w-5" aria-hidden="true" />
                                        </div>
                                        <div>
                                            <span className="block text-xs font-medium text-[var(--tnl-tan-text)]">
                                                Instagram Resmi
                                            </span>
                                            <span className="text-sm font-semibold text-[var(--tnl-heading)]">
                                                {igHandle}
                                            </span>
                                        </div>
                                    </div>
                                    <a
                                        href={igUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 text-xs font-semibold text-[#5D8A6B] dark:text-[#8AB597] hover:underline"
                                        data-testid="official-instagram-link"
                                    >
                                        <span>Buka</span>
                                        <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                                    </a>
                                </div>
                            </div>
                        </div>

                        {/* Card 3: Operational Hours & Quick Links */}
                        <div className="tnl-card p-6 sm:p-7 space-y-4" data-testid="contact-hours-card">
                            <span className="text-[11px] font-mono font-bold uppercase tracking-widest text-[var(--tnl-tan-text)]">
                                {isId ? "JAM OPERASIONAL & LAYANAN" : "OPERATING HOURS & DESK"}
                            </span>

                            <div className="space-y-3 text-sm">
                                <div className="flex items-center justify-between border-b border-black/5 dark:border-white/5 pb-2.5">
                                    <span className="text-[var(--tnl-body)]">{isId ? "Layanan Ruang B-301" : "Office Hours"}</span>
                                    <span className="font-semibold text-[var(--tnl-heading)]">Senin – Jumat · 08:00 – 16:00 WIB</span>
                                </div>
                                <div className="flex items-center justify-between border-b border-black/5 dark:border-white/5 pb-2.5">
                                    <span className="text-[var(--tnl-body)]">{isId ? "Sesi Praktikum & Riset" : "Practicum Sessions"}</span>
                                    <span className="font-semibold text-[var(--tnl-heading)]">16:00 – 20:00 WIB</span>
                                </div>
                            </div>

                            <div className="pt-2">
                                <span className="block text-xs font-bold uppercase tracking-wider text-[var(--tnl-tan-text)] mb-2">
                                    {isId ? "Akses Pintas Cepat" : "Quick Shortcuts"}
                                </span>
                                <div className="flex flex-wrap gap-2 text-xs">
                                    <Link
                                        to="/open-house"
                                        className="inline-flex items-center gap-1 rounded-md border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.03] px-2.5 py-1.5 font-medium hover:border-[#5D8A6B] hover:text-[#5D8A6B] transition-colors"
                                    >
                                        <span>Open House</span>
                                        <ArrowUpRight className="h-3 w-3" />
                                    </Link>
                                    <Link
                                        to="/activity"
                                        className="inline-flex items-center gap-1 rounded-md border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.03] px-2.5 py-1.5 font-medium hover:border-[#5D8A6B] hover:text-[#5D8A6B] transition-colors"
                                    >
                                        <span>Pelatihan & Riset</span>
                                        <ArrowUpRight className="h-3 w-3" />
                                    </Link>
                                    <Link
                                        to="/verify"
                                        className="inline-flex items-center gap-1 rounded-md border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.03] px-2.5 py-1.5 font-medium hover:border-[#5D8A6B] hover:text-[#5D8A6B] transition-colors"
                                    >
                                        <span>Verifikasi Sertifikat</span>
                                        <ArrowUpRight className="h-3 w-3" />
                                    </Link>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Right Column (7 Cols): Revamped Message Form */}
                    <div className="lg:col-span-7">
                        <div className="tnl-card p-6 sm:p-8" data-testid="contact-form-container">
                            <div className="border-b border-black/10 dark:border-white/10 pb-6 mb-6">
                                <div className="inline-flex items-center gap-2 text-xs font-mono font-bold tracking-wider text-[#5D8A6B] dark:text-[#8AB597] uppercase">
                                    <Send className="h-3.5 w-3.5" aria-hidden="true" />
                                    <span>{isId ? "FORMULIR PESAN RESMI" : "OFFICIAL DIRECT INQUIRY"}</span>
                                </div>
                                <h2 className="mt-2 text-2xl font-bold tracking-tight text-[var(--tnl-heading)]">
                                    {isId ? "Kirim Pesan Langsung" : "Send a Direct Message"}
                                </h2>
                                <p className="mt-1.5 text-sm text-[var(--tnl-body)]">
                                    {isId
                                        ? "Sampaikan pesan Anda langsung ke meja administrasi laboratorium. Kami akan merespon melalui email resmi."
                                        : "Direct your message straight to the laboratory administrative desk. We reply via official lab email."}
                                </p>

                                {/* Quick Topic Pills */}
                                <div className="mt-5">
                                    <label className="block text-xs font-semibold text-[var(--tnl-tan-text)] uppercase tracking-wider mb-2.5">
                                        {isId ? "Pilih Topik Cepat (Opsional)" : "Quick Topic Selection (Optional)"}
                                    </label>
                                    <div className="flex flex-wrap gap-2" role="group" aria-label="Topic Pills">
                                        {TOPIC_PILLS.map((pill) => {
                                            const label = isId ? pill.label_id : pill.label_en;
                                            const isSelected = activePill === pill.id;
                                            return (
                                                <button
                                                    key={pill.id}
                                                    type="button"
                                                    onClick={() => handleSelectPill(pill)}
                                                    className={`inline-flex min-h-[36px] items-center rounded-full px-3.5 py-1.5 text-xs font-medium transition-all ${
                                                        isSelected
                                                            ? "bg-[#223027] text-white dark:bg-[#7EA88B] dark:text-[#111613] shadow-sm font-semibold"
                                                            : "border border-black/10 dark:border-white/15 bg-black/[0.02] dark:bg-white/[0.04] text-[var(--tnl-body)] hover:border-[#5D8A6B] hover:text-[var(--tnl-heading)]"
                                                    }`}
                                                    data-testid={`topic-pill-${pill.id}`}
                                                >
                                                    {label}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>

                            {done ? (
                                <div
                                    className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-8 text-center space-y-4 animate-fade-in"
                                    data-testid="contact-form-success"
                                >
                                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                                        <CheckCircle2 className="h-8 w-8" aria-hidden="true" />
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-bold text-[var(--tnl-heading)]">
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
                                        className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[var(--tnl-heading)] px-5 py-2.5 text-xs font-bold text-[var(--background)] transition-opacity hover:opacity-90"
                                        data-testid="send-another-message-button"
                                    >
                                        <span>{isId ? "Kirim Pesan Lain" : "Send Another Message"}</span>
                                    </button>
                                </div>
                            ) : (
                                <form onSubmit={onSubmit} className="space-y-5" noValidate data-testid="contact-form">
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
                                            <label htmlFor="contact-name" className="mb-1.5 block text-sm font-semibold text-[var(--tnl-heading)]">
                                                {isId ? "Nama Lengkap" : "Full Name"}{" "}
                                                <span className="text-rose-500">*</span>
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
                                                className="tnl-field min-h-[44px]"
                                                required
                                                data-testid="contact-name-input"
                                            />
                                            {errors.name ? (
                                                <p className="mt-1 text-xs font-medium text-rose-500" data-testid="contact-name-error">
                                                    {errors.name}
                                                </p>
                                            ) : null}
                                        </div>

                                        <div>
                                            <label htmlFor="contact-email" className="mb-1.5 block text-sm font-semibold text-[var(--tnl-heading)]">
                                                {isId ? "Email Resmi / Institusi" : "Official / Personal Email"}{" "}
                                                <span className="text-rose-500">*</span>
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
                                                className="tnl-field min-h-[44px]"
                                                required
                                                data-testid="contact-email-input"
                                            />
                                            {errors.email ? (
                                                <p className="mt-1 text-xs font-medium text-rose-500" data-testid="contact-email-error">
                                                    {errors.email}
                                                </p>
                                            ) : null}
                                        </div>
                                    </div>

                                    {/* Subject */}
                                    <div>
                                        <label htmlFor="contact-subject" className="mb-1.5 block text-sm font-semibold text-[var(--tnl-heading)]">
                                            {isId ? "Subjek Pesan" : "Subject"}{" "}
                                            <span className="text-rose-500">*</span>
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
                                            className="tnl-field min-h-[44px]"
                                            required
                                            data-testid="contact-subject-input"
                                        />
                                        {errors.subject ? (
                                            <p className="mt-1 text-xs font-medium text-rose-500" data-testid="contact-subject-error">
                                                {errors.subject}
                                            </p>
                                        ) : null}
                                    </div>

                                    {/* Message */}
                                    <div>
                                        <label htmlFor="contact-message" className="mb-1.5 block text-sm font-semibold text-[var(--tnl-heading)]">
                                            {isId ? "Isi Pesan" : "Message Body"}{" "}
                                            <span className="text-rose-500">*</span>
                                        </label>
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
                                            className="tnl-field"
                                            required
                                            data-testid="contact-message-input"
                                        />
                                        {errors.message ? (
                                            <p className="mt-1 text-xs font-medium text-rose-500" data-testid="contact-message-error">
                                                {errors.message}
                                            </p>
                                        ) : null}
                                    </div>

                                    {/* UU PDP Consent Checkbox */}
                                    <div className="rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02] p-4">
                                        <div className="flex items-start gap-3">
                                            <input
                                                id="contact-pdp-consent"
                                                type="checkbox"
                                                checked={consent}
                                                onChange={(e) => {
                                                    setConsent(e.target.checked);
                                                    if (errors.consent) setErrors((prev) => ({ ...prev, consent: "" }));
                                                }}
                                                className="mt-1 h-4 w-4 rounded border-gray-300 text-[#5D8A6B] focus:ring-[#5D8A6B]"
                                                data-testid="contact-pdp-consent-checkbox"
                                            />
                                            <label htmlFor="contact-pdp-consent" className="text-xs leading-relaxed text-[var(--tnl-body)]">
                                                {isId ? (
                                                    <>
                                                        Saya menyetujui pemrosesan data pribadi ini untuk keperluan korespondensi resmi
                                                        sesuai dengan ketentuan <strong>UU PDP No. 27/2022</strong> dan{" "}
                                                        <Link to="/privacy" className="text-[#5D8A6B] dark:text-[#8AB597] underline hover:opacity-80">
                                                            Kebijakan Privasi
                                                        </Link>{" "}
                                                        Lab TNL ITS.
                                                    </>
                                                ) : (
                                                    <>
                                                        I consent to the processing of this personal data for official correspondence in
                                                        compliance with <strong>Indonesian PDP Law No. 27/2022</strong> and the Lab TNL ITS{" "}
                                                        <Link to="/privacy" className="text-[#5D8A6B] dark:text-[#8AB597] underline hover:opacity-80">
                                                            Privacy Policy
                                                        </Link>
                                                        .
                                                    </>
                                                )}
                                            </label>
                                        </div>
                                        {errors.consent ? (
                                            <p className="mt-2 text-xs font-medium text-rose-500 pl-7" data-testid="contact-consent-error">
                                                {errors.consent}
                                            </p>
                                        ) : null}
                                    </div>

                                    {/* Submit Button */}
                                    <button
                                        type="submit"
                                        disabled={sending}
                                        className="tnl-btn tnl-btn-primary w-full min-h-[46px] text-sm font-bold flex items-center justify-center gap-2"
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

                {/* 3. Interactive Campus Map Section (Full-Width) */}
                <section className="mt-14" data-testid="contact-map-section">
                    <div className="tnl-card overflow-hidden p-0 border border-black/10 dark:border-white/10 shadow-lg">
                        {/* Map Header */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-black/10 dark:border-white/10 p-6 bg-black/[0.01] dark:bg-white/[0.02]">
                            <div>
                                <span className="text-[11px] font-mono font-bold uppercase tracking-widest text-[#5D8A6B] dark:text-[#8AB597]">
                                    INTERACTIVE LOCATION · GEDUNG B, B-301
                                </span>
                                <h3 className="text-xl font-bold tracking-tight text-[var(--tnl-heading)] mt-1">
                                    {isId ? "Kunjungi Ruang B-301" : "Visit Room B-301"}
                                </h3>
                                <p className="text-xs text-[var(--tnl-body)] mt-0.5">
                                    Lantai 3, Gedung B Departemen Teknik Elektro FTEIC ITS Surabaya
                                </p>
                            </div>

                            {/* Direct Action Buttons */}
                            <div className="flex flex-wrap items-center gap-2.5">
                                <a
                                    href="https://maps.google.com/maps?q=Departemen+Teknik+Elektro+ITS+Surabaya"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-black/10 dark:border-white/15 bg-white dark:bg-[#1C2821] px-3.5 py-2 text-xs font-semibold text-[var(--tnl-heading)] shadow-sm transition-all hover:bg-black/[0.04] dark:hover:bg-white/[0.08]"
                                    data-testid="map-open-google-maps"
                                >
                                    <span>Buka di Google Maps</span>
                                    <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                                </a>
                                <a
                                    href="https://www.google.com/maps/dir/?api=1&destination=Departemen+Teknik+Elektro+ITS+Surabaya"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-[#223027] dark:bg-[#7EA88B] px-3.5 py-2 text-xs font-semibold text-white dark:text-[#111613] shadow-sm transition-all hover:opacity-90"
                                    data-testid="map-get-directions"
                                >
                                    <Navigation className="h-3.5 w-3.5" aria-hidden="true" />
                                    <span>{isId ? "Petunjuk Arah" : "Get Directions"}</span>
                                </a>
                            </div>
                        </div>

                        {/* Interactive Google Maps Embed Container */}
                        <div className="relative w-full overflow-hidden bg-slate-100 dark:bg-slate-900">
                            <iframe
                                src="https://maps.google.com/maps?q=Departemen+Teknik+Elektro+ITS+Surabaya&t=&z=17&ie=UTF8&iwloc=&output=embed"
                                title="Lokasi Laboratorium Jaringan Telekomunikasi ITS - Gedung B Ruang B-301"
                                className="w-full h-[380px] md:h-[460px] border-0 dark:brightness-90 dark:contrast-105 transition-all duration-300"
                                loading="lazy"
                                allowFullScreen
                                referrerPolicy="no-referrer-when-downgrade"
                                data-testid="google-maps-iframe"
                            />

                            {/* Floating Non-Blocking Info Badge */}
                            <div className="pointer-events-none absolute bottom-4 left-4 z-10 hidden sm:flex items-center gap-2 rounded-xl border border-black/10 dark:border-white/15 bg-white/90 dark:bg-[#111613]/90 px-3.5 py-2 text-xs font-medium text-[var(--tnl-heading)] shadow-md backdrop-blur-md">
                                <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                                <span>Ruang B-301 · Lantai 3 Gedung B, Teknik Elektro ITS</span>
                            </div>
                        </div>
                    </div>
                </section>
            </main>
        </div>
    );
}
