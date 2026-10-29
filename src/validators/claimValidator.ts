export interface ValidationContext {
  rating?: number;
  reviewCount?: number;
  hasProvenEvidence?: boolean;
  isPersonalizedDemo?: boolean;
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
    regex: /\b(kami telah merancang website khusus untuk anda|website anda sudah jadi|kami sudah buatkan website untuk anda)\b/i,
    claim: 'Klaim palsu kustomisasi demo',
    explanation: 'Demo generik harus dideskripsikan jujur sebagai "contoh tampilan yang bisa disesuaikan", bukan mengaku sudah dibuat khusus.',
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
 * Memvalidasi apakah pesan outreach mematuhi etika kejujuran dan didukung data faktual
 */
export function validateMessageClaims(
  messageText: string,
  context: ValidationContext = {}
): ClaimValidationResult {
  const flaggedClaims: string[] = [];
  const reasons: string[] = [];

  if (!messageText || typeof messageText !== 'string') {
    return { isValid: false, flaggedClaims: ['Pesan kosong'], reasons: ['Teks pesan tidak boleh kosong'] };
  }

  // 1. Cek klaim yang dilarang mutlak
  for (const item of DISALLOWED_CLAIM_PATTERNS) {
    if (item.regex.test(messageText)) {
      flaggedClaims.push(item.claim);
      reasons.push(item.explanation);
    }
  }

  // 2. Cek klaim popularitas
  for (const item of POPULARITY_CLAIM_PATTERNS) {
    if (item.regex.test(messageText)) {
      const hasHighRating = (context.rating || 0) >= 4.5 && (context.reviewCount || 0) >= 50;
      if (!hasHighRating && !context.hasProvenEvidence) {
        flaggedClaims.push(item.claim);
        reasons.push(
          `Klaim popularitas/keramaian tidak didukung data yang memadai (memerlukan rating >= 4.5 dan ulasan >= 50, atau bukti ulasan riil). Data saat ini: Rating ${context.rating || 0}, Ulasan ${context.reviewCount || 0}.`
        );
      }
    }
  }

  // 3. Cek deskripsi demo: jika menyebut demo/konsep, harus jujur bila belum dipersonalisasi
  if (/demo|konsep website|contoh tampilan/i.test(messageText) && !context.isPersonalizedDemo) {
    const hasHonestDisclaimer = /contoh tampilan|bisa disesuaikan|prototipe|konsep/i.test(messageText);
    if (!hasHonestDisclaimer) {
      flaggedClaims.push('Deskripsi demo tidak transparan');
      reasons.push('Harus mencantumkan secara jujur bahwa demo adalah contoh konsep yang dapat disesuaikan.');
    }
  }

  const isValid = flaggedClaims.length === 0;
  return { isValid, flaggedClaims, reasons };
}

