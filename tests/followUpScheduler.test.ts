import assert from 'assert';
import {
  calculateNextFollowUpDate,
  isFollowUpDue,
  getNextFollowUpSchedule,
} from '../src/services/followUpScheduler';

export function runFollowUpSchedulerTests() {
  console.log('🧪 Testing: Follow-up Scheduler Logic...');

  // 1. Tanggal 3 hari ke depan
  const baseDate = new Date('2026-10-01T10:00:00Z');
  const d1 = calculateNextFollowUpDate(baseDate, 3);
  assert.strictEqual(d1, '2026-10-04');

  // 2. Transisi status 'terkirim' -> 'follow_up_1' pada H+3
  const s1 = getNextFollowUpSchedule('terkirim', baseDate);
  assert.strictEqual(s1.nextStatus, 'follow_up_1');
  assert.strictEqual(s1.nextFollowUpAt, '2026-10-04');

  // 3. Transisi status 'follow_up_1' -> 'follow_up_2' pada H+4 (total H+7)
  const s2 = getNextFollowUpSchedule('follow_up_1', new Date('2026-10-04T10:00:00Z'));
  assert.strictEqual(s2.nextStatus, 'follow_up_2');
  assert.strictEqual(s2.nextFollowUpAt, '2026-10-08');

  // 4. Reset follow-up untuk status terminal / aktif
  const s3 = getNextFollowUpSchedule('deal');
  assert.strictEqual(s3.nextStatus, undefined);
  assert.strictEqual(s3.nextFollowUpAt, undefined);

  const s4 = getNextFollowUpSchedule('jangan_hubungi');
  assert.strictEqual(s4.nextStatus, undefined);
  assert.strictEqual(s4.nextFollowUpAt, undefined);

  // 5. Pemeriksaan jatuh tempo
  assert.strictEqual(isFollowUpDue('2026-10-04', new Date('2026-10-04T12:00:00Z')), true); // Hari H
  assert.strictEqual(isFollowUpDue('2026-10-03', new Date('2026-10-04T12:00:00Z')), true); // Kemarin (terlambat)
  assert.strictEqual(isFollowUpDue('2026-10-05', new Date('2026-10-04T12:00:00Z')), false); // Besok (belum jatuh tempo)

  console.log('   ✅ Semua 8 pengujian Follow-up Scheduler Lulus!');
}

