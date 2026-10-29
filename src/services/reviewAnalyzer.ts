import { PlaceReview } from '../scrapers/googlePlacesClient';

export interface ReviewQuoteEvidence {
  quote: string;
  rating: number;
  author: string;
}

export interface PainPointEvidence {
  isProven: boolean;
  label: 'terbukti dari ulasan nyata' | 'asumsi kategori, belum terbukti';
  painPointDescription: string;
  evidenceQuotes: ReviewQuoteEvidence[];
  usableInPitch: boolean; // Aturan: Hanya boleh dipakai di outreach jika terbukti
}

interface PainPointPattern {
  keywords: string[];
  theme: string;
  synthesizedPainPoint: string;
}

const PAIN_POINT_PATTERNS: PainPointPattern[] = [
  {
    keywords: ['antri', 'antre', 'nunggu', 'lama', 'panjang'],
    theme: 'antrean_dan_waktu_tunggu',
    synthesizedPainPoint: 'Pelanggan mengeluhkan waktu tunggu dan antrean di lokasi yang cukup panjang pada jam sibuk.',
  },
  {
    keywords: ['menu', 'daftar menu', 'buku menu', 'katalog', 'pricelist', 'daftar harga'],
    theme: 'katalog_dan_menu_tidak_tersedia_online',
    synthesizedPainPoint: 'Calon pengunjung kesulitan mengakses daftar menu, katalog produk, atau pricelist lengkap sebelum datang/memesan.',
  },
  {
    keywords: ['slow respon', 'slow response', 'lama balas', 'susah dihubungi', 'susah kontak', 'chat'],
    theme: 'komunikasi_admin_lambat',
    synthesizedPainPoint: 'Respon admin via chat masih lambat dalam melayani pertanyaan rincian produk/paket pemesanan.',
  },
  {
    keywords: ['resolusi', 'pecah', 'file', 'kirim wa', 'size chart', 'ukuran'],
    theme: 'kendala_spesifikasi_order',
    synthesizedPainPoint: 'Pelanggan mengalami kendala saat mengirimkan file order atau mencari panduan ukuran/spesifikasi bahan.',
  },
  {
    keywords: ['booking', 'reservasi', 'penuh', 'tempat'],
    theme: 'ketiadaan_sistem_reservasi',
    synthesizedPainPoint: 'Pelanggan kesulitan melakukan reservasi tempat/jadwal konsultasi secara pasti sebelum datang ke lokasi.',
  },
];

/**
 * Menganalisis ulasan Google Places untuk mencari bukti nyata masalah bisnis
 */
export function analyzeReviewPainPoints(
  reviews: PlaceReview[] | undefined,
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

  for (const pattern of PAIN_POINT_PATTERNS) {
    for (const review of reviews) {
      const lowerText = review.text.toLowerCase();
      const hasKeyword = pattern.keywords.some((kw) => lowerText.includes(kw));

      if (hasKeyword && review.text.trim().length > 15) {
        // Potong kutipan jika terlalu panjang agar ringkas
        let cleanQuote = review.text.trim();
        if (cleanQuote.length > 140) {
          cleanQuote = cleanQuote.substring(0, 137) + '...';
        }

        matchedQuotes.push({
          quote: cleanQuote,
          rating: review.rating,
          author: review.author_name || 'Pelanggan',
        });

        if (!detectedDescription) {
          detectedDescription = pattern.synthesizedPainPoint;
        }

        if (matchedQuotes.length >= 2) break;
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

  // Fallback ke asumsi kategori jika tidak ada bukti ulasan
  return {
    isProven: false,
    label: 'asumsi kategori, belum terbukti',
    painPointDescription: categoryAssumedPainPoint,
    evidenceQuotes: [],
    usableInPitch: false,
  };
}

