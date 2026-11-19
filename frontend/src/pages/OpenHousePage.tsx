import { useState, useId } from "react";
import { Link } from "react-router-dom";
import {
    Calendar,
    MapPin,
    Users,
    Instagram,
    CheckCircle2,
    UploadCloud,
    ArrowRight,
    Sparkles,
    AlertCircle,
    Info,
} from "lucide-react";
import { useEvent, useSubmitRegistration } from "@/lib/hooks";
import { useLocale, pick } from "@/lib/i18n";
import { toast } from "sonner";
import { FadeCarousel } from "@/components/site/MediaCarousel";

const BATCH_OPTIONS = ["2023", "2024", "2025", "2026"];

export default function OpenHousePage() {
    const { locale } = useLocale();
    const eventSlug = "open-house-tnl";
    const { data: event, isLoading: eventLoading } = useEvent(eventSlug);
    const submitRegistration = useSubmitRegistration(event?.id ?? eventSlug);

    const [fullName, setFullName] = useState("");
    const [nrp, setNrp] = useState("");
    const [batch, setBatch] = useState("2024");
    const [motivation, setMotivation] = useState("");
    const [igFile, setIgFile] = useState<File | null>(null);
    const [consent, setConsent] = useState(true);
    const [submittedData, setSubmittedData] = useState<{ name: string; nrp: string; batch: string } | null>(null);

    const fullNameId = useId();
    const nrpId = useId();
    const batchId = useId();
    const motivationId = useId();
    const igFileId = useId();
    const consentId = useId();

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
            toast.error("Wajib mengunggah bukti follow Instagram @tnllab_its.");
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
        formData.append("f_bukti-follow-instagram-tnllab-its", igFile);

        try {
            await submitRegistration.mutateAsync(formData);
            setSubmittedData({
                name: fullName.trim(),
                nrp: cleanNrp,
                batch,
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
        <div className="min-h-screen bg-[#FBFBFA] dark:bg-[#0C100E] text-[#111613] dark:text-[#F4F4F0] transition-colors duration-200">
            {/* Top Atmospheric Hero */}
            <section className="relative overflow-hidden border-b border-black/5 dark:border-white/10 bg-gradient-to-b from-[#EFEFEA] to-[#FBFBFA] dark:from-[#111613] dark:to-[#0C100E] pt-14 pb-16 lg:pt-20 lg:pb-24">
                <div
                    aria-hidden="true"
                    className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 h-[500px] w-[800px] rounded-full bg-[#5D8A6B]/15 blur-3xl dark:bg-[#43594A]/20"
                />

                <div className="tnl-container max-w-6xl px-6 lg:px-8 relative z-10">
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-center">
                        <div className="lg:col-span-7 space-y-6">
                            <div className="inline-flex items-center gap-2 rounded-full border border-[#A8977B]/40 bg-[#A8977B]/10 px-3.5 py-1 text-xs font-bold tracking-widest text-[#7F715C] dark:text-[#C4B393] uppercase">
                                <Sparkles className="h-3.5 w-3.5" />
                                <span>OPEN HOUSE 2026 · LIVE SYNC</span>
                            </div>

                            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-[1.08] text-[#111613] dark:text-[#F4F4F0]">
                                {title}
                            </h1>

                            <p className="text-base sm:text-lg text-[#555E58] dark:text-[#B8C0BA] leading-relaxed max-w-2xl">
                                {description}
                            </p>

                            {/* Meta Badges */}
                            <div className="flex flex-wrap items-center gap-4 text-xs sm:text-sm font-medium text-[#444E48] dark:text-[#D1D5DB]">
                                <span className="inline-flex items-center gap-2 rounded-lg bg-black/5 dark:bg-white/5 px-3 py-1.5 border border-black/5 dark:border-white/10">
                                    <MapPin className="h-4 w-4 text-[#A8977B]" />
                                    <span>Ruang B-301, Teknik Elektro ITS</span>
                                </span>
                                <span className="inline-flex items-center gap-2 rounded-lg bg-black/5 dark:bg-white/5 px-3 py-1.5 border border-black/5 dark:border-white/10">
                                    <Users className="h-4 w-4 text-[#A8977B]" />
                                    <span>Terbuka Mahasiswa Baru & Aktif</span>
                                </span>
                                <span className="inline-flex items-center gap-2 rounded-lg bg-[#5D8A6B]/15 text-[#2E583A] dark:text-[#8AB597] px-3 py-1.5 border border-[#5D8A6B]/30 font-semibold">
                                    <CheckCircle2 className="h-4 w-4" />
                                    <span>Gratis / Pendaftaran Terbuka</span>
                                </span>
                            </div>

                            <div className="pt-2">
                                <a
                                    href="#form-section"
                                    className="inline-flex items-center gap-2 rounded-xl bg-[#223027] dark:bg-[#A8977B] px-6 py-3.5 text-sm font-semibold text-white dark:text-[#111613] shadow-md transition-all hover:bg-[#35483B] dark:hover:bg-[#C2B091]"
                                >
                                    <span>Isi Formulir Pendaftaran</span>
                                    <ArrowRight className="h-4 w-4" />
                                </a>
                            </div>
                        </div>

                        {/* Interactive Gallery Preview */}
                        <div className="lg:col-span-5">
                            <div className="relative rounded-2xl border border-black/10 dark:border-white/10 p-2 bg-white/40 dark:bg-black/20 backdrop-blur-md shadow-2xl">
                                <FadeCarousel
                                    images={galleryImages}
                                    aspectRatio="aspect-[4/3]"
                                    className="rounded-xl"
                                />
                                <div className="mt-2 text-center text-xs text-[#7F715C] dark:text-[#A8977B] font-medium">
                                    Suasana Fasilitas & Testbed Ruang B-301
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Registration Form Section */}
            <section id="form-section" className="py-16 lg:py-24">
                <div className="tnl-container max-w-3xl px-6 lg:px-8">
                    {submittedData ? (
                        <div className="rounded-2xl border border-[#5D8A6B]/40 bg-[#5D8A6B]/10 p-8 sm:p-12 text-center space-y-6 animate-fade-in">
                            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#5D8A6B] text-white shadow-lg">
                                <CheckCircle2 className="h-8 w-8" />
                            </div>

                            <div className="space-y-2">
                                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
                                    Pendaftaran Berhasil Diterima!
                                </h2>
                                <p className="text-sm sm:text-base text-[#555E58] dark:text-[#B8C0BA] max-w-lg mx-auto">
                                    Terima kasih, <strong className="text-current">{submittedData.name}</strong> (NRP: {submittedData.nrp}). Data pendaftaranmu telah tercatat dan otomatis disinkronkan ke lembar registrasi panitia.
                                </p>
                            </div>

                            <div className="rounded-xl border border-black/10 dark:border-white/10 bg-white/70 dark:bg-black/40 p-4 text-xs sm:text-sm text-left max-w-md mx-auto space-y-1.5">
                                <p><strong>Nama:</strong> {submittedData.name}</p>
                                <p><strong>NRP:</strong> {submittedData.nrp}</p>
                                <p><strong>Angkatan:</strong> {submittedData.batch}</p>
                                <p><strong>Lokasi:</strong> Ruang B-301, Gedung B Teknik Elektro ITS</p>
                                <p><strong>Email Notifikasi:</strong> {submittedData.nrp}@student.its.ac.id</p>
                            </div>

                            <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
                                <Link
                                    to="/activity"
                                    className="inline-flex items-center gap-2 rounded-lg bg-[#223027] dark:bg-[#A8977B] px-5 py-2.5 text-sm font-semibold text-white dark:text-[#111613]"
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
                    ) : (
                        <div className="rounded-3xl border border-black/10 dark:border-white/10 bg-white dark:bg-[#111613] p-8 sm:p-12 shadow-xl space-y-8">
                            <div className="space-y-2 border-b border-black/5 dark:border-white/10 pb-6">
                                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
                                    Formulir Pendaftaran Peserta
                                </h2>
                                <p className="text-sm text-[#555E58] dark:text-[#B8C0BA]">
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
                                        1. Nama Lengkap <span className="text-red-500">*</span>
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
                                        2. NRP (Nomor Registrasi Pokok) <span className="text-red-500">*</span>
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
                                    <p className="mt-1.5 text-xs text-[#7F715C] dark:text-[#9FA8A2]">
                                        Format angka NRP mahasiswa ITS (minimal 7 digit).
                                    </p>
                                </div>

                                {/* 3. Angkatan */}
                                <div>
                                    <label
                                        htmlFor={batchId}
                                        className="mb-2 block text-sm font-semibold tracking-wide"
                                    >
                                        3. Angkatan <span className="text-red-500">*</span>
                                    </label>
                                    <select
                                        id={batchId}
                                        value={batch}
                                        onChange={(e) => setBatch(e.target.value)}
                                        className="w-full rounded-xl border border-black/15 dark:border-white/15 bg-white dark:bg-[#111613] px-4 py-3 text-sm focus:border-[#A8977B] focus:outline-none focus:ring-1 focus:ring-[#A8977B]"
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
                                        4. Mengapa kamu tertarik untuk ikut Open House TNL? <span className="text-red-500">*</span>
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
                                    <div className="mt-1 flex items-center justify-between text-xs text-[#7F715C] dark:text-[#9FA8A2]">
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
                                        5. Bukti Follow Instagram @tnllab_its <span className="text-red-500">*</span>
                                    </label>

                                    {/* Direct Instagram Link Note */}
                                    <div className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-pink-500/10 via-purple-500/10 to-indigo-500/10 border border-purple-500/20 p-3 text-xs">
                                        <Instagram className="h-4 w-4 text-pink-500 shrink-0" />
                                        <span>
                                            Follow akun resmi kami di{" "}
                                            <a
                                                href="https://www.instagram.com/tnllab_its/"
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="font-bold underline text-pink-600 dark:text-pink-400 hover:text-pink-700"
                                            >
                                                @tnllab_its
                                            </a>{" "}
                                            lalu unggah tangkapan layar (screenshot) profilmu yang sedang follow.
                                        </span>
                                    </div>

                                    <div className="relative mt-2 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-black/15 dark:border-white/15 p-6 hover:border-[#A8977B] transition-colors bg-black/[0.01] dark:bg-white/[0.01]">
                                        <UploadCloud className="h-8 w-8 text-[#A8977B] mb-2" />
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
                                                <p className="text-sm font-semibold text-[#2E583A] dark:text-[#8AB597]">
                                                    ✓ {igFile.name}
                                                </p>
                                                <p className="text-xs text-[#7F715C] dark:text-[#9FA8A2]">
                                                    {(igFile.size / (1024 * 1024)).toFixed(2)} MB · Klik untuk mengganti
                                                </p>
                                            </div>
                                        ) : (
                                            <div className="text-center">
                                                <p className="text-sm font-medium">
                                                    Pilih atau seret screenshot bukti follow ke sini
                                                </p>
                                                <p className="text-xs text-[#7F715C] dark:text-[#9FA8A2]">
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
                                        className="mt-1 h-4 w-4 rounded border-gray-300 text-[#223027] focus:ring-[#A8977B]"
                                    />
                                    <label htmlFor={consentId} className="text-xs leading-relaxed text-[#555E58] dark:text-[#B8C0BA]">
                                        Saya menyetujui pemrosesan data diri (nama, NRP, dan kontak) oleh panitia Laboratorium Jaringan Telekomunikasi ITS semata-mata untuk verifikasi dan pelaksanaan kegiatan Open House sesuai ketentuan UU PDP.
                                    </label>
                                </div>

                                {/* Submit Button */}
                                <div>
                                    <button
                                        type="submit"
                                        disabled={submitRegistration.isPending}
                                        className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#223027] dark:bg-[#A8977B] px-8 py-4 text-base font-bold text-white dark:text-[#111613] shadow-lg transition-all hover:bg-[#35483B] dark:hover:bg-[#C2B091] disabled:opacity-50"
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
