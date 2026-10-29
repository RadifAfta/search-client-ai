export interface DeduplicableLead {
  placeId?: string;
  name: string;
  phone?: string;
  address?: string;
  referenceUrl?: string;
}

/**
 * Membersihkan nama bisnis dari noise (badan usaha, tanda baca, kata lokasi umum)
 */
export function normalizeBusinessName(name: string): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/\b(cv|pt|ud|tb|toko|warung|kedai|outlet|pusat)\b/gi, '')
    .replace(/\bjember\b/gi, '')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Menghitung koefisien kesamaan dua string (Sørensen–Dice coefficient pada bigram)
 * Menghasilkan nilai antara 0.0 (berbeda total) hingga 1.0 (identik)
 */
export function calculateStringSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();

  if (s1 === s2) return 1.0;
  if (s1.length < 2 || s2.length < 2) return 0.0;

  const getBigrams = (str: string): Map<string, number> => {
    const bigrams = new Map<string, number>();
    for (let i = 0; i < str.length - 1; i++) {
      const bigram = str.substring(i, i + 2);
      bigrams.set(bigram, (bigrams.get(bigram) || 0) + 1);
    }
    return bigrams;
  };

  const bigrams1 = getBigrams(s1);
  const bigrams2 = getBigrams(s2);

  let intersectionSize = 0;
  for (const [bigram, count1] of bigrams1.entries()) {
    if (bigrams2.has(bigram)) {
      intersectionSize += Math.min(count1, bigrams2.get(bigram)!);
    }
  }

  const totalBigrams = (s1.length - 1) + (s2.length - 1);
  return (2.0 * intersectionSize) / totalBigrams;
}

function normalizePhoneForComparison(phone?: string): string {
  if (!phone) return '';
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('0')) {
    digits = '62' + digits.substring(1);
  }
  return digits;
}

/**
 * Memeriksa apakah dua record lead merupakan bisnis yang sama
 */
export function areLeadsDuplicate(
  leadA: DeduplicableLead,
  leadB: DeduplicableLead
): { isDuplicate: boolean; reason?: string } {
  // 1. Exact Place ID Match
  if (leadA.placeId && leadB.placeId && leadA.placeId === leadB.placeId) {
    return { isDuplicate: true, reason: `Place ID Google identik (${leadA.placeId})` };
  }

  // 2. Exact Phone Number Match (normalisasi 08xxx vs 628xxx)
  const normPhoneA = normalizePhoneForComparison(leadA.phone);
  const normPhoneB = normalizePhoneForComparison(leadB.phone);
  if (normPhoneA.length >= 8 && normPhoneB.length >= 8 && normPhoneA === normPhoneB) {
    return { isDuplicate: true, reason: `Nomor telepon identik (${normPhoneA})` };
  }

  // 3. Nama Bisnis Sangat Mirip
  const normA = normalizeBusinessName(leadA.name);
  const normB = normalizeBusinessName(leadB.name);

  if (normA && normB) {
    const nameSim = calculateStringSimilarity(normA, normB);
    if (nameSim >= 0.82) {
      // Jika salah satu adalah substring dari yang lain atau kemiripan di atas 0.85
      return {
        isDuplicate: true,
        reason: `Nama bisnis hampir identik (${leadA.name} vs ${leadB.name}, kemiripan: ${(nameSim * 100).toFixed(0)}%)`,
      };
    }
  }

  // 4. Exact Reference URL Match (jika ada)
  if (
    leadA.referenceUrl &&
    leadB.referenceUrl &&
    leadA.referenceUrl.toLowerCase() === leadB.referenceUrl.toLowerCase()
  ) {
    return { isDuplicate: true, reason: `URL referensi identik` };
  }

  return { isDuplicate: false };
}

/**
 * Membersihkan array lead dari item-item duplikat
 */
export function deduplicateLeads<T extends DeduplicableLead>(
  leads: T[]
): { uniqueLeads: T[]; duplicatesRemovedCount: number } {
  const uniqueLeads: T[] = [];
  let duplicatesRemovedCount = 0;

  for (const lead of leads) {
    let duplicateFound = false;

    for (const existing of uniqueLeads) {
      const check = areLeadsDuplicate(lead, existing);
      if (check.isDuplicate) {
        duplicateFound = true;
        duplicatesRemovedCount++;
        break;
      }
    }

    if (!duplicateFound) {
      uniqueLeads.push(lead);
    }
  }

  return { uniqueLeads, duplicatesRemovedCount };
}
