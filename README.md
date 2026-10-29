# 🇮🇩 Indonesian Local UMKM Lead Generation & Outreach Engine

Sistem otomatisasi riset lead UMKM lokal (berfokus pada UMKM Jember dan sekitarnya) untuk freelancer software & web developer yang mencari klien melalui penawaran santun (*warm outreach*) dengan model biaya setup + langganan bulanan.

Sistem ini menganalisis bisnis yang belum memiliki website, melakukan audit status web & kontak, ekstraksi bukti ulasan nyata dari Google Places, menghitung skor prioritas (0–100), dan menyiapkan draf pesan 3 tahap per channel (WhatsApp, Instagram, Telepon, Kunjungan Langsung).

---

## 🚀 Cara Menjalankan

### 1. Instalasi Dependensi
Pastikan Node.js (v18+) terpasang, lalu instal dependensi:
```bash
npm install
```

### 2. Konfigurasi Environment (`.env`)
Salin berkas `.env.example` ke `.env`:
```env
# Google Places API (Resmi)
GOOGLE_PLACES_API_KEY=your_google_places_api_key_here
MAX_PLACES_API_CALLS=20

# LLM untuk AI Business Brief (Opsional, fallback otomatis aktif jika kosong)
GROQ_API_KEY=your_groq_api_key_here
GROQ_MODEL=openai/gpt-oss-120b
```
> *Catatan Keamanan*: Jika `GOOGLE_PLACES_API_KEY` belum diisi, sistem otomatis berjalan dalam mode aman menggunakan data cache/mock terverifikasi UMKM Jember tanpa error dan tanpa memotong kuota.

### 3. Menjalankan Pipeline Lengkap
Untuk mencari lead, memverifikasi website, menghitung skor, menyusun brief, dan memperbarui antrean hari ini:
```bash
npm run pipeline
```
Hasil yang diperbarui:
1. `data/leads_pipeline.json` (Database pipeline status & history)
2. `briefs/MASTER_REPORT.md` & `briefs/REKOMENDASI_SERVICES_LEADS.md` (Laporan terurut dari skor tertinggi)
3. `TODAY_QUEUE.md` (Antrean 10–15 lead siap outreach hari ini)
4. `briefs/<slug>/BUSINESS_BRIEF.md` (Dokumen brief per bisnis)

### 4. Menjalankan Pengujian (Unit Tests)
Untuk menjalankan seluruh suite pengujian otomatis (scoring, channel, detektor nomor, claim validator, deduplikasi, follow-up scheduler):
```bash
npm test
```

---

## 🛠️ Cara Menambah Kategori Baru

Kategori bisnis bersifat generik dan **tidak di-hardcode**. Semua kategori dikelola di file [`src/config/categories.config.ts`](file:///e:/Projects/search-client/src/config/categories.config.ts).

Untuk menambah kategori baru (contoh: *Cuci Sepatu / Laundry Helm* atau *Klinik Hewan / Pet Shop*), cukup tambahkan objek baru ke `CATEGORIES_CONFIG`:

```typescript
pet_shop: {
  id: 'pet_shop',
  name: 'Pet Shop & Klinik Hewan',
  keywords: ['Pet Shop Jember', 'Klinik Hewan Jember'],
  aliases: ['pet shop', 'klinik hewan', 'grooming', 'kucing', 'anjing'],
  ticketSize: 'medium',
  decisionSpeed: 'fast',
  categoryFitScore: 18, // Nilai kecocokan 0 - 20
  recommendedService: 'Landing Page Pet Shop & Booking Antrean Grooming Online',
  highValueSystems: [
    'Sistem Booking Jadwal Grooming & Vaksinasi via WhatsApp',
    'Katalog Makanan & Aksesoris Hewan Terintegrasi WA Order',
  ],
  assumedPainPoint: 'Pemilik hewan kesulitan mengecek ketersediaan slot grooming dan tarif perawatan.',
  assumedValueProp: 'Mengatur antrean antarmuka grooming secara tertib dan meningkatkan pemesanan perlengkapan rutin.',
  sampleProducts: ['Grooming Kucing/Anjing', 'Vaksinasi & Pemeriksaan Dokter', 'Pakan Premium'],
  dynamicPage: 'Layanan',
  defaultHighlight: 'kebersihan fasilitas dan ketelatenan perawatan hewan',
}
```

---

## ⚖️ Cara Mengatur Bobot Lead Scoring (0–100)

Bobot penilaian dikelola di [`src/config/scoring.config.ts`](file:///e:/Projects/search-client/src/config/scoring.config.ts):
- **Aktivitas Bisnis (Maks 25 poin)**: Rating & jumlah ulasan.
- **Ketersediaan Kontak (Maks 25 poin)**: WhatsApp (25) > Instagram (18) > Telepon Rumah (12) > Kunjungan Langsung (8).
- **Kecocokan Kategori (Maks 20 poin)**: Dihitung dari `categoryFitScore` kategori terkait.
- **Kepastian Belum Punya Website (Maks 20 poin)**: `tidak punya website` (20) > `hanya media sosial` (18) > `punya website buruk` (15) > `tidak pasti` (5).
- **Kedekatan Lokasi (Maks 10 poin)**: Dihitung dengan rumus Haversine dari koordinat referensi Anda (`originLat` & `originLng` default Alun-Alun Jember `-8.1724, 113.7007`).

---

## 🔒 Batas Harian & Pengiriman Aman

Sistem dirancang dengan filosofi **Human-in-the-Loop** (tanpa bot spam otomatis):
- Anda melakukan outreach secara manual menggunakan pesan yang disiapkan di `TODAY_QUEUE.md`.
- Batas antrean harian default adalah **12 lead/hari** (dapat diubah di `QueueService` atau parameter `maxLeads`).
- Status `jangan_hubungi` dan `perlu_riset_kontak` otomatis dikecualikan dari antrean.
- Setiap pesan mencantumkan opsi menolak yang santun (*"Jika sedang tidak membutuhkan, abaikan saja ya Kak"*).

---

## 📋 Status Pipeline

Status tiap lead dicatat di `data/leads_pipeline.json`:
- `belum_dihubungi`: Lead baru belum pernah dikontak.
- `terkirim`: Pesan pertama telah dikirim manual (menjadwalkan follow-up 1 pada H+3).
- `follow_up_1`: Follow-up nilai tambah terkirim (menjadwalkan follow-up 2 pada H+7).
- `follow_up_2`: Pesan penutup terkirim.
- `balas`: Calon klien merespons percakapan.
- `demo`: Tahap presentasi contoh demo web/sistem.
- `negosiasi`: Pembahasan paket & biaya setup/langganan.
- `deal`: Klien resmi menggunakan layanan Anda.
- `tidak_tertarik`: Klien menolak (tidak akan difollow-up lagi).
- `jangan_hubungi`: Klien meminta kontak dihentikan (permanen blacklist dari antrean).
- `perlu_riset_kontak`: Lead tanpa kontak memadai, ditahan dari antrean outreach.
