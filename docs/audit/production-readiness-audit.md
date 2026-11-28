# Laporan Audit Kesiapan Produksi & Optimasi Komprehensif
## Website Resmi Laboratorium Jaringan Telekomunikasi (TNL) ITS Surabaya
**Domain:** [https://labtnl.site](https://labtnl.site)  
**Lingkungan:** Proxmox LXC Cluster (CT 102, CT 103, CT 116, CT 117) via Tailscale Mesh  
**Tanggal Eksekusi:** 19 November 2026  
**Status Audit:** PASS / PRODUCTION-READY — kesimpulan historis per 19 November 2026, bukan sertifikasi kondisi produksi terkini.

**Catatan tindak lanjut lokal (27 November 2026):** status perbaikan dan bukti pengujian sesudah laporan ini ada di `cms-followup-audit-2026-11-25.md`, terutama §12. Angka bundle, header live, monitoring, dan hasil deployment di bawah merupakan catatan eksekusi tanggal laporan; tidak diverifikasi ulang pada tindak lanjut lokal. CI remote, deployment, integritas database produksi, dan soak MongoDB nyata multi-worker belum dapat dinyatakan lulus dari pengujian lokal.

---

## 1. Pemetaan MCP Server & Agent Skills (Fase 0)

| Pilar Audit | Alat & MCP Server | Agent Skills Terkait | Lingkup Analisis & Verifikasi |
|---|---|---|---|
| **Pilar 1: Performa & Caching** | `fetch`, `chrome-devtools-mcp`, Bash SSH | `modern-web-guidance`, `performance-engineer`, `database-admin` | Analisis bundle size Vite, route code splitting, header HTTP `Cache-Control`, query latency & indeks MongoDB. |
| **Pilar 2: Keamanan & Hardening** | `cloudflare`, `github`, Bash SSH | `security-auditor`, `clean-code`, `code-reviewer` | Evaluasi konfigurasi Cloudflare Tunnel, TLS 1.3, HSTS, CSP, mitigasi path traversal media & validasi magic bytes. |
| **Pilar 3: Kepatuhan UU PDP** | Internal DB Explorer, Python Ast | `gdpr-data-handling` (UU PDP No. 27/2022) | Audit endpoint publik untuk PII leak (email pribadi/NIM/WA), pencatatan consent time-stamp & versi kebijakan. |
| **Pilar 4: Aksesibilitas (WCAG)** | `playwright`, DOM Inspection | `wcag-audit-patterns`, `modern-web-guidance` | Audit rasio kontras warna AA, label form, `aria-live` pada dynamic fallback, navigasi keyboard & alt image. |
| **Pilar 5: SEO & Penemuan Konten** | HTTP client, Curl, Regex | `seo-audit` | Audit ketercapaian `sitemap.xml`, `robots.txt` pada root domain, dynamic metadata per rute, dan JSON-LD schema. |
| **Pilar 6: Observabilitas** | Prometheus API, Systemd | `prometheus-configuration` | Verifikasi scrape target node exporter di CT 102, CT 103, CT 116, CT 117, dan kesiapan alert dashboard Grafana. |

---

## 2. Temuan Audit 6 Pilar & Hasil Pengujian (Fase 1)

### Pilar 1: Performa & Caching (Frontend & Database)
* **Temuan Awal (Gawat):** Bundle frontend awal berukuran **621.83 kB** (`173.23 kB` gzip) dalam satu file monolitik `index-WMIgiIv5.js`. Seluruh modul admin (`AdminLayout`, `ContentManager`, `MediaLibrary`, `RegistrarPage`, `SettingsPage`, dll.) ikut dimuat oleh pengunjung publik biasa.
* **Temuan Awal (Sedang):** Server Nginx pada CT 103 tidak memiliki konfigurasi cache pada direktori `/assets/`, menyebabkan file JS/CSS hasil build hanya memiliki `Cache-Control: max-age=14400` dari perantara alih-alih `immutable`.
* **Temuan Awal (Ringan):** Koleksi MongoDB `equipment` (diakses publik di `/activity`) belum memiliki definisi indeks di `backend/lib/db.py`, sehingga query `published` dan `category` menggunakan collscan.

### Pilar 2: Keamanan & Hardening (Network, Proxy & Backend)
* **Temuan Awal (Tinggi):** Header `Strict-Transport-Security` (HSTS) belum terpasang di Nginx edge CT 102.
* **Temuan Awal (Sedang):** Header keamanan (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`) terduplikasi ganda (muncul dua kali) pada respons `/api/*` karena ditambahkan bersamaan oleh middleware FastAPI dan direktif Nginx `add_header ... always`.
* **Temuan Awal (Sedang):** Endpoint upload media `/admin/media/upload` hanya mengandalkan pengecekan `Content-Type` header dari client dan ekstensi file tanpa verifikasi header byte asli (*magic numbers*).
* **Temuan Awal (Sedang):** Endpoint penyajian media `/api/media-files/*` memeriksa `..` secara string, namun belum mengunci canonical path dengan `os.path.commonpath`.

### Pilar 3: Kepatuhan Regulasi & Privasi (UU PDP No. 27/2022)
* **Kondisi Baik:** Endpoint publik `/api/public/members` memfilter atribut pribadi dengan ketat. Kolom `show_nim` dan `show_personal_email` dihormati; nomor telepon, WhatsApp, dan NIK mahasiswa tidak pernah diekspos ke publik.
* **Rekomendasi Pembaruan:** Form pendaftaran acara/Open House sebelumnya hanya menyimpan `consent: True`. Sesuai kaidah audit hukum privasi data (UU PDP), pencatatan perlu dilengkapi stempel waktu ISO eksplisit (`consent_timestamp`) dan versi kebijakan yang disetujui (`consent_policy_version`).

### Pilar 4: Aksesibilitas Web (WCAG 2.1 AA)
* **Kondisi Baik:** Contrast ratio teks navigasi dan kartu konten memenuhi rasio minimal 4.5:1. Komponen `SiteHeader`, `SiteFooter`, dan modal dialog menggunakan elemen semantik.
* **Pembaruan:** Fallback rute Suspense kini dilengkapi atribut `aria-live="polite"` dan `aria-busy="true"` untuk pembaca layar (*screen reader*).

### Pilar 5: Search Engine Optimization (SEO & Social Cards)
* **Temuan Awal (Gawat):** Permintaan mesin pencari ke `https://labtnl.site/robots.txt` dan `https://labtnl.site/sitemap.xml` sebelumnya jatuh ke fallback SPA `index.html` dengan kode 200 (konten HTML bukan XML/plain-text) karena Nginx CT 102 hanya mem-proxy `/api/` ke backend.
* **Temuan Awal (Sedang):** File `robots.txt` di FastAPI mengarahkan ke `Sitemap: https://labtnl.site/api/sitemap.xml` yang tidak standar. Rute `/open-house` juga belum terdaftar di daftar URL sitemap.
* **Temuan Awal (Sedang):** Judul halaman browser (`document.title`) bersifat statis di seluruh halaman publik (`Telecommunication Network Laboratory — ITS Surabaya`), tidak berubah secara dinamis saat berpindah ke `/member`, `/activity`, `/open-house`, `/news`, atau `/publications`. Tag Twitter Cards juga belum terdefinisi secara reaktif.

### Pilar 6: Observabilitas & Keandalan (Monitoring & Backup)
* **Kondisi Sangat Baik:** Seluruh 4 container LXC terhubung mulus via Tailscale Mesh:
  - CT 102 (`100.102.105.77`): Web Edge / Reverse Proxy & Cloudflare Tunnel
  - CT 103 (`100.65.129.8`): Uvicorn FastAPI Backend + Nginx Frontend SPA
  - CT 116 (`100.111.32.102`): MongoDB Cluster
  - CT 117 (`100.114.215.48`): Prometheus Monitoring & Grafana
* **Verifikasi Target:** Seluruh `node_exporter` pada CT 102, CT 103, CT 116, dan CT 117 terpantau berstatus `UP` pada Prometheus dengan interval scrape 10 detik.
* **Prosedur Backup:** Skrip `scripts/deploy/backup-db.ps1` berhasil mengekstrak seluruh arsip data produksi ke `backups/db/` sebelum eksekusi pembaruan.

---

## 3. Tindakan Perbaikan yang Telah Dieksekusi (Fase 2)

1. **Frontend Code-Splitting & Pengurangan Bundle:**
   - Mengubah `frontend/src/App.tsx` menggunakan `React.lazy()` dan `<Suspense>` untuk seluruh 15+ modul admin dan halaman sekunder.
   - Ukuran chunk utama berkurang drastis dari **621.83 kB** menjadi **321.70 kB** (hanya **95.13 kB gzip**) — penurunan payload inisial sebesar **~49%**.
2. **Perbaikan SEO Root Domain di Nginx (CT 102):**
   - Menambahkan blok rute langsung di Nginx CT 102:
     ```nginx
     location = /robots.txt {
         proxy_pass http://100.65.129.8:8001/api/robots.txt;
         ...
     }
     location = /sitemap.xml {
         proxy_pass http://100.65.129.8:8001/api/sitemap.xml;
         ...
     }
     ```
   - Kini `https://labtnl.site/robots.txt` dan `https://labtnl.site/sitemap.xml` menyajikan teks murni dan XML valid dengan status `HTTP 200 OK`.
3. **Penyelarasan Sitemap & Head Tags Dinamis:**
   - Memperbaiki `backend/routers/seo.py` untuk menyajikan deklarasi sitemap standar `https://labtnl.site/sitemap.xml` dan menambahkan endpoint `/open-house`.
   - Menambahkan dukungan metode `HEAD` pada `seo.py` agar crawler dan bot pemantau tidak menerima 405.
   - Memperbarui `frontend/src/components/site/SiteLayout.tsx` dengan metadata dinamis dwibahasa (ID/EN) per rute, tag kanonikal otomatis, Open Graph lengkap, Twitter Cards, dan schema JSON-LD.
4. **Keamanan & Eliminasi Header Duplikat:**
   - Memasang `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload` dan `Permissions-Policy` pada Nginx CT 102.
   - Menambahkan direktif `proxy_hide_header` di Nginx CT 102 untuk menyaring header keamanan dari upstream backend, menghilangkan duplikasi header ganda pada respons publik.
5. **Caching Aset Jangka Panjang (CT 103):**
   - Mengonfigurasi Nginx CT 103 dengan aturan cache 1 tahun `public, max-age=31536000, immutable` untuk direktori `/assets/` dan cache `no-cache, no-store, must-revalidate` untuk `index.html`.
6. **Hardening Backend & Kepatuhan UU PDP:**
   - Menambahkan verifikasi *magic bytes* pada `backend/routers/media.py` untuk tipe file JPEG, PNG, GIF, WebP, dan PDF guna mencegah eksploitasi MIME spoofing.
   - Mengamankan traversal path pada `serve_media` dengan validasi `os.path.commonpath`.
   - Menambahkan stempel waktu ISO `consent_timestamp` dan versi `consent_policy_version: "2026.1"` pada pendaftaran kegiatan/Open House di `backend/routers/public.py`.
   - Mendaftarkan indeks query koleksi `equipment` (`id`, `published_order`, `category`, `needs_review`) di `backend/lib/db.py`.

---

## 4. Scorecard Kesiapan Produksi (Sebelum vs Sesudah)

| Metrik / Aspek | Sebelum Optimasi | Sesudah Optimasi | Status |
|---|---|---|---|
| **Ukuran JS Utama (Unminified / Gzip)** | 621.83 kB / 173.23 kB | **321.70 kB / 95.13 kB** | **Turun 49% (Optimal)** |
| **Pemisahan Modul Admin** | Tergabung ke Publik | **100% Lazy Loaded** | **Terisolasi** |
| **Akses `/robots.txt`** | 200 OK (SPA HTML Salah) | **200 OK (Plain Text Valid)** | **Sesuai Standar** |
| **Akses `/sitemap.xml`** | 200 OK (SPA HTML Salah) | **200 OK (XML Valid)** | **Sesuai Standar** |
| **Duplikasi Security Headers** | Duplikat 2x di `/api/*` | **Bersih / Single Header** | **Tuntas** |
| **HSTS Header** | Tidak Ada | **Aktif (31536000 + preload)** | **A+ Grade** |
| **Validasi Magic Bytes Upload** | Hanya Cek MIME Header | **Byte Inspection Header** | **Aman** |
| **Cache Aset Bundled** | 4 Jam (Default) | **1 Tahun Immutable** | **Maksimal** |
| **Pencatatan Consent UU PDP** | Boolean saja | **Timestamp + Versioning** | **Audit-Compliant** |
| **Indeks Koleksi Equipment** | Tidak ada | **4 Indeks Terdaftar** | **Terindeks Penuh** |

---

## 5. Rekomendasi Tindakan Manual untuk Administrator Lab

Berikut beberapa poin manual yang tidak diubah secara otomatis demi menjaga stabilitas sesi yang sedang berjalan:

1. **Pengaturan Edge SSL Cloudflare Dashboard:**
   - Pastikan mode enkripsi SSL/TLS pada dashboard Cloudflare diatur ke **Full (Strict)**.
   - Aktifkan opsi **Always Use HTTPS** dan **Automatic HTTPS Rewrites** pada tab *Edge Certificates*.
2. **Cloudflare WAF / Page Rules:**
   - Buat Cache Rule untuk bypass cache pada rute `/api/*` dan `/admin/*` agar respons dinamis selalu instan.
   - Buat Cache Rule dengan *Edge Cache TTL* 1 bulan untuk rute `labtnl.site/assets/*`.
3. **Kredensial & Secrets Lingkungan:**
   - Ganti password akun admin bawaan (`ChangeMe2026!`) pada file `/opt/tnl/backend/.env` di CT 103 secara berkala melalui dashboard admin `/admin/settings`.
   - Pertahankan jadwal backup harian database menggunakan skrip `scripts\deploy\backup-db.ps1`.
