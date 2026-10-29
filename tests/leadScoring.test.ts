import assert from 'assert';
import { calculateLeadScore, calculateHaversineDistanceKm } from '../src/services/leadScoringEngine';
import { CATEGORIES_CONFIG } from '../src/config/categories.config';
import { SCORING_MODES } from '../src/config/scoring.config';

export function runLeadScoringTests() {
  console.log('🧪 Testing: Lead Scoring Engine (Tahap 4 Mode Cash Flow Cepat & Nilai Besar)...');

  // 1. Haversine distance test: Alun-Alun Jember ke Kaliwates Kidul (~2.5 - 3 km)
  const dist = calculateHaversineDistanceKm(-8.1724, 113.7007, -8.1845, 113.6792);
  assert.ok(dist >= 2.0 && dist <= 3.5, `Jarak terhitung: ${dist} km`);

  // 2. Mode 'cashflow_cepat': Kategori keputusan cepat (Kafe/Resto) HARUS LEBIH TINGGI dari keputusan lambat (Klinik/WO)
  const cafeScore = calculateLeadScore(
    {
      rating: 4.6,
      reviewCount: 150,
      primaryChannel: 'WhatsApp',
      categoryConfig: CATEGORIES_CONFIG.fnb_cafe, // fast decision
      websiteVerificationStatus: 'tidak punya website',
      lat: -8.1751,
      lng: 113.7019,
    },
    SCORING_MODES.cashflow_cepat,
    'cashflow_cepat'
  );

  const klinikScore = calculateLeadScore(
    {
      rating: 4.6,
      reviewCount: 150,
      primaryChannel: 'WhatsApp',
      categoryConfig: CATEGORIES_CONFIG.klinik_kecantikan, // slow decision
      websiteVerificationStatus: 'tidak punya website',
      lat: -8.1751,
      lng: 113.7019,
    },
    SCORING_MODES.cashflow_cepat,
    'cashflow_cepat'
  );

  assert.ok(
    cafeScore.totalScore > klinikScore.totalScore,
    `Pada mode cashflow_cepat, Kafe (${cafeScore.totalScore}) harus lebih tinggi dari Klinik (${klinikScore.totalScore})`
  );
  assert.strictEqual(cafeScore.breakdown.categoryFit, 25);
  assert.strictEqual(klinikScore.breakdown.categoryFit, 12);
  console.log('   ✅ Mode cashflow_cepat: Kategori keputusan cepat (Kafe: 25 pts) mengungguli keputusan lambat (Klinik: 12 pts)');

  // 3. Mode 'nilai_besar': Kategori tiket besar (Wedding Organizer) HARUS LEBIH TINGGI dari Kafe
  const woScoreNilaiBesar = calculateLeadScore(
    {
      rating: 4.6,
      reviewCount: 150,
      primaryChannel: 'WhatsApp',
      categoryConfig: CATEGORIES_CONFIG.wedding_organizer, // high ticket
      websiteVerificationStatus: 'tidak punya website',
      lat: -8.1751,
      lng: 113.7019,
    },
    SCORING_MODES.nilai_besar,
    'nilai_besar'
  );

  const cafeScoreNilaiBesar = calculateLeadScore(
    {
      rating: 4.6,
      reviewCount: 150,
      primaryChannel: 'WhatsApp',
      categoryConfig: CATEGORIES_CONFIG.fnb_cafe, // low ticket
      websiteVerificationStatus: 'tidak punya website',
      lat: -8.1751,
      lng: 113.7019,
    },
    SCORING_MODES.nilai_besar,
    'nilai_besar'
  );

  assert.ok(
    woScoreNilaiBesar.totalScore > cafeScoreNilaiBesar.totalScore,
    `Pada mode nilai_besar, WO (${woScoreNilaiBesar.totalScore}) harus lebih tinggi dari Kafe (${cafeScoreNilaiBesar.totalScore})`
  );
  assert.strictEqual(woScoreNilaiBesar.breakdown.categoryFit, 30);
  assert.strictEqual(cafeScoreNilaiBesar.breakdown.categoryFit, 10);
  console.log('   ✅ Mode nilai_besar: Kategori tiket besar (WO: 30 pts) mengungguli tiket kecil (Kafe: 10 pts)');

  // 4. Bonus Bukti Pain Point Riil SerpAPI (+10 pts)
  const withProvenReview = calculateLeadScore(
    {
      rating: 4.5,
      reviewCount: 20,
      primaryChannel: 'WhatsApp',
      categoryConfig: CATEGORIES_CONFIG.bengkel,
      websiteVerificationStatus: 'tidak punya website',
      isProvenReviewPainPoint: true,
    },
    SCORING_MODES.cashflow_cepat
  );

  const withoutProvenReview = calculateLeadScore(
    {
      rating: 4.5,
      reviewCount: 20,
      primaryChannel: 'WhatsApp',
      categoryConfig: CATEGORIES_CONFIG.bengkel,
      websiteVerificationStatus: 'tidak punya website',
      isProvenReviewPainPoint: false,
    },
    SCORING_MODES.cashflow_cepat
  );

  assert.ok(
    withProvenReview.totalScore > withoutProvenReview.totalScore,
    `Lead dengan bukti ulasan riil (${withProvenReview.totalScore}) harus lebih tinggi dari tanpa bukti (${withoutProvenReview.totalScore})`
  );
  console.log('   ✅ Bukti ulasan riil SerpAPI memberikan diferensiasi poin nyata (+10 pts)');

  // 5. Score range bounds (0 - 100)
  assert.ok(cafeScore.totalScore <= 100 && cafeScore.totalScore >= 0);
  assert.ok(woScoreNilaiBesar.totalScore <= 100 && woScoreNilaiBesar.totalScore >= 0);

  console.log('   ✅ Semua 5 pengujian Lead Scoring Tahap 4 Lulus!');
}
