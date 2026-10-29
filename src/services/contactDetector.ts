export type PhoneType = 'mobile' | 'landline' | 'invalid';

export type OutreachChannel = 'WhatsApp' | 'Instagram' | 'Telepon' | 'Kunjungan Langsung' | 'None';

export interface PhoneAnalysis {
  type: PhoneType;
  rawPhone: string;
  normalizedNumber?: string;
  areaCode?: string;
  areaName?: string;
  waUrl?: string;
}

export interface ChannelDecision {
  primaryChannel: OutreachChannel;
  reason: string;
  status: 'siap_outreach' | 'perlu_riset_kontak';
  phoneAnalysis?: PhoneAnalysis;
  instagramUrl?: string;
  address?: string;
  recommendedVisitTime?: string;
}

// Daftar kode area telepon rumah/kantor umum Jawa Timur & Nasional
const LANDLINE_AREA_CODES: Record<string, string> = {
  '0331': 'Jember',
  '0332': 'Bondowoso',
  '0333': 'Banyuwangi',
  '0334': 'Lumajang',
  '0335': 'Probolinggo',
  '0338': 'Situbondo',
  '031': 'Surabaya/Sidoarjo/Gresik',
  '0341': 'Malang/Batu',
  '0342': 'Blitar',
  '0343': 'Pasuruan',
  '0351': 'Madiun',
  '0352': 'Ponorogo',
  '0353': 'Bojonegoro',
  '0354': 'Kediri',
  '0355': 'Tulungagung/Trenggalek',
  '0356': 'Tuban',
  '0357': 'Pacitan',
  '0358': 'Nganjuk',
  '021': 'Jabodetabek',
  '022': 'Bandung',
  '024': 'Semarang',
  '0274': 'Yogyakarta',
  '0271': 'Solo',
};

/**
 * Menganalisis apakah sebuah nomor adalah nomor seluler Indonesia atau telepon rumah/kantor
 */
export function analyzePhoneNumber(phoneStr?: string): PhoneAnalysis {
  if (!phoneStr || typeof phoneStr !== 'string' || phoneStr.trim().toLowerCase() === 'unknown' || phoneStr.trim() === '-') {
    return { type: 'invalid', rawPhone: phoneStr || '' };
  }

  const clean = phoneStr.replace(/\D/g, '');
  if (!clean || clean.length < 6) {
    return { type: 'invalid', rawPhone: phoneStr };
  }

  // Cek Seluler: 08xx atau 628xx
  let intlMobile = '';
  if (clean.startsWith('628') && clean.length >= 11 && clean.length <= 15) {
    intlMobile = clean;
  } else if (clean.startsWith('08') && clean.length >= 10 && clean.length <= 14) {
    intlMobile = '62' + clean.substring(1);
  } else if (clean.startsWith('8') && clean.length >= 9 && clean.length <= 13) {
    intlMobile = '62' + clean;
  }

  if (intlMobile) {
    return {
      type: 'mobile',
      rawPhone: phoneStr,
      normalizedNumber: intlMobile,
      waUrl: `https://wa.me/${intlMobile}`,
    };
  }

  // Cek Telepon Rumah / Kantor (PSTN)
  let standardLocal = clean;
  if (clean.startsWith('62') && !clean.startsWith('628')) {
    standardLocal = '0' + clean.substring(2);
  }

  // Urutkan kode area dari yang terpanjang (e.g. 0331 sebelum 03)
  const sortedCodes = Object.keys(LANDLINE_AREA_CODES).sort((a, b) => b.length - a.length);

  for (const code of sortedCodes) {
    if (standardLocal.startsWith(code)) {
      const areaName = LANDLINE_AREA_CODES[code];
      const intlLandline = '62' + standardLocal.substring(1);
      return {
        type: 'landline',
        rawPhone: phoneStr,
        normalizedNumber: intlLandline,
        areaCode: code,
        areaName,
      };
    }
  }

  // Jika berawalan '0' atau '62' tapi bukan seluler dan panjang wajar telepon kabel
  if (standardLocal.startsWith('0') && standardLocal.length >= 7 && standardLocal.length <= 12) {
    return {
      type: 'landline',
      rawPhone: phoneStr,
      normalizedNumber: '62' + standardLocal.substring(1),
      areaCode: standardLocal.substring(0, 4),
      areaName: 'Area Khusus / Tidak Dikenal',
    };
  }

  return { type: 'invalid', rawPhone: phoneStr };
}

/**
 * Menentukan saran waktu kunjungan optimal berdasarkan kategori bisnis
 */
export function getRecommendedVisitTime(categoryName?: string): string {
  const cat = (categoryName || '').toLowerCase();
  if (cat.includes('cafe') || cat.includes('resto') || cat.includes('kuliner')) {
    return 'Pukul 14:00 - 16:30 WIB (Jam senggang antara makan siang dan malam)';
  }
  if (cat.includes('percetakan') || cat.includes('printing')) {
    return 'Pukul 09:30 - 11:30 WIB (Pagi hari sebelum puncak antrean cetak)';
  }
  if (cat.includes('konveksi') || cat.includes('garment')) {
    return 'Pukul 10:00 - 12:00 WIB (Saat produksi pagi berjalan)';
  }
  if (cat.includes('bengkel')) {
    return 'Pukul 09:30 - 11:00 WIB (Setelah briefing pagi teknisi)';
  }
  if (cat.includes('klinik') || cat.includes('beauty')) {
    return 'Pukul 11:00 - 13:00 WIB (Sebelum jam ramai perawatan sore)';
  }
  if (cat.includes('wedding')) {
    return 'Pukul 13:00 - 15:30 WIB (Hari Selasa - Kamis)';
  }
  return 'Pukul 10:00 - 11:30 WIB (Jam kerja reguler)';
}

/**
 * Memilih saluran kontak utama secara cerdas dan menentukan apakah lead siap dihubungi
 */
export function selectOutreachChannel(input: {
  phone?: string;
  whatsappUrl?: string;
  instagramUrl?: string;
  address?: string;
  categoryName?: string;
}): ChannelDecision {
  // 1. WhatsApp / Nomor Seluler
  const phoneAnalysis = analyzePhoneNumber(input.phone);
  if (phoneAnalysis.type === 'mobile' || (input.whatsappUrl && input.whatsappUrl.includes('wa.me/628'))) {
    return {
      primaryChannel: 'WhatsApp',
      reason: `Tersedia nomor seluler aktif (${phoneAnalysis.normalizedNumber || input.phone}) yang terhubung ke WhatsApp.`,
      status: 'siap_outreach',
      phoneAnalysis,
      address: input.address,
    };
  }

  // 2. Instagram DM
  if (input.instagramUrl && input.instagramUrl.includes('instagram.com/')) {
    return {
      primaryChannel: 'Instagram',
      reason: `Tidak ada nomor seluler WA, tersedia profil Instagram aktif (${input.instagramUrl}).`,
      status: 'siap_outreach',
      phoneAnalysis,
      instagramUrl: input.instagramUrl,
      address: input.address,
    };
  }

  // 3. Telepon Rumah / Kantor
  if (phoneAnalysis.type === 'landline') {
    return {
      primaryChannel: 'Telepon',
      reason: `Tersedia nomor telepon rumah/kantor (${phoneAnalysis.rawPhone} - Area ${phoneAnalysis.areaName || phoneAnalysis.areaCode}).`,
      status: 'siap_outreach',
      phoneAnalysis,
      address: input.address,
    };
  }

  // 4. Kunjungan Langsung (Onsite)
  if (input.address && input.address.trim().length > 10) {
    const visitTime = getRecommendedVisitTime(input.categoryName);
    return {
      primaryChannel: 'Kunjungan Langsung',
      reason: `Tidak ada kontak telepon/sosmed digital, namun memiliki alamat fisik terverifikasi untuk kunjungan personal.`,
      status: 'siap_outreach',
      phoneAnalysis,
      address: input.address,
      recommendedVisitTime: visitTime,
    };
  }

  // 5. Tanpa Kontak Sama Sekali -> Perlu Riset Kontak
  return {
    primaryChannel: 'None',
    reason: 'Tidak memiliki kontak telepon, Instagram, maupun alamat fisik yang memadai.',
    status: 'perlu_riset_kontak',
  };
}
