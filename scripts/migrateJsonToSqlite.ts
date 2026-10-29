import * as fs from 'fs';
import * as path from 'path';
import { SqliteDatabase, SqliteLeadRecord } from '../src/database/sqliteDb';
import { PipelineLeadRecord } from '../src/database/pipelineDb';

export function migrateJsonToSqlite(): { migrated: number; totalInDb: number } {
  console.log('🔄 Memulai migrasi data leads JSON ke SQLite (data/leads.db)...');

  const jsonPath = path.join(process.cwd(), 'data', 'leads_pipeline.json');
  if (!fs.existsSync(jsonPath)) {
    console.warn('⚠️ File data/leads_pipeline.json tidak ditemukan. Tidak ada data yang dimigrasikan.');
    return { migrated: 0, totalInDb: 0 };
  }

  const rawJson = fs.readFileSync(jsonPath, 'utf-8');
  let records: PipelineLeadRecord[] = [];
  try {
    records = JSON.parse(rawJson);
  } catch (err: any) {
    console.error('❌ Gagal mem-parsing data/leads_pipeline.json:', err.message);
    return { migrated: 0, totalInDb: 0 };
  }

  const db = new SqliteDatabase();
  const nowIso = new Date().toISOString();
  let migrated = 0;

  for (const r of records) {
    const sqliteRecord: SqliteLeadRecord = {
      id: r.id,
      name: r.name,
      category: r.category,
      primaryChannel: r.primaryChannel,
      status: r.status,
      score: r.score,
      scoreReasons: r.scoreReasons || [],
      phone: r.phone,
      whatsappUrl: r.whatsappUrl,
      instagramUrl: r.instagramUrl,
      address: r.address,
      area: r.area,
      mapsUrl: (r as any).mapsUrl || undefined,
      websiteVerificationStatus: r.websiteVerificationStatus,
      websiteAuditEvidence: r.websiteAuditEvidence,
      reviewEvidence: r.reviewEvidence,
      estimatedValue: 0,
      lastContactedAt: r.lastContactedAt,
      nextFollowUpAt: r.nextFollowUpAt,
      messages: r.messages,
      notes: r.notes,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    db.upsertLead(sqliteRecord);
    migrated++;
  }

  const metrics = db.getPipelineMetrics();
  console.log(`✅ Berhasil memigrasikan ${migrated} lead ke SQLite. Total lead di database: ${metrics.totalLeads}`);
  return { migrated, totalInDb: metrics.totalLeads };
}

if (require.main === module) {
  migrateJsonToSqlite();
}
