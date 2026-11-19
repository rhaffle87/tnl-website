# Graphic Standards Manual (GSM) & UX/UI Architecture System
## Laboratorium Jaringan Telekomunikasi (TNL) — Institut Teknologi Sepuluh Nopember (ITS)
**Edisi Baku:** *GSM Kabinet Keberlanjutan 2026*  
**Domain Produksi:** [https://labtnl.site](https://labtnl.site)

---

## 1. Pendahuluan & Filosofi Desain

Dokumen ini merupakan panduan resmi standar identitas visual (Graphic Standards Manual) dan arsitektur desain antarmuka (UX/UI) untuk website Laboratorium Jaringan Telekomunikasi (Lab TNL) ITS.

Tujuan utama sistem ini adalah menjamin **keberlanjutan lintas periode kepengurusan (*cross-period sustainability*)**:
- Pengurus dan asisten laboratorium di masa mendatang dapat memperbarui nuansa visual, warna kampanye, maupun edisi kabinet melalui panel admin tanpa perlu menyentuh atau merusak basis kode (*codebase*).
- Sistem token berbasis CSS Variables yang dihidrasi secara dinamis (*Dynamic Hydration*) memastikan seluruh elemen website (dari navbar, tombol CTA, kartu lab, watermark, hingga footer) otomatis tersinkronisasi.
- Mematuhi standar aksesibilitas web internasional **WCAG 2.1 Level AA** dengan verifikasi otomatis sebelum publikasi.

---

## 2. Palet Warna Baku (Core GSM Color Palette)

Palet identitas Lab TNL ITS dibangun di atas 5 warna inti berkarakter teknis, kokoh, dan modern:

| Token Semantik | Nama Karakter | Hex Baku | Peran & Penggunaan Desain |
| :--- | :--- | :--- | :--- |
| `--gsm-primary` | **Deep Forest Green** | `#223027` | Fondasi identitas TNL, gradient latar hero, border kontur gelap, tombol primer di mode terang. |
| `--gsm-emerald` | **Emerald Pulse Glow** | `#5D8A6B` | Indikator node aktif, sinyal transmisi, cincin gelombang RF, status live, badge verifikasi. |
| `--gsm-obsidian`| **Obsidian Dark** | `#0C100E` | Latar belakang mode gelap (*dark surface*), kontras maksimum di hero & footer, kedalaman visual. |
| `--gsm-accent` | **Warm Sand Gold** | `#A8977B` | Aksen keemasan/tan, tombol Call-to-Action utama di hero, tipografi penekanan pada tema gelap. |
| `--gsm-accent-hover`| **Luminous Tan** | `#C2B091` | Keadaan interaktif (*hover/focus state*), bayangan pijar (*glow effects*), ring fokus aksesibel. |

### Pemetaan Token CSS Variabel (`frontend/src/index.css`)

Semua komponen UI website mengonsumsi token semantik di bawah ini:

```css
/* Light Mode (Root Default) */
:root {
  --gsm-primary: #223027;
  --gsm-primary-soft: #2F4236;
  --gsm-emerald: #5D8A6B;
  --gsm-obsidian: #0C100E;
  --gsm-accent: #A8977B;
  --gsm-accent-hover: #C2B091;
  --gsm-accent-ink: #0C100E;
  --gsm-accent-glow: rgba(194, 176, 145, 0.45);
  --gsm-bg-page: #FAF7F2;
  --gsm-bg-surface: #FFFFFF;
  --gsm-bg-elevated: #F2ECE1;
  --gsm-text-primary: #1E2521;
  --gsm-text-secondary: #48544D;
  --gsm-text-muted: #6E7B73;
  --gsm-border-hairline: rgba(34, 48, 39, 0.12);
}

/* Dark Mode Overrides */
.dark {
  --gsm-bg-page: #0C100E;
  --gsm-bg-surface: #111613;
  --gsm-bg-elevated: #18201B;
  --gsm-text-primary: #E5EDE7;
  --gsm-text-secondary: #BAC8BF;
  --gsm-text-muted: #829288;
  --gsm-border-hairline: rgba(93, 138, 107, 0.22);
}
```

---

## 3. Aset Logo Resmi & Aturan Penggunaan

Semua file logo tersimpan secara terdistribusi di direktori publik `frontend/public/assets/brand/`:

1. **`tnl-logo-white.png` (Monochrome White)**
   - **Lokasi:** `/assets/brand/tnl-logo-white.png`
   - **Penggunaan Wajib:**
     - Hero Section Beranda (Floating Emblem dengan Signal Waves).
     - Footer Latar Gelap & Header Gelap.
     - Dark Mode Navbar.
   - **Karakter:** Putih bersih dengan transparansi penuh, bebas artefak batas tepi.

2. **`tnl-logo-dark.png` (Solid Monochrome Dark)**
   - **Lokasi:** `/assets/brand/tnl-logo-dark.png`
   - **Penggunaan Wajib:**
     - Light Mode Navbar & kop surat resmi / dokumen cetak.
     - Latar belakang cerah (permukaan `#FFFFFF` atau `#FAF7F2`).

3. **`tnl-logo-badge.png` (Emblem Bersegel Bulat)**
   - **Lokasi:** `/assets/brand/tnl-logo-badge.png`
   - **Penggunaan Wajib:**
     - Favicon dan App Icon.
     - Avatar resmi profil media sosial.
     - Tanda air dokumen pendaftaran Open House & Sertifikat Praktikum.

### Larangan Penggunaan Logo (*Brand Don'ts*):
- Dilarang mendistorsi proporsi aspek rasio (panjang/lebar harus selalu 1:1 terkunci).
- Dilarang memberi efek *drop shadow* tebal berwarna hitam pekat di atas latar terang.
- Dilarang mengganti warna logo menjadi gradasi pelangi atau warna di luar palet GSM TNL.

---

## 4. Standar Aksesibilitas (WCAG 2.1 AA) & Ergonomi Interaksi

1. **Rasio Kontras Minimum Teks & Tombol:**
   - Teks normal (<18pt): Minimal **4.5:1** terhadap latar belakangnya.
   - Teks besar (≥18pt) & elemen UI penting (tombol): Minimal **3.0:1**.
   - Tombol CTA Aksen (`#A8977B` / `#C2B091`) wajib menggunakan teks warna gelap Obsidian (`#0C100E` / `#111613`), menghasilkan rasio **6.4:1 hingga 8.9:1** (jauh melampaui standar AA).

2. **Ukuran Area Sentuh Minimum (*Touch Target Size*):**
   - Seluruh elemen interaktif (tombol navigasi, pill tab, ikon media sosial, switcher bahasa/tema) memiliki dimensi sentuh minimal **$44 \times 44\text{px}$** (`min-h-[44px] min-w-[44px]`).

3. **State Fokus Terlihat (*Visible Focus Rings*):**
   - Navigasi keyboard (`Tab`) wajib memunculkan ring fokus dengan warna aksen:
     `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gsm-accent-glow,#C4B393)] focus-visible:ring-offset-2`.

---

## 5. Panduan Pengurus: Mengubah Tema via Panel Admin (Tanpa Koding)

Bagi koordinator publikasi, asisten lab, atau pengurus kabinet baru:

1. Masuk ke panel admin: `https://labtnl.site/admin/login`.
2. Buka menu **Colours & Theme (GSM)** (`https://labtnl.site/admin/theme`).
3. Anda akan melihat:
   - **Edisi Panduan Standar Grafis:** Masukkan nama kepengurusan (misal: *"GSM Kabinet Sinergi 2027"*).
   - **5 Color Picker Token Inti GSM:** Pilih warna Deep Forest, Emerald Glow, Obsidian, Warm Sand, dan Hover Tan.
   - **Pratinjau Langsung (Side-by-Side):** Menampilkan perbandingan kartu mode terang dan gelap secara *real-time*.
   - **Uji Kontras Otomatis (WCAG AA):** Sistem akan otomatis menghitung rasio matematis. Tombol *Publish theme* hanya akan aktif jika semua uji berstatus `✓ Lulus`.
4. Klik **Save draft** untuk menyimpan perubahan sementara.
5. Klik **Publish theme** untuk mempublikasikannya ke seluruh pengunjung website secara instan.
6. Apabila terjadi kekeliruan warna, klik **Reset Baku GSM TNL** untuk mengembalikan seluruh palet ke standar baku permanen.

---

## 6. Mekanisme Anti-FOUC & Hidrasi Dinamis

Untuk mencegah *Flash of Unstyled Content* (warna lama berkedip sebelum tema baru termuat):

1. **Inline Pre-hydration Script** di `<head>` file `frontend/index.html`:
   Mengambil cache draf/rilis dari `localStorage.getItem("tnl-theme-tokens")` sebelum parser DOM memuat CSS, sehingga variabel `--gsm-*` sudah terpasang sebelum browser merender frame pertama.
2. **React Hydration Listener** di `frontend/src/components/site/SiteLayout.tsx`:
   Memperbarui variabel CSS pada `:root` dan menyimpannya ke `localStorage` setiap kali `settings?.theme_tokens` diperbarui dari API publik `/api/public/settings`.
