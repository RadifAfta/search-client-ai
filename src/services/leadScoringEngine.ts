import {
  SCORING_CONFIG,
  SCORING_MODES,
  ScoringMode,
  ScoringWeights,
} from '../config/scoring.config';
import { CategoryConfig } from '../config/categories.config';
import { WebsiteVerificationStatus } from '../auditors/webAuditor';
import { OutreachChannel } from './contactDetector';

export interface ScoreBreakdown {
  businessActivity: number;
  contactAvailability: number;
  categoryFit: number;
  websiteStatus: number;
  locationProximity: number;
}

export interface LeadScoreResult {
  totalScore: number; // 0 - 100
  breakdown: ScoreBreakdown;
  reasons: string[];
  distanceKm?: number;
  mode: ScoringMode;
  modeName: string;
}

/**
 * Menghitung jarak lingkaran besar (Great-circle distance) dengan rumus Haversine dalam kilometer
 */
export function calculateHaversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Radius bumi dalam km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return parseFloat((R * c).toFixed(2));
}

/**
 * Menghitung Lead Score secara transparan berdasarkan konfigurasi mode bobot (Tahap 4)
 * Mendukung mode 'cashflow_cepat' (default) dan 'nilai_besar'
 */
export function calculateLeadScore(
  input: {
    rating?: number;
    reviewCount?: number;
    primaryChannel: OutreachChannel;
    categoryConfig: CategoryConfig;
    websiteVerificationStatus: WebsiteVerificationStatus;
    isProvenReviewPainPoint?: boolean;
    lat?: number;
    lng?: number;
    address?: string;
  },
  customConfig?: ScoringWeights,
  scoringMode: ScoringMode = 'cashflow_cepat'
): LeadScoreResult {
  const config = customConfig || SCORING_MODES[scoringMode] || SCORING_CONFIG;
  const reasons: string[] = [];

  // 1. Aktivitas & Reputasi Bisnis + Bukti Pain Point Riil
  let ratingPoints = 1;
  const rating = input.rating || 0;
  for (const t of config.businessActivity.ratingThresholds) {
    if (rating >= t.min) {
      ratingPoints = t.points;
      break;
    }
  }

  let reviewsPoints = 1;
  const reviewCount = input.reviewCount || 0;
  for (const t of config.businessActivity.reviewsThresholds) {
    if (reviewCount >= t.min) {
      reviewsPoints = t.points;
      break;
    }
  }

  let provenBonus = 0;
  if (input.isProvenReviewPainPoint) {
    provenBonus = config.businessActivity.provenReviewBonus;
    reasons.push(`Bukti Pain Point Riil (+${provenBonus}): Kendala operasional terbukti di ulasan riil SerpAPI`);
  }

  const businessActivity = Math.min(
    config.businessActivity.maxPoints,
    ratingPoints + reviewsPoints + provenBonus
  );
  reasons.push(
    `Aktivitas Bisnis (+${ratingPoints + reviewsPoints}): Rating ${rating || 'N/A'} (${ratingPoints} pts) & ${reviewCount} ulasan (${reviewsPoints} pts)`
  );

  // 2. Ketersediaan Kontak (Maks 25 di cashflow_cepat, maks 20 di nilai_besar)
  let contactAvailability = 0;
  switch (input.primaryChannel) {
    case 'WhatsApp':
      contactAvailability = config.contactAvailability.whatsapp;
      reasons.push(`Ketersediaan Kontak (+${contactAvailability}): Nomor seluler WhatsApp terverifikasi`);
      break;
    case 'Instagram':
      contactAvailability = config.contactAvailability.instagram;
      reasons.push(`Ketersediaan Kontak (+${contactAvailability}): Profil media sosial Instagram aktif`);
      break;
    case 'Telepon':
      contactAvailability = config.contactAvailability.landline;
      reasons.push(`Ketersediaan Kontak (+${contactAvailability}): Telepon kantor/rumah (PSTN)`);
      break;
    case 'Kunjungan Langsung':
      contactAvailability = config.contactAvailability.onsiteOnly;
      reasons.push(`Ketersediaan Kontak (+${contactAvailability}): Alamat fisik ada untuk kunjungan langsung`);
      break;
    default:
      contactAvailability = config.contactAvailability.none;
      reasons.push(`Ketersediaan Kontak (+0): Tanpa kontak terverifikasi (perlu riset)`);
      break;
  }

  // 3. Kecocokan Kategori (Maks 25 di cashflow_cepat, maks 30 di nilai_besar)
  let categoryFit = 0;
  if (config.mode === 'cashflow_cepat') {
    if (input.categoryConfig.decisionSpeed === 'fast') {
      categoryFit = 25;
      reasons.push(
        `Kecocokan Kategori (+${categoryFit}): ${input.categoryConfig.name} (Keputusan Cepat: Resto/Cafe/Percetakan/Konveksi/Bengkel)`
      );
    } else if (input.categoryConfig.decisionSpeed === 'medium') {
      categoryFit = 18;
      reasons.push(
        `Kecocokan Kategori (+${categoryFit}): ${input.categoryConfig.name} (Keputusan Sedang)`
      );
    } else {
      categoryFit = 12;
      reasons.push(
        `Kecocokan Kategori (+${categoryFit}): ${input.categoryConfig.name} (Keputusan Lambat: Klinik/WO)`
      );
    }
  } else {
    // Mode nilai_besar: memprioritaskan high ticket (Wedding Organizer, Klinik Kecantikan)
    if (input.categoryConfig.ticketSize === 'high') {
      categoryFit = 30;
      reasons.push(
        `Kecocokan Kategori (+${categoryFit}): ${input.categoryConfig.name} (Nilai Kontrak Tinggi / High Ticket)`
      );
    } else if (input.categoryConfig.ticketSize === 'medium') {
      categoryFit = 20;
      reasons.push(
        `Kecocokan Kategori (+${categoryFit}): ${input.categoryConfig.name} (Nilai Kontrak Sedang)`
      );
    } else {
      categoryFit = 10;
      reasons.push(
        `Kecocokan Kategori (+${categoryFit}): ${input.categoryConfig.name} (Nilai Kontrak Rendah)`
      );
    }
  }

  // 4. Status Kepastian Belum Punya Website (Maks 20)
  let websiteStatus = 0;
  switch (input.websiteVerificationStatus) {
    case 'tidak punya website':
      websiteStatus = config.websiteStatus.noWebsite;
      reasons.push(`Status Website (+${websiteStatus}): Terbukti tidak memiliki website independen`);
      break;
    case 'hanya media sosial':
      websiteStatus = config.websiteStatus.socialOnly;
      reasons.push(`Status Website (+${websiteStatus}): Menggunakan media sosial / link-in-bio`);
      break;
    case 'punya website tapi buruk':
    case 'punya website tapi buruk/tidak mobile-friendly':
      websiteStatus = config.websiteStatus.poorWebsite;
      reasons.push(`Status Website (+${websiteStatus}): Punya website tapi bermasalah / tidak mobile-friendly`);
      break;
    case 'tidak pasti':
      websiteStatus = config.websiteStatus.uncertain;
      reasons.push(`Status Website (+${websiteStatus}): Status meragukan, perlu verifikasi manual`);
      break;
    default:
      websiteStatus = 0;
      reasons.push(`Status Website (+0): Bisnis sudah memiliki website mandiri aktif`);
      break;
  }

  // 5. Kedekatan Lokasi (Maks 5)
  let locationProximity = config.locationProximity.fallbackPointsUnknown;
  let distanceKm: number | undefined = undefined;

  if (typeof input.lat === 'number' && typeof input.lng === 'number') {
    distanceKm = calculateHaversineDistanceKm(
      config.locationProximity.originLat,
      config.locationProximity.originLng,
      input.lat,
      input.lng
    );

    let assigned = false;
    for (const band of config.locationProximity.distanceBandsKm) {
      if (distanceKm <= band.maxKm) {
        locationProximity = band.points;
        assigned = true;
        reasons.push(`Kedekatan Lokasi (+${locationProximity}): Jarak ${distanceKm} km dari pusat ${config.locationProximity.originCity}`);
        break;
      }
    }
    if (!assigned) {
      locationProximity = 1;
      reasons.push(`Kedekatan Lokasi (+1): Jarak ${distanceKm} km dari pusat kota`);
    }
  } else if (input.address && input.address.toLowerCase().includes(config.locationProximity.originCity.toLowerCase())) {
    locationProximity = config.locationProximity.fallbackPointsInCity;
    reasons.push(`Kedekatan Lokasi (+${locationProximity}): Alamat berada di area ${config.locationProximity.originCity} (tanpa koordinat GPS)`);
  } else {
    locationProximity = config.locationProximity.fallbackPointsUnknown;
    reasons.push(`Kedekatan Lokasi (+${locationProximity}): Lokasi di luar radius atau tidak diketahui`);
  }

  const totalScore = Math.min(
    100,
    Math.max(0, businessActivity + contactAvailability + categoryFit + websiteStatus + locationProximity)
  );

  return {
    totalScore,
    breakdown: {
      businessActivity,
      contactAvailability,
      categoryFit,
      websiteStatus,
      locationProximity,
    },
    reasons,
    distanceKm,
    mode: config.mode,
    modeName: config.modeName,
  };
}
