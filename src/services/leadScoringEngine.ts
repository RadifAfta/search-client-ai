import { SCORING_CONFIG, ScoringWeights } from '../config/scoring.config';
import { CategoryConfig } from '../config/categories.config';
import { WebsiteVerificationStatus } from '../auditors/webAuditor';
import { OutreachChannel } from './contactDetector';

export interface ScoreBreakdown {
  businessActivity: number; // max 25
  contactAvailability: number; // max 25
  categoryFit: number; // max 20
  websiteStatus: number; // max 20
  locationProximity: number; // max 10
}

export interface LeadScoreResult {
  totalScore: number; // 0 - 100
  breakdown: ScoreBreakdown;
  reasons: string[];
  distanceKm?: number;
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
 * Menghitung Lead Score secara transparan berdasarkan konfigurasi bobot
 */
export function calculateLeadScore(
  input: {
    rating?: number;
    reviewCount?: number;
    primaryChannel: OutreachChannel;
    categoryConfig: CategoryConfig;
    websiteVerificationStatus: WebsiteVerificationStatus;
    lat?: number;
    lng?: number;
    address?: string;
  },
  config: ScoringWeights = SCORING_CONFIG
): LeadScoreResult {
  const reasons: string[] = [];

  // 1. Aktivitas & Reputasi Bisnis (Maks 25)
  let ratingPoints = 2;
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

  const businessActivity = ratingPoints + reviewsPoints;
  reasons.push(
    `Aktivitas Bisnis (+${businessActivity}): Rating ${rating || 'N/A'} (${ratingPoints} pts) & ${reviewCount} ulasan (${reviewsPoints} pts)`
  );

  // 2. Ketersediaan Kontak (Maks 25)
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

  // 3. Kecocokan Kategori (Maks 20)
  const categoryFit = Math.min(input.categoryConfig.categoryFitScore, config.categoryFit.maxPoints);
  reasons.push(
    `Kecocokan Kategori (+${categoryFit}): ${input.categoryConfig.name} (Ticket: ${input.categoryConfig.ticketSize}, Keputusan: ${input.categoryConfig.decisionSpeed})`
  );

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

  // 5. Kedekatan Lokasi (Maks 10)
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
      locationProximity = 2;
      reasons.push(`Kedekatan Lokasi (+2): Jarak ${distanceKm} km dari pusat kota`);
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
  };
}

