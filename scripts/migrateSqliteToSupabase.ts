import { config } from '../src/config';
import { SqliteDatabase } from '../src/database/sqliteDb';
import { SupabaseDatabase } from '../src/database/supabaseDb';

async function migrate() {
  console.log('================================================================');
  console.log('🚀 MIGRASI DATA: SQLITE -> SUPABASE CLOUD');
  console.log('================================================================\n');

  if (!config.supabaseUrl || !config.supabaseKey) {
    console.error('❌ ERROR: SUPABASE_URL atau SUPABASE_KEY belum diset di .env!');
    console.error('   Harap isi SUPABASE_URL dan SUPABASE_KEY di .env terlebih dahulu.');
    process.exit(1);
  }

  const sqliteDb = new SqliteDatabase();
  const supabaseDb = new SupabaseDatabase(config.supabaseUrl, config.supabaseKey);

  try {
    const leads = sqliteDb.getAllLeads();
    console.log(`📦 Ditemukan ${leads.length} lead di SQLite lokal.`);

    if (leads.length === 0) {
      console.log('ℹ️ Database SQLite kosong. Tidak ada data yang perlu dipindahkan.');
      return;
    }

    let successCount = 0;
    for (const lead of leads) {
      try {
        await supabaseDb.upsertLead(lead);
        const events = sqliteDb.getLeadEvents(lead.id);
        for (const ev of events) {
          await supabaseDb.addEvent(lead.id, ev.status, ev.action, ev.note);
        }
        successCount++;
        process.stdout.write(`   [${successCount}/${leads.length}] ✓ ${lead.name}\n`);
      } catch (err: any) {
        console.error(`   ✗ Gagal migrasi "${lead.name}":`, err.message);
      }
    }

    console.log('\n================================================================');
    console.log(`🎉 MIGRASI SELESAI: ${successCount} dari ${leads.length} lead berhasil diunggah ke Supabase!`);
    console.log('================================================================\n');
  } catch (err: any) {
    console.error('❌ Terjadi kesalahan saat migrasi:', err.message);
  } finally {
    sqliteDb.close();
  }
}

migrate();

