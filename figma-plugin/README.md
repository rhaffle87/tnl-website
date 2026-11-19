# TNL Studio CMS Sync — Figma Private Plugin
**Official Figma Extension for Laboratorium Jaringan Telekomunikasi (Lab TNL) ITS**  
Platform: [https://labtnl.site](https://labtnl.site)

Ekstensi Figma privat ini menghubungkan lembar kerja desain divisi media/kreatif langsung ke sistem CMS **TNL Studio**. 
Dengan 1-klik, tim desain dapat:
1. **Sync GSM Color Variables:** Menyinkronkan variabel warna lokal (Deep Forest `#223027`, Emerald Glow `#5D8A6B`, Obsidian `#0C100E`, Warm Sand `#A8977B`, Hover Tan `#C2B091`) langsung ke draf tema website.
2. **Push Selected Frame as Page Draft:** Mengonversi layout frame/section di canvas Figma menjadi blok halaman valid (`inner_hero`, `feature_tiles`, `cta_band`) dan menyimpannya sebagai **halaman DRAFT** di CMS tanpa risiko menimpa halaman produksi.

---

## Panduan Instalasi Cepat (4 Langkah)

1. **Buka Aplikasi Desktop Figma**
   - Buka project atau dokumen desain Lab TNL ITS Anda.

2. **Muat Plugin dari Manifest**
   - Klik menu Figma (ikon sudut kiri atas) &rarr; **Plugins** &rarr; **Development** &rarr; **Import plugin from manifest...**.
   - Arahkan ke file: `E:\Projects\tnl-website\figma-plugin\manifest.json`.

3. **Ambil Figma Sync Token**
   - Buka browser dan login ke dashboard admin: `https://labtnl.site/admin/settings`.
   - Pada panel **Koneksi Plugin Figma (`TNL CMS Sync`)**, klik **"Generate Figma Sync Token"**.
   - Salin token rahasia yang dihasilkan (berawalan `tnl_figma_...`).

4. **Jalankan Plugin**
   - Di Figma, klik kanan pada canvas &rarr; **Plugins** &rarr; **Development** &rarr; **TNL Studio CMS Sync**.
   - Tempelkan token Anda ke input *Figma Sync Token* (token otomatis tersimpan di sesi lokal Figma).
   - Pilih frame yang ingin dikirim atau klik *Sync GSM Tokens* &rarr; Tekan **Push ke Admin Dashboard**.
   - Buka `https://labtnl.site/admin/pages` untuk melihat draf yang baru masuk, melakukan pratinjau, dan mempublikasikannya.
