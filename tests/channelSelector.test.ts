import assert from 'assert';
import { selectOutreachChannel } from '../src/services/contactDetector';

export function runChannelSelectorTests() {
  console.log('🧪 Testing: Channel Selector...');

  // 1. WhatsApp Priority for Mobile Phone
  const chWA = selectOutreachChannel({
    phone: '081237090009',
    instagramUrl: 'https://instagram.com/terracecafe',
    address: 'Jl. Trunojoyo No.42, Jember',
    categoryName: 'Kafe & Resto',
  });
  assert.strictEqual(chWA.primaryChannel, 'WhatsApp');
  assert.strictEqual(chWA.status, 'siap_outreach');

  // 2. Instagram DM Priority when no mobile phone
  const chIG = selectOutreachChannel({
    instagramUrl: 'https://www.instagram.com/soen.cafe',
    address: 'Jl. Jember',
    categoryName: 'Kafe & Resto',
  });
  assert.strictEqual(chIG.primaryChannel, 'Instagram');
  assert.strictEqual(chIG.status, 'siap_outreach');

  // 3. Landline Phone Script when only office PSTN exists
  const chPhone = selectOutreachChannel({
    phone: '0331422283',
    address: 'Jl. Trunojoyo No.93 A, Jember',
    categoryName: 'Percetakan & Digital Printing',
  });
  assert.strictEqual(chPhone.primaryChannel, 'Telepon');
  assert.strictEqual(chPhone.status, 'siap_outreach');

  // 4. Onsite Direct Visit when only physical address exists
  const chOnsite = selectOutreachChannel({
    address: 'Jalan ledjen suprapto gang VI nomor 90 jember',
    categoryName: 'Kafe & Resto',
  });
  assert.strictEqual(chOnsite.primaryChannel, 'Kunjungan Langsung');
  assert.strictEqual(chOnsite.status, 'siap_outreach');
  assert.ok(chOnsite.recommendedVisitTime?.includes('WIB'));

  // 5. Perlu Riset Kontak when no contact or address
  const chNone = selectOutreachChannel({
    phone: '',
    categoryName: 'UMKM',
  });
  assert.strictEqual(chNone.primaryChannel, 'None');
  assert.strictEqual(chNone.status, 'perlu_riset_kontak');

  console.log('   ✅ Semua 5 skenario Channel Selector Lulus!');
}

