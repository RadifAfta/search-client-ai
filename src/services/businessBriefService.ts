import Groq from 'groq-sdk';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Config } from '../config';
import { UnifiedLead, QualifiedLead } from '../index';

export interface BriefMetadata {
  score?: number;
  scoreReasons?: string[];
  websiteVerificationStatus?: string;
  primaryChannel?: string;
  evidenceLabel?: string;
  evidenceDescription?: string;
  evidenceQuotes?: { quote: string; rating: number; date?: string }[];
  messages?: {
    step1: string;
    step2_followup1: string;
    step3_followup2: string;
  };
}

export class BusinessBriefService {
  private config: Config;
  private groqClient: Groq | null = null;
  private outputBaseDir: string;

  constructor(config: Config, outputBaseDir?: string) {
    this.config = config;
    const baseDir = process.env.VERCEL ? os.tmpdir() : process.cwd();
    this.outputBaseDir = outputBaseDir || path.join(baseDir, 'briefs');
    if (this.config.groqApiKey) {
      this.groqClient = new Groq({
        apiKey: this.config.groqApiKey,
      });
    }
  }

  /**
   * Generates a safe URL-friendly directory slug from business name
   */
  public generateSlug(name: string): string {
    return (
      name
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '') || 'bisnis'
    );
  }

  /**
   * Generates a comprehensive BUSINESS BRIEF document using Groq (Llama 3.3 70B)
   * with fallback to rule-based templating if API is unavailable.
   */
  public async generateBusinessBrief(lead: UnifiedLead | QualifiedLead): Promise<string> {
    if (!this.groqClient) {
      return this.generateFallbackBrief(lead);
    }

    const systemPrompt = `Anda adalah seorang Senior Business Analyst dan Website Project Strategist untuk agensi digital di Indonesia.
Tugas Anda adalah menyusun dokumen "BUSINESS BRIEF" resmi untuk calon klien UMKM/bisnis lokal berdasarkan data lead yang disediakan.

Dokumen ini adalah acuan esensial bagi tim developer dan desainer untuk membangun Landing Page / Company Profile yang profesional, konversif, dan tepat sasaran.

FORMAT OUTPUT WAJIB:
Anda HARUS menghasilkan dokumen Markdown dengan format, heading, dan label persis seperti di bawah ini. Jangan menambahkan pengantar "Berikut adalah..." atau penutup apapun di luar dokumen brief.

BUSINESS BRIEF
Nama bisnis: <nama bisnis>
Kota/wilayah: <kota/wilayah, e.g. Jember, Jawa Timur>
Modul industri: <Pilih modul industri yang spesifik dan relevan dari: F&B / Kuliner (Resto, Cafe, Katering), Jasa Kreatif & Acara (Wedding Organizer), Retail & Oleh-oleh Khas Daerah, Percetakan & Digital Advertising, Industri Tekstil & Konveksi, Kesehatan & Klinik Kecantikan, Otomotif & Bengkel Kendaraan, atau Jasa Profesional>
Deskripsi 2-3 kalimat (menjual/mengerjakan apa, untuk siapa):
<2-3 kalimat tajam, realistis, dan persuasif yang menjelaskan apa yang dijual/dikerjakan, siapa target pasarnya, dan nilai penting bisnis tersebut>
Layanan atau produk utama (3-6):
- <item 1>
- <item 2>
- <item 3>
- <item 4 (opsional)>
- <item 5 (opsional)>
- <item 6 (opsional)>
Pembeda yang NYATA dan bisa dibuktikan:
<Sebutkan keunggulan unik (USP) yang objektif, konkret, dan dapat diverifikasi, seperti lokasi strategis, fasilitas, legalitas/sertifikasi, pengalaman/kapasitas produksi, teknologi mesin, atau layanan kustom>
Pengunjung utama:
<Target persona pembeli/pengunjung paling relevan, contoh: Warga lokal Jember, mahasiswa, calon pengantin, pemilik bisnis, dsb.>
Konversi utama: <Pilih opsi yang paling relevan: WhatsApp / telepon / form penawaran / reservasi / datang ke lokasi>
Kontak:
- WA: <Nomor atau tautan WA yang tersedia>
- Email: <Email yang tersedia atau '-'>
- Alamat lengkap: <Alamat atau area bisnis jika ada, atau estimasi area di kota terkait>
- Jam operasional: <Jam operasional yang wajar untuk tipe bisnis ini jika tidak spesifik, misal: Setiap hari 10:00 - 22:00 WIB>
- Link Google Maps: <Link Google Maps jika ada>
- Instagram: <Link atau username Instagram jika ada, atau '-'>
Data yang tersedia (kosongkan jika tidak ada):
- Tahun berdiri: <jika tidak ada data, kosongkan atau '-'>
- Sertifikasi: <jika tidak ada data, kosongkan atau '-'>
- Daftar klien: <jika tidak ada data, kosongkan atau '-'>
- Portofolio: <jika tidak ada data, kosongkan atau '-'>
- Tim: <jika tidak ada data, kosongkan atau '-'>
Preferensi brand:
- Warna logo / nuansa yang disukai: <rekomendasi palette nuansa warna yang cocok dengan karakter industri bisnis ini>
- Hal yang dihindari: <hal-hal visual/konten yang harus dihindari agar tidak merusak reputasi brand>
Halaman yang dibutuhkan: Beranda, Tentang, Layanan, <PILIH SALAH SATU: Portofolio ATAU Produk ATAU Menu ATAU Program>, Kontak
Bahasa: Indonesia

ANALISIS REKOMENDASI SERVICES & SISTEM (PITCHING & VALUE OFFERING)
Rekomendasi Layanan Website: <Pilihan model website utama, misal: Landing Page Konversi Tinggi, Interactive Company Profile, atau Katalog Digital>
Rekomendasi Sistem / Fitur Tambahan:
- <Fitur sistem bernilai tinggi 1, misal: Menu Digital QR Code / Kalkulator Estimasi Harga / Booking Jadwal Temu / Form Pemesanan WA Direct>
- <Fitur sistem bernilai tinggi 2>
- <Fitur sistem bernilai tinggi 3>
Masalah Bisnis (Pain Point) yang Diselesaikan:
<Jelaskan masalah operasional/penjualan nyata yang dihadapi bisnis ini jika belum punya sistem/web ini>
Nilai Tambah (Value Proposition) untuk Klien:
<Jelaskan bagaimana sistem ini membantu menaikkan omzet, mempercepat closing order, atau menghemat waktu admin mereka>
Sudut Pandang Pitching (Contoh Pesan Penawaran WA/DM):
<Draf 2-3 kalimat santun dan persuasif yang jujur menyebutkan contoh konsep yang dapat disesuaikan>`;

    const userPayload = {
      name: lead.name,
      keyword: lead.keyword,
      source: lead.source,
      referenceUrl: lead.referenceUrl,
      websiteUrl: lead.websiteUrl,
      mapsUrl: lead.mapsUrl,
      contactInfo: lead.contactInfo,
      contacts: lead.contacts,
      address: (lead as any).address,
      category: (lead as any).category,
      openingHours: (lead as any).openingHours,
      qualification: (lead as any).qualification,
    };

    try {
      const response = await this.groqClient.chat.completions.create({
        model: this.config.groqModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: JSON.stringify(userPayload) },
        ],
        temperature: 0.3,
      });

      const briefText = response.choices[0]?.message?.content?.trim();
      if (!briefText) {
        throw new Error('Groq returned an empty response.');
      }

      return briefText;
    } catch (err: any) {
      console.error(`⚠️ AI Business Brief generation failed for "${lead.name}":`, err.message || err);
      return this.generateFallbackBrief(lead);
    }
  }

  /**
   * Saves the generated brief into a subfolder per business: `briefs/<slug>/BUSINESS_BRIEF.md`
   */
  public saveBusinessBrief(lead: UnifiedLead | QualifiedLead, content: string): string {
    const slug = this.generateSlug(lead.name);
    const targetDir = path.join(this.outputBaseDir, slug);
    const filePath = path.join(targetDir, 'BUSINESS_BRIEF.md');

    try {
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }
      fs.writeFileSync(filePath, content, 'utf-8');
    } catch (err: any) {
      console.warn(`[WARN] Gagal menyimpan brief ke file: ${err.message}`);
    }

    return filePath;
  }

  /**
   * Generates and immediately saves the BUSINESS_BRIEF.md for a lead
   */
  public async generateAndSaveBrief(lead: UnifiedLead | QualifiedLead): Promise<{ filePath: string; content: string }> {
    const content = await this.generateBusinessBrief(lead);
    const filePath = this.saveBusinessBrief(lead, content);
    return { filePath, content };
  }

  /**
   * Appends Lead Gen Metadata (Score, Website Status, Channel, Evidence, 3-Step Sequence)
   * into BUSINESS_BRIEF.md while preserving the existing brief structure
   */
  public saveEnhancedBusinessBrief(
    lead: UnifiedLead | QualifiedLead,
    baseBriefContent: string,
    metadata: BriefMetadata
  ): { filePath: string; content: string } {
    let enhanced = baseBriefContent.trim() + '\n\n---\n\n';
    enhanced += `### 🎯 METADATA LEAD GENERATION & STRATEGI OUTREACH\n`;
    if (typeof metadata.score === 'number') {
      enhanced += `- **Skor Prioritas Lead:** **${metadata.score}/100**\n`;
    }
    if (metadata.scoreReasons && metadata.scoreReasons.length > 0) {
      enhanced += `- **Rincian Alasan Skor:**\n`;
      metadata.scoreReasons.forEach((r) => {
        enhanced += `  - ${r}\n`;
      });
    }
    if (metadata.websiteVerificationStatus) {
      enhanced += `- **Status Verifikasi Website:** \`${metadata.websiteVerificationStatus}\`\n`;
    }
    if (metadata.primaryChannel) {
      enhanced += `- **Channel Outreach Utama:** **${metadata.primaryChannel}**\n`;
    }
    if (metadata.evidenceLabel) {
      enhanced += `- **Status Bukti Pain Point:** \`${metadata.evidenceLabel}\`\n`;
    }
    if (metadata.evidenceQuotes && metadata.evidenceQuotes.length > 0) {
      enhanced += `- **Kutipan Ulasan Nyata:**\n`;
      metadata.evidenceQuotes.forEach((q) => {
        enhanced += `  > "⭐ ${q.rating}/5 — ${q.quote}" *(${q.date || 'Ulasan Google'})*\n`;
      });
    }

    if (metadata.messages) {
      enhanced += `\n#### 💬 Urutan Pesan Outreach (3 Tahap):\n`;
      enhanced += `1. **Pesan 1 (Pembuka 2-3 Kalimat Santun + Pertanyaan Ringan):**\n`;
      enhanced += `   > "${metadata.messages.step1}"\n`;
      enhanced += `2. **Follow-Up 1 (H+3: Nilai Tambah Tanpa Menekan):**\n`;
      enhanced += `   > "${metadata.messages.step2_followup1}"\n`;
      enhanced += `3. **Follow-Up 2 (H+7: Penutup Sopan dengan Opsi Menolak):**\n`;
      enhanced += `   > "${metadata.messages.step3_followup2}"\n`;
    }

    const filePath = this.saveBusinessBrief(lead, enhanced);
    return { filePath, content: enhanced };
  }

  /**
   * Deterministic fast brief generator without LLM latency
   */
  public generateFallbackBrief(lead: UnifiedLead | QualifiedLead): string {
    const name = lead.name;
    const lowerName = name.toLowerCase();
    const lowerKw = (lead.keyword || '').toLowerCase();

    // Determine category / industry module & dynamic page
    let modulIndustri = 'Jasa & Bisnis Lokal';
    let dynamicPage = 'Portofolio';
    let conversion = 'WhatsApp / datang ke lokasi';
    let description = `${name} merupakan bisnis yang beroperasi di wilayah Jember, menyediakan produk dan layanan berkualitas untuk masyarakat lokal dan sekitarnya.`;
    let products = [
      '- Layanan Konsultasi & Pemesanan Langsung',
      '- Produk/Paket Unggulan Standar',
      '- Layanan Custom sesuai Kebutuhan Pelanggan',
    ];
    let pembeda = 'Pelayanan ramah, responsif, serta komitmen kualitas terbaik dengan harga yang bersaing di wilayah Jember.';
    let pengunjung = 'Masyarakat umum dan pelaku usaha di Jember dan sekitarnya yang membutuhkan layanan cepat dan terpercaya.';
    let brandNuance = 'Modern, bersih, dan profesional dengan palet warna elegan yang mencerminkan kredibilitas.';
    let brandAvoid = 'Desain yang terlalu ramai, teks sulit dibaca, dan navigasi yang membingungkan.';

    if (lowerName.includes('cafe') || lowerName.includes('coffee') || lowerKw.includes('cafe')) {
      modulIndustri = 'F&B / Kuliner (Cafe & Coffee Shop)';
      dynamicPage = 'Menu';
      conversion = 'Datang ke lokasi / WhatsApp / reservasi';
      description = `${name} adalah tempat kuliner dan nongkrong di Jember yang menghadirkan aneka kopi pilihan, minuman segar, dan hidangan lezat untuk masyarakat lokal dan pelajar.`;
      products = [
        '- Signature Coffee & Espresso Based',
        '- Manual Brew & Artisan Beverages',
        '- Makanan Utama & Camilan Pilihan',
        '- Paket Reservasi Tempat & Acara',
      ];
      pembeda = 'Suasana nyaman dengan fasilitas pendukung memadai dan racikan minuman yang konsisten.';
      pengunjung = 'Mahasiswa, pekerja lepas, komunitas lokal, serta keluarga muda di Jember.';
      brandNuance = 'Warm earth tone (cokelat kopi, krem, terakota), cozy minimalism.';
      brandAvoid = 'Warna neon menusuk mata atau tata letak situs kaku seperti toko retail online.';
    } else if (lowerName.includes('katering') || lowerName.includes('catering') || lowerKw.includes('catering')) {
      modulIndustri = 'F&B / Kuliner (Jasa Katering & Konsumsi Acara)';
      dynamicPage = 'Menu';
      conversion = 'WhatsApp / telepon / form penawaran';
      description = `${name} adalah penyedia jasa katering di Jember yang melayani kebutuhan konsumsi acara keluarga, kantor, hingga hajatan dengan masakan higienis dan cita rasa nusantara.`;
      products = [
        '- Nasi Kotak & Bento Acara',
        '- Katering Prasmanan (Buffet)',
        '- Paket Tumpeng Tradisional',
        '- Katering Harian Instansi & Keluarga',
      ];
      pembeda = 'Menu bervariasi dengan jaminan higienitas, porsi mantap, dan ketepatan pengantaran.';
      pengunjung = 'Penyelenggara acara, instansi kantor, keluarga yang mengadakan tasyakuran di Jember.';
      brandNuance = 'Nuansa segar dan menggugah selera (oranye hangat, emas, putih bersih).';
      brandAvoid = 'Tampilan situs suram atau foto makanan buram tanpa rincian paket.';
    } else if (lowerName.includes('wedding') || lowerName.includes('organizer') || lowerKw.includes('wedding')) {
      modulIndustri = 'Jasa Kreatif & Acara (Wedding Organizer & Event Planner)';
      dynamicPage = 'Portofolio';
      conversion = 'WhatsApp / form penawaran / konsultasi';
      description = `${name} adalah wedding organizer di Jember yang mendampingi calon pengantin merencanakan pernikahan mulai dari kurasi vendor hingga koordinasi hari-H.`;
      products = [
        '- Paket All-In Wedding Planning',
        '- Jasa Koordinasi Hari-H',
        '- Konsultasi Konsep & Anggaran',
        '- Kurasi & Manajemen Vendor Acara',
      ];
      pembeda = 'Rundown acara terstruktur rapi, komunikasi terbuka, dan tim pendamping berpengalaman.';
      pengunjung = 'Calon mempelai dan keluarga besar di Jember dan Jawa Timur.';
      brandNuance = 'Elegan, romantis, dan mewah (champagne gold, ivory white, blush pink).';
      brandAvoid = 'Desain gelap atau kaku seperti portal teknik.';
    } else if (lowerName.includes('percetakan') || lowerName.includes('printing') || lowerKw.includes('percetakan')) {
      modulIndustri = 'Percetakan & Digital Advertising';
      dynamicPage = 'Produk';
      conversion = 'WhatsApp / form penawaran / datang ke lokasi';
      description = `${name} adalah pusat layanan percetakan digital di Jember yang melayani kebutuhan cetak spanduk, brosur, kemasan, hingga media promosi bisnis.`;
      products = [
        '- Cetak Banner & Spanduk Outdoor',
        '- Digital Printing (Brosur, Kartu Nama, Flyer)',
        '- Cetak Buku, Nota, & Kalender',
        '- Stiker & Kemasan Produk',
      ];
      pembeda = 'Hasil cetak warna tajam dengan pilihan material variatif dan pengerjaan tepat waktu.';
      pengunjung = 'Pelaku usaha UMKM, panitia event kampus/sekolah, instansi pemerintah, dan masyarakat umum.';
      brandNuance = 'Kreatif, dinamis, dan terpercaya (cyan/biru profesional, putih, dan aksen warna cerah).';
      brandAvoid = 'Layout monoton tanpa contoh display hasil cetak.';
    } else if (lowerName.includes('konveksi') || lowerName.includes('garment') || lowerName.includes('cloth') || lowerKw.includes('konveksi')) {
      modulIndustri = 'Industri Tekstil & Konveksi';
      dynamicPage = 'Portofolio';
      conversion = 'WhatsApp / form penawaran / konsultasi';
      description = `${name} adalah jasa konveksi dan garment di Jember yang melayani pembuatan pakaian kustom seperti kaos, kemeja seragam, dan jaket komunitas.`;
      products = [
        '- Pembuatan Kaos Sablon & Polo Bordir',
        '- Kemeja Seragam Kerja & PDH Instansi',
        '- Jaket, Hoodie, & Rompi Custom',
        '- Jersey Olahraga Full Print',
      ];
      pembeda = 'Jahitan rapi standar distro, pilihan bahan kain lengkap, dan komitmen jadwal pengiriman.';
      pengunjung = 'Organisasi mahasiswa, pimpinan kantor/perusahaan, dan panitia komunitas.';
      brandNuance = 'Kasual modern, percaya diri (navy blue, charcoal grey, aksen oranye atau emas).';
      brandAvoid = 'Desain kuno tanpa katalog foto jahitan asli dan size chart.';
    } else if (lowerName.includes('kecantikan') || lowerName.includes('beauty') || lowerName.includes('klinik') || lowerKw.includes('kecantikan')) {
      modulIndustri = 'Kesehatan & Klinik Kecantikan';
      dynamicPage = 'Layanan';
      conversion = 'WhatsApp / reservasi / konsultasi';
      description = `${name} adalah klinik kecantikan di Jember yang menghadirkan perawatan estetika kulit wajah dan tubuh di bawah pengawasan tenaga terampil.`;
      products = [
        '- Facial Treatment & Cleansing Medis',
        '- Perawatan Rejuvenasi & Flek',
        '- Acne Solution & Scar Treatment',
        '- Produk Perawatan Kulit Resmi',
      ];
      pembeda = 'Ruang perawatan higienis dengan peralatan memadai dan pelayanan ramah.';
      pengunjung = 'Masyarakat dan wanita karier di Jember yang peduli terhadap perawatan kulit.';
      brandNuance = 'Soft pastel, rose gold, bersih (clean white), dan sentuhan hijau mint.';
      brandAvoid = 'Warna gelap kelam atau klaim berlebihan tanpa dasar.';
    } else if (lowerName.includes('bengkel') || lowerName.includes('motor') || lowerName.includes('mobil') || lowerKw.includes('bengkel')) {
      modulIndustri = 'Otomotif & Bengkel Kendaraan';
      dynamicPage = 'Layanan';
      conversion = 'WhatsApp / telepon / datang ke lokasi';
      description = `${name} adalah bengkel perawatan kendaraan di Jember yang melayani servis berkala, perbaikan mesin, dan ganti oli dengan mekanik terampil.`;
      products = [
        '- Servis Berkala & Tune Up',
        '- Ganti Oli & Pemeriksaan Rem/Kaki-kaki',
        '- Diagnosa Scanner Komputer',
        '- Perbaikan AC & Kelistrikan',
      ];
      pembeda = 'Pemeriksaan teliti, mekanik berpengalaman, dan transparansi pengerjaan.';
      pengunjung = 'Pemilik mobil dan motor pribadi serta pengemudi operasional di wilayah Jember.';
      brandNuance = 'Kuat, maskulin, dan teknis (merah solid, biru royal, abu-abu baja).';
      brandAvoid = 'Warna pastel yang terlalu lembut yang tidak mencerminkan keandalan teknis.';
    } else if (lowerName.includes('oleh') || lowerName.includes('khas') || lowerKw.includes('oleh')) {
      modulIndustri = 'Retail & Oleh-oleh Khas Daerah';
      dynamicPage = 'Produk';
      conversion = 'WhatsApp / datang ke lokasi';
      description = `${name} adalah pusat belanja oleh-oleh khas Jember yang menyediakan aneka makanan olahan tape, edamame, dan produk buah tangan lokal.`;
      products = [
        '- Olahan Tape Khas (Prol Tape, Suwar-Suwir)',
        '- Edamame Olahan & Camilan Khas',
        '- Kopi Robusta & Arabika Lokal',
        '- Paket Parcel / Hampers Oleh-Oleh',
      ];
      pembeda = 'Koleksi produk khas terlengkap dengan rasa otentik dan kemasan higienis.';
      pengunjung = 'Wisatawan, pelancong bisnis, perantau asal Jember, dan masyarakat lokal.';
      brandNuance = 'Hangat, ramah nusantara (kuning keemasan, hijau alami, dan cokelat kayu).';
      brandAvoid = 'Desain terlalu futuristik dingin yang menghilangkan nuansa tradisional.';
    }

    // Contacts
    const wa = lead.contacts?.whatsappUrl || (lead.contacts?.whatsappNumber ? `+${lead.contacts.whatsappNumber}` : lead.contactInfo || '-');
    const email = lead.contacts?.email || '-';
    const maps = lead.mapsUrl || (lead.referenceUrl?.includes('google.com/maps') ? lead.referenceUrl : '-');
    const ig = lead.contacts?.instagramUrl || (lead.referenceUrl?.includes('instagram.com') ? lead.referenceUrl : '-');
    const address = (lead as any).address || 'Jember, Jawa Timur';
    const hours = (lead as any).openingHours || 'Setiap hari jam kerja operasional';

    // Services & systems
    let recService = 'Landing Page Konversi & Profile Bisnis';
    let recSystems = [
      '- Form Pemesanan / Konsultasi Langsung terhubung ke WhatsApp',
      '- Katalog Layanan & Pricelist Interaktif',
      '- Integrasi Google Maps & Ulasan Pelanggan',
    ];
    let recPainPoint = 'Bisnis belum memiliki saluran digital mandiri resmi untuk menampilkan katalog dan verifikasi kredibilitas.';
    let recValue = 'Meningkatkan kepercayaan calon pelanggan lokal dan mempermudah pemesanan langsung.';
    let recPitching = `Halo Kak di ${name}, salam kenal dari saya di Jember. Kebetulan saya membuat contoh konsep website praktis yang bisa disesuaikan dengan logo dan produk Kakak, boleh saya bagikan tautan contohnya untuk dilihat santai?`;

    return `BUSINESS BRIEF
Nama bisnis: ${name}
Kota/wilayah: Jember, Jawa Timur
Modul industri: ${modulIndustri}
Deskripsi 2-3 kalimat (menjual/mengerjakan apa, untuk siapa):
${description}
Layanan atau produk utama (3-6):
${products.join('\n')}
Pembeda yang NYATA dan bisa dibuktikan:
${pembeda}
Pengunjung utama:
${pengunjung}
Konversi utama: ${conversion}
Kontak:
- WA: ${wa}
- Email: ${email}
- Alamat lengkap: ${address}
- Jam operasional: ${hours}
- Link Google Maps: ${maps}
- Instagram: ${ig}
Data yang tersedia (kosongkan jika tidak ada):
- Tahun berdiri: -
- Sertifikasi: -
- Daftar klien: -
- Portofolio: -
- Tim: -
Preferensi brand:
- Warna logo / nuansa yang disukai: ${brandNuance}
- Hal yang dihindari: ${brandAvoid}
Halaman yang dibutuhkan: Beranda, Tentang, Layanan, ${dynamicPage}, Kontak
Bahasa: Indonesia

ANALISIS REKOMENDASI SERVICES & SISTEM (PITCHING & VALUE OFFERING)
Rekomendasi Layanan Website: ${recService}
Rekomendasi Sistem / Fitur Tambahan:
${recSystems.join('\n')}
Masalah Bisnis (Pain Point) yang Diselesaikan:
${recPainPoint}
Nilai Tambah (Value Proposition) untuk Klien:
${recValue}
Sudut Pandang Pitching (Contoh Pesan Penawaran WA/DM):
"${recPitching}"`;
  }
}
