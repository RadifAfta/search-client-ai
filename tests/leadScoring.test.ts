import assert from 'assert';
import { calculateLeadScore, calculateHaversineDistanceKm } from '../src/services/leadScoringEngine';
import { CATEGORIES_CONFIG } from '../src/config/categories.config';

export function runLeadScoringTests() {
  console.log('🧪 Testing: Lead Scoring Engine (0 - 100)...');

  // 1. Haversine distance test: Alun-Alun Jember ke Kaliwates Kidul (~2.5 - 3 km)
  const dist = calculateHaversineDistanceKm(-8.1724, 113.7007, -8.1845, 113.6792);
  assert.ok(dist >= 2.0 && dist <= 3.5, `Jarak terhitung: ${dist} km`);

  // 2. High Priority Lead (Rating tinggi, review banyak, ada WA, tidak punya web, dekat)
  const topLead = calculateLeadScore({
    rating: 4.8,
    reviewCount: 300,
    primaryChannel: 'WhatsApp',
    categoryConfig: CATEGORIES_CONFIG.fnb_cafe,
    websiteVerificationStatus: 'tidak punya website',
    lat: -8.1751,
    lng: 113.7019,
  });

  // Expected points:
  // Activity: 15 (rating >= 4.6) + 10 (reviews >= 100) = 25
  // Contact: 25 (WhatsApp)
  // Category: 19 (fnb_cafe)
  // Website: 20 (tidak punya website)
  // Location: 10 (jarak ~0.3 km <= 3km)
  // Total = 99
  assert.strictEqual(topLead.totalScore, 99);
  assert.strictEqual(topLead.breakdown.businessActivity, 25);
  assert.strictEqual(topLead.breakdown.contactAvailability, 25);
  assert.strictEqual(topLead.breakdown.websiteStatus, 20);

  // 3. Medium Lead (Landline, website buruk, review sedang)
  const medLead = calculateLeadScore({
    rating: 4.4,
    reviewCount: 50,
    primaryChannel: 'Telepon',
    categoryConfig: CATEGORIES_CONFIG.percetakan,
    websiteVerificationStatus: 'punya website tapi buruk/tidak mobile-friendly',
    lat: -8.1753,
    lng: 113.6984,
  });
  // Activity: 12 + 8 = 20
  // Contact: 12 (landline)
  // Category: 19
  // Website: 15 (buruk)
  // Location: 10
  // Total = 76
  assert.strictEqual(medLead.totalScore, 76);

  // 4. Low Lead (No contact, website aktif)
  const lowLead = calculateLeadScore({
    rating: 3.5,
    reviewCount: 2,
    primaryChannel: 'None',
    categoryConfig: CATEGORIES_CONFIG.general_umkm,
    websiteVerificationStatus: 'punya website aktif',
  });
  // Activity: 4 + 3 = 7
  // Contact: 0
  // Category: 15
  // Website: 0
  // Location: 2
  // Total = 24
  assert.strictEqual(lowLead.totalScore, 24);

  // 5. Bounds test: Ensure score stays within 0 - 100
  assert.ok(topLead.totalScore <= 100);
  assert.ok(lowLead.totalScore >= 0);

  console.log('   ✅ Semua 5 pengujian Lead Scoring Lulus!');
}

