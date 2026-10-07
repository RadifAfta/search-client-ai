import Groq from 'groq-sdk';
import * as fs from 'fs';
import * as path from 'path';
import { Config } from '../config';
import { UnifiedLead, QualifiedLead } from '../index';

export class BusinessBriefService {
  private config: Config;
  private groqClient: Groq | null = null;
  private outputBaseDir: string;

  constructor(config: Config, outputBaseDir: string = path.join(process.cwd(), 'briefs')) {
    this.config = config;
    this.outputBaseDir = outputBaseDir;
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
    return name
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '') || 'bisnis';
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

PETUNJUK PENGISIAN:
1. Pada 'Halaman yang dibutuhkan:', ganti pilihan dalam kurung dengan SALAH SATU kata yang sesuai. Contoh untuk Cafe: 'Beranda, Tentang, Layanan, Menu, Kontak'. Contoh untuk Wedding Organizer: 'Beranda, Tentang, Layanan, Portofolio, Kontak'. Contoh untuk Toko/Percetakan/Konveksi: 'Beranda, Tentang, Layanan, Produk, Kontak'.
2. Pada 'Modul industri:', pilih modul yang paling akurat sesuai jenis bisnis.
3. Pada 'Konversi utama:', pilih jenis konversi yang paling realistis bagi bisnis tersebut.
4. Gunakan data kontak aktual yang disediakan semaksimal mungkin.
5. Output langsung dimulai dari teks 'BUSINESS BRIEF'.`;

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
        temperature: 0.4,
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

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const filePath = path.join(targetDir, 'BUSINESS_BRIEF.md');
    fs.writeFileSync(filePath, content, 'utf-8');
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
   * Deterministic fallback brief generator when LLM is unavailable
   */
  private generateFallbackBrief(lead: UnifiedLead | QualifiedLead): string {
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
      description = `${name} adalah tempat nongkrong dan kuliner di Jember yang menghadirkan pilihan kopi berkualitas, aneka minuman segar, dan hidangan lezat. Tempat ini dirancang untuk anak muda, mahasiswa, pekerja WFC, dan keluarga yang mencari suasana santai dan nyaman. Menghadirkan pengalaman bersantap dan kumpul yang asyik dengan pelayanan ramah.`;
      products = [
        '- Signature Coffee & Espresso Based Beverages',
        '- Manual Brew & Artisan Tea',
        '- Makanan Berat (Rice Bowl, Pasta, Snack Pilihan)',
        '- Paket Reservasi Tempat & Acara Komunitas',
      ];
      pembeda = 'Suasana tempat yang nyaman dengan fasilitas WiFi cepat, colokan merata untuk kebutuhan kerja/tugas, serta cita rasa racikan kopi yang konsisten.';
      pengunjung = 'Mahasiswa, pekerja lepas (freelancer), komunitas lokal, serta keluarga muda di Jember.';
      brandNuance = 'Warm earth tone (cokelat kopi, krem, terakota), cozy minimalism, dan pencahayaan hangat.';
      brandAvoid = 'Warna neon yang menusuk mata, layout situs yang kaku atau tampak seperti toko online e-commerce.';
    } else if (lowerName.includes('katering') || lowerName.includes('catering') || lowerKw.includes('catering')) {
      modulIndustri = 'F&B / Kuliner (Jasa Katering & Konsumsi Acara)';
      dynamicPage = 'Menu';
      conversion = 'WhatsApp / telepon / form penawaran';
      description = `${name} adalah penyedia jasa katering terpercaya di Jember yang melayani kebutuhan konsumsi acara keluarga, kantor, hingga pesta pernikahan. Menyajikan beragam olahan masakan nusantara dengan cita rasa lezat, higienis, dan bahan berkualitas. Berkomitmen memberikan kemudahan pemesanan dan ketepatan waktu pengiriman.`;
      products = [
        '- Nasi Kotak & Bento untuk Acara/Kantor',
        '- Katering Prasmanan (Buffet) Pernikahan & Hajatan',
        '- Paket Tumpeng Mini & Tradisional',
        '- Katering Harian Keluarga & Instansi',
      ];
      pembeda = 'Menu bervariasi dengan jaminan higienitas, rasa masakan konsisten, porsi mantap, dan pelayanan antar tepat waktu di seluruh Jember.';
      pengunjung = 'Penyelenggara acara, instansi kantor, keluarga yang mengadakan hajatan/tasyakuran di Jember.';
      brandNuance = 'Nuansa segar dan menggugah selera (oranye hangat, emas, putih bersih) dengan kesan higienis.';
      brandAvoid = 'Tampilan situs yang suram atau foto makanan yang buram tanpa daftar paket jelas.';
    } else if (lowerName.includes('wedding') || lowerName.includes('organizer') || lowerKw.includes('wedding')) {
      modulIndustri = 'Jasa Kreatif & Acara (Wedding Organizer & Event Planner)';
      dynamicPage = 'Portofolio';
      conversion = 'WhatsApp / form penawaran / konsultasi';
      description = `${name} adalah wedding organizer profesional di Jember yang mendampingi calon pengantin mewujudkan pernikahan impian tanpa stres. Kami menangani perencanaan menyeluruh mulai dari kurasi vendor, manajemen anggaran, hingga koordinasi ketat pada hari-H. Didedikasikan untuk menciptakan momen pernikahan yang sakral, indah, dan berkesan.`;
      products = [
        '- Paket All-In One Wedding Planning',
        '- Jasa Koordinasi Hari-H (On the Day Coordinator)',
        '- Konsultasi Konsep, Tema, & Anggaran Pernikahan',
        '- Kurasi & Manajemen Vendor (Dekorasi, MUA, Catering, Dokumentasi)',
      ];
      pembeda = 'Tim berpengalaman dengan rundown terstruktur rapi, komunikasi transparan, dan jaringan vendor terpercaya di Jember untuk hasil tanpa cela.';
      pengunjung = 'Calon mempelai pria & wanita serta keluarga besar di Jember dan Jawa Timur yang merencanakan pernikahan.';
      brandNuance = 'Elegan, romantis, dan mewah (champagne gold, ivory white, blush pink, dan sentuhan sage green).';
      brandAvoid = 'Desain bernuansa gelap atau terlalu kaku dan formal seperti portal korporat teknik.';
    } else if (lowerName.includes('percetakan') || lowerName.includes('printing') || lowerKw.includes('percetakan')) {
      modulIndustri = 'Percetakan & Digital Advertising';
      dynamicPage = 'Produk';
      conversion = 'WhatsApp / form penawaran / datang ke lokasi';
      description = `${name} adalah pusat layanan percetakan digital dan advertising di Jember yang melayani kebutuhan cetak personal maupun korporat. Kami memproduksi berbagai media promosi seperti banner, brosur, kartu nama, hingga souvenir dengan mesin berteknologi modern. Memberikan solusi cetak presisi tinggi dengan pengerjaan cepat dan harga bersahabat.`;
      products = [
        '- Cetak Banner / Spanduk / MMT Outdoor & Indoor',
        '- Digital Printing (Brosur, Kartu Nama, Flyer, Sertifikat)',
        '- Cetak Buku, Nota, & Kalender Kustom',
        '- Merchandise Promosi (Mug, Tumbler, Payung, Gantungan Kunci)',
      ];
      pembeda = 'Mesin cetak berkecepatan tinggi dengan hasil warna tajam dan tahan lama, melayani pesanan kilat (same day) dan partai besar.';
      pengunjung = 'Pelaku usaha UMKM, panitia event kampus/sekolah, instansi pemerintah, dan masyarakat umum di Jember.';
      brandNuance = 'Kreatif, dinamis, dan terpercaya (kombinasi cyan/biru profesional, putih, dan aksen warna cerah).';
      brandAvoid = 'Layout monoton tanpa contoh display hasil cetak dan pricelist yang membingungkan.';
    } else if (lowerName.includes('konveksi') || lowerName.includes('garment') || lowerName.includes('cloth') || lowerKw.includes('konveksi')) {
      modulIndustri = 'Industri Tekstil & Konveksi';
      dynamicPage = 'Portofolio';
      conversion = 'WhatsApp / form penawaran / konsultasi';
      description = `${name} adalah jasa konveksi dan garment di Jember yang melayani pembuatan pakaian kustom untuk komunitas, instansi, dan brand lokal. Memproduksi kaos, kemeja PDH/PDL, jaket, jersey, hingga seragam kerja dengan bahan bermutu dan jahitan rapi. Mengutamakan kepuasan pelanggan lewat jaminan ukuran pas dan ketepatan tenggat waktu.`;
      products = [
        '- Pembuatan Kaos Sablon & Polo Bordir Komunitas',
        '- Kemeja Seragam Kerja, PDH, & PDL Instansi',
        '- Jaket, Hoodie, & Rompi Custom',
        '- Jersey Olahraga Sublimasi Full Print',
      ];
      pembeda = 'Jahitan rantai standar distro, pilihan bahan kain lengkap bergaransi, sampel gratis untuk partai tertentu, dan pengerjaan tepat waktu.';
      pengunjung = 'Organisasi mahasiswa, pimpinan kantor/perusahaan, panitia komunitas, serta pemilik distro lokal.';
      brandNuance = 'Gaya kasual modern, percaya diri (navy blue, charcoal grey, aksen oranye atau kuning emas).';
      brandAvoid = 'Desain kuno tanpa katalog foto jahitan asli dan panduan ukuran (size chart) yang jelas.';
    } else if (lowerName.includes('kecantikan') || lowerName.includes('beauty') || lowerName.includes('klinik') || lowerKw.includes('kecantikan')) {
      modulIndustri = 'Kesehatan & Klinik Kecantikan';
      dynamicPage = 'Layanan';
      conversion = 'WhatsApp / reservasi / konsultasi';
      description = `${name} adalah klinik kecantikan di Jember yang menghadirkan perawatan kulit dan estetika medis aman di bawah pengawasan tenaga ahli. Kami membantu klien merawat kesehatan kulit wajah dan tubuh melalui teknologi perawatan terkini. Berkomitmen memberikan hasil perawatan optimal dengan suasana klinik yang tenang dan higienis.`;
      products = [
        '- Facial Treatment & Deep Cleansing Medis',
        '- Laser Skin Rejuvenation & Pigmentation Treatment',
        '- Acne Solution & Scar Treatment',
        '- Rangkaian Skincare Teruji Dermatologis',
      ];
      pembeda = 'Ditangani oleh dokter estetika berlisensi dan terapis tersertifikasi dengan peralatan medis modern yang steril.';
      pengunjung = 'Remaja, wanita karier, pria, dan masyarakat Jember yang peduli terhadap kesehatan dan perawatan kulit.';
      brandNuance = 'Soft pastel, rose gold, bersih (clean white), dan sentuhan hijau mint segar.';
      brandAvoid = 'Warna gelap kelam, gambar medis yang menakutkan, atau klaim berlebihan tanpa dasar medis.';
    } else if (lowerName.includes('bengkel') || lowerName.includes('motor') || lowerName.includes('mobil') || lowerKw.includes('bengkel')) {
      modulIndustri = 'Otomotif & Bengkel Kendaraan';
      dynamicPage = 'Layanan';
      conversion = 'WhatsApp / telepon / datang ke lokasi';
      description = `${name} adalah bengkel servis dan perawatan kendaraan terpercaya di Jember dengan teknisi handal dan peralatan lengkap. Menyediakan layanan perawatan berkala, perbaikan mesin, kelistrikan, hingga tune-up kendaraan dengan spare part asli bergaransi. Mengutamakan transparansi diagnosa kerusakan dan estimasi biaya sebelum pengerjaan.`;
      products = [
        '- Servis Berkala & Tune Up Mesin',
        '- Ganti Oli & Pemeriksaan Kaki-Kaki / Rem',
        '- Diagnosa Komputer & Kelistrikan Mobil/Motor',
        '- Perbaikan AC & Overhaul Mesin',
      ];
      pembeda = 'Diagnosa akurat dengan alat scanner modern, mekanik berpengalaman, serta jaminan transparansi harga spare part dan garansi servis.';
      pengunjung = 'Pemilik mobil dan motor pribadi, pengemudi komersial, dan pengelola armada operasional di wilayah Jember.';
      brandNuance = 'Kuat, maskulin, dan teknis (merah solid, biru royal, abu-abu baja, atau hitam profesional).';
      brandAvoid = 'Warna pastel yang terlalu lembut atau desain yang tidak mencerminkan keandalan teknis.';
    } else if (lowerName.includes('oleh') || lowerName.includes('khas') || lowerKw.includes('oleh')) {
      modulIndustri = 'Retail & Oleh-oleh Khas Daerah';
      dynamicPage = 'Produk';
      conversion = 'WhatsApp / datang ke lokasi';
      description = `${name} adalah pusat belanja oleh-oleh khas Jember yang menyediakan aneka makanan tradisional, camilan olahan tape, edamame, dan produk kerajinan lokal. Menjadi destinasi belanja favorit wisatawan dan warga yang ingin membawa buah tangan otentik khas Jember. Menyediakan produk segar, kemasan menarik, dan siap kirim ke luar kota.`;
      products = [
        '- Olahan Tape Khas Jember (Suwar-Suwir, Prol Tape)',
        '- Edamame Olahan & Camilan Khas Daerah',
        '- Kopi Robusta & Arabika Pegunungan Jember',
        '- Paket Parcel / Hampers Oleh-Oleh Lengkap',
      ];
      pembeda = 'Koleksi produk khas terlengkap dari UMKM unggulan Jember dengan jaminan tanggal kedaluwarsa baru, rasa otentik, dan harga terjangkau.';
      pengunjung = 'Wisatawan, pelancong bisnis, perantau asal Jember, dan masyarakat yang mencari oleh-oleh untuk keluarga/kerabat.';
      brandNuance = 'Hangat, ramah nusantara (kuning keemasan, hijau alami, dan cokelat kayu tradisional).';
      brandAvoid = 'Desain yang terlalu futuristik dingin yang menghilangkan cita rasa lokal tradisional.';
    }

    // Contacts
    const wa = lead.contacts?.whatsappUrl || (lead.contacts?.whatsappNumber ? `+${lead.contacts.whatsappNumber}` : lead.contactInfo || '-');
    const email = lead.contacts?.email || '-';
    const maps = lead.mapsUrl || (lead.referenceUrl?.includes('google.com/maps') ? lead.referenceUrl : '-');
    const ig = lead.contacts?.instagramUrl || (lead.referenceUrl?.includes('instagram.com') ? lead.referenceUrl : '-');
    const address = (lead as any).address || 'Jember, Jawa Timur';
    const hours = (lead as any).openingHours || '08:00 - 21:00 WIB (Setiap hari)';

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
Bahasa: Indonesia`;
  }
}
