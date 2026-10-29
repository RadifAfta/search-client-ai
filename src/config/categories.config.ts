export interface CategoryConfig {
  id: string;
  name: string;
  keywords: string[];
  aliases: string[];
  ticketSize: 'low' | 'medium' | 'high';
  decisionSpeed: 'fast' | 'medium' | 'slow';
  categoryFitScore: number; // 0 - 20 weight for lead scoring
  recommendedService: string;
  highValueSystems: string[];
  assumedPainPoint: string;
  assumedValueProp: string;
  sampleProducts: string[];
  dynamicPage: 'Menu' | 'Portofolio' | 'Produk' | 'Layanan';
  defaultHighlight: string;
}

export const CATEGORIES_CONFIG: Record<string, CategoryConfig> = {
  fnb_cafe: {
    id: 'fnb_cafe',
    name: 'Kafe & Resto',
    keywords: ['Cafe Jember', 'Coffee Shop Jember', 'Resto Jember'],
    aliases: ['cafe', 'coffee', 'kopi', 'resto', 'restoran', 'eatery'],
    ticketSize: 'low',
    decisionSpeed: 'fast',
    categoryFitScore: 19,
    recommendedService: 'Landing Page Kafe/Resto Modern + Menu Digital QR Code',
    highValueSystems: [
      'Menu Digital QR Code (pelanggan scan di meja untuk melihat foto & harga menu)',
      'Sistem Reservasi Meja / Booking Acara Kumpul via WhatsApp',
      'Direct Order WhatsApp (pesan langsung tanpa potongan komisi pihak ketiga)',
    ],
    assumedPainPoint: 'Buku menu fisik sering rusak/kotor dan sulit di-update saat harga/menu berubah, serta pengunjung kesulitan mengecek menu sebelum datang.',
    assumedValueProp: 'Mempercepat perputaran meja dan memudahkan pengunjung luar area melihat menu lengkap secara instan.',
    sampleProducts: ['Kopi Signature', 'Manual Brew', 'Menu Makanan Utama', 'Camilan & Dessert'],
    dynamicPage: 'Menu',
    defaultHighlight: 'pilihan menu dan suasana tempat yang nyaman',
  },
  catering: {
    id: 'catering',
    name: 'Jasa Katering',
    keywords: ['Catering Jember', 'Katering Jember'],
    aliases: ['catering', 'katering', 'aqiqah', 'nasi kotak'],
    ticketSize: 'medium',
    decisionSpeed: 'fast',
    categoryFitScore: 18,
    recommendedService: 'Company Profile Katering + Simulator Kalkulator Paket Acara',
    highValueSystems: [
      'Kalkulator Estimasi Biaya Paket (simulasi otomatis budget per porsi / jumlah tamu)',
      'Form Pemesanan Kilat Nasi Kotak & Tumpeng terhubung ke WhatsApp admin',
      'Katalog Paket Prasmanan & Unduh Pricelist PDF',
    ],
    assumedPainPoint: 'Admin katering berulang kali menjawab pertanyaan pricelist dan simulasi hitungan porsi satu per satu di WhatsApp.',
    assumedValueProp: 'Calon pemesan instansi/keluarga bisa menghitung estimasi biaya sendiri di website sehingga siap closing saat chat.',
    sampleProducts: ['Nasi Kotak Acara', 'Prasmanan Hajatan', 'Tumpeng Tradisional', 'Katering Harian'],
    dynamicPage: 'Menu',
    defaultHighlight: 'variasi paket hidangan dan ketepatan pengantaran',
  },
  percetakan: {
    id: 'percetakan',
    name: 'Percetakan & Digital Printing',
    keywords: ['Percetakan Jember', 'Digital Printing Jember'],
    aliases: ['percetakan', 'printing', 'offset', 'digital printing', 'advertising', 'spanduk'],
    ticketSize: 'medium',
    decisionSpeed: 'fast',
    categoryFitScore: 19,
    recommendedService: 'Web Katalog Percetakan Digital & B2B Order Portal',
    highValueSystems: [
      'Form Upload File Siap Cetak (bebas kompresi resolusi gambar)',
      'Kalkulator Otomatis Cetak Banner / Spanduk per meter persegi',
      'Katalog Sampel Kemasan & Stiker Label Produk UMKM',
    ],
    assumedPainPoint: 'File cetak pelanggan sering terkompresi dan pecah di chat WA, serta staf harus menghitung biaya cetak meteran secara manual.',
    assumedValueProp: 'Mempercepat pemesanan cetak rutin dari pelaku usaha/kampus dan mengurangi salah komunikasi ukuran atau bahan.',
    sampleProducts: ['Banner & Spanduk Outdoor', 'Brosur & Flier Promosi', 'Kartu Nama & Sertifikat', 'Stiker & Kemasan Produk'],
    dynamicPage: 'Produk',
    defaultHighlight: 'ketajaman cetak, ragam material, dan kecepatan proses',
  },
  konveksi: {
    id: 'konveksi',
    name: 'Konveksi & Garment',
    keywords: ['Konveksi Jember', 'Garment Jember', 'Bordir Kaos Jember'],
    aliases: ['konveksi', 'garment', 'cloth', 'sablon', 'bordir', 'seragam', 'jahit'],
    ticketSize: 'medium',
    decisionSpeed: 'fast',
    categoryFitScore: 18,
    recommendedService: 'Web Company Profile Garment & Konveksi Distro/Seragam',
    highValueSystems: [
      'Katalog Bahan Kain & Panduan Size Chart Standar',
      'Kalkulator Estimasi Biaya Jahit Kaos / Kemeja per Lusin',
      'Form Permintaan Sampel Kain & Mockup Desain',
    ],
    assumedPainPoint: 'Calon pemesan partai besar ragu memesan jika tidak bisa memeriksa panduan bahan kain, standar jahitan, dan size chart yang jelas.',
    assumedValueProp: 'Meningkatkan kredibilitas sebagai vendor resmi seragam instansi/komunitas dan mempercepat proses dealing kuantitas besar.',
    sampleProducts: ['Kaos Komunitas Sablon', 'Kemeja PDH / PDL Instansi', 'Jaket & Hoodie Custom', 'Jersey Printing'],
    dynamicPage: 'Portofolio',
    defaultHighlight: 'kerapian jahitan, variasi pilihan bahan kain, dan ketepatan waktu',
  },
  wedding_organizer: {
    id: 'wedding_organizer',
    name: 'Wedding Organizer & Event Planner',
    keywords: ['Wedding Organizer Jember', 'WO Jember', 'Event Organizer Jember'],
    aliases: ['wedding', 'organizer', 'wo', 'planner', 'manten', 'dekorasi wedding'],
    ticketSize: 'high',
    decisionSpeed: 'slow',
    categoryFitScore: 16,
    recommendedService: 'Luxury Wedding Showcase & Online Wedding Planner Portal',
    highValueSystems: [
      'Galeri Portofolio & Highlight Dokumentasi Pernikahan Nyata',
      'Wedding Budget Simulator (Pilihan bundling All-in vs Custom)',
      'Kalender Jadwal Konsultasi Temu Privat & Tanya Konsep',
    ],
    assumedPainPoint: 'Calon pengantin ragu mengambil paket pernikahan puluhan juta rupiah jika hanya melihat postingan media sosial acak tanpa portofolio terstruktur.',
    assumedValueProp: 'Membangun citra brand yang eksklusif dan terpercaya untuk mempermudah closing paket pernikahan bernilai tinggi.',
    sampleProducts: ['Paket All-In Wedding Planning', 'Koordinasi Hari-H (On The Day)', 'Kurasi Vendor & Dekorasi', 'Dokumentasi & Rundown Acara'],
    dynamicPage: 'Portofolio',
    defaultHighlight: 'karya portofolio acara dan profesionalitas tim pendamping',
  },
  klinik_kecantikan: {
    id: 'klinik_kecantikan',
    name: 'Klinik Kecantikan & Estetika',
    keywords: ['Klinik Kecantikan Jember', 'Skin Clinic Jember'],
    aliases: ['klinik', 'kecantikan', 'beauty', 'aesthetic', 'skincare', 'dermatologi'],
    ticketSize: 'high',
    decisionSpeed: 'slow',
    categoryFitScore: 16,
    recommendedService: 'Website Klinik Kecantikan & Reservasi Treatment Dokter',
    highValueSystems: [
      'Sistem Reservasi Janji Temu Treatment / Konsultasi Dokter Online',
      'Katalog Before-After Hasil Perawatan & Profil Dokter Berlisensi',
      'Penjelasan Solusi Masalah Kulit (Acne, Flek, Anti-Aging) & Skincare Resmi',
    ],
    assumedPainPoint: 'Pasien enggan mengantre lama di klinik tanpa kepastian jadwal dan mencari bukti kredibilitas dokter sebelum konsultasi pertama.',
    assumedValueProp: 'Menjadwalkan pasien secara tertata rapi dan meningkatkan keyakinan pasien baru melalui kredibilitas profil medis.',
    sampleProducts: ['Facial Medis & Treatment Kulit', 'Laser Rejuvenation', 'Acne Care Program', 'Konsultasi Dokter Estetika'],
    dynamicPage: 'Layanan',
    defaultHighlight: 'higienitas klinik, keahlian tim medis, dan kenyamanan perawatan',
  },
  bengkel: {
    id: 'bengkel',
    name: 'Otomotif & Bengkel Kendaraan',
    keywords: ['Bengkel Mobil Jember', 'Servis Mobil Jember', 'Bengkel Motor Jember'],
    aliases: ['bengkel', 'motor', 'mobil', 'otomotif', 'servis', 'tune up', 'ganti oli'],
    ticketSize: 'medium',
    decisionSpeed: 'fast',
    categoryFitScore: 17,
    recommendedService: 'Landing Page Bengkel Spesialis & Booking Antrean Servis',
    highValueSystems: [
      'Sistem Booking Antrean Servis Berkala & Ganti Oli',
      'Konsultasi Cepat Gejala Kerusakan via WhatsApp',
      'Transparansi Daftar Layanan Servis, Scanner Komputer, & Garansi Pengerjaan',
    ],
    assumedPainPoint: 'Pemilik kendaraan khawatir estimasi biaya tidak transparan dan enggan antre lama tanpa kejelasan ketersediaan teknisi/alat.',
    assumedValueProp: 'Memberikan kepastian estimasi biaya dan waktu pengerjaan untuk mengikat pelanggan agar rutin servis berkala.',
    sampleProducts: ['Servis Berkala & Tune Up', 'Ganti Oli & Filter', 'Diagnosa Scanner Komputer', 'Perbaikan Kaki-kaki & Rem'],
    dynamicPage: 'Layanan',
    defaultHighlight: 'ketepatan diagnosa kerusakan, transparansi biaya, dan kehandalan teknisi',
  },
  retail_oleholeh: {
    id: 'retail_oleholeh',
    name: 'Retail & Oleh-oleh Khas Daerah',
    keywords: ['Oleh-oleh Khas Jember', 'Toko Oleh-oleh Jember'],
    aliases: ['oleh-oleh', 'oleh', 'khas', 'suwar-suwir', 'prol tape', 'edamame', 'snack'],
    ticketSize: 'low',
    decisionSpeed: 'fast',
    categoryFitScore: 17,
    recommendedService: 'Web Katalog Oleh-oleh Khas Jember & Pengiriman Antar-Kota',
    highValueSystems: [
      'Katalog Produk Oleh-oleh Khas + Foto Berkualitas',
      'Paket Pemesanan Parcel & Hampers Hari Raya / Acara Keluarga',
      'Form Pemesanan Kirim Luar Kota via Ekspedisi terintegrasi WhatsApp',
    ],
    assumedPainPoint: 'Wisatawan yang sudah pulang ke kota asal kesulitan memesan kembali oleh-oleh khas karena belum ada katalog online resmi.',
    assumedValueProp: 'Membuka pasar pemesanan ulang dari luar kota secara berkelanjutan tanpa bergantung pada kunjungan fisik semata.',
    sampleProducts: ['Olahan Tape Khas (Prol Tape, Suwar-Suwir)', 'Camilan & Edamame Khas', 'Kopi Robusta/Arabika Lokal', 'Paket Hampers Oleh-Oleh'],
    dynamicPage: 'Produk',
    defaultHighlight: 'keaslian cita rasa khas daerah dan kesegaran kemasan produk',
  },
  general_umkm: {
    id: 'general_umkm',
    name: 'UMKM & Jasa Profesional',
    keywords: ['Jasa Jember', 'Usaha Jember'],
    aliases: ['jasa', 'usaha', 'toko', 'studio', 'salon', 'laundry'],
    ticketSize: 'medium',
    decisionSpeed: 'medium',
    categoryFitScore: 15,
    recommendedService: 'Landing Page Konversi & Profil Bisnis Profesional',
    highValueSystems: [
      'Form Konsultasi / Pemesanan Langsung terhubung WhatsApp',
      'Katalog Layanan & Pricelist Interaktif',
      'Integrasi Peta Lokasi & Ulasan Pelanggan',
    ],
    assumedPainPoint: 'Bisnis belum memiliki saluran informasi digital resmi mandiri, sehingga calon pelanggan ragu terhadap kredibilitas usaha.',
    assumedValueProp: 'Membangun kepercayaan pelanggan lokal dan memudahkan calon pembeli menghubungi bisnis secara langsung.',
    sampleProducts: ['Layanan Konsultasi Langsung', 'Paket Layanan Standar', 'Layanan Custom'],
    dynamicPage: 'Layanan',
    defaultHighlight: 'pelayanan ramah dan respon tanggap',
  },
};

/**
 * Helper to resolve category config from business name, category string, or keyword
 */
export function resolveCategory(input: {
  name?: string;
  category?: string;
  keyword?: string;
}): CategoryConfig {
  const combined = `${input.name || ''} ${input.category || ''} ${input.keyword || ''}`.toLowerCase();

  for (const key of Object.keys(CATEGORIES_CONFIG)) {
    const cfg = CATEGORIES_CONFIG[key];
    for (const alias of cfg.aliases) {
      if (combined.includes(alias.toLowerCase())) {
        return cfg;
      }
    }
  }

  return CATEGORIES_CONFIG.general_umkm;
}
