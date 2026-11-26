# Audit Lanjutan CMS TNL Studio — 25 November 2026

**Lingkup:** lokal saja. Tidak ada deploy, tidak ada perubahan database live, tidak ada SSH ke CT, tidak ada commit/push, dan tidak menyentuh `ollama-server (100.110.11.66 / 192.168.30.100)`.

**Status:** audit statis, implementasi semua temuan, dan seluruh gate lokal selesai hijau. Semua pekerjaan lokal; tinjauan/commit/deploy menunggu izin paneer.

---

## 1. Gate lokal setelah pembersihan 52 warning lint

| Gate | Hasil |
|---|---|
| `npx oxlint .` | 0 warning (dari 52 warning: 22 unused, 6 exhaustive-deps, 24 only-export-components) |
| `npx tsc --noEmit` | lolos |
| `npx vitest run --maxWorkers=1` | 40/40 file, 371/371 test, exit 0 |
| `npm run build` | lolos |
| Gate geometri/DESIGN.md | lolos |

Catatan: angka di tabel di atas adalah baseline sebelum perbaikan lanjutan. Untuk K5, `allowExportNames` global sudah dihapus; 24 simbol helper kini tercakup oleh 14 entri `overrides` per-file. Detail K6 ada di `README.md` (`Sunset note`). Hasil gate terbaru dicatat di bagian 6.

---

## 2. Verifikasi temuan keamanan yang sudah diperbaiki

Tiga temuan lama diverifikasi masih terpasang di repo:

1. HSTS `max-age=31536000; includeSubDomains; preload` + `Permissions-Policy` ada di `scripts/deploy/nginx-ct102.conf:18`.
2. Validasi magic bytes upload ada di `backend/routers/media.py:75-85` dan dipanggil di `:263`.
3. Penguncian canonical path memakai `os.path.commonpath` di `backend/routers/media.py:445`.
4. Duplikasi header keamanan upstream dicegah dengan `proxy_hide_header` di `scripts/deploy/nginx-ct102.conf:32-79`.

Tidak ada perubahan baru pada area ini.

---

## 3. Temuan aksesibilitas & i18n (baru)

### A1 — Tinggi: dropzone upload hanya mouse
`frontend/src/components/admin/media/MediaPickerModal.tsx:684-711`. `<div onClick>` dengan `<input type="file" className="hidden">`; teks “browse” hanya `<span>`. Pengguna keyboard/pembaca layar tidak bisa mengunggah. Perbaikan: `<button type="button">` atau `tabIndex=0` + `role="button"` + `onKeyDown` Enter/Space + `aria-label`.

### A2 — Sedang: kontrol search/upload tanpa nama aksesibel
`MediaPickerModal.tsx:406-413, 737-761`. Input hanya `placeholder`; `<label>` tanpa `htmlFor` dan tidak membungkus kontrol; `AdminSelect` tanpa `aria-label`. Perbaikan: pasangkan `id`/`htmlFor` atau `aria-label` dari `STRINGS`.

### A3 — Sedang: crop frame pointer-only
`frontend/src/components/admin/media/ImageCropDialog.tsx:252-260`. `<canvas>` hanya `onPointerDown/Move/Up`, tidak focusable. Perbaikan: `tabIndex=0` + navigasi arrow key (Shift = langkah besar) atau slider X/Y/zoom.

### A4 — Sedang: error validasi tidak diumumkan
`RichTextField.tsx:307-310`, `FormFieldsBuilder.tsx:300-304`, `KeyValueMapEditor.tsx:242-245`, `ObjectListRepeater.tsx:240-244`. Teks error hanya `<p>/<span>` merah. Perbaikan: `role="alert"`, `aria-invalid`, `aria-describedby`.

### A5 — Sedang: status loading/upload visual saja
`MediaPickerModal.tsx:801-815, 861-872, 903-910`, `AdminUI.tsx:284`. “Uploading…”, “Ready”, error antrean, “Nothing selected yet”, “Working…” tanpa live region. Perbaikan: `role="status" aria-live="polite"` untuk ringkasan dan `role="alert"` untuk error.

### A6 — Sedang: CMS tidak bilingual
20 file `.tsx` di `pages/admin` + `components/admin`: 0 pemakaian `useLocale`/`STRINGS`. Contoh: `ContentManager.tsx:681-707`, `AdminLayout.tsx:437-452`, `AdminScreens.tsx:1557-1565`. `MediaPickerModal.tsx:838` memakai “Detail aset” di tengah UI Inggris. Perbaikan: kamus `STRINGS.cms.*` via `useLocale`.

### A7 — Sedang: pesan dialog konfirmasi tidak terhubung
`frontend/src/pages/admin/AdminScreens.tsx:1541-1548`. `aria-labelledby` hanya menunjuk judul; `<p>{message}</p>` tanpa `id`/`aria-describedby`. Logika fokus di `:1529-1535` sudah benar dan tidak perlu diubah.

### A8 — Rendah: alt text generik/hardcode Inggris
`InlineMediaField.tsx:182`, `MultiMediaField.tsx:181`, `ContentEditor.tsx:986, 1006`, `MediaPickerModal.tsx:595`. Perbaikan: fallback lokal via `STRINGS` dengan cadangan `filename`/`label`.

**Metode:** inspeksi kode statis. Belum ada uji axe-core atau pembaca layar langsung.

---

## 4. Temuan kualitas kode & test (baru)

### K1 — Tinggi: triage pesan kosong menulis status palsu
`backend/routers/registrar.py:363-366`. `update_one({"triage": {"ai_ok": False}})` terjadi sebelum endpoint melempar 422. Pesan itu lalu terlewat oleh `triage-all` yang hanya mencari `{"triage": {"$exists": False}}` (`:372`). Terverifikasi di kode. Perbaikan: validasi `ai_ok` sebelum `update_one`; tambahkan asersi DB di `backend/tests/test_advisor_local.py:169-179`.

### K2 — Tinggi: upload `.docx` tersimpan sebagai `.zip`
`backend/lib/storage.py:41-42` + `backend/routers/media.py:232-235`. Semua OOXML diawali `PK\x03\x04`, sehingga `sniff_content_type` selalu mengembalikan `application/zip, .zip`. `DOC_EXT_BY_MIME` untuk `.docx` tidak terpakai pada jalur ini. Terverifikasi di kode. Perbaikan: deteksi OOXML lewat `[Content_Types].xml` / `word/` / `xl/` / `ppt/`, atau pertahankan ekstensi deklarasi saat sniff menghasilkan ZIP; tambah test regression.

### K3 — Sedang: ekspor log tidak sesuai UI dan terpotong diam-diam
`frontend/src/pages/admin/AdminDashboard.tsx:257, 263-265`; `backend/routers/siteadmin.py:376-394`. UI menjanjikan “export the visible range”, tetapi link hanya membawa `period`, bukan `limit`/`offset`. Backend memakai default `limit=1000`; penanda `X-Audit-Truncated` tidak bisa dibaca anchor. Terverifikasi di kode. Perbaikan: teruskan `limit`/`offset` ke link atau kembalikan `truncated` dalam body; uji batas 1000/5000.

### K4 — Sedang: focus-trap dialog ditulis ulang empat kali
`frontend/src/pages/admin/AdminUI.tsx:199-231`, `AdminScreens.tsx:1505-1535`, `AdminLayout.tsx:187-212`, `frontend/src/components/site/Chrome.tsx:92-105`. Versi `UsersConfirmDialog` hanya menjebak `<button>`, bukan link/input. Perbaikan: ekstrak satu `useFocusTrap(ref, onEscape)` di `lib/`.

### K5 — Rendah: 0 warning lint sebagaimana hasil allowlist 24 simbol
`frontend/.oxlintrc.json:6`. `react/only-export-components` dikecualikan untuk helper, hook, dan konstanta. Perbaikan: pindahkan helper murni ke modul `.ts`, biarkan hanya `allowConstantExport`, atau batasi override per file.

### K6 — Sedang: flag fitur tidak diuji lewat jalur build-time
`frontend/src/lib/features.ts:14-16` vs `frontend/src/__tests__/OpenHouseDeskPolish.test.tsx:59-68`. Test mengubah objek `FEATURES` saat runtime; tidak ada test `import.meta.env.VITE_FEATURE_*` atau build dengan flag aktif. Terverifikasi di kode. Perbaikan: `vi.stubEnv` + reset modul; tambah smoke build dua flag aktif dan tanggal penghapusan di README.

### K7 — Sedang: advisor menandai semua issue di field `body`
`backend/lib/advisor.py:69, 126, 132, 138`; `backend/routers/content.py:142-145`. `resource` diterima tetapi tidak dipakai; semua issue memakai `field: "body"` meski `REVIEW_TEXT` berbeda per resource. Terverifikasi di kode. Perbaikan: turunkan field dari `REVIEW_TEXT[resource]` atau hapus parameter; uji `field` per resource.

### K8 — Sedang: pagination konten menyimpan baris basi
`frontend/src/pages/admin/ContentManager.tsx:486-497`. `accumulated` hanya menambah page baru dan mendeduplikasi by id; tidak dibangun ulang saat `invalidateQueries` setelah hapus/ubah pada `offset > 0`. Terverifikasi di kode. Perbaikan: reset `accumulated` pada refetch/filter atau turunkan rows dari kumpulan page React Query.

---

## 5. Urutan rekomendasi

1. K1, K2 — koreksi data/status, risiko tertinggi.
2. A1, A3, A4, A7 — aksesibilitas yang memblokir operasi.
3. K3, K7, K8 — konsistensi data dan eksport.
4. A2, A5, A6, A8 — nama aksesibel, live region, bilingual.
5. K4, K5, K6 — utang teknis; K5 sebaiknya menyusul setelah helper dipindah ke `.ts`.

Semua perbaikan harus tetap lokal sampai paneer memberi izin tinjauan/commit/deploy.

---

## 6. Hasil implementasi lanjutan (delegasi `deleg_bc0c9e89` dan tindak lanjut)

### 6.1 Backend — K1, K2, K3-backend, K7 (TASK 1/4, selesai)

| Temuan | Perubahan | Bukti RED → GREEN |
|---|---|---|
| K1 | `backend/routers/registrar.py`: validasi `ai_ok` dipindah sebelum `update_one` | RED `AssertionError: assert 'triage' not in {...}` → GREEN 1 passed |
| K2 | `backend/lib/storage.py`: `sniff_content_type` membaca anggota ZIP `[Content_Types].xml` + `word/`/`xl/`/`ppt/` | RED `7cf5c267a0_modul-praktikum.zip` → GREEN 1 passed |
| K3-backend | Regression ekspor audit di `backend/tests/test_admin_filters_and_keys.py`; `siteadmin.py` tidak diubah karena kontrak sudah benar | limit=50 maksimal 50 baris, header `X-Audit-Truncated=true` saat 60 baris cocok, offset=50 melewati 50 baris pertama |
| K7 | `backend/lib/advisor.py`: `review_draft` lazy-import `REVIEW_TEXT[resource][0]` untuk field issue; `content.py` tidak diubah | RED field selalu `body` → GREEN 18 passed |

Gate backend: `python -m pytest backend/tests -q` → **183 passed, 665 warnings in 70.76s**, exit 0 (Python 3.13 di PATH lebih dulu).

### 6.2 Infra frontend — K5, K6 (TASK 4/4, selesai)

- K5: `allowExportNames` global dihapus dari `frontend/.oxlintrc.json`; 24 simbol helper dipindah ke 14 entri `overrides` per-file. `LINT_ALLOWLIST.md` ditulis ulang.
- K6: `getFeatureFlags()` murni di `frontend/src/lib/features.ts`, 6 test `vi.stubEnv` + `vi.resetModules`, serta `Sunset note` di `README.md` (tanggal penghapusan meja temporer 2026-12-31).
- Bukti RED/GREEN K6: 6 failed (`TypeError: getFeatureFlags is not a function`) → 6 passed, exit 0.
- Gate lint TASK 4: `npx oxlint .` → exit 0, 0 error, 0 warning `react/only-export-components`.

### 6.3 Sisa frontend (`deleg_da54e509`, selesai)

| Shard | Perubahan | Bukti RED → GREEN |
|---|---|---|
| A4/A5 | `MediaPickerModal.tsx`: `role="status"` + `aria-live="polite"` pada summary dan status `uploading`/`done`, `role="alert"` pada error. A4 sudah masuk dari shard sebelumnya di `RichTextField.tsx` | RED 4 failed / 20 passed → GREEN **24/24 passed**; regresi `MediaPicker.test.tsx` **4/4 passed** |
| A6/K4/K8 | `ContentManager.tsx`: placeholder `Cari posts...` + label via `t()`, baris basi dibuang dari `accumulated` setelah delete/bulk-delete; `components/site/Chrome.tsx`: modal `AnnouncementPopup` pakai `useFocusTrap`, kartu non-modal tidak; `App.tsx`: `AdminLocaleProvider` untuk semua rute admin via route pathless | RED 3 failed / 4 passed → GREEN **7/7 passed**; `npx tsc --noEmit` exit 0; 3 suite terkait **33/33 passed** |

Kontrak K3 UI: `AdminKeyLifecycleAndAuditFilters.test.tsx` diperbarui ke `href="/api/admin/audit/export?period=week&limit=50"` dan diverifikasi **3/3 passed**, exit 0.

### 6.4 Gate gabungan milik parent

| Gate | Hasil nyata |
|---|---|
| `npx oxlint .` | exit 0, tanpa output |
| `npx tsc --noEmit` | exit 0, tanpa output |
| `git diff --check` | exit 0, tanpa whitespace error |
| `npm run build` | exit 0; `dist/assets/index-DxT2VFvM.css 117.36 kB │ gzip: 19.03 kB`, `dist/assets/index-CX9hADQC.js 973.49 kB │ gzip: 264.75 kB`, selesai 8.36s |
| `npm run test:geometry` | **16 passed, 8 skipped (24)**, 1440×900 + 390×844, exit 0 |
| Full Vitest | `NODE_OPTIONS=--no-experimental-webstorage npx vitest run --maxWorkers=1` → **44 file passed (44), 412 test passed (412)**, exit 0; 813.52s (22:49:52). Satu baris jsdom `Not implemented: navigation to another Document` muncul di log tanpa kegagalan. |

Tidak ada commit, stash, reset, push, deploy, perubahan DB live, SSH CT, atau akses ke `ollama-server` dalam tahap audit di atas. Catatan ini bukan laporan deployment.

## 7. Tindak lanjut review independen

Tiga temuan blocking dari review `deleg_a5b72608` ditangani lokal:

- `registrar.py`: URL upload diurai sebelum penghapusan; query signature dan fragment tidak menjadi bagian storage key. Tolak traversal, backslash/NUL (termasuk terenkode), serta URL malformed. Regression endpoint memakai URL bertanda tangan; seluruh operasi DB/storage di test memakai fixture/mock, bukan produksi.
- `ContentManager.tsx`: rekonsiliasi halaman mengganti record dengan ID yang sama. Mutasi delete/publish/bulk/undo mengulang pagination dari halaman pertama agar baris halaman lama tidak tertinggal. Fixture penghapusan kini mencerminkan respons server setelah record dihapus.
- Kontrol pagination tetap tersedia pada filter status kosong selama server masih memiliki halaman berikutnya; hitungan akhir tetap tampil setelah seluruh halaman termuat.
- Assertion OpenAPI yang sebelumnya memiliki `or True` kini benar-benar memvalidasi response `200`.

Verifikasi setelah perubahan terakhir:

| Gate | Hasil |
|---|---|
| `uv run pytest -q` (backend) | **189 passed**, 665 deprecation warnings, exit 0 |
| `npx tsc --noEmit` | exit 0 |
| Full Vitest, `--maxWorkers=1` | **44 file / 415 test passed**, exit 0; log jsdom navigation tetap muncul tanpa kegagalan |
| `npm run build` | exit 0; warning chunk >500 kB; entry `index-Cqh8VfDj.js` |
| `npm run test:geometry` | **16 passed, 8 skipped**, exit 0 |
| `npm run lint` | exit 0, tanpa output warning/error |

Saran non-blocking yang belum ditangani: audit hash chain masih best-effort (tidak terserialisasi dan tidak mencakup `detail`); snapshot/rollback backend masih perlu mengecualikan mutable media atau memastikan storage terpisah sebelum deployment. Tidak ada klaim review ulang independen, CI remote, deployment, atau verifikasi integritas produksi dari gate lokal ini. Perubahan lokal tetap belum di-commit/push.

---

## 8. Penutupan gate lokal (26 November 2026)

Tiga penyempurnaan terakhir sebelum tinjauan:

- `AdminDashboard.tsx`: quick action “Door Check-in Desk” diganti “Registrations Desk” dengan ikon `ClipboardList`. Halaman registrasi tetap tersedia; hanya label meja check-in yang dihapus dari dashboard, selaras dengan flag `FEATURES.certificateIssue` dan `FEATURES.doorCheckIn` yang bernilai `false`.
- `ContentManager.tsx`: tombol `content-clear-filters` muncul saat filter status atau pencarian aktif; mengeksekusi reset `tab`, `searchInput`, seleksi, dan offset. `AdminLoadMore` menerima `countTestId`, dipakai sebagai `content-count` agar hitungan hasil tetap terlihat setelah filter dikosongkan.
- `admin-i18n.ts`: kunci `adminClearFilters` ditambahkan di kamus `en` (“Clear filters”) dan `id` (“Hapus filter”); tidak ada string baru yang hardcode Inggris.

Gate final yang benar-benar dijalankan:

| Gate | Hasil nyata |
|---|---|
| `py -3.13 -m pytest -q -n 0` (serial, backend) | **189 passed**, 665 warnings, exit 0 |
| `py -3.13 -m pytest -q` (`-n 2 --dist loadscope`, konfigurasi repo) | **189 passed**, 665 warnings, exit 0 pada rerun; satu run sebelumnya gagal 2 async test karena flake xdist, bukan kegagalan produk |
| `NODE_OPTIONS=--no-experimental-webstorage npx vitest run --maxWorkers=1` | **46 file / 427 test passed**, exit 0; satu baris jsdom `Not implemented: navigation to another Document` tanpa kegagalan |
| `npm run lint` | exit 0, tanpa output |
| `npm run build` | exit 0; `tsc -b && vite build`; chunk >500 kB hanya peringatan |
| `npm run test:geometry` | **16 passed, 8 skipped (24)**, exit 0 |
| `git diff --check` | exit 0; hanya peringatan konversi LF→CRLF pada file yang sudah ada |

Tidak ada commit, push, SSH, perubahan database live, atau deploy dalam penutupan ini. Semua perubahan masih di working tree lokal dan menunggu keputusan paneer.
