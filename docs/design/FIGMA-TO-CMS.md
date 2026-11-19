# Panduan Integrasi Figma &rarr; Admin Dashboard (TNL Studio)
## Laboratorium Jaringan Telekomunikasi (Lab TNL) — Institut Teknologi Sepuluh Nopember (ITS)
**Domain Produksi:** [https://labtnl.site](https://labtnl.site)  
**Endpoint Sinkronisasi:** `https://labtnl.site/api/admin/figma/...`

---

## 1. Arsitektur 3 Jalur Integrasi (Overview)

Untuk menjembatani alur kerja antara tim desain (Divisi Media & Kreatif) dan pengelola website (TNL Studio CMS), tersedia **3 pendekatan integrasi** yang saling melengkapi:

```
[ Tim Desain di Figma ]
        │
        ├── (Jalur 1: Developer/Agent) ──> Official Figma MCP / Framelink di Antigravity
        │                                     └── Inspeksi Node, Auto-Code, & Direct API Injection
        │
        ├── (Jalur 2: Media No-Code)   ──> Tokens Studio for Figma (Export JSON)
        │                                     └── Upload/Paste di https://labtnl.site/admin/settings
        │
        └── (Jalur 3: 1-Click Push)    ──> TNL Studio CMS Sync (Private Figma Plugin)
                                              └── REST API: POST /api/admin/figma/sync-frame (STRICT DRAFT)
```

---

## 2. Jalur 1: Figma MCP di Antigravity (Untuk Developer & AI Agent)

Antigravity mendukung MCP server Figma (seperti plugin partner resmi `antigravity-plugins-partners/plugin/figma` atau `figma-developer-mcp` / `Framelink`).

### Langkah Konfigurasi:
1. Dapatkan **Figma Personal Access Token (PAT)**:
   - Buka Figma &rarr; Klik avatar profil di kiri atas &rarr; **Settings** &rarr; **Security**.
   - Di bagian *Personal access tokens*, klik **Generate new token**.
   - Beri nama (misal: `Antigravity TNL Studio`) dengan cakupan: `files:read` dan `file_variables:read`.
2. Daftarkan server MCP di konfigurasi Antigravity (`$HOME/.gemini/antigravity/mcp/figma/mcp.json`):
   ```json
   {
     "mcpServers": {
       "figma": {
         "command": "npx",
         "args": ["-y", "figma-developer-mcp"],
         "env": {
           "FIGMA_API_KEY": "figd_YOUR_PERSONAL_ACCESS_TOKEN_HERE"
         }
       }
     }
   }
   ```
3. Cara Penggunaan di Chat Antigravity:
   - Cukup kirimkan tautan file atau frame Figma:  
     *"Tolong baca token warna dan layout dari `https://www.figma.com/design/XXXXX/TNL-GSM?...` lalu perbarui tema di CMS."*
   - Agen Antigravity akan membaca struktur token dan memanggil endpoint `/api/admin/figma/import-tokens`.

---

## 3. Jalur 2: Importer JSON Tokens Studio (Untuk Divisi Media Tanpa Koding)

Divisi media yang mendesain GSM kepengurusan baru di Figma dapat mengekspor variabel warna tanpa menulis sebaris kode pun:

1. **Pasang Plugin di Figma:**
   - Gunakan plugin gratis **Tokens Studio for Figma** (atau plugin W3C **Design Tokens**).
2. **Ekspor Variabel GSM:**
   - Buka Tokens Studio &rarr; Pilih koleksi warna GSM (`primary`, `emerald`, `obsidian`, `accent`, `accent_hover`).
   - Klik **Export** &rarr; Simpan sebagai file `.json`.
3. **Impor ke TNL Studio:**
   - Masuk ke dashboard CMS: [https://labtnl.site/admin/settings](https://labtnl.site/admin/settings).
   - Pada panel **Import dari Figma Tokens (JSON)**:
     - Klik tombol **Pilih File JSON** dan unggah file hasil ekspor, atau tempelkan JSON langsung ke kotak teks.
   - Sistem akan memvalidasi format warna hex dan menghitung rasio kontras WCAG AA secara otomatis.
   - Klik **Terapkan ke Draf Tema GSM**.
   - Masuk ke menu **Colours & Theme (GSM)** (`/admin/theme`) untuk pratinjau live dan klik **Publish theme**.

---

## 4. Jalur 3: Private Figma Plugin (`TNL Studio CMS Sync`) — 1-Klik dari Canvas

Plugin mandiri yang berada di folder repositori `figma-plugin/`:

### Spesifikasi Plugin:
- **Nama Manifest:** `TNL Studio CMS Sync` (`figma-plugin/manifest.json`)
- **Domain Izin Jaringan:** `https://labtnl.site`, `http://localhost:8001`
- **Fitur Utama:**
  1. **Sync GSM Color Variables:** Membaca variabel warna lokal canvas dan menyuntikkannya ke draf tema.
  2. **Push Selected Frame as Page Draft:** Membaca teks, heading, dan daftar card pada frame terpilih lalu mengirimkannya sebagai halaman baru berstatus **`draft`**.

### Panduan Pemasangan & Pemakaian:
1. **Muat Plugin ke Figma Desktop:**
   - Buka aplikasi Figma Desktop.
   - Klik menu Figma &rarr; **Plugins** &rarr; **Development** &rarr; **Import plugin from manifest...**.
   - Pilih file `E:\Projects\tnl-website\figma-plugin\manifest.json`.
2. **Generate Token Sinkronisasi di CMS:**
   - Buka `https://labtnl.site/admin/settings`.
   - Pada panel **Koneksi Plugin Figma (`TNL CMS Sync`)**, klik tombol **Generate Figma Sync Token**.
   - Salin token rahasia yang muncul (format: `tnl_figma_...`).
3. **Kirim Desain ke CMS:**
   - Di Figma, klik kanan canvas &rarr; **Plugins** &rarr; **Development** &rarr; **TNL Studio CMS Sync**.
   - Tempelkan *Figma Sync Token* (token otomatis tersimpan di sesi Figma Anda).
   - Pilih frame/section di canvas.
   - Masukkan Judul Halaman dan URL slug yang diinginkan (opsional).
   - Klik **Push ke Admin Dashboard**.
   - Buka [https://labtnl.site/admin/pages](https://labtnl.site/admin/pages) untuk melihat draf yang baru masuk, mengedit blok, dan mempublikasikannya.

---

## 5. Dokumentasi Endpoint API Backend

Semua endpoint dilindungi oleh `get_figma_actor` (menerima cookie session admin aktif ATAU header `X-Figma-Token` / `Authorization: Bearer <token>`):

### 1. `POST /api/admin/figma/token`
- **Otorisasi:** Super Admin / Editor (`settings:write`).
- **Fungsi:** Membuat atau merotasi token rahasia. Token disimpan dalam bentuk hash SHA-256 di MongoDB.
- **Respons:**
  ```json
  {
    "ok": true,
    "token": "tnl_figma_xxxxxxxxxxxxxxxx",
    "prefix": "tnl_figma_xxxx...",
    "created_at": "2026-11-19T21:50:00Z"
  }
  ```

### 2. `GET /api/admin/figma/status`
- **Otorisasi:** Admin Read (`settings:read`).
- **Respons:**
  ```json
  {
    "configured": true,
    "prefix": "tnl_figma_xxxx...",
    "endpoint_sync_frame": "https://labtnl.site/api/admin/figma/sync-frame",
    "endpoint_import_tokens": "https://labtnl.site/api/admin/figma/import-tokens"
  }
  ```

### 3. `POST /api/admin/figma/import-tokens`
- **Headers:** `X-Figma-Token: tnl_figma_...` atau cookie sesi.
- **Payload:** W3C Design Tokens JSON, Tokens Studio JSON, atau flat object.
- **Validasi:** Otomatis menghitung rasio kontras WCAG 2.1 AA (`accent_ink` pada `accent` $\ge 4.5:1$).
- **Penyimpanan:** Disimpan ke `settings.theme.draft` dan dicatat di `audit_log`.

### 4. `POST /api/admin/figma/sync-frame`
- **Headers:** `X-Figma-Token: tnl_figma_...` atau cookie sesi.
- **Payload:**
  ```json
  {
    "title": "Workshop Machine Learning on Edge",
    "slug": "workshop-ml-edge-2026",
    "frame_name": "Event Section",
    "heading": "Workshop Machine Learning on Edge",
    "subheading": "Pelatihan komputasi cerdas jaringan telekomunikasi",
    "cards": [
      { "title": "Sesi 1: Dasar IoT", "description": "Pengenalan sensor dan gateway" },
      { "title": "Sesi 2: Edge AI", "description": "Deploy model tflite pada SBC" }
    ],
    "cta_label": "Daftar Sekarang",
    "cta_url": "/activities"
  }
  ```
- **STRICT DRAFT GUARANTEE:** Halaman yang disinkronkan dari Figma **100% dipaksa berstatus `"draft"`** (`published: False`, `needs_review: True`). Tidak ada perubahan dari Figma yang dapat langsung terbit ke publik tanpa persetujuan eksplisit dari admin di panel `/admin/pages`.
- **Audit Trail:** Dicatat secara permanen di `audit_log` dengan aktor `figma-plugin@labtnl.site`.
