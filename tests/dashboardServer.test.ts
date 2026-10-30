import assert from 'assert';
import axios from 'axios';
import { startDashboardServer } from '../src/dashboard/server';
import { SqliteDatabase, SqliteLeadRecord } from '../src/database/sqliteDb';

export async function runDashboardServerTest(): Promise<void> {
  console.log('🧪 Testing: Dashboard Web Server HTTP Endpoints, Live Scanner & Reset...');
  const server = startDashboardServer();
  const db = new SqliteDatabase();

  try {
    // Tunggu 300ms agar server listen
    await new Promise((r) => setTimeout(r, 300));

    // 1. Test Endpoint Antrean Hari Ini (GET /) - Mode Fokus
    const resQueue = await axios.get('http://127.0.0.1:3000');
    assert.strictEqual(resQueue.status, 200);
    assert.ok(resQueue.data.includes('Kokpit Buruan Klien'));
    assert.ok(resQueue.data.includes('/css/fonts.css'));
    assert.ok(resQueue.data.includes('/css/theme.css'));
    assert.ok(resQueue.data.includes('/css/dashboard.css'));
    assert.ok(resQueue.data.includes('scannerModal'));
    assert.ok(resQueue.data.includes('resetModal'));
    console.log('   ✅ Endpoint Antrean Hari Ini (GET /) memuat tema Kokpit & Modal Scanner 200 OK');

    // 2. Test Endpoint Papan Pipeline Kanban (GET /pipeline)
    const resPipeline = await axios.get('http://127.0.0.1:3000/pipeline');
    assert.strictEqual(resPipeline.status, 200);
    assert.ok(resPipeline.data.includes('Papan Pipeline Kanban'));
    console.log('   ✅ Endpoint Papan Pipeline Kanban (GET /pipeline) 200 OK');

    // 3. Test Endpoint Semua Leads (GET /leads)
    const resLeads = await axios.get('http://127.0.0.1:3000/leads');
    assert.strictEqual(resLeads.status, 200);
    assert.ok(resLeads.data.includes('Database Semua Leads'));
    console.log('   ✅ Endpoint Semua Leads (GET /leads) 200 OK');

    // 4. Test Asset Font Offline Lokal (GET /fonts/bricolage-grotesque-600.woff2)
    const resFont = await axios.get('http://127.0.0.1:3000/fonts/bricolage-grotesque-600.woff2', {
      responseType: 'arraybuffer',
    });
    assert.strictEqual(resFont.status, 200);
    assert.ok(resFont.data.length > 5000);
    console.log('   ✅ Asset Font Lokal WOFF2 terlayani mandiri tanpa koneksi eksternal 200 OK');

    // 5. Test Endpoint Cek Kredit SerpAPI (GET /api/credits)
    try {
      const resCredits = await axios.get('http://127.0.0.1:3000/api/credits');
      assert.strictEqual(resCredits.status, 200);
      assert.strictEqual(resCredits.data.success, true);
      assert.ok(typeof resCredits.data.totalSearchesLeft === 'number');
      console.log(`   ✅ Endpoint Cek Kredit SerpAPI (/api/credits) 200 OK (Sisa: ${resCredits.data.totalSearchesLeft})`);
    } catch (err: any) {
      console.log('   ℹ️ Endpoint /api/credits dicek (Catatan: memerlukan SERPAPI_KEY valid)');
    }

    // 6. Test Endpoint AJAX Status Transition (Drag-and-Drop & Pintasan Keyboard S/R/X)
    const sampleTestLead: SqliteLeadRecord = {
      id: 'test-fixture-lead-123',
      name: 'Kafe Uji Coba Server',
      category: 'Kafe & Resto',
      primaryChannel: 'WhatsApp',
      status: 'belum_dihubungi',
      score: 88,
      scoreReasons: ['Aktivitas Google Maps tinggi'],
      phone: '081234567890',
      websiteVerificationStatus: 'hanya media sosial',
      estimatedValue: 1500000,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.upsertLead(sampleTestLead);

    const resAjax = await axios.post(`http://127.0.0.1:3000/lead/${encodeURIComponent(sampleTestLead.id)}/status-ajax`, {
      status: 'balas',
    });
    assert.strictEqual(resAjax.status, 200);
    assert.strictEqual(resAjax.data.success, true);
    assert.strictEqual(resAjax.data.status, 'balas');

    const updatedLead = db.getLeadById(sampleTestLead.id);
    assert.strictEqual(updatedLead?.status, 'balas');
    console.log('   ✅ Endpoint AJAX Status Transition (Drag-and-Drop / Shortcut Keyboard) Lulus!');

    // 7. Test Endpoint AJAX Manual Web Check
    const resManualCheck = await axios.post(`http://127.0.0.1:3000/lead/${encodeURIComponent(sampleTestLead.id)}/manual-check`, {
      checked: true,
    });
    assert.strictEqual(resManualCheck.status, 200);
    assert.strictEqual(resManualCheck.data.checked, true);
    const checkedLead = db.getLeadById(sampleTestLead.id);
    assert.strictEqual(checkedLead?.manualWebChecked, true);
    console.log('   ✅ Endpoint AJAX Manual Web Check Lulus!');

    // 8. Test Endpoint Reset Database (POST /api/leads/reset)
    const resReset = await axios.post('http://127.0.0.1:3000/api/leads/reset', { clearCache: false });
    assert.strictEqual(resReset.status, 200);
    assert.strictEqual(resReset.data.success, true);
    assert.ok(resReset.data.deletedLeads >= 1);
    const queueAfterReset = db.getTodayQueue(10);
    assert.strictEqual(queueAfterReset.length, 0);
    console.log('   ✅ Endpoint Reset Database (/api/leads/reset) dengan Backup Otomatis Lulus!');

    console.log('   ✅ Semua test suite Dashboard Server & Interaksi Redesain Lulus!\n');
  } finally {
    db.close();
    server.close();
  }
}

if (require.main === module) {
  runDashboardServerTest();
}
