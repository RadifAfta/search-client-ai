/**
 * Menghitung tanggal follow-up berikutnya (YYYY-MM-DD)
 */
export function calculateNextFollowUpDate(fromDate: Date = new Date(), daysLater: number = 3): string {
  const target = new Date(fromDate.getTime());
  target.setDate(target.getDate() + daysLater);
  return target.toISOString().split('T')[0];
}

/**
 * Memeriksa apakah suatu tanggal follow-up sudah jatuh tempo hari ini atau sebelumnya
 */
export function isFollowUpDue(nextFollowUpDateStr?: string, referenceDate: Date = new Date()): boolean {
  if (!nextFollowUpDateStr) return false;
  const todayStr = referenceDate.toISOString().split('T')[0];
  return nextFollowUpDateStr <= todayStr;
}

/**
 * Mengembalikan jadwal follow-up berikutnya berdasarkan transisi status
 */
export function getNextFollowUpSchedule(
  currentStatus: string,
  contactDate: Date = new Date()
): { nextStatus?: string; nextFollowUpAt?: string } {
  if (currentStatus === 'terkirim') {
    // Follow-up 1 dijadwalkan pada hari ke-3 (H+3)
    return {
      nextStatus: 'follow_up_1',
      nextFollowUpAt: calculateNextFollowUpDate(contactDate, 3),
    };
  }

  if (currentStatus === 'follow_up_1') {
    // Follow-up 2 dijadwalkan pada hari ke-7 (H+4 dari follow up 1)
    return {
      nextStatus: 'follow_up_2',
      nextFollowUpAt: calculateNextFollowUpDate(contactDate, 4),
    };
  }

  // Untuk status 'balas', 'demo', 'negosiasi', 'deal', 'tidak_tertarik', 'jangan_hubungi'
  return {
    nextStatus: undefined,
    nextFollowUpAt: undefined,
  };
}
