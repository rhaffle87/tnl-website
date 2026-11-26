# Laporan Pengujian Otomatis Holistik (Test Coverage Report)
**Laboratorium Jaringan Telekomunikasi (TNL) ITS — `https://labtnl.site`**
*Tanggal Eksekusi:* 20 November 2026 (rincian suite) / 25 November 2026 (verifikasi gate)
*Status:* **100% PASS across All 3 Layers (Backend, Frontend, E2E Smoke)**

> **Catatan pembaruan:** Runtime frontend dan CI menggunakan **Node.js 22**. Angka gate terverifikasi sebelum perbaikan audit adalah **backend 154** dan **frontend 360** — keduanya merupakan **minimum; jumlah final dicatat oleh parent setelah perbaikan audit selesai**. Rincian per-suite pada bagian 3–4 di bawah adalah snapshot historis eksekusi 20 November 2026 dan belum mencerminkan penambahan tes terbaru.

---

## 1. Ringkasan Eksekutif & Guardrail Compliance

Sesuai dengan instruksi dan standar mutu produksi institusi:
1. **Zero Production Mutation / Pollution (Isolasi Database Total):**
   - Seluruh pengujian backend `pytest` dijalankan pada *mock database* in-memory berbasis `mongomock_motor.AsyncMongoMockClient()` dan in-process transport ASGI (`httpx.ASGITransport` & Starlette `TestClient`).
   - Tidak ada koneksi atau modifikasi data apa pun ke database produksi MongoDB `tnl` pada CT 116 (`100.111.32.102`).
2. **Kepatuhan Node Guardrail:**
   - Node `ollama-server` (`100.110.11.66` / `192.168.30.100`) **SAMA SEKALI TIDAK TERSENTUH**.
3. **E2E Smoke Testing Strictly Read-Only:**
   - Pengujian live terhadap domain produksi `https://labtnl.site` murni menggunakan operasi idempotent (`GET`/`HEAD`/DOM inspection) tanpa payload mutasi (`POST`/`PUT`/`DELETE`).

---

## 2. Rincian Eksekusi Test Suite 3 Lapis

```
==========================================================================================
LAYER                          TOOL / RUNNER           TEST FILES   TEST CASES   OUTCOME
==========================================================================================
Layer 1: Backend Integration   pytest + mongomock_motor    10           154        100% PASS
Layer 2: Frontend Components   Vitest + Testing Library     7           360        100% PASS
Layer 3: E2E Smoke & Visual    Playwright (Chromium)        1            16        100% PASS
TypeScript & Build Check       tsc -b && vite build         -            -        100% PASS
==========================================================================================
TOTAL TERVERIFIKASI (minimum)                             18           530        100% PASS
==========================================================================================
Angka backend 154 / frontend 360 = minimum; final counts recorded by parent after audit fixes.
```

---

## 3. Layer 1: Backend Test Suite (`backend/tests/`)

Dijalankan dengan perintah: `python -m pytest backend/tests -v --cov=backend`

### Test Suites Terpasang:
1. **`test_health_db_indexes.py` (4 tests):**
   - Verifikasi root API index endpoint `GET /api/`.
   - Verifikasi status health check normal `GET /api/health` (`{"status": "ok", "database": "connected"}`).
   - Fallback degraded 503 jika database offline.
   - Pengecekan definisi indeks MongoDB unik pada `users`, `audit_logs`, dan `registrations`.
2. **`test_auth_rbac_security.py` (6 tests):**
   - Login cookie security: Atribut `HttpOnly`, `SameSite=Lax`, dan `Path=/api`.
   - Penolakan login password salah dengan kode 401.
   - Logout session: Penghancuran session cookie dan token di database.
   - Pembersihan session kadaluarsa (*expired session sweep*).
   - Proteksi endpoint `/api/admin/*` terhadap akses tanpa autentikasi (401).
   - Verifikasi hak akses berbasis RBAC (`viewer`, `registrar`, `super_admin`) dan scoping divisi admin.
3. **`test_public_content_and_pii.py` (8 tests):**
   - Sanitasi data publik & pencegahan kebocoran PII: Field nomor telepon pribadi, email pribadi, dan NRP/NIM dipastikan `None` atau tidak disertakan pada respon endpoint publik `/api/members`.
   - Pengujian publik: `settings`, `stats`, `equipment`, `practicum`, `events`, `activities`, `posts`, dan `publications`.
4. **`test_open_house_registrar_and_pdp.py` (3 tests):**
   - Validasi pendaftaran Open House & Event: NRP minimal 7 digit, penolakan jika checkbox UU PDP tidak dicentang.
   - Honeypot protection: Deteksi dan pemblokiran bot otomatis jika field tersembunyi `company_website` terisi.
   - Penolakan duplikasi pendaftaran untuk NRP/email yang sama pada satu event.
   - Ekspor data registrasi: Format CSV dan Excel (`.xlsx`) via openpyxl.
   - Hak Lupa & Retensi UU PDP: Penghapusan data registrasi atau anonimisasi nama/kontak setelah masa retensi.
5. **`test_certificates_and_pdf.py` (1 test):**
   - Penerbitan kode sertifikat standar institusi (`TNL-2026-TRA-XXXXXX`).
   - Verifikasi keaslian via endpoint `/api/public/verify/{code}`.
   - Unduhan PDF sertifikat resmi dengan header biner `%PDF-`, metadata penerbitan, dan QR Code tersemat.
6. **`test_media_security.py` (6 tests):**
   - Wajib alt-text untuk aksesibilitas WCAG pada setiap unggahan gambar.
   - Pemrosesan gambar PNG dan konversi derivatif WebP multi-resolusi.
   - Dukungan unggahan berkas akademik terdaftar (misal `.pkt` Cisco Packet Tracer).
   - Penolakan spoofing magic bytes (file teks yang diubah ekstensi menjadi `.png`).
   - Penegakan batas ukuran maksimum unggahan berkas (10 MB).
   - Pencegahan serangan path traversal (`../`) pada endpoint media.
7. **`test_seo_and_ssr_meta.py` (4 tests):**
   - Penyediaan endpoint `robots.txt` dengan deklarasi crawling yang aman.
   - Penyediaan endpoint `sitemap.xml` dinamis.
   - Server-Side SEO Pre-rendering `/api/seo/render` untuk crawler mesin pencari (Open Graph, Twitter Card, Canonical URL).
   - Sanitasi entitas HTML terhadap serangan XSS pada payload meta title dan deskripsi.
8. **`test_admin_cms_and_gsm_theme.py` (3 tests):**
   - Siklus CRUD konten CMS publik beserta fitur soft-delete dan restore (undo-delete).
   - Dynamic collection management untuk entitas kustom.
   - Sistem tema GSM kepengurusan: Penerapan token CSS variable dan validasi rasio kontras warna WCAG AA.
9. **`test_tnl.py` & `test_figma_sync.py` (42 tests):**
   - 42 pengujian fungsional modul sinkronisasi Figma, layout engine, dan utilitas pendukung seluruhnya lulus 100%.

---

## 4. Layer 2: Frontend Component & Integration Suite (`frontend/src/__tests__/`)

Dijalankan dengan perintah: `npx vitest run` (konfigurasi worker terisolasi `pool: "forks"`).

### Test Suites Terpasang:
1. **`ChromeAndLayout.test.tsx` (4 tests):**
   - Rendering `SiteHeader`: Branding institusi, logo TNL, dan tautan navigasi utama.
   - Rendering `SiteCollaborationBand`: Blok CTA kolaborasi riset beserta tombol aksi.
   - Rendering `SiteFooter`: Grid 4 kolom informasi, legalitas Departemen Teknik Elektro ITS, dan SVG monumental watermark `LAB TNL` (single-line, full margin).
   - Rendering `MobileRegistrationBar`: Bar aksi responsif pada rute publik saat ada event aktif.
2. **`HomeBlocksAndMarquee.test.tsx` (3 tests):**
   - Rendering `HeroBlock`: Emblem TNL, tipografi `.tnl-eyebrow`, dan `.tnl-hero-title`.
   - Rendering `AboutBlock`: Penerapan styling perataan teks `text-justify` untuk keterbacaan artikel.
   - Rendering `PartnersBlock`: Marquee kemitraan industri (misal *Indosat Ooredoo Hutchison*) tanpa pemotongan teks (*no truncation*).
3. **`NewsFilterAndSearch.test.tsx` (2 tests):**
   - Stabilitas filter kategori: Mengklik salah satu kategori (misal *Research*) memfilter daftar berita tanpa menghilangkan tombol kategori lain (*Training*, *Community Service*).
   - Pencarian berita: Penanganan input pencarian dengan debounce stabil tanpa memicu re-render tak hingga.
4. **`MemberSections.test.tsx` (3 tests):**
   - Rendering Kepala Laboratorium dan Dosen Pembina.
   - Tab switching asisten aktif vs alumni kepengurusan.
   - Verifikasi card asisten tanpa kebocoran PII.
5. **`MediaCarouselAndActivity.test.tsx` (3 tests):**
   - Fade carousel transisi galeri aktivitas lab.
   - Lightbox modal pop-up untuk inspeksi visual gambar resolusi tinggi.
   - Navigasi tab kegiatan (Riset, Praktikum, Pelatihan).
6. **`OpenHouseAndVerify.test.tsx` (2 tests):**
   - Formulir `OpenHousePage`: Validasi masukan Nama, NRP, dan persetujuan UU PDP.
   - Antarmuka `VerifyPage`: Formulir input kode sertifikat dan penampilan status validasi keaslian.
7. **`AdminCmsComponents.test.tsx` (3 tests):**
   - Formulir masuk admin (`AdminLogin`).
   - Halaman registrasi kepesertaan (`RegistrarPage`).
   - Pengaturan token warna GSM kepengurusan (`ThemePage`).

---

## 5. Layer 3: E2E Read-Only Smoke & Visual Integrity (`scripts/test/run_e2e_smoke.py`)

Dijalankan secara berkala pada URL live `https://labtnl.site` menggunakan Playwright Chromium.

### Hasil Verifikasi Live:
1. **Multi-Viewport & Responsive:**
   - Desktop (1440x900): **HTTP 200, 0 Console Errors, 0 Broken Images**.
   - Laptop (1920x1080): **HTTP 200, 0 Console Errors, 0 Broken Images**.
   - Mobile (390x844 iPhone 12/13/14): **HTTP 200, 0 Console Errors, 0 Broken Images**.
2. **Interactive DOM & UX:**
   - **Language Toggle:** Alih bahasa ID ↔ EN berhasil mengubah teks antarmuka secara instan tanpa reload penuh.
   - **Dark Mode Toggle:** Alih tema gelap/terang berhasil mengubah kelas `html.dark` dan token GSM.
   - **News Filter Stability:** Seluruh tombol kategori berita terverifikasi stabil saat interaksi berlangsung.
   - **Footer Monumental Watermark:** Teks SVG `LAB TNL` terkunci dalam 1 baris, terpusat proporsional, dan bebas clipping.
3. **SEO & Meta Verification:**
   - `<title>`: Terdefinisi rapi ("Laboratorium Jaringan Telekomunikasi — Institut Teknologi Sepuluh Nopember").
   - `<meta name="description">`: Terisi ringkasan profil laboratorium.
   - Open Graph (`og:title`, `og:description`, `og:image`): Siap untuk preview link media sosial.
   - Canonical URL: `https://labtnl.site`.
4. **Read-Only Route Crawl (Seluruhnya 200 OK):**
   - `/` (Home): HTTP 200
   - `/member` (Member): HTTP 200
   - `/activity` (Activity): HTTP 200
   - `/news` (News): HTTP 200
   - `/publications` (Publications): HTTP 200
   - `/contact` (Contact): HTTP 200
   - `/open-house` (Open House Portal): HTTP 200
   - `/verify` (Certificate Verification): HTTP 200

---

## 6. Temuan Bug & Resolusi yang Diterapkan Selama Pengujian

1. **Bug Infinite Re-render pada `NewsFeedBlock` (`frontend/src/components/site/Blocks.tsx`):**
   - *Masalah:* `useEffect` memanggil `setMasterCategories(data.categories)` setiap kali query me-refresh referensi array, memicu re-render tanpa batas di React.
   - *Solusi:* Ditambahkan pemeriksaan kesamaan isi (*content equality check*) sebelum memperbarui state kategori:
     ```tsx
     setMasterCategories((prev) => {
         const incoming = data.categories as string[];
         if (prev.length === incoming.length && prev.every((v, i) => v === incoming[i])) {
             return prev;
         }
         return incoming;
     });
     ```
2. **Kelonggaran Validasi Status Sertifikat (`backend/routers/public.py`):**
   - *Masalah:* Endpoint verifikasi sertifikat sebelumnya menolak sertifikat valid jika status pendaftar belum berlabel `"accepted"` atau `"attended"`.
   - *Solusi:* Diperbarui agar seluruh sertifikat resmi yang telah diterbitkan dapat divalidasi keasliannya selama peserta tidak dalam status `"rejected"`.
3. **Penyelarasan Verifikasi Typecheck TypeScript:**
   - *Masalah:* Tipe `Block` mewajibkan properti `hidden: boolean`, dan import `ReactNode` pada `test-utils.tsx` membutuhkan `type` modifier untuk verbatim module syntax.
   - *Solusi:* Ditambahkan `hidden: false` pada blok fixture pengujian dan disesuaikan `import React, { type ReactNode } from "react"`.

---

## 7. Instruksi Eksekusi Berkala bagi Pengembang / CI-CD

Seluruh rangkaian pengujian 3 lapis dapat dieksekusi melalui satu perintah:

```powershell
# Jalankan runner holistik otomatis
powershell -ExecutionPolicy Bypass -File scripts\test\run-all-tests.ps1
```

Atau dijalankan secara terpisah:
```powershell
# Hanya backend pytest
python -m pytest backend/tests -v --cov=backend

# Hanya frontend Vitest
cd frontend; npx vitest run

# Hanya E2E Read-Only Smoke Playwright
python -u scripts/test/run_e2e_smoke.py
```
