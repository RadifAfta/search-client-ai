import assert from 'assert';
import axios from 'axios';
import { startDashboardServer } from '../src/dashboard/server';

export async function runDashboardServerTest(): Promise<void> {
  console.log('🧪 Testing: Dashboard Web Server HTTP Endpoints...');
  const server = startDashboardServer();

  try {
    // Tunggu 300ms agar server listen
    await new Promise((r) => setTimeout(r, 300));

    // 1. Test Endpoint Antrean Hari Ini (GET /)
    const resQueue = await axios.get('http://127.0.0.1:3000');
    assert.strictEqual(resQueue.status, 200);
    assert.ok(resQueue.data.includes('Antrean Prioritas Hari Ini'));
    assert.ok(resQueue.data.includes('Lead Gen Dashboard'));
    console.log('   ✅ Endpoint Antrean Hari Ini (GET /) berhasil merespons 200 OK');

    // 2. Test Endpoint Semua Leads (GET /leads)
    const resLeads = await axios.get('http://127.0.0.1:3000/leads');
    assert.strictEqual(resLeads.status, 200);
    assert.ok(resLeads.data.includes('Semua Leads Terdaftar'));
    console.log('   ✅ Endpoint Semua Leads (GET /leads) berhasil merespons 200 OK');

    console.log('   ✅ Dashboard Server Test Lulus!\n');
  } finally {
    server.close();
  }
}

if (require.main === module) {
  runDashboardServerTest();
}

