import assert from 'assert';
import { analyzePhoneNumber } from '../src/services/contactDetector';

export function runPhoneDetectorTests() {
  console.log('🧪 Testing: Phone Detector (Mobile vs Landline)...');

  // Test 1: Mobile numbers
  const m1 = analyzePhoneNumber('0812-3709-0009');
  assert.strictEqual(m1.type, 'mobile');
  assert.strictEqual(m1.normalizedNumber, '6281237090009');
  assert.strictEqual(m1.waUrl, 'https://wa.me/6281237090009');

  const m2 = analyzePhoneNumber('+62 851 1751 0851');
  assert.strictEqual(m2.type, 'mobile');
  assert.strictEqual(m2.normalizedNumber, '6285117510851');

  const m3 = analyzePhoneNumber('085730388007');
  assert.strictEqual(m3.type, 'mobile');
  assert.strictEqual(m3.normalizedNumber, '6285730388007');

  // Test 2: Landline numbers (PSTN)
  const l1 = analyzePhoneNumber('0331422283'); // Araya Printing (Jember)
  assert.strictEqual(l1.type, 'landline');
  assert.strictEqual(l1.areaCode, '0331');
  assert.strictEqual(l1.areaName, 'Jember');
  assert.strictEqual(l1.normalizedNumber, '62331422283');

  const l2 = analyzePhoneNumber('0313504988'); // Pusat Oleh2 (Surabaya area code)
  assert.strictEqual(l2.type, 'landline');
  assert.strictEqual(l2.areaCode, '031');
  assert.strictEqual(l2.areaName, 'Surabaya/Sidoarjo/Gresik');

  const l3 = analyzePhoneNumber('021-7890123'); // Jakarta
  assert.strictEqual(l3.type, 'landline');
  assert.strictEqual(l3.areaCode, '021');

  // Test 3: Invalid numbers
  const inv1 = analyzePhoneNumber('Unknown');
  assert.strictEqual(inv1.type, 'invalid');

  const inv2 = analyzePhoneNumber('-');
  assert.strictEqual(inv2.type, 'invalid');

  const inv3 = analyzePhoneNumber('');
  assert.strictEqual(inv3.type, 'invalid');

  console.log('   ✅ Semua 8 assertion Phone Detector Lulus!');
}

