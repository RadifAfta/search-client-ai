export interface ValidationContext {
  rating?: number;
  reviewCount?: number;
  area?: string;
  address?: string;
  hasProvenEvidence?: boolean;
  provenQuote?: string;
  isPersonalizedDemo?: boolean;
  isStep1?: boolean;
}

export interface ClaimValidationResult {
  isValid: boolean;
  flaggedClaims: string[];
  reasons: string[];
}

// Pola klaim yang dilarang keras tanpa pembuktian data nyata
const DISALLOWED_CLAIM_PATTERNS: { regex: RegExp; claim: string; explanation: string }[] = [
  {
    regex: /\b(banyak instansi mencari|banyak keluarga mencari|banyak orang cari|semua orang cari)\b/i,
    claim: 'Klaim permintaan pasar tanpa verifikasi',
    explanation: 'Dilarang mengklaim permintaan instansi/pasar tanpa didukung data riset aktual.',
  },
  {
    regex: /\b(kami telah merancang website khusus untuk anda|website anda sudah jadi|kami sudah buatkan website untuk anda|sudah saya buatkan khusus)\b/i,
    claim: 'Klaim palsu kustomisasi demo',
    explanation: 'Demo harus dideskripsikan jujur sebagai "contoh tampilan untuk bisnis sejenis yang bisa disesuaikan", bukan mengaku sudah dibuat khusus.',
  },
  {
    regex: /\b(pasti naik|omzet pasti melonjak|dijamin laris|garansi closing)\b/i,
    claim: 'Janji hasil finansial pasti',
    explanation: 'Dilarang memberikan jaminan peningkatan omzet secara mutlak tanpa dasar data teruji.',
  },
];

// Pola klaim popularitas yang membutuhkan syarat data rating & ulasan tinggi
const POPULARITY_CLAIM_PATTERNS: { regex: RegExp; claim: string }[] = [
  { regex: /\b(sangat ramai|tempat favorit|paling laris|paling populer|terbaik di jember)\b/i, claim: 'Klaim popularitas/keramaian' },
];

/**
 * Memvalidasi apakah pesan outreach mematuhi etika kejujuran dan didukung data faktual (Tahap 3)
 */
export function validateMessageClaims(
  messageText: string,
  context: ValidationContext = {}
): ClaimValidationResult {
  const flaggedClaims: string[] = [];
  const reasons: string[] = [];

  if (!messageText || typeof messageText !== 'string' || messageText.trim() === '') {
    return { isValid: false, flaggedClaims: ['Pesan kosong'], reasons: ['Teks pesan tidak boleh kosong'] };
  }

  const isStep1 = context.isStep1 !== false;

  // 1. Cek larangan menyertakan alamat lengkap Google (Jl., No., RT/RW, dsb.)
  if (/\b(jl\.|jalan\s|no\.\s*\d+|rt\s*\d+|rw\s*\d+|kel\.|kabupaten\s+jember|jawa\s+timur\s+\d{5})\b/i.test(messageText)) {
    flaggedClaims.push('Menyertakan alamat lengkap Google');
    reasons.push('Pesan 1 dilarang menyertakan alamat jalan lengkap Google. Gunakan area kecamatan/kelurahan saja atau hilangkan lokasi.');
  }

  // 2. Cek larangan harga atau pitch jualan panjang pada pesan 1
  if (isStep1) {
    if (/\b(rp\.?\s*[\d\.,]+|harga|tarif|biaya\s+hanya|diskon|paket\s+promo)\b/i.test(messageText)) {
      flaggedClaims.push('Menyebutkan harga pada Pesan 1');
      reasons.push('Pesan 1 dilarang memuat harga, tarif, atau penawaran komersial langsung.');
    }

    // Panjang kalimat pada pesan 1 (harus 2-3 kalimat alami)
    const sentences = messageText
      .split(/[.?!](\s+|$)/)
      .map((s) => s.trim())
      .filter((s) => s.length > 5);

    if (sentences.length > 4) {
      flaggedClaims.push('Pesan terlalu panjang (melebihi 3-4 kalimat)');
      reasons.push(`Pesan 1 harus ringkas dan alami untuk chat (2-3 kalimat). Terdeteksi ${sentences.length} kalimat.`);
    }
  }

  // 3. Cek klaim yang dilarang mutlak
  for (const item of DISALLOWED_CLAIM_PATTERNS) {
    if (item.regex.test(messageText)) {
      flaggedClaims.push(item.claim);
      reasons.push(item.explanation);
    }
  }

  // 4. Cek klaim popularitas
  for (const item of POPULARITY_CLAIM_PATTERNS) {
    if (item.regex.test(messageText)) {
      const hasHighRating = (context.rating || 0) >= 4.5 && (context.reviewCount || 0) >= 50;
      if (!hasHighRating && !context.hasProvenEvidence) {
        flaggedClaims.push(item.claim);
        reasons.push(
          `Klaim popularitas tidak didukung data yang memadai (rating: ${context.rating || 0}, ulasan: ${context.reviewCount || 0}).`
        );
      }
    }
  }

  // 5. Cek deskripsi demo (harus jujur bila belum dipersonalisasi)
  if (/demo|konsep website|contoh tampilan/i.test(messageText) && !context.isPersonalizedDemo) {
    const hasHonestDisclaimer = /contoh tampilan|bisa disesuaikan|prototipe|konsep/i.test(messageText);
    if (!hasHonestDisclaimer) {
      flaggedClaims.push('Deskripsi demo tidak transparan');
      reasons.push('Harus mencantumkan secara jujur bahwa demo adalah contoh konsep/tampilan yang dapat disesuaikan.');
    }
  }

  // 6. Penelusuran Angka Rating ke Field Data Lead
  const ratingMatch = messageText.match(/rating\s+([\d\.]+)/i) || messageText.match(/([\d\.]+)\s+bintang/i);
  if (ratingMatch) {
    const claimedRating = parseFloat(ratingMatch[1]);
    if (context.rating === undefined || Math.abs(claimedRating - context.rating) > 0.05) {
      flaggedClaims.push('Klaim rating tidak sesuai data');
      reasons.push(`Angka rating dalam pesan (${claimedRating}) tidak cocok dengan data riil (${context.rating ?? 'tidak ada'}).`);
    }
  }

  // 7. Penelusuran Jumlah Ulasan ke Field Data Lead
  const reviewCountMatch = messageText.match(/(\d+)\s+ulasan/i);
  if (reviewCountMatch) {
    const claimedReviews = parseInt(reviewCountMatch[1], 10);
    if (context.reviewCount === undefined || Math.abs(claimedReviews - context.reviewCount) > 2) {
      flaggedClaims.push('Klaim jumlah ulasan tidak sesuai data');
      reasons.push(`Jumlah ulasan dalam pesan (${claimedReviews}) tidak cocok dengan data riil (${context.reviewCount ?? 'tidak ada'}).`);
    }
  }

  // 8. Penelusuran Area ke Field Data Lead
  const areaMatch = messageText.match(/di daerah\s+([A-Za-z]+)/i);
  if (areaMatch) {
    const claimedArea = areaMatch[1].toLowerCase();
    const validArea = (context.area || '').toLowerCase();
    const validAddress = (context.address || '').toLowerCase();
    if (!validArea.includes(claimedArea) && !validAddress.includes(claimedArea) && claimedArea !== 'jember') {
      flaggedClaims.push('Klaim area lokasi tidak sesuai data');
      reasons.push(`Area lokasi (${areaMatch[1]}) tidak ditemukan pada data lead (area: ${context.area || '-'}, alamat: ${context.address || '-'}).`);
    }
  }

  // 9. Penelusuran Kutipan Ulasan ke Bukti Nyata
  if (/ulasan.*sempat menyebut|kutipan ulasan/i.test(messageText) || messageText.includes('menurut ulasan')) {
    if (!context.hasProvenEvidence) {
      flaggedClaims.push('Mengutip ulasan tanpa bukti riil');
      reasons.push('Dilarang mengutip keluhan/masalah ulasan jika lead belum memiliki bukti ulasan riil dari SerpAPI.');
    }
  }

  const isValid = flaggedClaims.length === 0;
  return { isValid, flaggedClaims, reasons };
}
