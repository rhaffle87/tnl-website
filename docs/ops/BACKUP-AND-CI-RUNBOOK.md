# Runbook Operasional: Backup Harian Otomatis & GitHub Actions CI
**Laboratorium Jaringan Telekomunikasi (TNL) ITS — `https://labtnl.site`**
*Target Node:* Proxmox LXC Cluster (`CT 102`, `CT 103`, `CT 116`, `CT 117`)  
*Versi Dokumen:* 1.0 (November 2026)

---

## 1. Arsitektur & Jadwal Otomatisasi

Untuk menjamin keberlanjutan operasional (*kepengurusan keberlanjutan*), sistem backup dan pengujian otomatis telah dipasang tanpa intervensi manual:

```
+-----------------------------------------------------------------------------------------+
|                                    PROXMOX LXC CLUSTER                                  |
|                                                                                         |
|  [CT 116: labtnl-db]                                                                    |
|  - Systemd Timer : tnl-backup-db.timer (Pukul 02:00 WIB setiap hari)                    |
|  - Skrip         : /usr/local/bin/tnl-backup-db.sh (mongodump --gzip)                   |
|  - Lokasi Arsip  : /var/backups/tnl/db/tnl-db-YYYYMMDD-HHMMSS.archive.gz                |
|  - Symlink       : /var/backups/tnl/db/latest.archive.gz                                |
|  - Kebijakan     : Retensi 14 hari (tetap mempertahankan minimal 3 arsip terbaru)       |
|                                                                                         |
|  [CT 103: labtnl-app]                                                                   |
|  - Systemd Timer : tnl-backup-media.timer (Pukul 02:30 WIB setiap hari)                 |
|  - Skrip         : /usr/local/bin/tnl-backup-media.sh (tar -czf /opt/tnl/media)         |
|  - Lokasi Arsip  : /var/backups/tnl/media/tnl-media-YYYYMMDD-HHMMSS.tar.gz              |
|  - Symlink       : /var/backups/tnl/media/latest.tar.gz                                 |
|  - Kebijakan     : Retensi 14 hari (tetap mempertahankan minimal 3 arsip terbaru)       |
+-----------------------------------------------------------------------------------------+
                                            |
                         (Tarik Off-site secara berkala via Tailscale)
                                            v
+-----------------------------------------------------------------------------------------+
|  [PC Lokal / Admin Workstation]                                                         |
|  - Skrip Pull : powershell -ExecutionPolicy Bypass -File scripts\ops\pull-latest-backups.ps1 |
|  - Hasil      : Tersimpan di backups/offsite/ (disarankan backup bulanan ke GDrive lab) |
+-----------------------------------------------------------------------------------------+

+-----------------------------------------------------------------------------------------+
|                                  GITHUB ACTIONS CI / CD                                 |
|                                                                                         |
|  [.github/workflows/ci.yml]                                                             |
|  - Trigger : Push ke `main`, Pull Request ke `main`, dan manual workflow_dispatch        |
|  - Job 1   : backend-tests (Python 3.12, pytest **minimal 154 tes**, in-memory mock DB)             |
|  - Job 2   : frontend-checks (Node.js **22**, `tsc -b`, Vitest **minimal 360 tes**, vite build,   |
|              Playwright geometry gate)                                                            |
|  - Job 3   : repository hygiene & security guard (cek `.env`/arsip ter-commit, working tree       |
|              bersih, dan pemindaian assignment kredensial di source)                             |
|                                                                                         |
|  [.github/workflows/live-smoke.yml]                                                     |
|  - Trigger : Cron Harian 01:00 UTC (08:00 WIB) & workflow_dispatch pasca-deploy         |
|  - Job     : Playwright Chromium Read-Only Smoke Test terhadap https://labtnl.site      |
+-----------------------------------------------------------------------------------------+
```

> **Catatan angka:** 154 (backend) dan 360 (frontend) adalah angka gate terverifikasi sebelum perbaikan audit dan merupakan **minimum; final counts recorded by parent after audit fixes**. Node.js 22 adalah runtime CI saat ini.

> **Penamaan arsip:** backup *terjadwal di server* (CT 116) menghasilkan `.archive.gz` (mongodump `--gzip`), sedangkan `scripts/deploy/backup-db.ps1` menghasilkan dump ad-hoc `.archive` (tanpa gzip) di `backups/db/`. Keduanya sengaja berbeda; gunakan `--gzip` hanya untuk `.archive.gz`.

---

## 2. Pemantauan & Pengecekan Status Backup di Server

### A. Melihat Status Timer Terjadwal
Login via SSH ke masing-masing container:
```bash
# Di CT 116 (Database):
ssh root@100.111.32.102 "systemctl list-timers --all | grep tnl-backup"

# Di CT 103 (Media):
ssh root@100.65.129.8 "systemctl list-timers --all | grep tnl-backup"
```

### B. Menjalankan Backup Manual Kapan Saja
Jika ingin mencadangkan database atau media sesaat sebelum melakukan perubahan besar:
```bash
# Eksekusi manual database backup di CT 116:
ssh root@100.111.32.102 "systemctl start tnl-backup-db.service"

# Eksekusi manual media backup di CT 103:
ssh root@100.65.129.8 "systemctl start tnl-backup-media.service"
```

### C. Membaca Log Riwayat Eksekusi
```bash
# Log backup database di CT 116:
ssh root@100.111.32.102 "journalctl -u tnl-backup-db.service -n 30 --no-pager"

# Log backup media di CT 103:
ssh root@100.65.129.8 "journalctl -u tnl-backup-media.service -n 30 --no-pager"
```

### D. Mengaudit Status Menyeluruh dari Windows
Jalankan audit kesehatan kluster Proxmox yang sudah mengintegrasikan deteksi file backup:
```powershell
powershell -ExecutionPolicy Bypass -File scripts\deploy\health-check.ps1
```

---

## 3. Prosedur Pemulihan (Disaster Recovery / Restore)

> **PERINGATAN PENTING:** Operasi restore database akan menimpa data yang ada saat ini. Pastikan untuk selalu menjalankan backup cadangan sebelum merestore!

### A. Restore Database MongoDB (`CT 116`)

1. **Restore dari Backup Terbaru (`latest`):**
   ```bash
   ssh root@100.111.32.102
   mongorestore --gzip --archive=/var/backups/tnl/db/latest.archive.gz --drop
   ```
2. **Restore dari File Backup Tanggal Tertentu:**
   ```bash
   # Lihat daftar file yang tersedia:
   ls -la /var/backups/tnl/db/

   # Jalankan restore pada tanggal yang diinginkan:
   mongorestore --gzip --archive=/var/backups/tnl/db/tnl-db-20261120-093618.archive.gz --drop
   ```
3. **Verifikasi Data Pasca-Restore:**
   ```bash
   mongosh --eval "use tnl; db.users.countDocuments(); db.events.countDocuments();"
   ```
4. **Restore dump ad-hoc dari workstation (`backup-db.ps1`, ekstensi `.archive`, TANPA gzip):**
   ```bash
   # Jalankan di workstation Windows; file lokal berada di backups/db/
   scp backups\db\tnl-backup-<TIMESTAMP>.archive root@100.111.32.102:/tmp/restore.archive
   ssh root@100.111.32.102 "mongorestore --drop --archive=/tmp/restore.archive && rm -f /tmp/restore.archive"
   ```
   Jangan menambahkan `--gzip` untuk arsip `.archive`; flag tersebut hanya untuk arsip server `.archive.gz`.

### B. Restore Berkas Media & Unggahan (`CT 103`)

1. **Restore dari Arsip Terbaru (`latest`):**
   ```bash
   ssh root@100.65.129.8
   tar -xzf /var/backups/tnl/media/latest.tar.gz -C /opt/tnl/
   ```
2. **Pastikan Kepemilikan & Izin Least-Privilege:**
   ```bash
   # Sesuaikan group dengan user yang menjalankan Nginx di CT 103 (umumnya www-data).
   chown -R root:www-data /opt/tnl/media
   find /opt/tnl/media -type d -exec chmod 750 {} +
   find /opt/tnl/media -type f -exec chmod 640 {} +
   ```
   Hindari `chmod -R 777`: izin tersebut memberi hak tulis kepada semua user dan melemahkan isolasi media. Berikan hanya hak baca bagi group web server; gunakan `chown`/`chmod` tambahan hanya jika backend perlu menulis (`root` sudah memiliki akses penuh pada layanan systemd saat ini).
3. **Verifikasi:**
   ```bash
   ls -ld /opt/tnl/media && find /opt/tnl/media -maxdepth 1 -type f -printf '%m %u:%g %p\n' | head
   ```

---

## 4. Prosedur Sinkronisasi Salinan Off-Site ke Komputer Lokal

Admin atau asisten lab dapat mengunduh salinan backup terverifikasi ke workstation lokal (misalnya seminggu atau sebulan sekali) menggunakan:

```powershell
# Jalankan dari root workspace tnl-website di PowerShell:
powershell -ExecutionPolicy Bypass -File scripts\ops\pull-latest-backups.ps1
```

File akan tersimpan rapi di direktori `backups/offsite/`:
* `tnl-db-offsite-YYYYMMDD-HHMMSS.archive.gz`
* `tnl-media-offsite-YYYYMMDD-HHMMSS.tar.gz`
* `latest-db.archive.gz` & `latest-media.tar.gz`

Folder `backups/` telah dikecualikan secara ketat pada `.gitignore` agar tidak pernah ter-commit ke repositori publik Git.

---

## 5. Panduan GitHub Actions CI & Scheduled Live Smoke

Setiap asisten yang melakukan *pull request* atau *push* ke branch `main`:

1. **Workflow `CI` Otomatis Berjalan:**
   - Menjalankan **minimal 154** tes backend `pytest` dengan database terisolasi (`mongomock_motor`).
   - Menjalankan static typecheck TypeScript `tsc -b` dengan Node.js 22.
   - Menjalankan **minimal 360** tes komponen frontend `Vitest`.
   - Menjalankan kompilasi produksi `vite build` dan geometry gate Playwright.
   - Memastikan tidak ada file `.env`, private key, atau arsip backup yang tidak sengaja terdorong ke Git, working tree bersih, serta tidak ada assignment kredensial hardcoded di source.
   - Angka tes tersebut adalah minimum; final counts recorded by parent after audit fixes.
2. **Workflow `Live Smoke` Berjalan Setiap Pagi (08:00 WIB):**
   - Headless Playwright Chromium membuka `https://labtnl.site`.
   - Memeriksa zero broken images, responsive viewport (Desktop, Laptop, iPhone), dan keabsahan HTTP 200 di seluruh 8 rute publik.
   - Jika ada anomali atau downtime, GitHub Actions akan mengirim email notifikasi kegagalan secara instan ke pengelola repositori.
