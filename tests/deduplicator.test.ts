import assert from 'assert';
import { areLeadsDuplicate, deduplicateLeads } from '../src/services/deduplicator';

export function runDeduplicatorTests() {
  console.log('🧪 Testing: Lead Deduplicator...');

  // 1. Same Place ID
  const d1 = areLeadsDuplicate(
    { placeId: 'ChIJVwGWZiSU1i0RAT9auz9qXHM', name: 'Pusat Oleh2' },
    { placeId: 'ChIJVwGWZiSU1i0RAT9auz9qXHM', name: 'Toko Oleh-Oleh Lain' }
  );
  assert.strictEqual(d1.isDuplicate, true);

  // 2. Same Phone Number
  const d2 = areLeadsDuplicate(
    { name: 'Konveksi Jember A', phone: '087856956128' },
    { name: 'Konveksi Jember Ja-Hitz', phone: '6287856956128' }
  );
  assert.strictEqual(d2.isDuplicate, true);

  // 3. Similar Names
  const d3 = areLeadsDuplicate(
    { name: 'CV Konveksi Jember Ja-Hitz' },
    { name: 'Konveksi Jember Ja-Hitz' }
  );
  assert.strictEqual(d3.isDuplicate, true);

  // 4. Distinct Businesses (Not Duplicate)
  const d4 = areLeadsDuplicate(
    { name: 'Araya Printing', phone: '0331422283' },
    { name: 'Redjo Joyo Percetakan', phone: '082338915949' }
  );
  assert.strictEqual(d4.isDuplicate, false);

  // 5. Bulk Deduplication
  const pool = [
    { placeId: 'P1', name: 'Cafe A', phone: '08123456789' },
    { placeId: 'P1', name: 'Cafe A Cabang', phone: '08123456789' },
    { placeId: 'P2', name: 'Cafe B', phone: '08987654321' },
    { placeId: 'P3', name: 'Cafe C' },
  ];
  const res = deduplicateLeads(pool);
  assert.strictEqual(res.uniqueLeads.length, 3);
  assert.strictEqual(res.duplicatesRemovedCount, 1);

  console.log('   ✅ Semua 5 pengujian Deduplicator Lulus!');
}

