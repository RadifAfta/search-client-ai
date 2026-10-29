import assert from 'assert';
import { validateMessageClaims } from '../src/validators/claimValidator';

export function runClaimValidatorTests() {
  console.log('🧪 Testing: Ethical Claim Validator (Tahap 3 Data-Backed)...');

  // 1. Dilarang: Klaim pasar fiktif tanpa data ("banyak instansi mencari...")
  const msg1 = "Halo Tim Katering, banyak instansi mencari katering via online saat ini. Kami buatkan web untuk Anda.";
  const res1 = validateMessageClaims(msg1);
  assert.strictEqual(res1.isValid, false);
  assert.ok(res1.flaggedClaims.some((c) => c.includes('Klaim permintaan pasar')));

  // 2. Dilarang: Klaim palsu kustomisasi demo ("kami telah merancang website khusus untuk Anda")
  const msg2 = "Halo Kak, kami telah merancang website khusus untuk Anda. Boleh saya kirimkan contohnya?";
  const res2 = validateMessageClaims(msg2, { isPersonalizedDemo: false });
  assert.strictEqual(res2.isValid, false);
  assert.ok(res2.flaggedClaims.some((c) => c.includes('Klaim palsu kustomisasi demo')));

  // 3. Dilarang: Menyertakan alamat jalan lengkap Google Maps di pesan
  const msgAddress = "Halo Kak, saya melihat profil usaha Anda di Jl. Trunojoyo No.42, RT 01/RW 02, Kaliwates, Kabupaten Jember dengan rating bagus. Boleh saya kirimkan contoh tampilan website?";
  const resAddress = validateMessageClaims(msgAddress, { rating: 4.6 });
  assert.strictEqual(resAddress.isValid, false);
  assert.ok(resAddress.flaggedClaims.some((c) => c.includes('alamat lengkap Google')));

  // 4. Dilarang: Menyebutkan harga pada pesan 1
  const msgPrice = "Halo Kak, salam kenal. Saya perhatikan bisnis Anda bagus. Kami menyediakan jasa website dengan harga Rp 500.000 saja. Apakah berminat?";
  const resPrice = validateMessageClaims(msgPrice, { isStep1: true });
  assert.strictEqual(resPrice.isValid, false);
  assert.ok(resPrice.flaggedClaims.some((c) => c.includes('harga')));

  // 5. Dilarang: Angka rating tidak cocok dengan data riil (mengarang angka)
  const msgFakeRating = "Halo Kak, saya perhatikan profil Anda memiliki rating 4.9 bintang di Google Maps. Boleh saya kirimkan contoh tampilan website untuk bisnis sejenis?";
  const resFakeRating = validateMessageClaims(msgFakeRating, { rating: 4.2 });
  assert.strictEqual(resFakeRating.isValid, false);
  assert.ok(resFakeRating.flaggedClaims.some((c) => c.includes('rating tidak sesuai')));

  // 6. Dilarang: Mengutip keluhan ulasan tanpa bukti riil
  const msgFakeQuote = "Halo Kak, saya melihat ulasan pelanggan sempat menyebut antrean kasir lama di jam makan siang. Boleh saya kirimkan contoh solusinya?";
  const resFakeQuote = validateMessageClaims(msgFakeQuote, { hasProvenEvidence: false });
  assert.strictEqual(resFakeQuote.isValid, false);
  assert.ok(resFakeQuote.flaggedClaims.some((c) => c.includes('tanpa bukti riil')));

  // 7. Diizinkan: Pesan 1 singkat (3 kalimat alami), area kecamatan saja, rating faktual, jujur soal demo
  const msgValid = "Halo Kak, salam kenal dari saya di Jember. Saya melihat profil De Terrace Cafe di daerah Kaliwates dengan rating bagus 4.6 bintang di Google Maps. Kebetulan saya ada contoh tampilan website untuk bisnis sejenis yang bisa disesuaikan, bolehkah saya kirimkan tautannya untuk dilihat santai? Kalau sedang belum membutuhkan, santai saja dan boleh abaikan pesan ini ya Kak.";
  const resValid = validateMessageClaims(msgValid, { rating: 4.6, area: 'Kaliwates' });
  assert.strictEqual(resValid.isValid, true);
  assert.strictEqual(resValid.flaggedClaims.length, 0);

  console.log('   ✅ Semua 7 pengujian ketat Claim Validator Lulus!');
}
