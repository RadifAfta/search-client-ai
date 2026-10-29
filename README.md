# 🇮🇩 Indonesian Local UMKM Lead Generation & Outreach Engine

Sistem otomatisasi riset lead UMKM lokal (berfokus pada UMKM Jember dan sekitarnya) untuk freelancer software engineer & web developer lokal yang mencari klien melalui pendekatan santun (*warm outreach*) dengan model biaya setup + langganan bulanan.

Sistem berjalan **100% LOKAL di laptop** (tanpa deployment server, tanpa bot spam otomatis). Sumber data menggunakan **SerpAPI (engine `google_maps` dan `google_maps_reviews`)** dengan penyimpanan lokal terstruktur di **SQLite (`data/leads.db`)** dan antarmuka web interaktif lokal (**Local Web Dashboard**).

---

## 🚀 Cara Menjalankan

### 1. Instalasi Dependensi
Pastikan Node.js (v18+) terpasang:
```bash
npm install
```

### 2. Konfigurasi Environment (`.env`)
Pastikan file `.env` memuat:
```env
# SerpAPI Key (Wajib untuk pipeline real)
SERPAPI_KEY=your_serpapi_key_here
SERPAPI_MAX_CREDITS=20
MAX_REVIEWS_ENRICHMENT=15
SERPAPI_MAX_GOOGLE_SEARCH=5
CACHE_TTL_DAYS=14

# Port & Host Dashboard Lokal
HOST=127.0.0.1
PORT=3000
DASHBOARD_PIN=

# Groq LLM untuk Dokumen Business Brief (Opsional)
GROQ_API_KEY=your_groq_api_key_here
GROQ_MODEL=openai/gpt-oss-120b
```

### 3. Membuka Dashboard Web Lokal
Jalankan dashboard lokal di laptop:
```bash
npm run dashboard
```
Buka browser di: **http://localhost:3000**
- Menampilkan **Antrean Hari Ini** (kartu prioritas).
- Tombol **"Buka WhatsApp"** (`https://wa.me/<nomor>?text=...`) dengan pesan sudah terisi di tab baru (Anda yang menekan kirim sendiri).
- Tombol ubah status instan: `Terkirim`, `Balas`, `Demo`, `Negosiasi`, `Deal`, `Tolak`, `Stop`, `Tunda`.
- Kolom catatan bebas per lead & estimasi nilai proyek.
- Halaman **Semua Lead** dengan filter kategori, status, channel, dan pencarian teks.

### 4. Menjalankan Pipeline Pencarian Lead Baru
Untuk melakukan pencarian dan analisis lead baru lewat SerpAPI:
```bash
npm run pipeline
```

### 5. Backup Database
Untuk membuat salinan cadangan file SQLite bertanggal:
```bash
npm run backup-db
```
File cadangan disimpan otomatis di folder `data/backups/leads_backup_YYYY-MM-DD_HH-mm-ss.db`.

### 6. Migrasi Data JSON ke SQLite
Jika ada data riwayat lama di `data/leads_pipeline.json`:
```bash
npm run migrate-db
```

### 7. Menjalankan Unit Tests (10 Test Suites)
Untuk memverifikasi seluruh komponen sistem:
```bash
npm test
```

---

## ⚖️ Mode Scoring (Tahap 4)

Dikelola di [`src/config/scoring.config.ts`](file:///e:/Projects/search-client/src/config/scoring.config.ts):
1. **Mode `"cashflow_cepat"` (Default)**:
   - Memprioritaskan penutupan proyek yang cepat untuk kelancaran arus kas freelance.
   - Kategori keputusan cepat (Resto/Cafe, Percetakan, Konveksi, Bengkel, Katering) mendapatkan bobot tertinggi (25 pts), mengungguli kategori keputusan lambat seperti Klinik & Wedding Organizer (12 pts).
   - Menghargai nomor WhatsApp seluler terverifikasi (+25 pts).
   - Memberikan bonus diferensiasi nyata (+10 pts) bila keluhan operasional **terbukti di ulasan riil SerpAPI**.
2. **Mode `"nilai_besar"` (Opsional)**:
   - Memprioritaskan proyek beranggaran kontrak tinggi (Wedding Organizer, Klinik Kecantikan, Korporasi) dengan bobot kategori tiket besar hingga 30 pts.

---

## 🔍 Verifikasi Website Ketat (Tahap 2)

Label *"tidak punya website"* tidak pernah diberikan secara sembarangan:
1. **Pemeriksaan Field SerpAPI**: Jika berisi tautan medsos (`instagram.com`, `facebook.com`, `tiktok.com`, `linktr.ee`, `wa.me`, `canva.site`, `business.site`, `tokopedia.com`, `shopee.co.id`, dll.), diberi label:
   `"hanya media sosial"`.
2. **Uji Audit Teknis Domain Kustom**: Jika ada domain kustom, dilakukan uji koneksi HTTP, enkripsi HTTPS, dan tag `<meta name="viewport">` mobile-friendly. Jika bermasalah atau mati, diberi label:
   `"punya website tapi buruk"`.
3. **Pencarian Google Web Fallback**: Jika field kosong, sistem dapat menjalankan verifikasi pencarian ringan Google Web (`SerpApiClient.searchGoogleWeb`) untuk memastikan tidak ada website resmi yang terlewat.
4. **Bukti Pengecekan Tersimpan**: Setiap lead menyimpan riwayat URL yang diperiksa dan alasan hasil verifikasi di field `websiteAuditEvidence`.

---

## 💬 Standar Pesan Outreach & Claim Validator (Tahap 3)

1. **Singkat & Alami**: Pesan 1 dirancang ringkas (2–3 kalimat alami untuk chat WhatsApp/DM).
2. **Tanpa Alamat Lengkap Google**: Hanya menyebutkan area kelurahan/kecamatan (contoh: *"di daerah Kaliwates"*) atau mengosongkan lokasi. Dilarang menjejalkan alamat jalan lengkap.
3. **Tanpa Harga / Pitch Keras di Pesan 1**: Pesan 1 hanya berisi 1 observasi santun + 1 pertanyaan ringan (*"boleh saya kirim contohnya?"*) + opsi menolak yang halus.
4. **Kejujuran Demo**: Dideskripsikan jujur sebagai *"contoh tampilan untuk bisnis sejenis yang bisa disesuaikan"*, bukan mengklaim sudah membuatkan website khusus.
5. **Data-Backed Claim Validator**: Setiap angka rating, jumlah ulasan, area, atau kutipan diuji secara otomatis dan wajib dapat ditelusuri ke field data nyata lead.

---

## 🔒 Filosofi Keamanan & Human-in-the-Loop

- **Tanpa Pengiriman Otomatis**: Sistem tidak pernah mengirim pesan WhatsApp secara otomatis. Sistem hanya menyiapkan tautan `https://wa.me/<nomor>?text=<pesan_terencode>`. Anda yang memutuskan dan menekan tombol kirim sendiri di WhatsApp Web/App.
- **Keamanan Dashboard**: Default hanya mendengarkan pada antarmuka lokal `127.0.0.1`. Jika Anda membuka akses jaringan lokal (`HOST=0.0.0.0`), wajib mengaktifkan `DASHBOARD_PIN` di `.env`. Output di-escape untuk mencegah XSS dan query database menggunakan parameterized statement.
