export type ScoringMode = 'cashflow_cepat' | 'nilai_besar';

export interface ScoringWeights {
  mode: ScoringMode;
  modeName: string;
  modeDescription: string;
  businessActivity: {
    maxPoints: number;
    ratingThresholds: { min: number; points: number }[];
    reviewsThresholds: { min: number; points: number }[];
    provenReviewBonus: number; // Poin pembeda utama bila keluhan terbukti di ulasan riil SerpAPI
  };
  contactAvailability: {
    maxPoints: number;
    whatsapp: number;
    instagram: number;
    landline: number;
    onsiteOnly: number;
    none: number;
  };
  categoryFit: {
    maxPoints: number;
  };
  websiteStatus: {
    maxPoints: number;
    noWebsite: number;
    socialOnly: number;
    poorWebsite: number;
    uncertain: number;
  };
  locationProximity: {
    maxPoints: number;
    originLat: number; // Alun-alun Jember
    originLng: number;
    originCity: string;
    distanceBandsKm: { maxKm: number; points: number }[];
    fallbackPointsInCity: number;
    fallbackPointsUnknown: number;
  };
}

export const SCORING_MODES: Record<ScoringMode, ScoringWeights> = {
  // Mode Default: Mengutamakan closing cepat, kontak WhatsApp, dan industri dengan siklus keputusan instan
  cashflow_cepat: {
    mode: 'cashflow_cepat',
    modeName: 'Cash Flow Cepat (Default)',
    modeDescription: 'Memprioritaskan bisnis dengan keputusan cepat (kafe, percetakan, konveksi, bengkel, katering) dan kontak WA langsung.',
    businessActivity: {
      maxPoints: 25,
      ratingThresholds: [
        { min: 4.6, points: 9 },
        { min: 4.2, points: 7 },
        { min: 3.8, points: 5 },
        { min: 0.1, points: 2 },
        { min: 0.0, points: 1 },
      ],
      reviewsThresholds: [
        { min: 100, points: 6 },
        { min: 30, points: 5 },
        { min: 10, points: 3 },
        { min: 1, points: 2 },
        { min: 0, points: 1 },
      ],
      provenReviewBonus: 10, // Tambahan 10 poin penuh bila bukti pain point terbukti di ulasan riil
    },
    contactAvailability: {
      maxPoints: 25,
      whatsapp: 25,
      instagram: 15,
      landline: 8,
      onsiteOnly: 4,
      none: 0,
    },
    categoryFit: {
      maxPoints: 25,
    },
    websiteStatus: {
      maxPoints: 20,
      noWebsite: 20,
      socialOnly: 18,
      poorWebsite: 15,
      uncertain: 5,
    },
    locationProximity: {
      maxPoints: 5, // Diturunkan karena dalam radius kecil tidak menjadi pembeda utama
      originLat: -8.1724,
      originLng: 113.7007,
      originCity: 'Jember',
      distanceBandsKm: [
        { maxKm: 3.0, points: 5 },
        { maxKm: 7.0, points: 4 },
        { maxKm: 15.0, points: 3 },
        { maxKm: 50.0, points: 1 },
      ],
      fallbackPointsInCity: 3,
      fallbackPointsUnknown: 1,
    },
  },

  // Mode Opsi: Mengutamakan nilai transaksi besar (proyek website mahal seperti Klinik & Wedding Organizer)
  nilai_besar: {
    mode: 'nilai_besar',
    modeName: 'Nilai Proyek Besar (High Ticket)',
    modeDescription: 'Memprioritaskan proyek bernilai kontrak tinggi (klinik kecantikan, wedding organizer, korporasi) meskipun siklus dealing lebih panjang.',
    businessActivity: {
      maxPoints: 25,
      ratingThresholds: [
        { min: 4.6, points: 12 },
        { min: 4.2, points: 9 },
        { min: 3.8, points: 6 },
        { min: 0.1, points: 3 },
        { min: 0.0, points: 1 },
      ],
      reviewsThresholds: [
        { min: 100, points: 8 },
        { min: 30, points: 6 },
        { min: 10, points: 4 },
        { min: 1, points: 2 },
        { min: 0, points: 1 },
      ],
      provenReviewBonus: 5,
    },
    contactAvailability: {
      maxPoints: 20,
      whatsapp: 20,
      instagram: 16,
      landline: 12,
      onsiteOnly: 6,
      none: 0,
    },
    categoryFit: {
      maxPoints: 30, // Bobot besar untuk kategori tiket bernilai tinggi
    },
    websiteStatus: {
      maxPoints: 20,
      noWebsite: 20,
      socialOnly: 18,
      poorWebsite: 15,
      uncertain: 5,
    },
    locationProximity: {
      maxPoints: 5,
      originLat: -8.1724,
      originLng: 113.7007,
      originCity: 'Jember',
      distanceBandsKm: [
        { maxKm: 3.0, points: 5 },
        { maxKm: 7.0, points: 4 },
        { maxKm: 15.0, points: 3 },
        { maxKm: 50.0, points: 1 },
      ],
      fallbackPointsInCity: 3,
      fallbackPointsUnknown: 1,
    },
  },
};

// Default scoring mode: cashflow_cepat
export const DEFAULT_SCORING_MODE: ScoringMode = 'cashflow_cepat';
export const SCORING_CONFIG: ScoringWeights = SCORING_MODES[DEFAULT_SCORING_MODE];
