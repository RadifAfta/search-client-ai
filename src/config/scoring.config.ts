export interface ScoringWeights {
  businessActivity: {
    maxPoints: number;
    ratingThresholds: { min: number; points: number }[];
    reviewsThresholds: { min: number; points: number }[];
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
    originLat: number; // Pusat referensi Anda di Jember
    originLng: number;
    originCity: string;
    distanceBandsKm: { maxKm: number; points: number }[];
    fallbackPointsInCity: number;
    fallbackPointsUnknown: number;
  };
}

export const SCORING_CONFIG: ScoringWeights = {
  businessActivity: {
    maxPoints: 25,
    ratingThresholds: [
      { min: 4.6, points: 15 },
      { min: 4.2, points: 12 },
      { min: 3.8, points: 8 },
      { min: 0.1, points: 4 },
      { min: 0.0, points: 2 }, // Rating tidak diketahui / 0
    ],
    reviewsThresholds: [
      { min: 100, points: 10 },
      { min: 30, points: 8 },
      { min: 10, points: 5 },
      { min: 1, points: 3 },
      { min: 0, points: 1 },
    ],
  },
  contactAvailability: {
    maxPoints: 25,
    whatsapp: 25,
    instagram: 18,
    landline: 12,
    onsiteOnly: 8,
    none: 0,
  },
  categoryFit: {
    maxPoints: 20,
  },
  websiteStatus: {
    maxPoints: 20,
    noWebsite: 20,
    socialOnly: 18,
    poorWebsite: 15,
    uncertain: 5,
  },
  locationProximity: {
    maxPoints: 10,
    originLat: -8.1724, // Alun-Alun Jember (titik tengah kota)
    originLng: 113.7007,
    originCity: 'Jember',
    distanceBandsKm: [
      { maxKm: 3.0, points: 10 },  // Sangat dekat untuk kunjungan langsung
      { maxKm: 7.0, points: 7 },   // Dalam kota Jember (Kaliwates, Sumbersari, Patrang)
      { maxKm: 15.0, points: 5 },  // Pinggiran Jember
      { maxKm: 50.0, points: 3 },  // Luar radius kota
    ],
    fallbackPointsInCity: 6,       // Alamat mencantumkan Jember tapi tanpa koordinat
    fallbackPointsUnknown: 2,      // Lokasi tidak diketahui
  },
};
