import { useState, useId } from "react";
import "./utility-editorial.css";
import { Link } from "react-router-dom";
import {
    MapPin,
    Users,
    Instagram,
    CheckCircle2,
    UploadCloud,
    ArrowRight,
    MessageCircle,
    Copy,
    Check,
    Calendar,
    XCircle,
    Clock,
} from "lucide-react";
import { useEvent, useSubmitRegistration } from "@/lib/hooks";
import { useLocale, pick } from "@/lib/i18n";
import { toast } from "sonner";
import { FadeCarousel } from "@/components/site/MediaCarousel";
import { TnlLogo } from "@/components/site/TnlLogo";

const BATCH_OPTIONS = ["2023", "2024", "2025", "2026"];

export default function OpenHousePage() {
    const { locale } = useLocale();
    const eventSlug = "open-house-tnl";
    const { data: event } = useEvent(eventSlug);
    const submitRegistration = useSubmitRegistration(event?.id ?? eventSlug);

    const [fullName, setFullName] = useState("");
    const [nrp, setNrp] = useState("");
    const [batch, setBatch] = useState("2024");
    const [motivation, setMotivation] = useState("");
    const [igFile, setIgFile] = useState<File | null>(null);
    const [consent, setConsent] = useState(true);
    const [submittedData, setSubmittedData] = useState<{
        name: string;
        nrp: string;
        batch: string;
        whatsapp_group_url?: string;
    } | null>(null);
    const [copiedWa, setCopiedWa] = useState(false);

    const handleCopyWa = async (url: string) => {
        try {
            await navigator.clipboard.writeText(url);
            setCopiedWa(true);
            toast.success("Tautan grup WhatsApp berhasil disalin!");
            setTimeout(() => setCopiedWa(false), 2000);
        } catch {
            toast.error("Gagal menyalin tautan.");
        }
    };

    const fullNameId = useId();
    const nrpId = useId();
    const batchId = useId();
    const motivationId = useId();
    const igFileId = useId();
    const consentId = useId();

    const capacity = event?.capacity ?? 30;
    const registeredCount = event?.registered_count ?? 1;
    const spotsLeft = typeof event?.seats_left === "number" ? event.seats_left : Math.max(0, capacity - registeredCount);
    const isClosed = Boolean(
        event?.registration_closed ||
        event?.is_full ||
        event?.reg_status === "full" ||
        event?.reg_status === "closed" ||
        event?.reg_status === "past"
    );

    const title = event
        ? pick(locale, event.title, event.title_id)
        : "Open House Laboratorium TNL 2026";
    const description = event
        ? pick(locale, event.description, event.description_id)
        : "Kunjungi dan kenali lebih dekat fasilitas riset, testbed 5G & serat optik di Ruang B-301, serta temui langsung dosen dan asisten Laboratorium Jaringan Telekomunikasi.";

    const galleryImages = event?.gallery_images?.length
        ? event.gallery_images
        : [
              "/api/media-files/illustrative/hero-network-rack.jpg",
              "/api/media-files/illustrative/fiber-patch-panel.jpg",
              "/api/media-files/illustrative/switch-ports.jpg",
              "/api/media-files/illustrative/sdr-spectrum-lab.jpg",
          ];

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        const cleanNrp = nrp.replace(/\D/g, "");
        if (cleanNrp.length < 7) {
            toast.error("Format NRP tidak valid. Minimal 7 digit angka.");
            return;
        }

        if (motivation.trim().length < 15) {
            toast.error("Alasan/motivasi minimal 15 karakter.");
            return;
        }

        if (!igFile) {
            toast.error("Wajib mengunggah bukti follow Instagram @tnlab_its.");
            return;
        }

        if (!consent) {
            toast.error("Persetujuan pemrosesan data (UU PDP) wajib dicentang.");
            return;
        }

        const formData = new FormData();
        formData.append("consent", "1");
        formData.append("f_nama-lengkap", fullName.trim());
        formData.append("f_nrp-nomor-registrasi-pokok", cleanNrp);
        formData.append("f_angkatan", batch);
        formData.append("f_mengapa-kamu-tertarik-untuk-ikut-open-house-tnl", motivation.trim());
        formData.append("f_bukti-follow-instagram-tnlab-its", igFile);

        try {
            const resp = (await submitRegistration.mutateAsync(formData)) as { whatsapp_group_url?: string } | null;
            setSubmittedData({
                name: fullName.trim(),
                nrp: cleanNrp,
                batch,
                whatsapp_group_url: resp?.whatsapp_group_url,
            });
            toast.success("Pendaftaran Open House berhasil terkirim!");
        } catch (err: any) {
            const msg =
                err?.response?.data?.detail?.message ||
                (typeof err?.response?.data?.detail === "string" ? err.response.data.detail : "") ||
                err?.message ||
                "Gagal mengirim pendaftaran. Silakan periksa formulir Anda.";
            toast.error(msg);
        }
    };

    return (
        <div className="utility-editorial open-house-editorial">
            <section className="utility-masthead">


                <div className="tnl-container max-w-6xl px-6 lg:px-8 relative z-10">
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-center">
                        <div className="lg:col-span-7 space-y-6">
                            <div className="flex flex-wrap items-center gap-3">
                                <TnlLogo variant="auto" className="h-9 w-9" />
                                <div className="utility-kicker">
                                    <span>OPEN HOUSE / TNL · ITS</span>
                                </div>
                            </div>

                            <h1 className="utility-title">
                                {title}
                            </h1>

                            <p className="text-base sm:text-lg text-[var(--tnl-body)] leading-relaxed max-w-2xl">
                                {description}
                            </p>

                            {/* Meta Badges */}
                            <div className="open-house-facts flex flex-wrap items-center gap-2.5">
                                <span className="inline-flex items-center gap-2 rounded-lg bg-black/5 dark:bg-white/5 px-3 py-1.5 border border-black/5 dark:border-white/10 text-xs">
                                    <MapPin className="h-4 w-4 text-[var(--tnl-body)]" />
                                    <span>Ruang B-301, Teknik Elektro ITS</span>
                                </span>
                                <span className="inline-flex items-center gap-2 rounded-lg bg-black/5 dark:bg-white/5 px-3 py-1.5 border border-black/5 dark:border-white/10 text-xs">
                                    <Calendar className="h-4 w-4 text-[var(--tnl-body)]" />
                                    <span>{locale === "id" ? "Sabtu, 28 November 2026" : "Saturday, 28 November 2026"}</span>
                                </span>
                                <span className="inline-flex items-center gap-2 rounded-lg bg-black/5 dark:bg-white/5 px-3 py-1.5 border border-black/5 dark:border-white/10 text-xs">
                                    <Users className="h-4 w-4 text-[var(--tnl-body)]" />
                                    <span>Terbuka Mahasiswa Baru & Aktif</span>
                                </span>
                                {isClosed ? (
                                    <span className="inline-flex items-center gap-2 rounded-lg bg-red-500/10 text-red-600 dark:text-red-400 px-3 py-1.5 border border-red-500/20 font-semibold text-xs" data-testid="open-house-status-closed">
                                        <XCircle className="h-4 w-4" />
                                        <span>
                                            {event?.is_full || event?.reg_status === "full"
                                                ? (locale === "id" ? `KUOTA PENUH (${capacity}/${capacity})` : `QUOTA FULL (${capacity}/${capacity})`)
                                                : (locale === "id" ? "PENDAFTARAN DITUTUP" : "REGISTRATION CLOSED")}
                                        </span>
                                    </span>
                                ) : (
                                    <span className="inline-flex items-center gap-2 rounded-lg bg-[var(--gsm-bg-elevated)] text-[var(--gsm-emerald)] px-3 py-1.5 border border-[var(--gsm-emerald)] font-semibold text-xs" data-testid="open-house-status-open">
                                        <CheckCircle2 className="h-4 w-4" />
                                        <span>
                                            {locale === "id"
                                                ? `Pendaftaran Terbuka · Sisa ${spotsLeft} Kursi`
                                                : `Registration Open · ${spotsLeft} Spots Left`}
                                        </span>
                                    </span>
                                )}
                            </div>

                            <p className="text-xs text-[var(--tnl-body)] italic">
                                {locale === "id"
                                    ? `Ditutup otomatis saat kuota ${capacity} peserta terpenuhi.`
                                    : `Automatically closes once all ${capacity} spots are filled.`}
                            </p>

                            <div className="pt-2">
                                {isClosed ? (
                                    <a
                                        href="#form-section"
                                        className="utility-button opacity-75"
                                    >
                                        <span>{locale === "id" ? "Pendaftaran Telah Ditutup" : "Registration Closed"}</span>
                                    </a>
                                ) : (
                                    <a
                                        href="#form-section"
                                        className="utility-button utility-button-primary"
                                    >
                                        <span>Isi Formulir Pendaftaran</span>
                                        <ArrowRight className="h-4 w-4" />
                                    </a>
                                )}
                            </div>
                        </div>

                        {/* Interactive Gallery Preview */}
                        <div className="lg:col-span-5">
                            <div className="open-house-figure">
                                <FadeCarousel
                                    images={galleryImages}
                                    aspectRatio="aspect-[4/3]"
                                    className="open-house-media"
                                />
                                <div className="mt-2 text-center text-xs text-[var(--tnl-body)] font-medium">
                                    Suasana Fasilitas & Testbed Ruang B-301
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Registration Form Section */}
            <section id="form-section" aria-label={submittedData ? "Pendaftaran Berhasil Diterima" : "Formulir Pendaftaran Peserta"} className="utility-section">
                <div className="tnl-container open-house-registration">
                    {submittedData ? (
                        <div role="status" className="open-house-success space-y-6">
                            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[var(--gsm-bg-elevated)] text-[var(--tnl-heading)] shadow-lg">
                                <CheckCircle2 className="h-8 w-8" />
                            </div>

                            <div className="space-y-2">
                                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
                                    Pendaftaran Berhasil Diterima!
                                </h2>
                                <p className="text-sm sm:text-base text-[var(--tnl-body)] max-w-lg mx-auto">
                                    Terima kasih, <strong className="text-current">{submittedData.name}</strong> (NRP: {submittedData.nrp}). Data pendaftaranmu telah tercatat dan otomatis disinkronkan ke lembar registrasi panitia.
                                </p>
                            </div>

                            <div className="rounded-xl border border-black/10 dark:border-white/10 bg-[var(--gsm-bg-elevated)] p-4 text-xs sm:text-sm text-left max-w-md mx-auto space-y-1.5">
                                <p><strong>Nama:</strong> {submittedData.name}</p>
                                <p><strong>NRP:</strong> {submittedData.nrp}</p>
                                <p><strong>Angkatan:</strong> {submittedData.batch}</p>
                                <p><strong>Lokasi:</strong> Ruang B-301, Gedung B Teknik Elektro ITS</p>
                                <p><strong>Email Notifikasi:</strong> {submittedData.nrp}@student.its.ac.id</p>
                            </div>

                            {submittedData.whatsapp_group_url ? (
                                <div
                                    className="rounded-xl border border-[var(--gsm-emerald)] bg-[var(--gsm-bg-elevated)] p-5 text-left max-w-md mx-auto space-y-3"
                                    data-testid="open-house-wa-group-card"
                                >
                                    <div className="flex items-start gap-3">
                                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--gsm-bg-elevated)] text-[var(--tnl-heading)] shadow-sm">
                                            <MessageCircle className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <h3 className="text-sm font-bold text-[var(--tnl-body)]">
                                                {locale === "id"
                                                    ? "Langkah Terakhir: Gabung Grup WhatsApp Peserta"
                                                    : "Final Step: Join the Participant WhatsApp Group"}
                                            </h3>
                                            <p className="mt-1 text-xs text-[var(--tnl-body)] leading-relaxed">
                                                {locale === "id"
                                                    ? "Seluruh pengumuman jadwal, ruang praktikum, dan panduan teknis Open House akan dibagikan melalui grup resmi peserta."
                                                    : "All schedule updates, room instructions, and Open House technical guides will be shared in the official participant group."}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
                                        <a
                                            href={submittedData.whatsapp_group_url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="utility-button utility-button-primary"
                                            data-testid="open-house-wa-group-join-button"
                                        >
                                            <span>{locale === "id" ? "Gabung Grup WhatsApp Sekarang ↗" : "Join WhatsApp Group Now ↗"}</span>
                                        </a>
                                        <button
                                            type="button"
                                            onClick={() => handleCopyWa(submittedData.whatsapp_group_url!)}
                                            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[var(--gsm-emerald)] bg-[var(--gsm-bg-elevated)] px-3 py-2 text-xs font-semibold text-[var(--tnl-body)] hover:bg-[var(--gsm-bg-recessed-hover)] transition-colors"
                                            data-testid="open-house-wa-group-copy-button"
                                        >
                                            {copiedWa ? (
                                                <>
                                                    <Check className="h-3.5 w-3.5 text-[var(--tnl-body)]" />
                                                    <span>{locale === "id" ? "Tersalin!" : "Copied!"}</span>
                                                </>
                                            ) : (
                                                <>
                                                    <Copy className="h-3.5 w-3.5" />
                                                    <span>{locale === "id" ? "Salin Tautan Grup" : "Copy Group Link"}</span>
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            ) : null}

                            <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
                                <Link
                                    to="/activity"
                                    className="utility-button"
                                >
                                    <span>Jelajahi Kegiatan Lab</span>
                                    <ArrowRight className="h-4 w-4" />
                                </Link>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSubmittedData(null);
                                        setFullName("");
                                        setNrp("");
                                        setMotivation("");
                                        setIgFile(null);
                                    }}
                                    className="rounded-lg border border-black/15 dark:border-white/15 px-4 py-2 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/5"
                                >
                                    Daftar Lagi untuk Rekan
                                </button>
                            </div>
                        </div>
                    ) : isClosed ? (
                        <div role="status" className="open-house-success space-y-6 max-w-xl mx-auto py-8 text-center" data-testid="open-house-closed-banner">
                            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10 text-red-600 dark:text-red-400 shadow-md">
                                <XCircle className="h-8 w-8" />
                            </div>
                            <div className="space-y-2">
                                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
                                    {locale === "id" ? "Pendaftaran Telah Ditutup" : "Registration Closed"}
                                </h2>
                                <p className="text-sm sm:text-base text-[var(--tnl-body)] max-w-lg mx-auto leading-relaxed">
                                    {event?.is_full || event?.reg_status === "full"
                                        ? (locale === "id"
                                            ? `Terima kasih atas antusiasme rekan-rekan mahasiswa. Kuota sebanyak ${capacity} peserta untuk Open House Laboratorium TNL 2026 telah terpenuhi.`
                                            : `Thank you for the high enthusiasm. All ${capacity} participant spots for Open House TNL 2026 have been filled.`)
                                        : (locale === "id"
                                            ? "Batas waktu pendaftaran untuk kegiatan Open House telah berakhir."
                                            : "The registration period for this Open House has ended.")}
                                </p>
                            </div>
                            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                                <a
                                    href="https://www.instagram.com/tnlab_its/"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="utility-button utility-button-primary"
                                >
                                    <Instagram className="h-4 w-4 mr-1.5" />
                                    <span>{locale === "id" ? "Ikuti Instagram @tnlab_its" : "Follow @tnlab_its on Instagram"}</span>
                                </a>
                                <Link to="/contact" className="utility-button">
                                    <span>{locale === "id" ? "Hubungi Panitia Lab" : "Contact Lab Team"}</span>
                                </Link>
                                <Link to="/activity" className="utility-button">
                                    <span>{locale === "id" ? "Jelajahi Kegiatan Lain" : "Explore Other Activities"}</span>
                                </Link>
                            </div>
                        </div>
                    ) : (
                        <div className="open-house-form space-y-8">
                            <div className="space-y-2 border-b border-black/5 dark:border-white/10 pb-6">
                                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
                                    Formulir Pendaftaran Peserta
                                </h2>
                                <p className="text-sm text-[var(--tnl-body)]">
                                    Lengkapi 5 data wajib di bawah ini. Pendaftaran otomatis terhubung secara real-time dengan Google Spreadsheet panitia.
                                </p>
                            </div>

                            <form onSubmit={handleSubmit} className="space-y-6">
                                {/* 1. Nama Lengkap */}
                                <div>
                                    <label
                                        htmlFor={fullNameId}
                                        className="mb-2 block text-sm font-semibold tracking-wide"
                                    >
                                        1. Nama Lengkap <span className="text-[var(--tnl-body)]">*</span>
                                    </label>
                                    <input
                                        id={fullNameId}
                                        type="text"
                                        required
                                        autoComplete="name"
                                        value={fullName}
                                        onChange={(e) => setFullName(e.target.value)}
                                        placeholder="cth. Bagas Dwi Prakoso"
                                        className="w-full rounded-xl border border-black/15 dark:border-white/15 bg-transparent px-4 py-3 text-sm focus:border-[#A8977B] focus:outline-none focus:ring-1 focus:ring-[#A8977B]"
                                    />
                                </div>

                                {/* 2. NRP */}
                                <div>
                                    <label
                                        htmlFor={nrpId}
                                        className="mb-2 block text-sm font-semibold tracking-wide"
                                    >
                                        2. NRP (Nomor Registrasi Pokok) <span className="text-[var(--tnl-body)]">*</span>
                                    </label>
                                    <input
                                        id={nrpId}
                                        type="text"
                                        required
                                        inputMode="numeric"
                                        value={nrp}
                                        onChange={(e) => setNrp(e.target.value)}
                                        placeholder="cth. 5022201045"
                                        className="w-full rounded-xl border border-black/15 dark:border-white/15 bg-transparent px-4 py-3 text-sm focus:border-[#A8977B] focus:outline-none focus:ring-1 focus:ring-[#A8977B]"
                                    />
                                    <p className="mt-1.5 text-xs text-[var(--tnl-body)]">
                                        Format angka NRP mahasiswa ITS (minimal 7 digit).
                                    </p>
                                </div>

                                {/* 3. Angkatan */}
                                <div>
                                    <label
                                        htmlFor={batchId}
                                        className="mb-2 block text-sm font-semibold tracking-wide"
                                    >
                                        3. Angkatan <span className="text-[var(--tnl-body)]">*</span>
                                    </label>
                                    <select
                                        id={batchId}
                                        value={batch}
                                        onChange={(e) => setBatch(e.target.value)}
                                        className="w-full rounded-xl border border-black/15 dark:border-white/15 bg-[var(--tnl-surface)] px-4 py-3 text-sm focus:border-[#A8977B] focus:outline-none focus:ring-1 focus:ring-[#A8977B]"
                                    >
                                        {BATCH_OPTIONS.map((opt) => (
                                            <option key={opt} value={opt}>
                                                Angkatan {opt}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                {/* 4. Motivasi */}
                                <div>
                                    <label
                                        htmlFor={motivationId}
                                        className="mb-2 block text-sm font-semibold tracking-wide"
                                    >
                                        4. Mengapa kamu tertarik untuk ikut Open House TNL? <span className="text-[var(--tnl-body)]">*</span>
                                    </label>
                                    <textarea
                                        id={motivationId}
                                        required
                                        rows={4}
                                        value={motivation}
                                        onChange={(e) => setMotivation(e.target.value)}
                                        placeholder="Ceritakan minatmu di bidang jaringan telekomunikasi, serat optik, SDR, atau ketertarikanmu menjadi asisten..."
                                        className="w-full rounded-xl border border-black/15 dark:border-white/15 bg-transparent px-4 py-3 text-sm focus:border-[#A8977B] focus:outline-none focus:ring-1 focus:ring-[#A8977B]"
                                    />
                                    <div className="mt-1 flex items-center justify-between text-xs text-[var(--tnl-body)]">
                                        <span>Minimal 15 karakter.</span>
                                        <span>{motivation.length} karakter</span>
                                    </div>
                                </div>

                                {/* 5. Bukti Follow IG */}
                                <div className="space-y-2">
                                    <label
                                        htmlFor={igFileId}
                                        className="block text-sm font-semibold tracking-wide"
                                    >
                                        5. Bukti Follow Instagram @tnlab_its <span className="text-[var(--tnl-body)]">*</span>
                                    </label>

                                    {/* Direct Instagram Link Note */}
                                    <div className="utility-note flex items-center gap-2 text-xs">
                                        <Instagram className="h-4 w-4 text-[var(--tnl-body)] shrink-0" />
                                        <span>
                                            Follow akun resmi kami di{" "}
                                            <a
                                                href="https://www.instagram.com/tnlab_its/"
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="font-bold underline text-[var(--tnl-body)] hover:text-[var(--tnl-body)]"
                                            >
                                                @tnlab_its
                                            </a>{" "}
                                            lalu unggah tangkapan layar (screenshot) profilmu yang sedang follow.
                                        </span>
                                    </div>

                                    <div className="relative mt-2 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-black/15 dark:border-white/15 p-6 hover:border-[#A8977B] transition-colors bg-black/[0.01] dark:bg-white/[0.01]">
                                        <UploadCloud className="h-8 w-8 text-[var(--tnl-body)] mb-2" />
                                        <input
                                            id={igFileId}
                                            type="file"
                                            required
                                            accept="image/jpeg,image/png,image/webp,image/jpg"
                                            onChange={(e) => setIgFile(e.target.files?.[0] || null)}
                                            className="absolute inset-0 opacity-0 cursor-pointer"
                                        />
                                        {igFile ? (
                                            <div className="text-center">
                                                <p className="text-sm font-semibold text-[var(--tnl-body)]">
                                                    ✓ {igFile.name}
                                                </p>
                                                <p className="text-xs text-[var(--tnl-body)]">
                                                    {(igFile.size / (1024 * 1024)).toFixed(2)} MB · Klik untuk mengganti
                                                </p>
                                            </div>
                                        ) : (
                                            <div className="text-center">
                                                <p className="text-sm font-medium">
                                                    Pilih atau seret screenshot bukti follow ke sini
                                                </p>
                                                <p className="text-xs text-[var(--tnl-body)]">
                                                    Format .JPG, .PNG, .WEBP (maks 5 MB)
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* UU PDP Consent */}
                                <div className="flex items-start gap-3 rounded-xl bg-black/5 dark:bg-white/5 p-4 border border-black/5 dark:border-white/10">
                                    <input
                                        id={consentId}
                                        type="checkbox"
                                        required
                                        checked={consent}
                                        onChange={(e) => setConsent(e.target.checked)}
                                        className="mt-1 h-4 w-4 rounded border-gray-300 text-[var(--tnl-body)] focus:ring-[#A8977B]"
                                    />
                                    <label htmlFor={consentId} className="text-xs leading-relaxed text-[var(--tnl-body)]">
                                        Saya menyetujui pemrosesan data diri (nama, NRP, dan kontak) oleh panitia Laboratorium Jaringan Telekomunikasi ITS semata-mata untuk verifikasi dan pelaksanaan kegiatan Open House sesuai ketentuan UU PDP.
                                    </label>
                                </div>

                                {/* Submit Button */}
                                <div>
                                    <button
                                        type="submit"
                                        disabled={submitRegistration.isPending}
                                        className="utility-button utility-button-primary w-full"
                                    >
                                        {submitRegistration.isPending ? (
                                            <span>Menyimpan & Mensinkronkan…</span>
                                        ) : (
                                            <>
                                                <span>Kirim Pendaftaran Open House</span>
                                                <ArrowRight className="h-5 w-5" />
                                            </>
                                        )}
                                    </button>
                                </div>
                            </form>
                        </div>
                    )}
                </div>
            </section>
        </div>
    );
}
