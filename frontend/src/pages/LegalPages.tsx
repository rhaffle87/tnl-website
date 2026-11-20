import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
    ArrowUpRight,
    CheckCircle2,
    Clock,
    Download,
    FileText,
    HelpCircle,
    Mail,
    Printer,
    Scale,
    Shield,
    ShieldCheck,
    Sparkles,
} from "lucide-react";
import { useLocale } from "@/lib/i18n";

export const POLICY_VERSION = "2026.1";
export const EFFECTIVE_DATE = "20 November 2026";
export const EFFECTIVE_DATE_EN = "November 20, 2026";

export function PrivacyPage() {
    const { locale } = useLocale();
    const isId = locale === "id";
    const [activeSection, setActiveSection] = useState<string>("sec-1");

    const sections = [
        { id: "sec-1", title_id: "1. Identitas Pengendali Data", title_en: "1. Data Controller Identity" },
        { id: "sec-2", title_id: "2. Ruang Lingkup & Jenis Data", title_en: "2. Scope & Categories of Data" },
        { id: "sec-3", title_id: "3. Dasar Pemrosesan & Tujuan", title_en: "3. Legal Basis & Purposes" },
        { id: "sec-4", title_id: "4. Penyimpanan Browser & Cookie", title_en: "4. Browser Storage & Cookies" },
        { id: "sec-5", title_id: "5. Pihak Ketiga & Pemroses Data", title_en: "5. Third Parties & Sub-processors" },
        { id: "sec-6", title_id: "6. Keamanan & Perlindungan Teknis", title_en: "6. Security & Technical Safeguards" },
        { id: "sec-7", title_id: "7. Masa Retensi & Cadangan", title_en: "7. Retention Period & Backups" },
        { id: "sec-8", title_id: "8. Hak Subjek Data & SLA 3×24 Jam", title_en: "8. Data Subject Rights & SLA" },
        { id: "sec-9", title_id: "9. Kerahasiaan & Akses Internal", title_en: "9. Internal Confidentiality" },
        { id: "sec-10", title_id: "10. Transfer Data Lintas Batas", title_en: "10. Cross-Border Data Transfer" },
        { id: "sec-11", title_id: "11. Privasi Usia & Mahasiswa", title_en: "11. Age & Student Privacy" },
        { id: "sec-12", title_id: "12. Pembaruan & Kontak Pengaduan", title_en: "12. Policy Updates & Contact" },
    ];

    const scrollToSection = (id: string) => {
        const el = document.getElementById(id);
        if (el) {
            el.scrollIntoView({ behavior: "smooth" });
            setActiveSection(id);
        }
    };

    useEffect(() => {
        const handleScroll = () => {
            const scrollPos = window.scrollY + 200;
            for (let i = sections.length - 1; i >= 0; i--) {
                const el = document.getElementById(sections[i].id);
                if (el && el.offsetTop <= scrollPos) {
                    setActiveSection(sections[i].id);
                    break;
                }
            }
        };
        window.addEventListener("scroll", handleScroll, { passive: true });
        return () => window.removeEventListener("scroll", handleScroll);
    }, []);

    return (
        <div data-testid="privacy-page" className="min-h-screen">
            {/* Hero Header */}
            <header className="tnl-hero-gradient relative border-b border-black/10 dark:border-white/10 py-12 md:py-16 overflow-hidden print:bg-none print:border-b-2 print:py-6">
                <div
                    aria-hidden="true"
                    className="pointer-events-none absolute -top-24 right-1/4 h-72 w-96 rounded-full bg-[#5D8A6B]/20 blur-3xl dark:bg-[#43594A]/25 print:hidden"
                />
                <div className="tnl-container relative z-10">
                    <div className="max-w-4xl">
                        {/* Eyebrow & Badges */}
                        <div className="flex flex-wrap items-center gap-2 text-xs font-mono font-bold tracking-widest uppercase">
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3.5 py-1 text-[#E6E8E6] backdrop-blur-md">
                                <ShieldCheck className="h-3.5 w-3.5 text-[#C4B393]" aria-hidden="true" />
                                <span>VERSI {POLICY_VERSION}</span>
                            </span>
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3.5 py-1 text-[#E6E8E6] backdrop-blur-md">
                                <Clock className="h-3.5 w-3.5 text-[#C4B393]" aria-hidden="true" />
                                <span>{isId ? `BERLAKU: ${EFFECTIVE_DATE}` : `EFFECTIVE: ${EFFECTIVE_DATE_EN}`}</span>
                            </span>
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-1 text-emerald-300 backdrop-blur-md">
                                <Scale className="h-3.5 w-3.5" aria-hidden="true" />
                                <span>UU PDP NO. 27/2022</span>
                            </span>
                        </div>

                        <h1 className="mt-4 text-3xl font-black tracking-tight text-white sm:text-5xl lg:text-6xl print:text-black">
                            {isId ? "Kebijakan Privasi" : "Privacy Policy"}
                        </h1>
                        <p className="mt-4 text-base leading-relaxed text-[#D1D5DB] sm:text-lg print:text-black">
                            {isId
                                ? "Keterbukaan lengkap tata kelola, pemrosesan, dan pelindungan data pribadi di Laboratorium Jaringan Telekomunikasi (TNL) Departemen Teknik Elektro FTEIC ITS sesuai amanat Undang-Undang No. 27 Tahun 2022 tentang Pelindungan Data Pribadi."
                                : "Comprehensive transparency on personal data governance, processing, and protection at the Telecommunication Network Laboratory (TNL), Department of Electrical Engineering FTEIC ITS in accordance with Indonesian Personal Data Protection Law No. 27/2022."}
                        </p>

                        {/* Action buttons */}
                        <div className="mt-8 flex flex-wrap items-center gap-3 print:hidden">
                            <button
                                type="button"
                                onClick={() => window.print()}
                                className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-xs font-bold text-white transition-all hover:bg-white/20 backdrop-blur-sm"
                                data-testid="print-privacy-button"
                            >
                                <Printer className="h-3.5 w-3.5" aria-hidden="true" />
                                <span>{isId ? "Cetak / Simpan PDF" : "Print / Save PDF"}</span>
                            </button>
                            <Link
                                to="/terms"
                                className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.05] px-4 py-2 text-xs font-bold text-[#D1D5DB] transition-all hover:text-white hover:bg-white/10"
                                data-testid="cross-link-terms"
                            >
                                <span>{isId ? "Lihat Ketentuan Penggunaan" : "View Terms of Use"}</span>
                                <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                            </Link>
                        </div>
                    </div>
                </div>
            </header>

            {/* Main Content Layout */}
            <main className="tnl-container py-12 md:py-16">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
                    {/* Sticky Left Sidebar (4 Columns) */}
                    <aside className="lg:col-span-4 lg:sticky lg:top-24 space-y-6 print:hidden">
                        {/* Table of Contents */}
                        <div className="tnl-card p-5 sm:p-6" data-testid="privacy-toc">
                            <span className="text-[11px] font-mono font-bold uppercase tracking-widest text-[var(--tnl-tan-text)]">
                                {isId ? "DAFTAR ISI KEBIJAKAN" : "TABLE OF CONTENTS"}
                            </span>
                            <nav className="mt-4 space-y-1 text-xs" aria-label="Privacy sections">
                                {sections.map((sec) => (
                                    <button
                                        key={sec.id}
                                        type="button"
                                        onClick={() => scrollToSection(sec.id)}
                                        className={`w-full text-left py-1.5 px-2.5 rounded-lg transition-colors flex items-center justify-between ${
                                            activeSection === sec.id
                                                ? "bg-[#5D8A6B]/15 text-[#2E583A] dark:text-[#8AB597] font-bold"
                                                : "text-[var(--tnl-body)] hover:bg-black/[0.03] dark:hover:bg-white/[0.04] hover:text-[var(--tnl-heading)]"
                                        }`}
                                        data-testid={`toc-link-${sec.id}`}
                                    >
                                        <span className="truncate">{isId ? sec.title_id : sec.title_en}</span>
                                        {activeSection === sec.id && <span className="h-1.5 w-1.5 rounded-full bg-[#5D8A6B] shrink-0 ml-2" />}
                                    </button>
                                ))}
                            </nav>
                        </div>

                        {/* Quick Highlights / TL;DR Card */}
                        <div className="tnl-card p-5 sm:p-6 space-y-3" data-testid="privacy-highlights">
                            <div className="flex items-center gap-2 text-xs font-mono font-bold text-[#5D8A6B] dark:text-[#8AB597] uppercase">
                                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                                <span>{isId ? "RINGKASAN CEPAT (TL;DR)" : "KEY HIGHLIGHTS"}</span>
                            </div>
                            <ul className="space-y-2.5 text-xs leading-relaxed text-[var(--tnl-body)]">
                                <li className="flex items-start gap-2">
                                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                                    <span>{isId ? "Prinsip minimisasi data: hanya mengumpulkan data yang esensial untuk kegiatan tridarma dan administrasi lab." : "Data minimisation: we only collect what is strictly necessary for academic activities."}</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                                    <span>{isId ? "Nol pelacak iklan: tidak memasang pixel iklan, cookie pemasaran pihak ketiga, atau pelacak lintas situs." : "Zero ad trackers: no marketing pixels, third-party advertising cookies, or cross-site tracking."}</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                                    <span>{isId ? "Cadangan terenkripsi dengan rotasi 14 hari: arsip cadangan otomatis server diputar dan dibersihkan berkala." : "Encrypted backups on 14-day safe rotation: server automated archives rotate and expire securely."}</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                                    <span>{isId ? "SLA Pemenuhan Hak 3×24 Jam: permohonan akses, perbaikan, atau penghapusan data diproses maks 3 hari kerja." : "3x24-hour SLA: requests for data access, rectification, or erasure processed within 3 workdays."}</span>
                                </li>
                            </ul>
                        </div>

                        {/* Privacy Help Card */}
                        <div className="tnl-card p-5 sm:p-6 space-y-3" data-testid="privacy-help-card">
                            <span className="text-[11px] font-mono font-bold uppercase tracking-widest text-[var(--tnl-tan-text)]">
                                {isId ? "KONTAK DATA PRIVASI" : "DATA PRIVACY DESK"}
                            </span>
                            <p className="text-xs text-[var(--tnl-body)]">
                                {isId
                                    ? "Ajukan permohonan hak subjek data atau konsultasi privasi langsung ke kanal resmi:"
                                    : "Submit data subject requests or privacy inquiries directly to our official desk:"}
                            </p>
                            <a
                                href="mailto:telconnetlab@gmail.com?subject=[Permintaan%20UU%20PDP]%20Hak%20Subjek%20Data"
                                className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.03] p-2.5 text-xs font-semibold hover:border-[#5D8A6B] hover:text-[#5D8A6B] transition-colors"
                            >
                                <Mail className="h-3.5 w-3.5" />
                                <span>telconnetlab@gmail.com</span>
                            </a>
                        </div>
                    </aside>

                    {/* Main Content Column (8 Columns) */}
                    <div className="lg:col-span-8 space-y-12 leading-relaxed text-[var(--tnl-body)]">
                        {/* Section 1 */}
                        <section id="sec-1" className="scroll-mt-28 space-y-4">
                            <div className="border-l-2 border-[#5D8A6B] pl-4">
                                <span className="text-xs font-mono font-bold text-[#5D8A6B] dark:text-[#8AB597] uppercase">PASAL 1 / SECTION 1</span>
                                <h2 className="text-2xl font-bold tracking-tight text-[var(--tnl-heading)]">
                                    {isId ? "Identitas Pengendali Data Pribadi" : "Identity of the Data Controller"}
                                </h2>
                            </div>
                            <p className="text-justify">
                                {isId ? (
                                    <>
                                        Berdasarkan ketentuan Pasal 1 angka 4 Undang-Undang Republik Indonesia Nomor 27 Tahun 2022
                                        tentang Pelindungan Data Pribadi (UU PDP), pihak yang bertindak sebagai <strong>Pengendali Data Pribadi</strong> atas
                                        seluruh data pribadi yang dikumpulkan dan diproses melalui situs web resmi <code>https://labtnl.site</code> adalah:
                                    </>
                                ) : (
                                    <>
                                        Under Article 1 paragraph 4 of Law of the Republic of Indonesia No. 27/2022 on Personal Data Protection (PDP Law),
                                        the designated <strong>Data Controller</strong> for personal data collected and processed via <code>https://labtnl.site</code> is:
                                    </>
                                )}
                            </p>
                            <div className="tnl-card p-5 space-y-2 text-sm bg-black/[0.01] dark:bg-white/[0.02]">
                                <p className="font-bold text-[var(--tnl-heading)]">Laboratorium Jaringan Telekomunikasi (TNL)</p>
                                <p>Departemen Teknik Elektro, Fakultas Teknologi Elektro dan Informatika Cerdas (FTEIC)</p>
                                <p>Institut Teknologi Sepuluh Nopember (ITS)</p>
                                <p>Gedung B, Ruang B-301, Kampus ITS Sukolilo, Surabaya 60111, Jawa Timur, Indonesia</p>
                                <p className="pt-2 text-xs font-mono text-[var(--tnl-tan-text)]">
                                    Kontak Resmi Tata Kelola Data: <strong>telconnetlab@gmail.com</strong>
                                </p>
                            </div>
                        </section>

                        {/* Section 2 */}
                        <section id="sec-2" className="scroll-mt-28 space-y-4">
                            <div className="border-l-2 border-[#5D8A6B] pl-4">
                                <span className="text-xs font-mono font-bold text-[#5D8A6B] dark:text-[#8AB597] uppercase">PASAL 2 / SECTION 2</span>
                                <h2 className="text-2xl font-bold tracking-tight text-[var(--tnl-heading)]">
                                    {isId ? "Ruang Lingkup & Jenis Data Pribadi yang Dikumpulkan" : "Scope & Categories of Personal Data Collected"}
                                </h2>
                            </div>
                            <p className="text-justify">
                                {isId
                                    ? "Kami menerapkan prinsip pembatasan tujuan dan minimisasi data secara ketat. Kami hanya memproses data pribadi yang relevan dan dibutuhkan sesuai konteks interaksi:"
                                    : "We apply strict purpose limitation and data minimisation principles. We only collect data directly relevant to your interactions with the laboratory:"}
                            </p>

                            <div className="overflow-x-auto tnl-card p-0 border border-black/10 dark:border-white/10">
                                <table className="w-full text-left text-xs border-collapse">
                                    <thead className="border-b border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.03]">
                                        <tr>
                                            <th className="py-3 px-4 font-bold text-[var(--tnl-heading)]">{isId ? "Konteks Interaksi" : "Interaction Context"}</th>
                                            <th className="py-3 px-4 font-bold text-[var(--tnl-heading)]">{isId ? "Kategori Data yang Dikumpulkan" : "Data Collected"}</th>
                                            <th className="py-3 px-4 font-bold text-[var(--tnl-heading)]">{isId ? "Tingkat Sensitivitas / Visibilitas" : "Sensitivity / Visibility"}</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-black/5 dark:divide-white/5">
                                        <tr>
                                            <td className="py-3 px-4 font-semibold text-[var(--tnl-heading)]">{isId ? "Pendaftaran Kegiatan (Open House / Pelatihan)" : "Event Registration"}</td>
                                            <td className="py-3 px-4">Nama lengkap, NRP/NIM, angkatan/jurusan, motivasi/alasan ketertarikan, unggahan bukti follow Instagram resmi <code>@tnlab_its</code>, stempel waktu persetujuan (<code>consent_timestamp</code>), dan versi kebijakan (<code>2026.1</code>).</td>
                                            <td className="py-3 px-4 text-emerald-700 dark:text-emerald-400 font-medium">{isId ? "Internal Panitia Terbatas" : "Restricted Internal Desk"}</td>
                                        </tr>
                                        <tr>
                                            <td className="py-3 px-4 font-semibold text-[var(--tnl-heading)]">{isId ? "Formulir Kontak (/contact)" : "Contact Form"}</td>
                                            <td className="py-3 px-4">Nama lengkap, alamat email pengirim, subjek permohonan, dan isi pesan korespondensi resmi.</td>
                                            <td className="py-3 px-4 text-emerald-700 dark:text-emerald-400 font-medium">{isId ? "Internal Administrasi Lab" : "Admin Desk Only"}</td>
                                        </tr>
                                        <tr>
                                            <td className="py-3 px-4 font-semibold text-[var(--tnl-heading)]">{isId ? "Portal e-Sertifikat (/verify)" : "Certificate Verification"}</td>
                                            <td className="py-3 px-4">Nama penerima, judul acara/pelatihan/praktikum, tanggal terbit, dan kode unik sertifikat. <strong>Nol kebocoran PII</strong>: tidak pernah menampilkan email pribadi, nomor telepon, atau NRP.</td>
                                            <td className="py-3 px-4 text-blue-700 dark:text-blue-400 font-medium">{isId ? "Publik Minimal (Verifikasi)" : "Minimal Public Proof"}</td>
                                        </tr>
                                        <tr>
                                            <td className="py-3 px-4 font-semibold text-[var(--tnl-heading)]">{isId ? "Direktori Anggota (/member)" : "Member Directory"}</td>
                                            <td className="py-3 px-4">Nama, peran/divisi, angkatan, foto resmi, riwayat riset/publikasi, dan tautan profil publik (LinkedIn/Scholar) berdasarkan persetujuan civitas lab. Bebas dari NIK, nomor WhatsApp, dan alamat rumah.</td>
                                            <td className="py-3 px-4 text-blue-700 dark:text-blue-400 font-medium">{isId ? "Publik Akademik" : "Academic Public"}</td>
                                        </tr>
                                        <tr>
                                            <td className="py-3 px-4 font-semibold text-[var(--tnl-heading)]">{isId ? "Keamanan Jaringan & Akses Server" : "Security & Network Logs"}</td>
                                            <td className="py-3 px-4">Alamat IP (pada lapisan firewall/rate-limiting), User-Agent, dan log permintaan HTTP untuk mitigasi serangan siber.</td>
                                            <td className="py-3 px-4 text-amber-700 dark:text-amber-400 font-medium">{isId ? "Log Keamanan Teknis" : "Technical Firewall Logs"}</td>
                                        </tr>
                                        <tr>
                                            <td className="py-3 px-4 font-semibold text-[var(--tnl-heading)]">{isId ? "Akses Administrator CMS (/admin)" : "Admin CMS Access"}</td>
                                            <td className="py-3 px-4">Alamat email akun dosen/asisten terdaftar, hash kata sandi terenkripsi, sesi cookie <code>tnl_session</code>, dan catatan riwayat tindakan <code>audit_log</code>.</td>
                                            <td className="py-3 px-4 text-rose-700 dark:text-rose-400 font-medium">{isId ? "Terkunci Ketat (RBAC)" : "Strict Role-Based"}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </section>

                        {/* Section 3 */}
                        <section id="sec-3" className="scroll-mt-28 space-y-4">
                            <div className="border-l-2 border-[#5D8A6B] pl-4">
                                <span className="text-xs font-mono font-bold text-[#5D8A6B] dark:text-[#8AB597] uppercase">PASAL 3 / SECTION 3</span>
                                <h2 className="text-2xl font-bold tracking-tight text-[var(--tnl-heading)]">
                                    {isId ? "Dasar Pemrosesan & Tujuan Penggunaan Data (Pasal 20 UU PDP)" : "Legal Basis & Processing Purposes"}
                                </h2>
                            </div>
                            <p className="text-justify">
                                {isId
                                    ? "Sesuai Pasal 20 UU PDP, pemrosesan data pribadi oleh Laboratorium Jaringan Telekomunikasi ITS berlandaskan pada:"
                                    : "In accordance with Article 20 of the Indonesian PDP Law, our data processing is grounded upon:"}
                            </p>
                            <ul className="list-disc pl-5 space-y-2 text-justify">
                                <li>
                                    <strong>{isId ? "Persetujuan Eksplisit yang Sah (Consent):" : "Explicit Valid Consent:"}</strong>{" "}
                                    {isId
                                        ? "Persetujuan tertulis eksplisit yang Anda berikan melalui kotak centang persetujuan sebelum mengirimkan formulir pendaftaran Open House atau formulir kontak."
                                        : "Explicit consent provided via dedicated opt-in checkboxes prior to submitting event registration or contact forms."}
                                </li>
                                <li>
                                    <strong>{isId ? "Pelaksanaan Kewajiban Akademik Tridarma:" : "Academic Mandate Execution:"}</strong>{" "}
                                    {isId
                                        ? "Penyelenggaraan praktikum kurikulum, seleksi peserta pelatihan teknologi telekomunikasi, validasi e-sertifikat kegiatan, dan pelaporan pertanggungjawaban kegiatan akademik laboratorium."
                                        : "Administering curriculum practicums, telecommunication training programmes, certificate validation, and statutory laboratory reporting."}
                                </li>
                                <li>
                                    <strong>{isId ? "Kepentingan Sah Keamanan Siber (Legitimate Interest):" : "Legitimate Cybersecurity Interests:"}</strong>{" "}
                                    {isId
                                        ? "Pencegahan serangan siber DDoS, proteksi formulir dari bot spam (honeypot), audit sistem internal CMS, dan penegakan tata tertib penggunaan laboratorium."
                                        : "Preventing DDoS attacks, defending forms against automated spam (honeypots), internal CMS auditing, and laboratory compliance."}
                                </li>
                            </ul>
                            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                                {isId
                                    ? "Penegasan Resmi: Laboratorium TNL ITS TIDAK PERNAH menjual, menyewakan, memperjualbelikan, atau menyerahkan data pribadi Anda kepada pihak ketiga untuk kepentingan pemasaran komersial atau iklan."
                                    : "Official Guarantee: TNL Laboratory NEVER sells, rents, monetises, or discloses your personal data to any third party for commercial marketing or advertising purposes."}
                            </div>
                        </section>

                        {/* Section 4 */}
                        <section id="sec-4" className="scroll-mt-28 space-y-4">
                            <div className="border-l-2 border-[#5D8A6B] pl-4">
                                <span className="text-xs font-mono font-bold text-[#5D8A6B] dark:text-[#8AB597] uppercase">PASAL 4 / SECTION 4</span>
                                <h2 className="text-2xl font-bold tracking-tight text-[var(--tnl-heading)]">
                                    {isId ? "Penggunaan Penyimpanan Browser & Tanpa Pelacak Iklan" : "Browser Storage, Cookies & Zero Ad Trackers"}
                                </h2>
                            </div>
                            <p className="text-justify">
                                {isId
                                    ? "Situs ini dirancang dengan prinsip privasi sejak awal (Privacy by Design). Kami tidak menggunakan cookie pelacak iklan pihak ketiga. Seluruh penyimpanan browser yang digunakan berfungsi murni untuk preferensi esensial pengguna:"
                                    : "This website is built with Privacy by Design. We do not deploy third-party advertising cookies. All local browser storage is strictly utilitarian:"}
                            </p>

                            <div className="overflow-x-auto tnl-card p-0 border border-black/10 dark:border-white/10">
                                <table className="w-full text-left text-xs border-collapse">
                                    <thead className="border-b border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.03]">
                                        <tr>
                                            <th className="py-3 px-4 font-bold text-[var(--tnl-heading)]">{isId ? "Kunci Penyimpanan" : "Storage Key"}</th>
                                            <th className="py-3 px-4 font-bold text-[var(--tnl-heading)]">{isId ? "Mekanisme" : "Mechanism"}</th>
                                            <th className="py-3 px-4 font-bold text-[var(--tnl-heading)]">{isId ? "Tujuan & Fungsi" : "Purpose & Function"}</th>
                                            <th className="py-3 px-4 font-bold text-[var(--tnl-heading)]">{isId ? "Masa Simpan" : "Duration"}</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-black/5 dark:divide-white/5">
                                        <tr>
                                            <td className="py-3 px-4 font-mono font-semibold text-[var(--tnl-heading)]">tnl-locale</td>
                                            <td className="py-3 px-4 font-mono">localStorage</td>
                                            <td className="py-3 px-4">{isId ? "Menyimpan preferensi bahasa pilihan pengguna (Bahasa Indonesia / English)." : "Stores user language preference (ID / EN)."}</td>
                                            <td className="py-3 px-4">{isId ? "Permanen lokal" : "Persistent local"}</td>
                                        </tr>
                                        <tr>
                                            <td className="py-3 px-4 font-mono font-semibold text-[var(--tnl-heading)]">theme</td>
                                            <td className="py-3 px-4 font-mono">localStorage</td>
                                            <td className="py-3 px-4">{isId ? "Menyimpan status mode tampilan (Light Mode / Dark Mode)." : "Stores dark / light mode preference."}</td>
                                            <td className="py-3 px-4">{isId ? "Permanen lokal" : "Persistent local"}</td>
                                        </tr>
                                        <tr>
                                            <td className="py-3 px-4 font-mono font-semibold text-[var(--tnl-heading)]">mobile-reg-cta-dismissed</td>
                                            <td className="py-3 px-4 font-mono">sessionStorage</td>
                                            <td className="py-3 px-4">{isId ? "Mengingat status penutupan bar pendaftaran mobile agar tidak mengganggu navigasi." : "Remembers temporary dismissal of mobile registration bar."}</td>
                                            <td className="py-3 px-4">{isId ? "Sesi browser" : "Session only"}</td>
                                        </tr>
                                        <tr>
                                            <td className="py-3 px-4 font-mono font-semibold text-[var(--tnl-heading)]">tnl_session</td>
                                            <td className="py-3 px-4 font-mono">Cookie HttpOnly</td>
                                            <td className="py-3 px-4">{isId ? "Hanya untuk sesi login administrator CMS di /admin (SameSite=Lax, Secure). Pengunjung publik tidak diberikan cookie ini." : "CMS admin session authentication only (SameSite=Lax, Secure). Never set for public visitors."}</td>
                                            <td className="py-3 px-4">{isId ? "12 Jam / Saat Logout" : "12 Hours / On Logout"}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </section>

                        {/* Section 5 */}
                        <section id="sec-5" className="scroll-mt-28 space-y-4">
                            <div className="border-l-2 border-[#5D8A6B] pl-4">
                                <span className="text-xs font-mono font-bold text-[#5D8A6B] dark:text-[#8AB597] uppercase">PASAL 5 / SECTION 5</span>
                                <h2 className="text-2xl font-bold tracking-tight text-[var(--tnl-heading)]">
                                    {isId ? "Pihak Ketiga & Pemroses Data (Sub-processors)" : "Third Parties & Sub-processors"}
                                </h2>
                            </div>
                            <p className="text-justify">
                                {isId
                                    ? "Untuk menjamin keandalan infrastruktur dan kelancaran operasional tridarma, situs ini berinteraksi secara terbatas dengan layanan pihak ketiga berikut:"
                                    : "To ensure infrastructure reliability and smooth academic operations, the laboratory interacts with the following service providers:"}
                            </p>
                            <div className="space-y-3">
                                <div className="tnl-card p-4 space-y-1">
                                    <div className="flex items-center justify-between">
                                        <h4 className="font-bold text-sm text-[var(--tnl-heading)]">1. Cloudflare, Inc. (Edge CDN & WAF)</h4>
                                        <span className="text-xs font-mono text-[#5D8A6B] dark:text-[#8AB597]">Edge Infrastructure</span>
                                    </div>
                                    <p className="text-xs leading-relaxed">
                                        {isId
                                            ? "Berfungsi sebagai Content Delivery Network (CDN), proteksi keamanan tepi (DDoS Mitigation), enkripsi HTTPS TLS 1.3, dan telemetri kinerja tanpa cookie (Cloudflare Web Analytics)."
                                            : "Provides edge Content Delivery Network (CDN), DDoS mitigation, TLS 1.3 encryption, and privacy-first cookieless performance telemetry."}
                                    </p>
                                </div>

                                <div className="tnl-card p-4 space-y-1">
                                    <div className="flex items-center justify-between">
                                        <h4 className="font-bold text-sm text-[var(--tnl-heading)]">2. Google Workspace / Google Sheets (via Apps Script Webhook)</h4>
                                        <span className="text-xs font-mono text-[#5D8A6B] dark:text-[#8AB597]">Operational Sync</span>
                                    </div>
                                    <p className="text-xs leading-relaxed">
                                        {isId
                                            ? "Digunakan sebagai sinkronisasi operasional data pendaftaran kegiatan (seperti Open House) ke lembar kerja panitia asisten resmi Lab TNL secara terenkripsi melalui webhook terotentikasi."
                                            : "Used to synchronize event registration records (e.g. Open House) into authorized staff Google Sheets via encrypted webhook."}
                                    </p>
                                </div>

                                <div className="tnl-card p-4 space-y-1">
                                    <div className="flex items-center justify-between">
                                        <h4 className="font-bold text-sm text-[var(--tnl-heading)]">3. Google Maps Embed (Google LLC)</h4>
                                        <span className="text-xs font-mono text-[#5D8A6B] dark:text-[#8AB597]">Interactive Mapping</span>
                                    </div>
                                    <p className="text-xs leading-relaxed">
                                        {isId
                                            ? "Menampilkan peta interaktif lokasi Ruang B-301 pada halaman /contact. Interaksi langsung dengan peta tunduk pada Kebijakan Privasi Google."
                                            : "Renders the interactive map pointing to Room B-301 on /contact. Direct interaction with the map is governed by Google's Privacy Policy."}
                                    </p>
                                </div>

                                <div className="tnl-card p-4 space-y-1">
                                    <div className="flex items-center justify-between">
                                        <h4 className="font-bold text-sm text-[var(--tnl-heading)]">4. Klaster Server Mandiri Laboratorium (Proxmox LXC)</h4>
                                        <span className="text-xs font-mono text-[#5D8A6B] dark:text-[#8AB597]">Internal On-Premises</span>
                                    </div>
                                    <p className="text-xs leading-relaxed">
                                        {isId
                                            ? "Seluruh basis data utama MongoDB (CT 116) dan backend aplikasi (CT 103) di-hosting pada klaster server mandiri dalam jaringan privat terlindungi di Departemen Teknik Elektro ITS."
                                            : "Primary MongoDB database (CT 116) and backend application (CT 103) reside on our isolated on-premises cluster at the Electrical Engineering Dept."}
                                    </p>
                                </div>
                            </div>
                        </section>

                        {/* Section 6 */}
                        <section id="sec-6" className="scroll-mt-28 space-y-4">
                            <div className="border-l-2 border-[#5D8A6B] pl-4">
                                <span className="text-xs font-mono font-bold text-[#5D8A6B] dark:text-[#8AB597] uppercase">PASAL 6 / SECTION 6</span>
                                <h2 className="text-2xl font-bold tracking-tight text-[var(--tnl-heading)]">
                                    {isId ? "Keamanan Informasi & Perlindungan Teknis" : "Information Security & Technical Safeguards"}
                                </h2>
                            </div>
                            <p className="text-justify">
                                {isId
                                    ? "Laboratorium menerapkan langkah-langkah keamanan teknis dan organisasi berlapis untuk mencegah akses tidak sah, kebocoran, atau perusakan data pribadi:"
                                    : "We implement multi-layered technical and organizational safeguards to prevent unauthorized access, disclosure, or alteration of personal data:"}
                            </p>
                            <ul className="list-disc pl-5 space-y-2 text-justify">
                                <li>
                                    <strong>Enkripsi Transit Penuh:</strong> Protokol TLS 1.3 / HTTPS wajib dengan header keamanan modern (HSTS <code>max-age=31536000</code>, Content-Security-Policy ketat, X-Content-Type-Options: nosniff, dan Referrer-Policy).
                                </li>
                                <li>
                                    <strong>Validasi & Sanitasi Berkas:</strong> Seluruh berkas unggahan bukti persyaratan diverifikasi tipe MIME aslinya melalui inspeksi <em>magic bytes</em>, sanitasi nama berkas acak, dan pembatasan ekstensi ketat.
                                </li>
                                <li>
                                    <strong>Pemisahan Data Publik Bebas PII:</strong> Endpoint API publik (seperti <code>/api/members</code>, <code>/api/verify</code>, dan <code>/api/public/stats</code>) secara ketat memotong field sensitif sebelum respon dikirimkan ke peramban.
                                </li>
                                <li>
                                    <strong>Kontrol Akses Berbasis Peran (RBAC) & Audit Log:</strong> Setiap tindakan administratif pada CMS dicatat secara persisten ke dalam koleksi <code>audit_log</code> mencakup identitas aktor, stempel waktu, dan detail perubahan.
                                </li>
                            </ul>
                        </section>

                        {/* Section 7 */}
                        <section id="sec-7" className="scroll-mt-28 space-y-4">
                            <div className="border-l-2 border-[#5D8A6B] pl-4">
                                <span className="text-xs font-mono font-bold text-[#5D8A6B] dark:text-[#8AB597] uppercase">PASAL 7 / SECTION 7</span>
                                <h2 className="text-2xl font-bold tracking-tight text-[var(--tnl-heading)]">
                                    {isId ? "Masa Retensi Data & Siklus Cadangan (Backup)" : "Data Retention Period & Backup Cycles"}
                                </h2>
                            </div>
                            <p className="text-justify">
                                {isId ? (
                                    <>
                                        Data pribadi disimpan hanya selama jangka waktu yang diperlukan untuk memenuhi tujuan awal pengumpulannya:
                                    </>
                                ) : (
                                    <>
                                        Personal data is retained only as long as necessary to fulfill the intended academic or service purposes:
                                    </>
                                )}
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                                <div className="tnl-card p-4 space-y-1">
                                    <h4 className="font-bold text-[var(--tnl-heading)]">{isId ? "Pendaftaran Kegiatan / Open House" : "Event Registrations"}</h4>
                                    <p>{isId ? "Disimpan selama siklus seleksi & pelaporan akademik berlangsung, kemudian dihapus atau dianonimkan untuk keperluan statistik akademik agregat." : "Retained for the event duration and academic reporting, then purged or anonymised for aggregated statistics."}</p>
                                </div>
                                <div className="tnl-card p-4 space-y-1">
                                    <h4 className="font-bold text-[var(--tnl-heading)]">{isId ? "Pesan Formulir Kontak" : "Contact Inquiries"}</h4>
                                    <p>{isId ? "Disimpan selama proses korespondensi dan penyelesaian tindak lanjut pesan (maksimal 1 tahun sejak kontak terakhir)." : "Retained during correspondence and follow-up (up to 1 year from last contact)."}</p>
                                </div>
                                <div className="tnl-card p-4 space-y-1">
                                    <h4 className="font-bold text-[var(--tnl-heading)]">{isId ? "Keabsahan e-Sertifikat (/verify)" : "e-Certificate Authenticity"}</h4>
                                    <p>{isId ? "Disimpan secara berkelanjutan agar lulusan dan peserta dapat memvalidasi keaslian sertifikat mereka di masa depan." : "Stored continuously so alumni and participants can reliably verify certificates at any time."}</p>
                                </div>
                                <div className="tnl-card p-4 space-y-1">
                                    <h4 className="font-bold text-[var(--tnl-heading)]">{isId ? "Rotasi Cadangan Server (14 Hari)" : "Server Backups (14-Day Safe Rotation)"}</h4>
                                    <p>{isId ? "Cadangan otomatis terkompresi harian pada server Proxmox LXC (CT 116 & CT 103) mengalami rotasi otomatis 14 hari sebelum dihapus permanen." : "Daily compressed automated archives on internal Proxmox LXC undergo 14-day safe rotation before secure removal."}</p>
                                </div>
                            </div>
                        </section>

                        {/* Section 8 */}
                        <section id="sec-8" className="scroll-mt-28 space-y-4">
                            <div className="border-l-2 border-[#5D8A6B] pl-4">
                                <span className="text-xs font-mono font-bold text-[#5D8A6B] dark:text-[#8AB597] uppercase">PASAL 8 / SECTION 8</span>
                                <h2 className="text-2xl font-bold tracking-tight text-[var(--tnl-heading)]">
                                    {isId ? "Hak Subjek Data Pribadi & SLA Pemenuhan 3×24 Jam" : "Data Subject Rights & 3x24-Hour SLA"}
                                </h2>
                            </div>
                            <p className="text-justify">
                                {isId
                                    ? "Sesuai Pasal 5 sampai dengan Pasal 13 UU No. 27 Tahun 2022, Anda sebagai Subjek Data Pribadi memiliki hak-hak yang dijamin oleh hukum:"
                                    : "Under Articles 5 through 13 of Law No. 27/2022, you hold explicit statutory rights as a Data Subject:"}
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                                <div className="tnl-card p-3.5 space-y-1">
                                    <strong className="text-[var(--tnl-heading)]">{isId ? "1. Hak atas Kejelasan Informasi:" : "1. Right to Information:"}</strong>
                                    <p>{isId ? "Mendapatkan kejelasan mengenai identitas pengendali, dasar hukum, dan tujuan pemrosesan data." : "Clarity on controller identity, legal basis, and processing purposes."}</p>
                                </div>
                                <div className="tnl-card p-3.5 space-y-1">
                                    <strong className="text-[var(--tnl-heading)]">{isId ? "2. Hak Memperbaiki & Melengkapi:" : "2. Right to Rectification:"}</strong>
                                    <p>{isId ? "Memperbarui atau melengkapi data pribadi yang tidak akurat atau tidak lengkap." : "Correct or complete outdated or inaccurate personal records."}</p>
                                </div>
                                <div className="tnl-card p-3.5 space-y-1">
                                    <strong className="text-[var(--tnl-heading)]">{isId ? "3. Hak Akses & Salinan Data:" : "3. Right of Access & Portability:"}</strong>
                                    <p>{isId ? "Memperoleh akses dan salinan data pribadi yang diproses laboratorium secara terstruktur." : "Obtain access and copies of your processed personal data."}</p>
                                </div>
                                <div className="tnl-card p-3.5 space-y-1">
                                    <strong className="text-[var(--tnl-heading)]">{isId ? "4. Hak Menghapus / Menganonimkan:" : "4. Right to Erasure / Anonymisation:"}</strong>
                                    <p>{isId ? "Meminta penghapusan atau pemusnahan data pribadi apabila tujuan pemrosesan telah selesai." : "Request deletion or anonymisation once the purpose has concluded."}</p>
                                </div>
                                <div className="tnl-card p-3.5 space-y-1">
                                    <strong className="text-[var(--tnl-heading)]">{isId ? "5. Hak Menarik Kembali Persetujuan:" : "5. Right to Withdraw Consent:"}</strong>
                                    <p>{isId ? "Mencabut persetujuan pemrosesan yang telah diberikan sebelumnya kapan saja." : "Withdraw previously granted consent at any time without penalty."}</p>
                                </div>
                                <div className="tnl-card p-3.5 space-y-1">
                                    <strong className="text-[var(--tnl-heading)]">{isId ? "6. Hak Mengajukan Keberatan:" : "6. Right to Object:"}</strong>
                                    <p>{isId ? "Menolak pemrosesan data yang didasarkan pada kepentingan yang sah." : "Object to processing based upon legitimate interest grounds."}</p>
                                </div>
                            </div>

                            <div className="tnl-card p-5 space-y-3 bg-[#5D8A6B]/10 border-[#5D8A6B]/30">
                                <h4 className="font-bold text-sm text-[var(--tnl-heading)] flex items-center gap-2">
                                    <Clock className="h-4 w-4 text-[#5D8A6B]" />
                                    <span>{isId ? "Prosedur Pengajuan & Komitmen SLA 3×24 Jam Kerja" : "Request Procedure & 3x24-Hour SLA"}</span>
                                </h4>
                                <p className="text-xs leading-relaxed text-justify">
                                    {isId ? (
                                        <>
                                            Untuk menggunakan hak Anda, kirimkan surat elektronik ke <strong>telconnetlab@gmail.com</strong> dengan subjek{" "}
                                            <code>[Permintaan UU PDP] &lt;Nama Pemohon&gt; - &lt;Jenis Hak&gt;</code> beserta lampiran identitas sah (KTM ITS / KTP)
                                            untuk verifikasi kepemilikan data. Tim privasi laboratorium akan memverifikasi dan memproses pemenuhan hak Anda dalam waktu paling lambat{" "}
                                            <strong>3×24 jam kerja (3 hari kerja)</strong> sejak permohonan tervalidasi.
                                        </>
                                    ) : (
                                        <>
                                            To exercise your rights, email <strong>telconnetlab@gmail.com</strong> with the subject{" "}
                                            <code>[UU PDP Request] &lt;Your Name&gt; - &lt;Right Type&gt;</code> accompanied by valid academic/national ID.
                                            Our data desk will verify and execute your request within a maximum of <strong>3x24 working hours (3 workdays)</strong>.
                                        </>
                                    )}
                                </p>
                            </div>
                        </section>

                        {/* Section 9 */}
                        <section id="sec-9" className="scroll-mt-28 space-y-4">
                            <div className="border-l-2 border-[#5D8A6B] pl-4">
                                <span className="text-xs font-mono font-bold text-[#5D8A6B] dark:text-[#8AB597] uppercase">PASAL 9 / SECTION 9</span>
                                <h2 className="text-2xl font-bold tracking-tight text-[var(--tnl-heading)]">
                                    {isId ? "Kerahasiaan & Pembatasan Akses Internal" : "Internal Confidentiality & Access Restrictions"}
                                </h2>
                            </div>
                            <p className="text-justify">
                                {isId
                                    ? "Akses terhadap data pribadi pendaftar dan korespondensi dibatasi secara ketat hanya kepada Dosen Pembina Laboratorium dan Asisten Laboratorium yang bertugas secara resmi. Setiap asisten menandatangani komitmen kerahasiaan dan diwajibkan mematuhi kode etik civitas akademika ITS."
                                    : "Access to participant and inquiry records is restricted strictly to faculty advisors and officially designated student assistants. Every assistant is bound by academic confidentiality standards."}
                            </p>
                        </section>

                        {/* Section 10 */}
                        <section id="sec-10" className="scroll-mt-28 space-y-4">
                            <div className="border-l-2 border-[#5D8A6B] pl-4">
                                <span className="text-xs font-mono font-bold text-[#5D8A6B] dark:text-[#8AB597] uppercase">PASAL 10 / SECTION 10</span>
                                <h2 className="text-2xl font-bold tracking-tight text-[var(--tnl-heading)]">
                                    {isId ? "Transfer Data Pribadi Lintas Batas" : "Cross-Border Data Transfers"}
                                </h2>
                            </div>
                            <p className="text-justify">
                                {isId
                                    ? "Secara umum basis data utama tersimpan di dalam wilayah Republik Indonesia (Kampus ITS Surabaya). Apabila terjadi perutean lalu lintas tepi melalui jaringan Cloudflare CDN atau sinkronisasi Google Workspace, transfer data dilindungi oleh enkripsi TLS standar industri dan perjanjian pemrosesan data berstandar global selaras prinsip GDPR."
                                    : "Primary databases reside on-premises within the Republic of Indonesia. Where edge routing traverses Cloudflare CDN or Google Workspace, data is protected by industry TLS encryption and compliant data processing agreements aligned with global standards."}
                            </p>
                        </section>

                        {/* Section 11 */}
                        <section id="sec-11" className="scroll-mt-28 space-y-4">
                            <div className="border-l-2 border-[#5D8A6B] pl-4">
                                <span className="text-xs font-mono font-bold text-[#5D8A6B] dark:text-[#8AB597] uppercase">PASAL 11 / SECTION 11</span>
                                <h2 className="text-2xl font-bold tracking-tight text-[var(--tnl-heading)]">
                                    {isId ? "Pelindungan Data Anak / Mahasiswa di Bawah Umur" : "Child & Student Privacy Protection"}
                                </h2>
                            </div>
                            <p className="text-justify">
                                {isId
                                    ? "Layanan dan kegiatan Laboratorium TNL ITS ditujukan untuk mahasiswa perguruan tinggi dan calon mahasiswa (usia minimal 17 tahun). Kami tidak secara sengaja mengumpulkan data pribadi dari individu di bawah umur tanpa persetujuan institusi sekolah atau orang tua/wali yang sah."
                                    : "Our services and programmes are tailored for university students and prospective higher-education applicants (aged 17+). We do not knowingly harvest personal data from children without valid parental or institutional consent."}
                            </p>
                        </section>

                        {/* Section 12 */}
                        <section id="sec-12" className="scroll-mt-28 space-y-4">
                            <div className="border-l-2 border-[#5D8A6B] pl-4">
                                <span className="text-xs font-mono font-bold text-[#5D8A6B] dark:text-[#8AB597] uppercase">PASAL 12 / SECTION 12</span>
                                <h2 className="text-2xl font-bold tracking-tight text-[var(--tnl-heading)]">
                                    {isId ? "Pembaruan Kebijakan & Saluran Pengaduan Resmi" : "Policy Revisions & Official Grievance Channel"}
                                </h2>
                            </div>
                            <p className="text-justify">
                                {isId ? (
                                    <>
                                        Kami dapat meninjau dan memperbarui Kebijakan Privasi ini dari waktu ke waktu guna mencerminkan pembaruan sistem teknis atau regulasi perundang-undangan.
                                        Setiap pembaruan akan ditandai dengan perubahan nomor versi (saat ini <code>v{POLICY_VERSION}</code>) dan tanggal berlaku efektif di bagian atas dokumen ini.
                                    </>
                                ) : (
                                    <>
                                        We may periodically update this Privacy Policy to reflect ongoing technical improvements or regulatory evolutions.
                                        Revisions will be designated by an incremented version number (currently <code>v{POLICY_VERSION}</code>) and effective date at the top of this document.
                                    </>
                                )}
                            </p>
                            <div className="tnl-card p-5 space-y-2 text-xs">
                                <p className="font-bold text-[var(--tnl-heading)]">{isId ? "Pengaduan & Lembaga Terkait:" : "Official Grievance Desk:"}</p>
                                <p>
                                    Laboratorium Jaringan Telekomunikasi ITS · Ruang B-301 Gedung B Departemen Teknik Elektro FTEIC ITS, Surabaya 60111.
                                    Surel: <strong>telconnetlab@gmail.com</strong>
                                </p>
                            </div>
                        </section>
                    </div>
                </div>
            </main>
        </div>
    );
}

export function TermsPage() {
    const { locale } = useLocale();
    const isId = locale === "id";
    const [activeSection, setActiveSection] = useState<string>("sec-1");

    const sections = [
        { id: "sec-1", title_id: "1. Penerimaan Ketentuan", title_en: "1. Acceptance of Terms" },
        { id: "sec-2", title_id: "2. Ruang Lingkup Layanan", title_en: "2. Scope of Services" },
        { id: "sec-3", title_id: "3. Batasan Perilaku & UU ITE", title_en: "3. Acceptable Use & Cyber Law" },
        { id: "sec-4", title_id: "4. Pendaftaran Kegiatan & Seleksi", title_en: "4. Registration & Selection" },
        { id: "sec-5", title_id: "5. Keabsahan e-Sertifikat (/verify)", title_en: "5. e-Certificate Authenticity" },
        { id: "sec-6", title_id: "6. Hak Cipta & Lisensi Modul", title_en: "6. Intellectual Property & Practicum" },
        { id: "sec-7", title_id: "7. Layanan & Tautan Pihak Ketiga", title_en: "7. Third-Party Services & Links" },
        { id: "sec-8", title_id: "8. Penafian Jaminan & Batasan", title_en: "8. Warranty Disclaimer & Liability" },
        { id: "sec-9", title_id: "9. Hukum yang Berlaku & Sengketa", title_en: "9. Governing Law & Jurisdiction" },
        { id: "sec-10", title_id: "10. Kontak Hukum & Administrasi", title_en: "10. Legal & Administrative Desk" },
    ];

    const scrollToSection = (id: string) => {
        const el = document.getElementById(id);
        if (el) {
            el.scrollIntoView({ behavior: "smooth" });
            setActiveSection(id);
        }
    };

    useEffect(() => {
        const handleScroll = () => {
            const scrollPos = window.scrollY + 200;
            for (let i = sections.length - 1; i >= 0; i--) {
                const el = document.getElementById(sections[i].id);
                if (el && el.offsetTop <= scrollPos) {
                    setActiveSection(sections[i].id);
                    break;
                }
            }
        };
        window.addEventListener("scroll", handleScroll, { passive: true });
        return () => window.removeEventListener("scroll", handleScroll);
    }, []);

    return (
        <div data-testid="terms-page" className="min-h-screen">
            {/* Hero Header */}
            <header className="tnl-hero-gradient relative border-b border-black/10 dark:border-white/10 py-12 md:py-16 overflow-hidden print:bg-none print:border-b-2 print:py-6">
                <div
                    aria-hidden="true"
                    className="pointer-events-none absolute -top-24 right-1/4 h-72 w-96 rounded-full bg-[#5D8A6B]/20 blur-3xl dark:bg-[#43594A]/25 print:hidden"
                />
                <div className="tnl-container relative z-10">
                    <div className="max-w-4xl">
                        {/* Eyebrow & Badges */}
                        <div className="flex flex-wrap items-center gap-2 text-xs font-mono font-bold tracking-widest uppercase">
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3.5 py-1 text-[#E6E8E6] backdrop-blur-md">
                                <FileText className="h-3.5 w-3.5 text-[#C4B393]" aria-hidden="true" />
                                <span>VERSI {POLICY_VERSION}</span>
                            </span>
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3.5 py-1 text-[#E6E8E6] backdrop-blur-md">
                                <Clock className="h-3.5 w-3.5 text-[#C4B393]" aria-hidden="true" />
                                <span>{isId ? `BERLAKU: ${EFFECTIVE_DATE}` : `EFFECTIVE: ${EFFECTIVE_DATE_EN}`}</span>
                            </span>
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-1 text-emerald-300 backdrop-blur-md">
                                <Scale className="h-3.5 w-3.5" aria-hidden="true" />
                                <span>HUKUM RI & STANDAR ITS</span>
                            </span>
                        </div>

                        <h1 className="mt-4 text-3xl font-black tracking-tight text-white sm:text-5xl lg:text-6xl print:text-black">
                            {isId ? "Ketentuan Penggunaan" : "Terms of Use"}
                        </h1>
                        <p className="mt-4 text-base leading-relaxed text-[#D1D5DB] sm:text-lg print:text-black">
                            {isId
                                ? "Ketentuan hukum yang mengikat penggunaan situs resmi, materi modul praktikum, pendaftaran kegiatan, dan portal verifikasi sertifikat Laboratorium Jaringan Telekomunikasi (TNL) Departemen Teknik Elektro FTEIC ITS Surabaya."
                                : "The legal terms governing your access to the official website, practicum modules, event registrations, and certificate verification portals of the Telecommunication Network Laboratory (TNL) at FTEIC ITS Surabaya."}
                        </p>

                        {/* Action buttons */}
                        <div className="mt-8 flex flex-wrap items-center gap-3 print:hidden">
                            <button
                                type="button"
                                onClick={() => window.print()}
                                className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-xs font-bold text-white transition-all hover:bg-white/20 backdrop-blur-sm"
                                data-testid="print-terms-button"
                            >
                                <Printer className="h-3.5 w-3.5" aria-hidden="true" />
                                <span>{isId ? "Cetak / Simpan PDF" : "Print / Save PDF"}</span>
                            </button>
                            <Link
                                to="/privacy"
                                className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.05] px-4 py-2 text-xs font-bold text-[#D1D5DB] transition-all hover:text-white hover:bg-white/10"
                                data-testid="cross-link-privacy"
                            >
                                <span>{isId ? "Lihat Kebijakan Privasi" : "View Privacy Policy"}</span>
                                <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                            </Link>
                        </div>
                    </div>
                </div>
            </header>

            {/* Main Content Layout */}
            <main className="tnl-container py-12 md:py-16">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
                    {/* Sticky Left Sidebar (4 Columns) */}
                    <aside className="lg:col-span-4 lg:sticky lg:top-24 space-y-6 print:hidden">
                        {/* Table of Contents */}
                        <div className="tnl-card p-5 sm:p-6" data-testid="terms-toc">
                            <span className="text-[11px] font-mono font-bold uppercase tracking-widest text-[var(--tnl-tan-text)]">
                                {isId ? "DAFTAR ISI KETENTUAN" : "TABLE OF CONTENTS"}
                            </span>
                            <nav className="mt-4 space-y-1 text-xs" aria-label="Terms sections">
                                {sections.map((sec) => (
                                    <button
                                        key={sec.id}
                                        type="button"
                                        onClick={() => scrollToSection(sec.id)}
                                        className={`w-full text-left py-1.5 px-2.5 rounded-lg transition-colors flex items-center justify-between ${
                                            activeSection === sec.id
                                                ? "bg-[#5D8A6B]/15 text-[#2E583A] dark:text-[#8AB597] font-bold"
                                                : "text-[var(--tnl-body)] hover:bg-black/[0.03] dark:hover:bg-white/[0.04] hover:text-[var(--tnl-heading)]"
                                        }`}
                                        data-testid={`toc-link-${sec.id}`}
                                    >
                                        <span className="truncate">{isId ? sec.title_id : sec.title_en}</span>
                                        {activeSection === sec.id && <span className="h-1.5 w-1.5 rounded-full bg-[#5D8A6B] shrink-0 ml-2" />}
                                    </button>
                                ))}
                            </nav>
                        </div>

                        {/* Quick Highlights / TL;DR Card */}
                        <div className="tnl-card p-5 sm:p-6 space-y-3" data-testid="terms-highlights">
                            <div className="flex items-center gap-2 text-xs font-mono font-bold text-[#5D8A6B] dark:text-[#8AB597] uppercase">
                                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                                <span>{isId ? "POIN UTAMA KETENTUAN" : "KEY HIGHLIGHTS"}</span>
                            </div>
                            <ul className="space-y-2.5 text-xs leading-relaxed text-[var(--tnl-body)]">
                                <li className="flex items-start gap-2">
                                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                                    <span>{isId ? "Tujuan murni akademik: materi dan layanan disediakan untuk menunjang tridarma perguruan tinggi di ITS." : "Purely academic purpose: resources support higher education tridarma mandates."}</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                                    <span>{isId ? "Integritas e-Sertifikat (/verify): sertifikat resmi hanya sah jika lolos validasi kode unik di portal verifikasi lab." : "e-Certificate integrity (/verify): authentic credentials validate exclusively via our verification portal."}</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                                    <span>{isId ? "Lisensi non-komersial: modul praktikum boleh diunduh untuk belajar, dilarang diperjualbelikan tanpa izin." : "Non-commercial licence: practicum modules may be downloaded for study, commercial resale strictly prohibited."}</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                                    <span>{isId ? "Kepatuhan UU ITE: dilarang melakukan scraping berlebih, serangan siber, atau manipulasi data pendaftaran." : "Cyber law compliance: automated scraping, vulnerability scanning, or data falsification prohibited under UU ITE."}</span>
                                </li>
                            </ul>
                        </div>

                        {/* Legal Help Card */}
                        <div className="tnl-card p-5 sm:p-6 space-y-3" data-testid="terms-help-card">
                            <span className="text-[11px] font-mono font-bold uppercase tracking-widest text-[var(--tnl-tan-text)]">
                                {isId ? "KONTAK ADMINISTRASI LAB" : "ADMINISTRATIVE DESK"}
                            </span>
                            <p className="text-xs text-[var(--tnl-body)]">
                                {isId
                                    ? "Pertanyaan mengenai perizinan modul praktikum atau konfirmasi kegiatan akademik:"
                                    : "Inquiries regarding practicum licensing or academic confirmations:"}
                            </p>
                            <Link
                                to="/contact"
                                className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.03] p-2.5 text-xs font-semibold hover:border-[#5D8A6B] hover:text-[#5D8A6B] transition-colors"
                            >
                                <Mail className="h-3.5 w-3.5" />
                                <span>{isId ? "Hubungi Ruang B-301" : "Contact Room B-301"}</span>
                            </Link>
                        </div>
                    </aside>

                    {/* Main Content Column (8 Columns) */}
                    <div className="lg:col-span-8 space-y-12 leading-relaxed text-[var(--tnl-body)]">
                        {/* Section 1 */}
                        <section id="sec-1" className="scroll-mt-28 space-y-4">
                            <div className="border-l-2 border-[#5D8A6B] pl-4">
                                <span className="text-xs font-mono font-bold text-[#5D8A6B] dark:text-[#8AB597] uppercase">BAGIAN 1 / PART 1</span>
                                <h2 className="text-2xl font-bold tracking-tight text-[var(--tnl-heading)]">
                                    {isId ? "Penerimaan Ketentuan & Penyelenggara Layanan" : "Acceptance of Terms & Site Provider"}
                                </h2>
                            </div>
                            <p className="text-justify">
                                {isId ? (
                                    <>
                                        Selamat datang di situs resmi <strong>Laboratorium Jaringan Telekomunikasi (TNL)</strong>, Departemen Teknik Elektro,
                                        Fakultas Teknologi Elektro dan Informatika Cerdas (FTEIC), Institut Teknologi Sepuluh Nopember (ITS) Surabaya (<code>https://labtnl.site</code>).
                                        Dengan mengakses, menelusuri, mendaftar kegiatan, atau mengunduh materi dari situs ini, Anda menyatakan telah membaca, memahami,
                                        dan menyetujui untuk terikat secara hukum oleh <strong>Ketentuan Penggunaan</strong> ini serta{" "}
                                        <Link to="/privacy" className="text-[#5D8A6B] dark:text-[#8AB597] underline">Kebijakan Privasi</Link> kami.
                                        Apabila Anda tidak menyetujui ketentuan ini, Anda disarankan untuk tidak melanjutkan penggunaan situs ini.
                                    </>
                                ) : (
                                    <>
                                        Welcome to the official website of the <strong>Telecommunication Network Laboratory (TNL)</strong>, Department of Electrical Engineering,
                                        Faculty of Intelligent Electrical and Informatics Technology (FTEIC), Institut Teknologi Sepuluh Nopember (ITS), Surabaya (<code>https://labtnl.site</code>).
                                        By accessing, browsing, registering for events, or downloading materials from this site, you acknowledge that you have read, understood,
                                        and agree to be bound by these <strong>Terms of Use</strong> and our{" "}
                                        <Link to="/privacy" className="text-[#5D8A6B] dark:text-[#8AB597] underline">Privacy Policy</Link>.
                                    </>
                                )}
                            </p>
                        </section>

                        {/* Section 2 */}
                        <section id="sec-2" className="scroll-mt-28 space-y-4">
                            <div className="border-l-2 border-[#5D8A6B] pl-4">
                                <span className="text-xs font-mono font-bold text-[#5D8A6B] dark:text-[#8AB597] uppercase">BAGIAN 2 / PART 2</span>
                                <h2 className="text-2xl font-bold tracking-tight text-[var(--tnl-heading)]">
                                    {isId ? "Ruang Lingkup Layanan Situs" : "Scope of Website Services"}
                                </h2>
                            </div>
                            <p className="text-justify">
                                {isId
                                    ? "Situs web ini diselenggarakan sebagai portal informasi dan layanan akademik laboratorium, mencakup:"
                                    : "This website operates as an academic laboratory portal providing:"}
                            </p>
                            <ul className="list-disc pl-5 space-y-2 text-justify">
                                <li>{isId ? "Profil resmi laboratorium, fasilitas Ruang B-301, serta direktori keanggotaan dosen pembina dan asisten laboratorium (/member)." : "Official laboratory profile, Room B-301 facilities, and academic faculty and assistant directory (/member)."}</li>
                                <li>{isId ? "Katalog publikasi ilmiah, artikel riset telekomunikasi, dan rekam jejak pengabdian masyarakat (/publications & /news)." : "Scholarly publication catalogue, telecommunication research updates, and community programmes (/publications & /news)."}</li>
                                <li>{isId ? "Informasi silabus modul praktikum, jadwal shift praktikum, dan materi panduan jaringan kurikulum Departemen Teknik Elektro ITS." : "Practicum syllabus information, laboratory shift schedules, and telecommunication curriculum guides."}</li>
                                <li>{isId ? "Portal pendaftaran kegiatan terintegrasi (seperti Open House dan Pelatihan) dengan sinkronisasi data panitia." : "Integrated registration portals for events (e.g. Open House & Technical Workshops)."}</li>
                                <li>{isId ? "Sistem validasi dan verifikasi keabsahan e-sertifikat kegiatan akademik (/verify)." : "Official electronic certificate authenticity verification system (/verify)."}</li>
                                <li>{isId ? "Saluran komunikasi dan formulir korespondensi langsung ke meja administrasi Ruang B-301 (/contact)." : "Direct communication desk and contact form to Room B-301 (/contact)."}</li>
                            </ul>
                        </section>

                        {/* Section 3 */}
                        <section id="sec-3" className="scroll-mt-28 space-y-4">
                            <div className="border-l-2 border-[#5D8A6B] pl-4">
                                <span className="text-xs font-mono font-bold text-[#5D8A6B] dark:text-[#8AB597] uppercase">BAGIAN 3 / PART 3</span>
                                <h2 className="text-2xl font-bold tracking-tight text-[var(--tnl-heading)]">
                                    {isId ? "Penggunaan yang Diizinkan & Batasan Perilaku (UU ITE)" : "Acceptable Use Policy & Cyber Law Compliance"}
                                </h2>
                            </div>
                            <p className="text-justify">
                                {isId ? (
                                    <>
                                        Anda wajib menggunakan situs ini secara bertanggung jawab, beretika akademik, dan mematuhi{" "}
                                        <strong>UU No. 11 Tahun 2008 jo. UU No. 1 Tahun 2024 tentang Informasi dan Transaksi Elektronik (UU ITE)</strong>.
                                        Tindakan-tindakan berikut dilarang keras secara hukum:
                                    </>
                                ) : (
                                    <>
                                        You agree to access this website in a responsible, academically ethical manner compliant with Indonesian Cyber Law (UU ITE).
                                        The following acts are strictly prohibited:
                                    </>
                                )}
                            </p>
                            <div className="space-y-2 text-xs">
                                <div className="tnl-card p-3 border-rose-500/20 bg-rose-500/5">
                                    <strong>{isId ? "1. Peretasan & Pemindaian Ilegal:" : "1. Unauthorized Penetration & Scanning:"}</strong>{" "}
                                    {isId ? "Dilarang melakukan pemindaian kerentanan (vulnerability scanning), penetrasi tanpa izin tertulis, atau eksploitasi terhadap infrastruktur server klaster lab." : "Running automated vulnerability scans or unauthorized penetration attempts against the laboratory server cluster."}
                                </div>
                                <div className="tnl-card p-3 border-rose-500/20 bg-rose-500/5">
                                    <strong>{isId ? "2. Serangan Penolakan Layanan (DoS/DDoS) & Spam:" : "2. Denial-of-Service & Spam Bots:"}</strong>{" "}
                                    {isId ? "Dilarang membanjiri request server, mengirimkan spam otomatis melalui formulir kontak/pendaftaran, atau mengakali mekanisme rate-limiting." : "Flooding server requests, deploying spam bots through forms, or circumventing rate limits."}
                                </div>
                                <div className="tnl-card p-3 border-rose-500/20 bg-rose-500/5">
                                    <strong>{isId ? "3. Pengunggahan Berkas Berbahaya:" : "3. Malicious File Uploads:"}</strong>{" "}
                                    {isId ? "Dilarang mengunggah berkas yang mengandung skrip berbahaya, virus, trojan, atau berkas yang sengaja disamarkan (manipulasi MIME/ekstensi)." : "Uploading malicious payloads, embedded shell scripts, or falsified MIME binaries."}
                                </div>
                                <div className="tnl-card p-3 border-rose-500/20 bg-rose-500/5">
                                    <strong>{isId ? "4. Pemalsuan Identitas & Data Akademik:" : "4. Identity Theft & Academic Falsification:"}</strong>{" "}
                                    {isId ? "Dilarang mendaftar menggunakan identitas (Nama/NRP) milik mahasiswa lain atau memalsukan bukti persyaratan." : "Registering with another student's credentials (Name/NRP) or submitting forged prerequisite documents."}
                                </div>
                            </div>
                        </section>

                        {/* Section 4 */}
                        <section id="sec-4" className="scroll-mt-28 space-y-4">
                            <div className="border-l-2 border-[#5D8A6B] pl-4">
                                <span className="text-xs font-mono font-bold text-[#5D8A6B] dark:text-[#8AB597] uppercase">BAGIAN 4 / PART 4</span>
                                <h2 className="text-2xl font-bold tracking-tight text-[var(--tnl-heading)]">
                                    {isId ? "Pendaftaran Kegiatan, Praktikum, & Seleksi" : "Event Registration, Practicums & Selection"}
                                </h2>
                            </div>
                            <p className="text-justify">
                                {isId
                                    ? "Dalam pendaftaran kegiatan (seperti Open House, Pelatihan Jaringan, atau rekrutmen asisten), peserta bertanggung jawab penuh atas keabsahan data yang dimasukkan. Panitia laboratorium berhak penuh untuk mendiskualifikasi atau menolak pendaftaran apabila ditemukan ketidaksesuaian data, manipulasi berkas bukti follow, atau pelanggaran etika akademik."
                                    : "Participants bear full legal responsibility for data accuracy when enrolling in event or training programmes. The laboratory reserves full authority to reject or disqualify registrations suspected of falsified identities or manipulated requirements."}
                            </p>
                        </section>

                        {/* Section 5 */}
                        <section id="sec-5" className="scroll-mt-28 space-y-4">
                            <div className="border-l-2 border-[#5D8A6B] pl-4">
                                <span className="text-xs font-mono font-bold text-[#5D8A6B] dark:text-[#8AB597] uppercase">BAGIAN 5 / PART 5</span>
                                <h2 className="text-2xl font-bold tracking-tight text-[var(--tnl-heading)]">
                                    {isId ? "Keabsahan Portal Verifikasi e-Sertifikat (/verify)" : "e-Certificate Authenticity & Verification Portal (/verify)"}
                                </h2>
                            </div>
                            <p className="text-justify">
                                {isId ? (
                                    <>
                                        Sertifikat resmi yang diterbitkan oleh Laboratorium Jaringan Telekomunikasi ITS dilengkapi dengan kode identifikasi unik dan QR Code
                                        yang tertaut langsung ke portal validasi resmi <code>https://labtnl.site/verify/&lt;KODE&gt;</code>. Sertifikat hanya dinyatakan sah
                                        apabila parameter nama, judul kegiatan, dan tanggal terbit pada dokumen fisik/PDF cocok persis dengan rekaman data verifikasi di portal ini.
                                        Tindakan memalsukan e-sertifikat atau mengubah isi dokumen merupakan tindak pidana pemalsuan dokumen yang dapat diproses secara hukum.
                                    </>
                                ) : (
                                    <>
                                        Official credentials issued by the TNL Laboratory carry a unique verification code and QR code linking directly to <code>https://labtnl.site/verify/&lt;CODE&gt;</code>.
                                        A certificate is valid if and only if the recipient name, event title, and issuance date perfectly match our live database validation record.
                                    </>
                                )}
                            </p>
                        </section>

                        {/* Section 6 */}
                        <section id="sec-6" className="scroll-mt-28 space-y-4">
                            <div className="border-l-2 border-[#5D8A6B] pl-4">
                                <span className="text-xs font-mono font-bold text-[#5D8A6B] dark:text-[#8AB597] uppercase">BAGIAN 6 / PART 6</span>
                                <h2 className="text-2xl font-bold tracking-tight text-[var(--tnl-heading)]">
                                    {isId ? "Hak Kekayaan Intelektual & Lisensi Materi Praktikum" : "Intellectual Property & Practicum Materials Licence"}
                                </h2>
                            </div>
                            <p className="text-justify">
                                {isId ? (
                                    <>
                                        Seluruh hak cipta, merek dagang, lambang/logo TNL, desain antarmuka, tata letak grafis GSM, foto dokumentasi, dan modul materi praktikum
                                        merupakan kekayaan intelektual milik <strong>Laboratorium Jaringan Telekomunikasi Departemen Teknik Elektro ITS</strong> dan/atau para penulis terkait.
                                    </>
                                ) : (
                                    <>
                                        All copyrights, logos, brand emblems, GSM layouts, photography, and practicum instructional modules are intellectual property of
                                        <strong>Telecommunication Network Laboratory, Department of Electrical Engineering ITS</strong> and its contributing authors.
                                    </>
                                )}
                            </p>
                            <div className="tnl-card p-4 space-y-2 text-xs">
                                <strong className="text-[var(--tnl-heading)]">{isId ? "Ketentuan Lisensi Pengunduhan Modul Praktikum:" : "Practicum Download Licence Terms:"}</strong>
                                <ul className="list-disc pl-5 space-y-1.5 text-justify">
                                    <li>{isId ? "Modul praktikum (.pdf), simulasi Packet Tracer (.pkt), dan file konfigurasi disediakan gratis untuk tujuan pembelajaran, praktikum kurikulum, dan riset mandiri non-komersial." : "Practicum modules (.pdf), network simulations (.pkt), and config files are provided free exclusively for educational, curriculum, and non-commercial academic research."}</li>
                                    <li>{isId ? "Wajib mencantumkan atribusi sumber kepada Laboratorium Jaringan Telekomunikasi Teknik Elektro ITS pada setiap kutipan atau karya turunan akademik." : "Mandatory attribution to Telecommunication Network Laboratory ITS must accompany scholarly citations or derivative student works."}</li>
                                    <li>{isId ? "DILARANG memperjualbelikan, mendistribusikan ulang berbayar, atau memuat ulang file modul pada platform komersial tanpa izin tertulis dari Kepala Laboratorium." : "Commercial resale, monetised redistribution, or hosting modules on commercial study platforms without written approval is strictly prohibited."}</li>
                                </ul>
                            </div>
                        </section>

                        {/* Section 7 */}
                        <section id="sec-7" className="scroll-mt-28 space-y-4">
                            <div className="border-l-2 border-[#5D8A6B] pl-4">
                                <span className="text-xs font-mono font-bold text-[#5D8A6B] dark:text-[#8AB597] uppercase">BAGIAN 7 / PART 7</span>
                                <h2 className="text-2xl font-bold tracking-tight text-[var(--tnl-heading)]">
                                    {isId ? "Layanan & Tautan Pihak Ketiga" : "Third-Party Services & External Links"}
                                </h2>
                            </div>
                            <p className="text-justify">
                                {isId
                                    ? "Situs ini memuat tautan menuju layanan eksternal (seperti Instagram @tnlab_its, profil LinkedIn anggota, penerbit jurnal IEEE/Scopus, dan peta Google Maps). Tautan tersebut disediakan untuk kenyamanan referensi akademik semata. Laboratorium tidak bertanggung jawab atas kebijakan privasi, syarat operasional, atau konten yang dikelola oleh pihak ketiga tersebut."
                                    : "This site contains links to third-party services (such as Instagram @tnlab_its, member LinkedIn profiles, IEEE journal DOIs, and Google Maps). These links are provided solely for academic convenience; the laboratory exercises no operational control over external websites."}
                            </p>
                        </section>

                        {/* Section 8 */}
                        <section id="sec-8" className="scroll-mt-28 space-y-4">
                            <div className="border-l-2 border-[#5D8A6B] pl-4">
                                <span className="text-xs font-mono font-bold text-[#5D8A6B] dark:text-[#8AB597] uppercase">BAGIAN 8 / PART 8</span>
                                <h2 className="text-2xl font-bold tracking-tight text-[var(--tnl-heading)]">
                                    {isId ? "Penafian Jaminan & Batasan Tanggung Jawab" : "Disclaimer of Warranties & Limitation of Liability"}
                                </h2>
                            </div>
                            <p className="text-justify">
                                {isId
                                    ? "Seluruh materi dan layanan pada situs ini disediakan atas dasar 'sebagaimana adanya' ('as is') dan 'sebagaimana tersedia' ('as available'). Meskipun kami berupaya memastikan akurasi jadwal dan informasi teknis, laboratorium tidak menjamin bahwa situs akan bebas dari galat teknis atau jeda pemeliharaan berkala. Untuk urusan akademik krusial (seperti jadwal shift ujian praktikum), mahasiswa diwajibkan melakukan konfirmasi silang ke papan pengumuman resmi Ruang B-301."
                                    : "All content and services are provided on an 'as is' and 'as available' basis. While we strive for accuracy, the laboratory makes no warranties that operations will be completely error-free or uninterrupted. For critical practicum schedules, students must cross-reference announcements at Room B-301."}
                            </p>
                        </section>

                        {/* Section 9 */}
                        <section id="sec-9" className="scroll-mt-28 space-y-4">
                            <div className="border-l-2 border-[#5D8A6B] pl-4">
                                <span className="text-xs font-mono font-bold text-[#5D8A6B] dark:text-[#8AB597] uppercase">BAGIAN 9 / PART 9</span>
                                <h2 className="text-2xl font-bold tracking-tight text-[var(--tnl-heading)]">
                                    {isId ? "Hukum yang Berlaku & Penyelesaian Sengketa" : "Governing Law & Dispute Resolution"}
                                </h2>
                            </div>
                            <p className="text-justify">
                                {isId
                                    ? "Ketentuan Penggunaan ini diatur dan ditafsirkan berdasarkan Hukum Negara Republik Indonesia (termasuk UU ITE, UU Hak Cipta, dan UU PDP). Segala perselisihan yang timbul sehubungan dengan penggunaan situs ini diutamakan untuk diselesaikan melalui musyawarah mufakat secara kekeluargaan di lingkungan civitas akademika Institut Teknologi Sepuluh Nopember, Surabaya."
                                    : "These Terms of Use are governed by the Laws of the Republic of Indonesia. Any dispute arising out of or in connection with this website shall be settled amicably through academic mediation within Institut Teknologi Sepuluh Nopember, Surabaya."}
                            </p>
                        </section>

                        {/* Section 10 */}
                        <section id="sec-10" className="scroll-mt-28 space-y-4">
                            <div className="border-l-2 border-[#5D8A6B] pl-4">
                                <span className="text-xs font-mono font-bold text-[#5D8A6B] dark:text-[#8AB597] uppercase">BAGIAN 10 / PART 10</span>
                                <h2 className="text-2xl font-bold tracking-tight text-[var(--tnl-heading)]">
                                    {isId ? "Kontak Hukum & Administrasi Laboratorium" : "Legal & Administrative Inquiries"}
                                </h2>
                            </div>
                            <p className="text-justify">
                                {isId ? (
                                    <>
                                        Apabila Anda memiliki pertanyaan, klarifikasi hak cipta modul, atau kebutuhan perizinan resmi terkait Ketentuan Penggunaan ini, silakan hubungi:
                                    </>
                                ) : (
                                    <>
                                        For inquiries, copyright permissions, or administrative clarifications regarding these Terms of Use, please reach out to:
                                    </>
                                )}
                            </p>
                            <div className="tnl-card p-5 space-y-2 text-xs bg-black/[0.01] dark:bg-white/[0.02]">
                                <p className="font-bold text-[var(--tnl-heading)]">Laboratorium Jaringan Telekomunikasi (Ruang B-301)</p>
                                <p>Departemen Teknik Elektro, FTEIC - Institut Teknologi Sepuluh Nopember (ITS)</p>
                                <p>Kampus ITS Sukolilo, Surabaya 60111, Jawa Timur, Indonesia</p>
                                <p className="pt-2 text-xs font-mono text-[var(--tnl-tan-text)]">
                                    Email Resmi: <strong>telconnetlab@gmail.com</strong> · Formulir Daring: <Link to="/contact" className="underline text-[#5D8A6B] dark:text-[#8AB597]">labtnl.site/contact</Link>
                                </p>
                            </div>
                        </section>
                    </div>
                </div>
            </main>
        </div>
    );
}

export default PrivacyPage;
