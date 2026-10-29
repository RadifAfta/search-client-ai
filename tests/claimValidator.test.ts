import assert from 'assert';
import { validateMessageClaims } from '../src/validators/claimValidator';

export function runClaimValidatorTests() {
  console.log('🧪 Testing: Ethical Claim Validator (Tahap 3 Data-Backed & Anti-Praise)...');

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
  const msgAddress = "Halo Kak, saya melihat profil usaha Anda di Jl. Trunojoyo No.42, RT 01/RW 02, Kaliwates, Kabupaten Jember. Boleh saya kirimkan contoh tampilan website?";
  const resAddress = validateMessageClaims(msgAddress);
  assert.strictEqual(resAddress.isValid, false);
  assert.ok(resAddress.flaggedClaims.some((c) => c.includes('alamat lengkap Google')));

  // 4. Dilarang: Menyebutkan harga pada pesan 1
  const msgPrice = "Halo Kak, saya Radif dari Jember. Kami menyediakan jasa website dengan harga Rp 500.000 saja. Apakah berminat?";
  const resPrice = validateMessageClaims(msgPrice, { isStep1: true });
  assert.strictEqual(resPrice.isValid, false);
  assert.ok(resPrice.flaggedClaims.some((c) => c.includes('harga')));

  // 5. Dilarang: Pujian generik "rating bagus"
  const msgGenericRating = "Halo Kak, saya melihat profil usaha Anda dengan rating bagus 4.7 bintang di Google Maps. Boleh saya kirimkan contoh tampilan?";
  const resGenericRating = validateMessageClaims(msgGenericRating, { rating: 4.7 });
  assert.strictEqual(resGenericRating.isValid, false);
  assert.ok(resGenericRating.flaggedClaims.some((c) => c.includes('Pujian generik rating')));

  // 6. Dilarang: Lebih dari 1 pertanyaan pada pesan 1
  const msgMultiQuestions = "Halo Kak, saya Radif. Boleh saya kirimkan contoh tampilan website? Apakah Kakak punya waktu luang hari ini?";
  const resMultiQuestions = validateMessageClaims(msgMultiQuestions);
  assert.strictEqual(resMultiQuestions.isValid, false);
  assert.ok(resMultiQuestions.flaggedClaims.some((c) => c.includes('Lebih dari satu pertanyaan')));

  // 7. Dilarang: Mengutip keluhan ulasan tanpa bukti riil
  const msgFakeQuote = "Halo Kak, saya melihat ulasan pelanggan sempat menyebut antrean kasir lama di jam makan siang. Boleh saya kirimkan contoh solusinya?";
  const resFakeQuote = validateMessageClaims(msgFakeQuote, { hasProvenEvidence: false });
  assert.strictEqual(resFakeQuote.isValid, false);
  assert.ok(resFakeQuote.flaggedClaims.some((c) => c.includes('tanpa bukti riil')));

  // 8. Diizinkan: Pesan 1 ringkas (maks 4 kalimat, 1 pertanyaan), perkenalan nama & profesi, penawaran konkret, tanpa pujian generik
  const msgValid = "Halo Kak, saya Radif, freelance web developer di Jember yang sempat melihat profil De Terrace Cafe di daerah Kaliwates di Google Maps. Kebetulan saya ada membuat contoh tampilan website dengan fitur menu digital yang bisa dibuka lewat QR di meja agar calon pelanggan bisa lebih mudah bertransaksi. Apakah boleh saya kirimkan tautan contohnya untuk dilihat santai? Kalau saat ini sedang belum membutuhkan, santai saja dan abaikan pesan ini ya Kak.";
  const resValid = validateMessageClaims(msgValid, { area: 'Kaliwates' });
  assert.strictEqual(resValid.isValid, true);
  assert.strictEqual(resValid.flaggedClaims.length, 0);

  console.log('   ✅ Semua 8 pengujian ketat Claim Validator Lulus!');
}
