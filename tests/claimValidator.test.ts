import assert from 'assert';
import { validateMessageClaims } from '../src/validators/claimValidator';

export function runClaimValidatorTests() {
  console.log('🧪 Testing: Ethical Claim Validator...');

  // 1. Dilarang: Klaim pasar fiktif tanpa data ("banyak instansi mencari...")
  const msg1 = "Halo Tim Katering, banyak instansi mencari katering via online saat ini. Kami buatkan web untuk Anda.";
  const res1 = validateMessageClaims(msg1);
  assert.strictEqual(res1.isValid, false);
  assert.ok(res1.flaggedClaims.some((c) => c.includes('Klaim permintaan pasar')));

  // 2. Dilarang: Klaim palsu kustomisasi demo ("kami telah merancang website khusus untuk Anda")
  const msg2 = "Halo Kak, kami telah merancang website khusus untuk Anda. Silakan bayar jika suka.";
  const res2 = validateMessageClaims(msg2, { isPersonalizedDemo: false });
  assert.strictEqual(res2.isValid, false);
  assert.ok(res2.flaggedClaims.some((c) => c.includes('Klaim palsu kustomisasi demo')));

  // 3. Dilarang: Klaim keramaian tanpa data pendukung (rating 3.0, ulasan 5)
  const msg3 = "Halo Kak, kami perhatikan tempat Anda sangat ramai dan tempat favorit di Jember.";
  const res3 = validateMessageClaims(msg3, { rating: 3.8, reviewCount: 5, hasProvenEvidence: false });
  assert.strictEqual(res3.isValid, false);
  assert.ok(res3.flaggedClaims.some((c) => c.includes('popularitas')));

  // 4. Diizinkan: Klaim keramaian JIKA rating >= 4.5 dan ulasan >= 50
  const res4 = validateMessageClaims(msg3, { rating: 4.8, reviewCount: 300 });
  assert.strictEqual(res4.isValid, true);

  // 5. Diizinkan: Deskripsi demo yang jujur dan santun
  const msg5 = "Halo Kak, salam kenal. Saya melihat profil De Terrace Cafe di Kaliwates dengan rating 4.6 (385 ulasan). Kebetulan saya membuat contoh konsep website yang bisa disesuaikan dengan logo dan produk Kakak, boleh saya kirimkan tautan contohnya untuk dilihat santai? Bila tidak membutuhkan, abaikan saja ya Kak.";
  const res5 = validateMessageClaims(msg5, { rating: 4.6, reviewCount: 385 });
  assert.strictEqual(res5.isValid, true);
  assert.strictEqual(res5.flaggedClaims.length, 0);

  console.log('   ✅ Semua 5 pengujian Claim Validator Lulus!');
}

