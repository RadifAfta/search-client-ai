import { SerpApiReview } from '../scrapers/serpApiClient';

export interface ReviewQuoteEvidence {
  quote: string;
  rating: number;
  date?: string;
}

export interface PainPointEvidence {
  isProven: boolean;
  label: 'terbukti dari ulasan nyata' | 'asumsi kategori, belum terbukti';
  painPointDescription: string;
  evidenceQuotes: ReviewQuoteEvidence[];
  usableInPitch: boolean; // Hanya boleh dipakai di outreach jika terbukti
}

interface PainPointPattern {
  keywords: string[];
  negativeExclusions: string[]; // Keluhan yang diabaikan (bukan urusan website)
  theme: string;
  synthesizedPainPoint: string;
}

const RELEVANT_PAIN_POINT_PATTERNS: PainPointPattern[] = [
  {
    keywords: ['antri', 'antre', 'nunggu lama', 'antrian panjang', 'antre kasir', 'antri pesan'],
    negativeExclusions: ['pelayanan judes', 'pelayan jutek'],
    theme: 'antrean_dan_waktu_tunggu',
    synthesizedPainPoint: 'Pelanggan menyebut antrean dan waktu tunggu pemesanan di lokasi cukup panjang pada jam sibuk.',
  },
  {
    keywords: ['daftar menu', 'buku menu', 'katalog', 'pricelist', 'daftar harga', 'harga tidak jelas', 'menu habis'],
    negativeExclusions: ['asin', 'manis', 'pedas', 'hambar', 'minyak', 'porsi dikit'],
    theme: 'katalog_dan_menu_tidak_tersedia_online',
    synthesizedPainPoint: 'Pelanggan kesulitan mengecek rincian daftar menu, pricelist, atau ketersediaan produk sebelum datang.',
  },
  {
    keywords: ['booking', 'reservasi', 'susah booking', 'pesan tempat', 'meja penuh', 'janji temu'],
    negativeExclusions: [],
    theme: 'ketiadaan_sistem_reservasi',
    synthesizedPainPoint: 'Pelanggan kesulitan memastikan reservasi tempat atau janji temu secara pasti sebelum berkunjung.',
  },
  {
    keywords: ['slow respon', 'slow response', 'lama balas', 'susah dihubungi', 'susah kontak', 'chat tidak dibalas', 'nomor tidak aktif'],
    negativeExclusions: ['pelayan marah', 'kasir jutek'],
    theme: 'komunikasi_admin_lambat',
    synthesizedPainPoint: 'Pelanggan mengeluhkan kontak admin atau respon pesan yang lambat saat ingin memesan atau bertanya.',
  },
  {
    keywords: ['info online', 'katalog online', 'pesan luar kota', 'tidak ada web', 'cari di ig susah', 'website'],
    negativeExclusions: [],
    theme: 'ketiadaan_saluran_online',
    synthesizedPainPoint: 'Pelanggan mencari saluran katalog atau pemesanan online resmi yang praktis namun belum tersedia.',
  },
];

// Kata-kata yang murni urusan rasa masakan atau keluhan fisik yang DILARANG dianggap masalah website
const PURE_CULINARY_COMPLAINTS = [
  'kurang asin', 'keasinan', 'terlalu manis', 'hambar', 'banyak minyak', 'minyaknya', 'pedasnya luar binasa',
  'terlalu pedas', 'makanannya dingin', 'gosong', 'amis', 'porsi sedikit', 'toilet kotor', 'parkir becek'
];

/**
 * Menganalisis ulasan Google Maps untuk mencari bukti nyata masalah operasional yang relevan dengan solusi website/sistem
 */
export function analyzeReviewPainPoints(
  reviews: SerpApiReview[] | undefined,
  categoryAssumedPainPoint: string
): PainPointEvidence {
  if (!reviews || reviews.length === 0) {
    return {
      isProven: false,
      label: 'asumsi kategori, belum terbukti',
      painPointDescription: categoryAssumedPainPoint,
      evidenceQuotes: [],
      usableInPitch: false,
    };
  }

  const matchedQuotes: ReviewQuoteEvidence[] = [];
  let detectedDescription = '';

  for (const review of reviews) {
    const rawText = review.snippet || '';
    const lowerText = rawText.toLowerCase();

    // 1. Abaikan jika ulasan bintang 5 tanpa keluhan
    if (review.rating >= 5 && !lowerText.includes('tapi') && !lowerText.includes('namun') && !lowerText.includes('sayang')) {
      continue;
    }

    // 2. Cek apakah teks cocok dengan masalah yang relevan dengan solusi web/sistem
    for (const pattern of RELEVANT_PAIN_POINT_PATTERNS) {
      const hasRelevantKeyword = pattern.keywords.some((kw) => lowerText.includes(kw));

      if (hasRelevantKeyword) {
        // Pastikan bukan murni komplain rasa makanan (kecuali ada komplain antrean/menu di dalamnya)
        const isPureFoodComplaint = PURE_CULINARY_COMPLAINTS.some((fc) => lowerText.includes(fc)) &&
          !pattern.keywords.some((kw) => lowerText.includes(kw));

        if (!isPureFoodComplaint) {
          let cleanQuote = rawText.trim();
          if (cleanQuote.length > 200) {
            cleanQuote = cleanQuote.substring(0, 197) + '...';
          }

          matchedQuotes.push({
            quote: cleanQuote,
            rating: review.rating,
            date: review.date,
          });

          if (!detectedDescription) {
            detectedDescription = pattern.synthesizedPainPoint;
          }

          if (matchedQuotes.length >= 2) break;
        }
      }
    }
    if (matchedQuotes.length >= 2) break;
  }

  if (matchedQuotes.length > 0) {
    return {
      isProven: true,
      label: 'terbukti dari ulasan nyata',
      painPointDescription: detectedDescription,
      evidenceQuotes: matchedQuotes,
      usableInPitch: true,
    };
  }

  // Jika tidak ditemukan masalah relevan
  return {
    isProven: false,
    label: 'asumsi kategori, belum terbukti',
    painPointDescription: categoryAssumedPainPoint,
    evidenceQuotes: [],
    usableInPitch: false,
  };
}
