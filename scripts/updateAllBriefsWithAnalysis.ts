import * as fs from 'fs';
import * as path from 'path';
import { config } from '../src/config';
import { BusinessBriefService } from '../src/services/businessBriefService';

interface LeadRecord {
  referenceUrl: string;
  name: string;
  source: string;
  processedAt: string;
  phone?: string;
  whatsappUrl?: string;
  address?: string;
  instagramUrl?: string;
}

interface AnalysisItem {
  name: string;
  category: string;
  contactDisplay: string;
  waUrl?: string;
  instagramUrl?: string;
  recommendedService: string;
  highValueSystems: string[];
  painPoint: string;
  valueProp: string;
  pitchMessage: string;
  folderSlug: string;
}

async function main() {
  const filePath = path.join(__dirname, '../data/processed_leads.json');
  const records: LeadRecord[] = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

  console.log(`🚀 Updating all 20 briefs with Service & System Analysis and compiling master dashboard...\n`);

  const briefService = new BusinessBriefService(config);
  const briefsDir = path.join(process.cwd(), 'briefs');

  const analysisItems: AnalysisItem[] = [];

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    console.log(`[${i + 1}/${records.length}] 🏢 Processing: "${record.name}"...`);

    const slug = briefService.generateSlug(record.name);
    const briefPath = path.join(briefsDir, slug, 'BUSINESS_BRIEF.md');

    // Determine category
    const lower = record.name.toLowerCase();
    let category = 'UMKM & Jasa';
    if (lower.includes('cafe') || lower.includes('coffee')) category = 'Kafe & Coffee Shop';
    else if (lower.includes('katering') || lower.includes('catering')) category = 'Jasa Katering';
    else if (lower.includes('wedding') || lower.includes('organizer')) category = 'Wedding Organizer';
    else if (lower.includes('percetakan') || lower.includes('printing')) category = 'Percetakan & Advertising';
    else if (lower.includes('konveksi') || lower.includes('garment') || lower.includes('cloth')) category = 'Konveksi & Garment';
    else if (lower.includes('klinik') || lower.includes('beauty') || lower.includes('kecantikan')) category = 'Klinik Kecantikan';
    else if (lower.includes('resto') || lower.includes('puasin')) category = 'Resto & Kuliner';
    else if (lower.includes('bengkel') || lower.includes('mobil')) category = 'Bengkel Mobil';
    else if (lower.includes('oleh')) category = 'Retail Oleh-oleh Khas';

    // Systems & Services mapping
    let recommendedService = 'Landing Page Konversi & Profile Bisnis';
    let highValueSystems: string[] = [];
    let painPoint = '';
    let valueProp = '';
    let pitchMessage = '';

    if (category.includes('Kafe') || category.includes('Resto')) {
      recommendedService = 'Landing Page Cafe/Resto Modern + Menu Digital QR Code';
      highValueSystems = [
        'Menu Digital QR Code (Pelanggan scan di meja untuk lihat foto & harga menu)',
        'Sistem Reservasi Meja / Booking Acara Kumpul terintegrasi WhatsApp',
        'Direct Order WhatsApp (Pesan bawa pulang / delivery langsung tanpa komisi ojol 20-30%)',
      ];
      painPoint = 'Buku menu cetak sering rusak/kotor dan sulit di-update saat harga berubah; pengunjung luar kota/mahasiswa kesulitan cek menu lengkap sebelum datang.';
      valueProp = 'Menaikkan nilai pesanan dengan display foto menu yang estetik dan mempercepat perputaran meja dengan akses menu instan.';
      pitchMessage = `Halo Tim ${record.name}, kami perhatikan tempat Anda sangat ramai dan asyik untuk nongkrong di Jember. Kami berinisiatif membuatkan konsep website dengan Menu Digital QR Code & form reservasi via WhatsApp agar pelanggan Anda lebih praktis. Silakan cek draft websitenya di sini: [link-demo].`;
    } else if (category.includes('Katering')) {
      recommendedService = 'Company Profile Katering + Simulator Kalkulator Paket Acara';
      highValueSystems = [
        'Kalkulator Estimasi Biaya Paket (Simulasi otomatis budget per porsi / jumlah tamu)',
        'Form Pemesanan Nasi Kotak & Tumpeng Kilat terhubung ke WhatsApp Admin',
        'Fitur Unduh Brosur Pricelist & Menu Lengkap format PDF',
      ];
      painPoint = 'Admin katering kelelahan melayani chat WA yang berulang-ulang hanya untuk tanya pricelist atau bingung hitung porsi untuk hajatan/kantor.';
      valueProp = 'Calon klien instansi atau keluarga bisa simulasi budget sendiri di website, sehingga saat menghubungi WA mereka sudah 90% siap deal.';
      pitchMessage = `Halo Tim ${record.name}, banyak instansi dan keluarga di Jember mencari jasa katering via online. Kami buatkan konsep website katering dengan kalkulator paket otomatis agar waktu admin Anda lebih hemat dan closing pesanan hajatan lebih cepat. Boleh kami kirimkan link demonya?`;
    } else if (category.includes('Wedding')) {
      recommendedService = 'Luxury Wedding Showcase & Online Wedding Planner Portal';
      highValueSystems = [
        'Galeri Portofolio Dokumentasi & Highlight Video Acara Pernikahan Real',
        'Wedding Budget Simulator (Pilihan bundling All-in vs Custom Vendor)',
        'Kalender Jadwal Konsultasi Temu Privat & Tanya Konsep',
      ];
      painPoint = 'Calon pengantin ragu mengambil paket pernikahan puluhan juta rupiah jika hanya melihat postingan Instagram acak tanpa portofolio terstruktur.';
      valueProp = 'Meningkatkan positioning brand WO menjadi lebih prestisius dan terpercaya, mempermudah closing paket pernikahan bernilai puluhan juta rupiah.';
      pitchMessage = `Halo Tim ${record.name}, kami sangat kagum dengan karya wedding organizer Anda di Jember. Kami rancang konsep website pernikahan elegan untuk menampilkan portofolio dan paket bundling Anda secara eksklusif kepada calon pengantin. Silakan dicek konsepnya di sini: [link-demo].`;
    } else if (category.includes('Percetakan')) {
      recommendedService = 'Web Katalog Percetakan Digital & B2B Order Portal';
      highValueSystems = [
        'Form Upload File Siap Cetak (PDF/TIFF) bebas kompresi chat WA',
        'Kalkulator Otomatis Cetak Spanduk / MMT per meter persegi',
        'Showcase Katalog Kemasan Produk & Label Stiker UMKM',
      ];
      painPoint = 'Pelanggan sering mengirim file lewat chat WA yang terkompresi/pecah, dan staf percetakan harus menghitung biaya cetak meteran secara manual.';
      valueProp = 'Mempercepat alur kerja percetakan dan menarik pasar B2B (kantor, kampus, UMKM) yang membutuhkan pesanan cetak rutin.';
      pitchMessage = `Halo Tim ${record.name}, kami melihat layanan percetakan Anda sangat dibutuhkan di Jember. Kami siapkan draft website percetakan dengan fitur upload file desain dan hitung biaya cetak otomatis agar proses order pelanggan Anda jauh lebih praktis. Berikut demonya: [link-demo].`;
    } else if (category.includes('Konveksi')) {
      recommendedService = 'Web Company Profile Garment & Konveksi Distro/Seragam';
      highValueSystems = [
        'Katalog Bahan Kain & Panduan Size Chart Standar Distro',
        'Kalkulator Estimasi Biaya Jahit Kaos / Seragam per Lusin',
        'Form Permintaan Sampel Kain & Mockup Desain Gratis',
      ];
      painPoint = 'Organisasi dan kantor ragu pesan ratusan seragam jika tidak bisa melihat bukti kerapian jahitan, pilihan gramasi bahan, dan standar ukuran.';
      valueProp = 'Membangun otoritas sebagai vendor konveksi profesional di Jember untuk memenangkan pesanan seragam instansi dan komunitas kampus.';
      pitchMessage = `Halo Tim ${record.name}, kami rancang konsep website konveksi profesional lengkap dengan katalog bahan kain dan size chart interaktif untuk mempermudah instansi dan komunitas di Jember memesan seragam kerja/kaos ke konveksi Anda: [link-demo].`;
    } else if (category.includes('Kecantikan')) {
      recommendedService = 'Website Klinik Kecantikan & Reservasi Treatment Dokter';
      highValueSystems = [
        'Sistem Reservasi Janji Temu Treatment / Konsultasi Dokter Online',
        'Katalog Before-After Hasil Perawatan & Profil Dokter Berlisensi',
        'Penjelasan Solusi Masalah Kulit (Acne, Flek, Anti-Aging) & Skincare Resmi',
      ];
      painPoint = 'Pasien malas antre lama tanpa kepastian jam di ruang tunggu klinik; pasien baru ragu jika tidak melihat sertifikasi medis dan hasil perawatan nyata.';
      valueProp = 'Mengatur alur antrean pasien dengan rapi dan menaikkan konversi pasien baru yang mencari klinik terpercaya di Google.';
      pitchMessage = `Halo Tim ${record.name}, kami rancang website estetika medis modern dengan sistem booking janji temu dokter agar calon pasien di Jember dapat memilih jadwal perawatan dengan mudah tanpa perlu antre lama: [link-demo].`;
    } else if (category.includes('Bengkel')) {
      recommendedService = 'Landing Page Bengkel Spesialis & Booking Antrean Servis';
      highValueSystems = [
        'Sistem Booking Antrean Servis Berkala & Ganti Oli',
        'Konsultasi Cepat Gejala Kerusakan Mobil via Form WhatsApp',
        'Transparansi Daftar Layanan Servis, Scanner Komputer, & Garansi Sparepart',
      ];
      painPoint = 'Pemilik mobil takut biaya servis tidak transparan dan malas antre berjam-jam tanpa kepastian ketersediaan montir/alat.';
      valueProp = 'Membangun reputasi bengkel nomor satu yang jujur dan profesional, serta mengunci pelanggan agar rutin servis berkala.';
      pitchMessage = `Halo Tim ${record.name}, banyak pemilik mobil di Jember mencari bengkel terpercaya via online. Kami buatkan draft website profesional dengan fitur booking antrean servis agar bengkel Anda semakin dipercaya dan ramai pelanggan: [link-demo].`;
    } else if (category.includes('Retail')) {
      recommendedService = 'Web Katalog Oleh-oleh Khas Jember & Pengiriman Antar-Kota';
      highValueSystems = [
        'Katalog Produk Oleh-oleh Khas (Tape, Edamame, Kopi) + Foto Menggiurkan',
        'Paket Pemesanan Parcel & Hampers Hari Raya / Acara Keluarga',
        'Form Pemesanan Kirim Luar Kota via Ekspedisi terintegrasi WhatsApp',
      ];
      painPoint = 'Wisatawan yang sudah kembali ke kota asal sulit membeli kembali oleh-oleh khas Jember karena tidak ada katalog online yang praktis.';
      valueProp = 'Membuka pasar pembeli dari luar kota secara berkelanjutan tanpa tergantung pada kunjungan wisatawan fisik semata.';
      pitchMessage = `Halo Tim ${record.name}, kami rancang website katalog oleh-oleh khas Jember agar pelanggan setia maupun wisatawan dari luar kota bisa memesan hampers dan oleh-oleh khas Anda kapan saja via WhatsApp: [link-demo].`;
    }

    // Contact display
    let contactDisplay = '-';
    if (record.whatsappUrl) {
      contactDisplay = `[Chat WA](${record.whatsappUrl}) (${record.phone || ''})`;
    } else if (record.phone) {
      contactDisplay = `Telp: ${record.phone}`;
    } else if (record.instagramUrl) {
      contactDisplay = `[Instagram](${record.instagramUrl})`;
    }

    analysisItems.push({
      name: record.name,
      category,
      contactDisplay,
      waUrl: record.whatsappUrl,
      instagramUrl: record.instagramUrl,
      recommendedService,
      highValueSystems,
      painPoint,
      valueProp,
      pitchMessage,
      folderSlug: slug,
    });

    // Append / Update Section in individual BUSINESS_BRIEF.md
    if (fs.existsSync(briefPath)) {
      let content = fs.readFileSync(briefPath, 'utf-8');

      // Strip existing analysis section if present
      const splitIdx = content.indexOf('ANALISIS REKOMENDASI SERVICES & SISTEM');
      if (splitIdx !== -1) {
        content = content.substring(0, splitIdx).trim();
      }

      const analysisSection = `

---

### 💼 ANALISIS REKOMENDASI SERVICES & SISTEM (PITCHING & VALUE OFFERING)
- **Rekomendasi Layanan Website:** ${recommendedService}
- **Sistem / Fitur Tambahan Bernilai Tinggi:**
${highValueSystems.map((s) => `  - ${s}`).join('\n')}
- **Masalah Bisnis (Pain Point) yang Diselesaikan:**
  ${painPoint}
- **Nilai Tambah (Value Proposition) untuk Klien:**
  ${valueProp}
- **Draf Sudut Pandang Pitching (Contoh Pesan Penawaran WA/DM):**
  > "${pitchMessage}"
`;

      content += analysisSection;
      fs.writeFileSync(briefPath, content, 'utf-8');
      console.log(`   ✅ Brief updated: briefs/${slug}/BUSINESS_BRIEF.md`);
    }
  }

  // Generate Master Report: briefs/REKOMENDASI_SERVICES_LEADS.md
  console.log('\n📑 Generating Master Report: briefs/REKOMENDASI_SERVICES_LEADS.md...');
  let masterDoc = `# 📊 MASTER REPORT: REKOMENDASI SERVICES & SISTEM LEADS UMKM JEMBER

Dokumen ini adalah **ringkasan eksekutif & panduan penawaran (sales pitch playbook)** untuk ke-20 bisnis UMKM di Jember yang telah dianalisis. Gunakan panduan ini untuk memilih bisnis mana yang ingin ditawari, jenis website/sistem apa yang paling cocok, serta contoh draf pesan WhatsApp yang siap dikirim.

---

## 📌 TABEL RINGKASAN REKOMENDASI (QUICK OVERVIEW)

| No | Nama Bisnis | Kategori | Kontak Langsung | Layanan Website / Sistem Rekomendasi | Brief & Detail |
|---|---|---|---|---|---|
`;

  analysisItems.forEach((item, idx) => {
    masterDoc += `| ${idx + 1} | **${item.name}** | ${item.category} | ${item.contactDisplay} | **${item.recommendedService}** | [Buka Brief](./${item.folderSlug}/BUSINESS_BRIEF.md) |\n`;
  });

  masterDoc += `\n---\n\n## 🔍 DETAIL ANALISIS & STRATEGI PENAWARAN PER BISNIS\n\n`;

  analysisItems.forEach((item, idx) => {
    masterDoc += `### ${idx + 1}. ${item.name} (${item.category})
- **Kontak:** ${item.contactDisplay}
- **Rekomendasi Website Utama:** **${item.recommendedService}**
- **Fitur / Sistem Tambahan Bernilai Tinggi (Upsell):**
${item.highValueSystems.map((s) => `  1. ${s}`).join('\n')}
- **Masalah Bisnis (Pain Point):**
  ${item.painPoint}
- **Nilai Tambah (Value Proposition):**
  ${item.valueProp}
- **Draf Pesan Penawaran (Tinggal Ganti [link-demo] dengan website demo yang Anda buat):**
  > "${item.pitchMessage}"
- 📁 **File Dokumen Brief Lengkap:** [${item.folderSlug}/BUSINESS_BRIEF.md](./${item.folderSlug}/BUSINESS_BRIEF.md)

---

`;
  });

  fs.writeFileSync(path.join(briefsDir, 'REKOMENDASI_SERVICES_LEADS.md'), masterDoc, 'utf-8');

  // Update README.md
  let readmeDoc = `# DAFTAR BUSINESS BRIEF & REKOMENDASI SERVICES UMKM JEMBER

Dokumen Utama:
- 📊 **[MASTER REPORT: Rekomendasi Services & Sistem Bisnis](./REKOMENDASI_SERVICES_LEADS.md)** *(Buka file ini untuk melihat ringkasan tabel dan draf penawaran)*

Total Bisnis yang Dianalisis: **20 Bisnis**

| No | Nama Bisnis | Kategori | Kontak Langsung | Rekomendasi Website/Sistem | Dokumen Brief |
|---|---|---|---|---|---|
`;

  analysisItems.forEach((item, idx) => {
    readmeDoc += `| ${idx + 1} | **${item.name}** | ${item.category} | ${item.contactDisplay} | ${item.recommendedService} | [BUSINESS_BRIEF.md](./${item.folderSlug}/BUSINESS_BRIEF.md) |\n`;
  });

  fs.writeFileSync(path.join(briefsDir, 'README.md'), readmeDoc, 'utf-8');

  console.log('🎉 Selesai! File dashboard tersedia di: briefs/REKOMENDASI_SERVICES_LEADS.md');
}

main().catch(console.error);
