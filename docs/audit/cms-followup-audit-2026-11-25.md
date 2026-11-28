# Audit Lanjutan CMS TNL Studio — 25 November 2026

**Lingkup:** lokal saja. Tidak ada deploy, tidak ada perubahan database live, tidak ada SSH ke CT, tidak ada commit/push, dan tidak menyentuh `ollama-server (100.110.11.66 / 192.168.30.100)`.

**Status terbaru (27 November 2026):** bukti lokal yang sudah tersedia: backend **257 passed**, satu full run frontend **52 file / 601 passed**, build/typecheck/lint exit 0, geometri **16 passed / 8 skipped**, dan matriks browser EN/ID **66/66**. Run tambahan frontend pernah gagal startup tiga worker (571 passed; tiga file berhasil pada retry terpisah), sehingga hasil itu tidak boleh disebut full-suite GREEN. Run isolasi berikutnya dihentikan batas tool 600 detik tanpa ringkasan tes; run pengganti berlog verbose kini selesai **52 file / 601 passed**, 678.08s, `VITEST_EXIT=0` (`tnl-isolated-long-vitest.log`). Hasil run gagal dan retry sebelumnya tetap dipertahankan sebagai riwayat, bukan diubah menjadi lulus. Lihat §12 untuk bukti dan keterbatasan; tabel gate sebelumnya adalah snapshot historis, bukan bukti untuk perubahan setelahnya. Tidak ada commit, push, deployment, atau akses database produksi.

---

## 1. Gate lokal setelah pembersihan 52 warning lint

| Gate | Hasil |
|---|---|
| `npx oxlint .` | 0 warning (dari 52 warning: 22 unused, 6 exhaustive-deps, 24 only-export-components) |
| `npx tsc --noEmit` | lolos |
| `npx vitest run --maxWorkers=1` | 40/40 file, 371/371 test, exit 0 |
| `npm run build` | lolos |
| Gate geometri/DESIGN.md | lolos |

Catatan: angka di tabel di atas adalah baseline sebelum perbaikan lanjutan. Untuk K5, `allowExportNames` global sudah dihapus; 24 simbol helper kini tercakup oleh 14 entri `overrides` per-file. Detail K6 ada di `README.md` (`Sunset note`). Hasil gate terbaru dicatat di §12; §6–11 menyimpan riwayat verifikasi tahap sebelumnya.

---

## 2. Verifikasi temuan keamanan yang sudah diperbaiki

Tiga temuan lama diverifikasi masih terpasang di repo:

1. HSTS `max-age=31536000; includeSubDomains; preload` + `Permissions-Policy` ada di `scripts/deploy/nginx-ct102.conf:18`.
2. Validasi magic bytes upload ada di `backend/routers/media.py:75-85` dan dipanggil di `:263`.
3. Penguncian canonical path memakai `os.path.commonpath` di `backend/routers/media.py:445`.
4. Duplikasi header keamanan upstream dicegah dengan `proxy_hide_header` di `scripts/deploy/nginx-ct102.conf:32-79`.

Tidak ada perubahan baru pada area ini.

---

## 3. Temuan aksesibilitas & i18n awal (riwayat; tindak lanjut §6–12)

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
Pada inspeksi awal, 20 file `.tsx` di `pages/admin` + `components/admin` belum memakai locale UI admin. Contoh lama: `ContentManager.tsx:681-707`, `AdminLayout.tsx:437-452`, `AdminScreens.tsx:1557-1565`; media picker mencampur “Detail aset” dan UI Inggris. Implementasi aktual menggunakan `useAdminT()` dan `AdminLocaleProvider`, bukan `useLocale()` langsung: tanpa provider tetap Inggris, dengan provider mengikuti locale situs. Lanjutan login/invite, pages, builders/editor, media, dan primitive bersama tercatat di §12; temuan awal ini bukan inventaris string yang masih terbuka.

### A7 — Sedang: pesan dialog konfirmasi tidak terhubung
`frontend/src/pages/admin/AdminScreens.tsx:1541-1548`. `aria-labelledby` hanya menunjuk judul; `<p>{message}</p>` tanpa `id`/`aria-describedby`. Logika fokus di `:1529-1535` sudah benar dan tidak perlu diubah.

### A8 — Rendah: alt text generik/hardcode Inggris
`InlineMediaField.tsx:182`, `MultiMediaField.tsx:181`, `ContentEditor.tsx:986, 1006`, `MediaPickerModal.tsx:595`. Perbaikan: fallback lokal via `STRINGS` dengan cadangan `filename`/`label`.

**Metode:** inspeksi kode statis. Belum ada uji axe-core atau pembaca layar langsung.

---

## 4. Temuan kualitas kode & test awal (riwayat; tindak lanjut §6–12)

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

## 5. Urutan rekomendasi awal (riwayat, bukan backlog terkini)

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

Catatan historis: kekhawatiran snapshot/rollback mutable media ditangani melalui pengecualian pada snapshot remote dan paket sumber lokal serta tes ekstraksi/sentinel (§9.6 dan §12). Klaim keamanan rantai audit pada §11 memerlukan penguatan insertion-time fencing yang dijelaskan di §12; lease saja tidak cukup. Gate tahap ini tidak membuktikan CI remote, deployment, atau integritas database produksi. Perubahan lokal tetap belum di-commit/push.

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

## 9. Pengerasan rantai audit dan flag build-time (27 November 2026)

Lanjutan dari §8. Semua perubahan tetap lokal; belum ada commit, push, atau deploy.

### 9.1 Rantai hash audit kini mencakup `detail` (K4 lanjutan)

Masalah: hash lama hanya menutup `actor_id, action, resource, target_id, created_at`. Isi `detail` — yaitu payload before/after yang justru jadi bukti utama — bisa diubah tanpa membuat rantai tampak rusak.

- `backend/lib/auth.py`: entri baru ditulis dengan `hash_version: 2` dan `hash` dihitung atas tujuh argumen termasuk `detail`.
- Urutan argumen `audit_hash(prev_hash, actor_id, action, resource, target_id, created, detail)` dibekukan; mengubah urutan akan membatalkan seluruh hash v2 yang sudah tertulis.
- `verify_audit_chain(limit=None)` ditambahkan: menelusuri `audit_log` dari yang tertua, menghitung ulang tiap baris, dan mengembalikan `{"checked", "skipped", "ok", "broken_at"}`.
- Baris lama/fixture yang benar-benar tidak memiliki metadata rantai dihitung sebagai `skipped`, bukan jangkar. Setelah perbaikan §12, baris berantai (`hash_version: 2`, `seq`, atau `prev_hash`) dengan hash hilang/kosong justru menggagalkan verifikasi; menghapus hash tidak boleh menjadi bypass.

### 9.2 Presisi waktu: dua bug nyata yang ditemukan lewat probe

Probe langsung terhadap `mongomock_motor` memperlihatkan dua penyebab rantai selalu `ok: False` walau data tidak disentuh:

1. `datetime.now(timezone.utc)` punya mikrodetik; Mongo menyimpan presisi milidetik. Hash dihitung dari nilai yang tidak akan pernah kembali dari database. Perbaikan: `created` dipotong ke milidetik sebelum di-hash (`microsecond // 1000 * 1000`), ditambah `_canonical_dt()` yang menormalkan naive/aware ke ISO UTC.
2. Baris v1 yang sudah terlanjur ditulis tidak bisa diperbaiki tanpa membuang riwayat. `_hash_matches()` menguji 1000 kemungkinan mikrodetik di dalam milidetik tersimpan, sehingga riwayat v1 yang jujur tetap lolos verifikasi sementara baris v1 yang diubah tetap gagal.

Uji regresi `test_legacy_v1_audit_rows_still_verify` menutup kedua arah: baris v1 asli `ok: True`, baris v1 yang `target_id`-nya diubah `ok: False`.

### 9.3 Ekor rantai deterministik

`find_one({}, sort=[("created_at", -1)])` ambigu ketika dua penulisan jatuh pada milidetik yang sama — dua penulis bisa mengambil `prev_hash` yang sama dan mencabangkan rantai.

- Entri baru menyimpan `seq` monoton. Ekor v2 dicari berdasarkan `seq`; bila hanya ada riwayat v1 tanpa `seq`, ekor dipilih dari hubungan `hash`/`prev_hash`, bukan urutan hasil query (§12).
- Verifikasi mengurutkan `[("seq", 1), ("created_at", 1)]`, bukan `created_at` saja; hash v1 tidak ditulis ulang. Pemilihan ekor legacy untuk append memakai hubungan hash (§12).
- Pembacaan ekor + insert memakai kunci lintas-proses (`_acquire_chain_lock()`), tetapi lease bukan jaminan keselamatan. Indeks unik sparse `audit_seq_unique` memagari insert; konflik memicu pembacaan kepala baru dan percobaan ulang terbatas (§12).
- Uji konkurensi kini menegaskan delapan penulisan paralel menghasilkan delapan `prev_hash` unik dan `seq` berurutan.

### 9.4 Endpoint verifikasi

`GET /admin/audit/verify?limit=N` di `backend/routers/siteadmin.py`, di balik `Depends(require("audit:read"))`. Admin dapat memeriksa integritas rantai di produksi tanpa CLI. `/admin/audit/export` tidak berubah.

### 9.5 Flag fitur akhirnya sampai ke image

`docker-compose.yml` sudah mengirim `VITE_FEATURE_DOOR_CHECKIN` dan `VITE_FEATURE_CERTIFICATES` sebagai build arg, tetapi `frontend/Dockerfile` tidak mendeklarasikan `ARG`/`ENV` untuk keduanya — Vite hanya menginline `VITE_*` yang ada saat `npm run build`, sehingga flag selalu `false` di image apa pun nilai compose-nya. Kedua argumen kini dideklarasikan dengan default `false`.

Diverifikasi dua arah lewat build nyata:

| Build | Hasil di bundle |
|---|---|
| `VITE_FEATURE_DOOR_CHECKIN=true VITE_FEATURE_CERTIFICATES=true npx vite build` | `doorCheckIn:!0,certificates:!0` |
| `npx vite build` (default) | `doorCheckIn:!1` |

### 9.6 Snapshot deploy tidak lagi menyedot media

`scripts/deploy/deploy.ps1` meng-`tar` seluruh `/opt/tnl/backend` kecuali `venv` dan `.env`. Direktori `media` dan `downloaded_files` ikut masuk, sehingga snapshot bisa membengkak sampai ratusan MB per deploy dan memperlambat jendela rollback. Keduanya (plus `__pycache__`) kini dikecualikan; sumber, model, dan aset statis tetap tersimpan.

### 9.7 Gate yang benar-benar dijalankan

| Gate | Hasil nyata |
|---|---|
| `py -3.13 -m pytest backend/tests -q` | **192 passed**, 674 warnings, exit 0 |
| `py -3.13 -m pytest backend/tests/test_security_hardening.py -q` | **26 passed**, exit 0 |
| `npx vitest run` | **46 file / 435 test passed**, exit 0 |
| `npx tsc --noEmit` | exit 0 |
| `npm run lint` (oxlint) | exit 0, tanpa temuan |
| `npx vite build` (flag on dan off) | exit 0 keduanya; flag terinline sesuai nilai |
| `git diff --check` | exit 0; hanya peringatan LF→CRLF |

Belum diverifikasi dan tidak dapat diklaim dari gate lokal: tinjauan independen, CI remote, deploy, dan integritas rantai audit pada database produksi. Verifikasi produksi baru mungkin setelah endpoint `/admin/audit/verify` terpasang dan dijalankan terhadap `audit_log` asli.

---

## 10. Ekor A6/A8: sisa string hardcode (27 November 2026)

Lanjutan §9. Semua perubahan tetap lokal; belum ada commit, push, atau deploy.

### 10.1 Media picker

- `MediaPickerModal.tsx`: judul panel inspeksi `Asset Details` dan ringkasan mobile `Detail aset` kini keduanya memakai `t("adminAssetDetails")` — sebelumnya UI Inggris dan Indonesia bercampur dalam satu dialog.
- Baris bantuan dropzone `JPG, PNG, WebP, GIF, or academic docs up to 10 MB.` menjadi `t("adminDropFileTypes")` dengan `data-testid="media-picker-drop-hint"`.
- `aria-label` tombol antrean `Remove {file} from queue` menjadi `t("adminRemoveFromQueue")` + nama berkas.
- Placeholder pencarian perpustakaan `Search by filename or alt...` menjadi `t("adminSearchMediaPlaceholder")`.

### 10.2 Editor dan layar admin

- `ContentEditor.tsx`: `alt="Cover"` / `alt="Event Cover"` diganti `t("adminCoverAlt")` / `t("adminEventCoverAlt")`; `useAdminT()` dipasang pada komponen.
- `AdminScreens.tsx`: empat empty state (`media-empty` `No files yet.`, `registrations-empty` `No registrations yet.`, `inbox-empty` `No messages yet.`, tabel akun `No accounts yet.`) memakai `t("adminMediaEmpty")`, `t("adminRegistrationsEmpty")`, `t("adminInboxEmpty")`, `t("adminAccountsEmpty")`; hook dipasang di `MediaLibrary`, `RegistrarPage`, `InboxPage`, `UsersPage`.

### 10.3 Kamus

Sembilan kunci baru di `admin-i18n.ts`, paritas `en`/`id` lengkap: `adminDropFileTypes`, `adminRemoveFromQueue`, `adminCoverAlt`, `adminEventCoverAlt`, `adminMediaEmpty`, `adminRegistrationsEmpty`, `adminInboxEmpty`, `adminAccountsEmpty`, `adminSearchMediaPlaceholder`.

### 10.4 Gate

| Gate | Hasil nyata |
|---|---|
| `npx vitest run src/__tests__/admin/AdminA11yI18nTail.test.tsx` | RED 5 failed → GREEN **7 passed**, exit 0 |
| Uji paritas kamus (`ADMIN_STRINGS.en` vs `.id`) | 9 kunci baru terverifikasi ada di kedua bahasa dan tidak identik |
| `npx vitest run src/__tests__/admin` | **8 file / 90 test passed** |
| Full `npx vitest run` | **47 file / 442 test passed**, exit 0 |
| `py -3.13 -m pytest backend/tests` | **192 passed**, 674 warnings, exit 0 |
| `npx tsc --noEmit` | exit 0 |
| `npx oxlint .` | exit 0, tanpa temuan |

Batasan yang sama masih berlaku: tidak ada tinjauan independen, CI remote, deploy, atau verifikasi produksi yang dapat diklaim dari gate lokal ini.
---

## 11. Kunci rantai audit lintas-proses (27 November 2026)

Lanjutan §9.3. Semua perubahan tetap lokal; belum ada commit, push, atau deploy.

### 11.1 Masalah

Ekor rantai dibaca lalu di-insert di dalam `_get_audit_lock()`, yaitu `asyncio.Lock`. Primitive itu hanya berlaku di dalam satu event loop. Begitu service berjalan dengan lebih dari satu worker (`uvicorn --workers N`, container yang di-scale, replika kedua), setiap proses memegang kuncinya sendiri, keduanya membaca baris "terakhir" yang sama, dan keduanya menulis anak dari `prev_hash` yang sama. Tidak ada error apa pun; rantai bercabang diam-diam dan baru terlihat di `verify_audit_chain()` sebagai tamper palsu.

Saat ini `backend/Dockerfile` menjalankan uvicorn single-worker, jadi ini laten — bukan mati. Desainnya tetap harus lintas-proses karena penskalaan tidak mengubah kode.

### 11.2 Perbaikan

`backend/lib/auth.py`:

- `_get_audit_lock()` dipertahankan sebagai lapisan dalam (per-proses) agar penulis di worker yang sama tidak membebani Mongo.
- `_acquire_chain_lock(token)` menambahkan kunci lintas-proses berupa satu dokumen di koleksi `audit_locks` (`_id: "audit_chain"`), diklaim dengan `find_one_and_update` (CAS) pada `{held: false}` **atau** `{expires_at: {$lt: now}}`.
- `_release_chain_lock(token)` melepas dengan filter token, sehingga pemegang yang klaimnya sudah diambil-alih sebagai stale tidak bisa melepas kunci pemegang baru.
- Pengambil-alihan stale: klaim kedaluwarsa setelah `AUDIT_LOCK_TTL = 30s`, sehingga worker yang mati tidak membekukan rantai selamanya. Penulis menunggu maksimum `AUDIT_LOCK_TIMEOUT = 10s`.
- Bila CAS gagal atau lease tidak diperoleh, warning tetap dicatat, tetapi fallback per-proses saja tidak cukup aman. Setelah §12, setiap append tetap wajib memiliki indeks urutan unik; konflik insert membaca kepala baru dan mengulang, sedangkan kegagalan indeks/storage atau konflik terus-menerus dipropagasikan. Tidak ada fallback append tanpa fencing.

`backend/lib/db.py`:

- Indeks `seq_desc` dan `prev_hash` membantu pembacaan; indeks unik sparse `audit_seq_unique` adalah pagar insert wajib (§12), termasuk ketika startup pembuatan indeks hanya best-effort.
- Koleksi `audit_locks` didaftarkan dengan indeks `lock_expires`, sehingga koleksi dan indeksnya ada sejak boot pertama.

### 11.3 Uji

Empat uji baru di `backend/tests/test_security_hardening.py`, masing-masing menegaskan mekanisme, bukan happy path:

| Uji | Yang ditegaskan |
|---|---|
| `test_chain_lock_is_released_after_each_write` | Tidak ada klaim yang tertinggal; rantai tetap `ok: True` |
| `test_chain_lock_blocks_a_foreign_holder` | Klaim worker lain yang masih hidup (`expires_at` belum lewat) tidak dirampas |
| `test_chain_lock_steals_an_expired_claim` | Klaim worker yang mati diambil-alih setelah TTL, lalu dilepas |
| `test_chain_lock_survives_mongo_failure` | CAS gagal → baris audit tetap tersimpan dengan hash |

### 11.4 Gate

| Gate | Hasil nyata |
|---|---|
| `py -3.13 -m pytest backend/tests -q` | **196 passed**, 674 warnings, exit 0 |
| `npx tsc --noEmit` | exit 0 |
| `npx vitest run` | **47 file / 442 test passed**, exit 0 |

Batasan: suite tahap ini membuktikan mekanisme lease, bukan keamanan multi-worker di lapangan. Perbaikan fencing dan regresi deterministik tambahan ada di §12. Soak multi-worker dengan MongoDB nyata serta verifikasi `audit_log` produksi tetap belum dijalankan; tidak ada klaim deployment atau verifikasi produksi.

---

## 12. Integrasi lanjutan dan bukti terkini (27 November 2026)

### 12.1 Bilingual UI dan batas ekspor

- Kamus domain auth, pages, builders, dan media digabung di `admin-i18n.ts`; provider-less English tetap dipertahankan. Provider admin eksplisit mengikuti locale `en`/`id` situs.
- Label, tooltip, nama aksesibel, placeholder, pesan fallback, serta primitive loading/retry/pagination/confirmation/status memakai kamus. Konten buatan penulis, alt yang ditulis pengguna, nama berkas, detail error backend, URL, schema, enum, dan payload tidak diterjemahkan atau ditulis ulang.
- Login/invite dan pages mempunyai laporan shard RED→GREEN masing-masing 39 dan 57 tes; shard builders terinterupsi sehingga laporan shard itu bukan bukti penyelesaian. Penerimaan integrasi bergantung pada gate parent di §12.4.
- Audit UI mempertahankan total backend sebenarnya, membatasi tampilan hingga 200 baris tanpa tombol load-more mati, mereset range saat periode berubah, dan menyelaraskan `period`/`limit` ekspor dengan range termuat. `href` ekspor tidak tersedia saat loading/error.
- Media picker menambah locale untuk feedback upload, mempertahankan nama berkas/detail backend, dan memakai interpolasi satu langkah agar placeholder di data pengguna tidak ditafsirkan ulang. Header dibungkus secara responsif setelah probe visual memperlihatkan tab/judul bertumpuk meskipun halaman tidak overflow.
- Semua pemakai focus trap menunjuk `lib/a11y/useFocusTrap.ts`; penghapusan shim mati `lib/useFocusTrap.ts` tetap dipertahankan.

### 12.2 Perbaikan lanjutan integritas rantai audit

- Legacy tail dicari melalui hubungan hash sehingga tiga atau lebih baris v1 tanpa `seq` tidak menyebabkan append ke simpul yang salah. Hash/record lama tidak dimodifikasi; ekor legacy ambigu ditolak, bukan ditebak.
- `audit()` memastikan indeks produksi unik sparse `audit_seq_unique` sebelum append. Indeks ini memagari stale holder, timeout, dan kegagalan CAS pada saat insert, bukan hanya saat memperoleh lease.
- `DuplicateKeyError` memicu pembacaan kepala baru dan penghitungan ulang `prev_hash`, hash, serta urutan; maksimal delapan percobaan. Konflik habis atau error indeks/storage melempar error, bukan menghilangkan penulisan secara diam-diam.
- Verifier menolak hash hilang/kosong pada baris yang memiliki metadata rantai; hanya baris lama tanpa metadata rantai yang dapat dilewati.
- Regresi baru menggunakan lock terpisah per simulasi worker dan insert mock nyata: legacy append, timeout, CAS failure, lease expiry, deklarasi indeks produksi, retry exhaustion, storage error, dan missing hash.
- Batasan penting: ini tes `mongomock`, bukan MongoDB nyata/multiprocess soak. Duplicate `seq` yang sudah ada memerlukan remediasi operator; aplikasi tidak menulis ulang riwayat. Kegagalan audit tidak otomatis membatalkan mutasi bisnis yang sudah tersimpan sebelumnya.

### 12.3 Keamanan paket deployment

Snapshot remote dan paket sumber backend lokal mengecualikan `venv`, `.env`, `media`, dan `downloaded_files`. `backend/tests/test_deploy_media_safety.py` menguji arsip dan ekstraksi update/rollback dengan sentinel server, bukan hanya mencari teks pengecualian. RED: dua tes gagal karena media ikut dikemas/ditimpa; GREEN: dua tes lulus. Tidak ada ekstraksi atau perubahan media produksi.

### 12.4 Gate parent dan status bukti

| Gate | Bukti terkini |
|---|---|
| Backend penuh, konfigurasi pytest repo | Run ulang saat resume: `py -3.13 -m pytest tests -q` dari `backend/`, **257 passed**, 675 dependency deprecation warnings, 21.92s; `PYTEST_EXIT=0`, log `tnl-session-resume-backend.log`, dua worker xdist sesuai konfigurasi repo. Run sebelumnya `tnl-backend-current.log`: **257 passed**, 34.43s. Laporan delegasi `audit-chain-verified-20261127-150431-612bcc92.log` (**212 passed / 1 failed**) adalah snapshot sebelum perbaikan; source terkini diperiksa langsung sebelum run ulang. |
| Audit chain + security targeted | **45 passed**, 173 warnings, 46.30s; parent membaca `audit-chain-0854a3d1/green-targeted.log` |
| Media/a11y/audit boundary targeted | **4 file / 76 passed**, 212.23s; `VITEST_EXIT=0`, log `tnl-media-tail-green.log` |
| Full frontend dan retry worker | Run ulang isolasi terbaru: `tnl-isolated-long-vitest.log`, **52 file / 601 passed**, 678.08s, `VITEST_EXIT=0`; ringkasan dibaca setelah proses selesai. Percobaan foreground sebelumnya berhenti pada batas tool 600 detik tanpa ringkasan tes (`tnl-final-isolated-vitest.log`), bukan bukti lulus. Run final setelah wrapping toolbar editor: `tnl-finalized-vitest.log`, **52 file / 601 passed**, 1728.26s, `GATE_EXIT=0`; ringkasan dan marker dibaca langsung saat resume. Tidak ada source frontend yang lebih baru daripada akhir run final menurut mtime. Log masih memuat satu diagnostik jsdom `Not implemented: navigation to another Document` tanpa kegagalan. Run sebelumnya `tnl-closure-vitest.log`: **52 file / 601 passed**, 1052.24s, `GATE_EXIT=0`. Run tambahan `tnl-resume-vitest-direct.log` tetap **exit 1**: **49 file / 571 passed**, tetapi 3 error timeout saat startup forks worker (`SignalChrome`, `AdminA11yI18nTail`, `UtilityEditorial`), 2600.80s; bukan full-suite GREEN. Ketiga file kemudian dijalankan ulang parent: **3 file / 30 passed**, 166.70s, `VITEST_EXIT=0`, `tnl-worker-retry.log`. Hasil retry tidak mengubah exit gagal run tambahan atau digabung seolah satu run utuh. Run historis 595 passed / 2 failed dan run `threads` yang dihentikan bukan bukti lulus. |
| Regresi copy final + penyesuaian tes integrasi | RED **4 failed / 1 passed / 27 skipped**; setelah perbaikan, gate terkait lengkap **5 file / 53 passed**, 51.44s, `VITEST_EXIT=0`; log `tnl-final-copy-red.log` dan `tnl-final-copy-green.log`. |
| Build/lint/geometri terbaru | Rangkaian `tnl-finalized-{tsc,build,geometry,lint}.log` dibaca langsung: `npx tsc --noEmit`, `npm run build` (termasuk `tsc -b`), dan `npm run lint` masing-masing `GATE_EXIT=0`; `npm run test:geometry` **16 passed / 8 skipped**, `GATE_EXIT=0`, 2.3 menit. Skip merupakan pemisahan kasus desktop/mobile menurut project viewport. Build tetap memberi peringatan chunk >500 kB, bukan error. |
| Browser locale tambahan | **66/66 kombinasi unik lulus**: 11 mode × 2 locale EN/ID × viewport 320/390/1440 px; 0 overflow, 0 overlap header, 0 page error. Parent membaca dan menghitung ulang `tnl-resume-stable-browser/results.json`; `tnl-resume-stable-browser.log`, exit 0. Dua run awal belum stabil: padding fixture tidak mengikuti wrapper produksi, lalu geometri 320 px diukur sebelum font/layout siap. Fixture scratch mengikuti `AdminLayout` dan menunggu `document.fonts.ready` + dua animation frame; perbaikan fixture tidak mengubah layout aplikasi. Wrapping toolbar editor 320 px diterapkan terpisah secara minimal di `ContentEditor.tsx`, sebelum matriks 66 kasus dan rangkaian gate final. |
| Review independen | Review awal frontend `deleg_48b45c98` tidak menemukan regresi high/medium. Review final `deleg_e0006327` menemukan dua masalah verifier tingkat sedang dan dua masalah copy (§12.6); seluruh temuan ditinjau terhadap source, bukan dianggap tertutup oleh gate sebelumnya. |

Log/probe/screenshot berada di scratch di luar repo. Full frontend dijalankan satu per satu dengan `NODE_OPTIONS=--no-experimental-webstorage`, `--maxWorkers=1`, dan `--testTimeout=20000`, memakai pool `forks` konfigurasi repo. Rangkaian final merekam `GATE_EXIT` di `tnl-finalized-{tsc,vitest,build,geometry,lint}.log`; backend resume memakai `tnl-session-resume-backend.log` dengan `PYTEST_EXIT=0`. Tidak menyamakan targeted GREEN dengan full-suite GREEN. Saat resume, `tnl-resume-stable-browser/results.json` dihitung ulang secara programatis: tepat 66 baris unik sesuai produk silang 11 mode × 2 locale × 3 viewport, tanpa kombinasi hilang/tambahan, overflow, overlap header, atau page error (`errors: []`). Ini validasi ulang artefak probe lokal, bukan run browser atau smoke produksi baru.

### 12.5 Pekerjaan yang tetap memerlukan lingkungan/izin produksi

1. Menilai data/index aktual dan menuntaskan duplicate sequence bila ada; jangan mengubah hash historis.
2. Soak dengan MongoDB nyata dan beberapa worker, lalu verifikasi rantai; simulasi mongomock bukan pengganti.
3. Setelah izin deployment eksplisit, backup terverifikasi, deploy sesuai skrip aktual, verifikasi bundle lokal/remote/live, smoke autentikasi/TOTP/invite, ekspor, upload, dan endpoint audit pada data asli.
4. CI remote, commit/push, deployment, dan verifikasi database produksi belum dilakukan. Tidak ada SSH, operasi Docker, atau akses ke `ollama-server` pada tindak lanjut ini.

### 12.6 Tindak lanjut review final independen

| Temuan | Tindakan dan status |
|---|---|
| Sedang: verifier legacy masih menggunakan timestamp saat timestamp sama | Verifier kini mengurutkan slot legacy berhash melalui link lalu memeriksa baris ber-sequence; fork, cycle, dan komponen terputus tidak dibuang. Regresi mencakup timestamp sama/terbalik, transisi legacy→v2, batas prefix, dan korupsi; termasuk dalam full suite **257 passed**. Resolusi link tetap membaca seluruh baris unsequenced meskipun prefix dibatasi. |
| Sedang: `datetime` dalam detail audit berubah melalui BSON | Detail baru yang mengandung datetime memakai `hash_version: 3` dengan encoding bertipe, UTC/milidetik yang stabil setelah BSON; datetime nested/list, aware/naive/offset, serta reader aware/naive diuji bersama codec BSON nyata. Regresi memeriksa tamper dan pelestarian payload v1/v2 tanpa mutasi detail penulis atau hash historis; termasuk dalam full suite **257 passed**. Offset/mikrodetik yang sudah hilang pada riwayat lama tidak dipulihkan atau ditulis ulang. |
| P2: `ContentEditor` menimpa placeholder lokal dengan fallback Inggris | Menghapus hanya fallback hardcoded pemanggil; `field.placeholder` eksplisit tetap diteruskan, fallback locale dimiliki `RichTextField`. Regresi memakai editor artikel nyata dalam EN/ID, bukan hanya komponen terisolasi; GREEN. |
| P3: heading preview EN masih Indonesia | Entri EN diubah menjadi `Registration Form Preview (Read-Only)`; entri ID tetap `Pratinjau Formulir Pendaftar (Hanya Baca)`. Tes rendered kedua locale dan provider-less English diperkuat, ekspektasi lama diperbarui; GREEN. |

Tes bantuan registrasi kini memeriksa teks rendered EN/ID tentang database/CMS/ekspor, bukan lokasi fisik literal di berkas komponen. Tes ekspor menunggu query siap dan tetap memeriksa `limit=50` serta `aria-disabled=false`; kontrak tidak diubah agar tes lulus.
