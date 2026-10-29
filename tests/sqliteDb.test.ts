import assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { SqliteDatabase, SqliteLeadRecord } from '../src/database/sqliteDb';

export function runSqliteDbTests(): void {
  console.log('🧪 Testing: SQLite Database & Status Transitions (Tahap 5)...');

  const testDbPath = path.join(process.cwd(), 'data', 'test_leads.db');
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }

  const db = new SqliteDatabase(testDbPath);

  // 1. Uji Upsert Lead
  const sampleLead: SqliteLeadRecord = {
    id: 'test-cafe-jember',
    name: 'Test Cafe Jember',
    category: 'Kafe & Resto',
    primaryChannel: 'WhatsApp',
    status: 'belum_dihubungi',
    score: 95,
    scoreReasons: ['Aktivitas Bisnis (+25)', 'Ketersediaan Kontak (+25)'],
    phone: '081234567890',
    whatsappUrl: 'https://wa.me/6281234567890',
    address: 'Jl. Kalimantan No. 1, Jember',
    area: 'Sumbersari',
    websiteVerificationStatus: 'tidak punya website',
    estimatedValue: 2500000,
    messages: {
      step1: 'Halo Kak, salam kenal...',
      step2_followup1: 'Halo Kak, menyambung pesan...',
      step3_followup2: 'Halo Kak, izin sapaan penutup...',
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  db.upsertLead(sampleLead);
  const fetched = db.getLeadById('test-cafe-jember');
  assert.ok(fetched !== null, 'Lead harus tersimpan di SQLite');
  assert.strictEqual(fetched?.name, 'Test Cafe Jember');
  assert.strictEqual(fetched?.score, 95);
  console.log('   ✅ Upsert dan pembacaan lead berhasil');

  // 2. Uji Aturan Otomatis "Terkirim": Jadwalkan H+3
  db.updateLeadStatus('test-cafe-jember', 'terkirim', 'Pesan pembuka terkirim ke owner');
  const updatedTerkirim = db.getLeadById('test-cafe-jember');
  assert.strictEqual(updatedTerkirim?.status, 'terkirim');
  assert.ok(updatedTerkirim?.lastContactedAt !== undefined, 'lastContactedAt harus tercatat');
  assert.ok(updatedTerkirim?.nextFollowUpAt !== undefined, 'nextFollowUpAt harus dijadwalkan otomatis');

  const diffMs = new Date(updatedTerkirim!.nextFollowUpAt!).getTime() - Date.now();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  assert.strictEqual(diffDays, 3, 'Follow up 1 harus terjadwal H+3');
  console.log('   ✅ Aturan "Terkirim" otomatis menjadwalkan follow-up 1 pada H+3');

  // 3. Uji "Balas": Menghentikan jadwal follow-up otomatis
  db.updateLeadStatus('test-cafe-jember', 'balas', 'Owner merespons: Boleh minta preview menu QR code?');
  const updatedBalas = db.getLeadById('test-cafe-jember');
  assert.strictEqual(updatedBalas?.status, 'balas');
  assert.strictEqual(updatedBalas?.nextFollowUpAt, undefined, 'nextFollowUpAt harus dibatalkan saat klien membalas');
  console.log('   ✅ Aturan "Balas" otomatis menghentikan jadwal follow-up');

  // 4. Uji "Jangan Hubungi": Dikeluarkan dari Antrean Hari Ini secara permanen
  db.updateLeadStatus('test-cafe-jember', 'jangan_hubungi');
  const queueAfterOptOut = db.getTodayQueue(10);
  assert.ok(!queueAfterOptOut.some((l) => l.id === 'test-cafe-jember'), 'Lead opt-out harus keluar dari Antrean Hari Ini');
  console.log('   ✅ Aturan "Jangan Hubungi" mengeluarkan lead secara permanen dari antrean');

  // 5. Uji Riwayat Events
  const events = db.getLeadEvents('test-cafe-jember');
  assert.ok(events.length >= 4, 'Harus mencatat riwayat event interaksi lengkap');
  console.log('   ✅ Pencatatan riwayat event (events table) tersimpan rapi');

  // 6. Uji Metrics Pipeline
  const metrics = db.getPipelineMetrics();
  assert.strictEqual(metrics.totalLeads, 1);
  assert.strictEqual(metrics.tidakTertarik, 1);
  console.log('   ✅ Kalkulasi metrics pipeline akurat');

  // Bersihkan database test
  db.close();
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }

  console.log('   ✅ Semua 6 pengujian SQLite Database & Status Transitions Lulus!\n');
}
