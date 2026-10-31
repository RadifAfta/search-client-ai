import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { OutreachChannel } from '../services/contactDetector';

export type LeadPipelineStatus =
  | 'belum_dihubungi'
  | 'terkirim'
  | 'follow_up_1'
  | 'follow_up_2'
  | 'balas'
  | 'demo'
  | 'negosiasi'
  | 'deal'
  | 'tidak_tertarik'
  | 'jangan_hubungi'
  | 'selesai_tidak_ada_respons'
  | 'tunda'
  | 'data_lama'
  | 'perlu_riset_kontak';

export interface SqliteLeadRecord {
  id: string; // placeId atau slug unik
  name: string;
  category: string;
  primaryChannel: OutreachChannel;
  status: LeadPipelineStatus;
  score: number;
  scoreReasons: string[];
  phone?: string;
  whatsappUrl?: string;
  instagramUrl?: string;
  address?: string;
  area?: string;
  mapsUrl?: string;
  websiteVerificationStatus: string;
  websiteAuditEvidence?: any;
  reviewEvidence?: any;
  estimatedValue: number;
  lastContactedAt?: string;
  nextFollowUpAt?: string;
  snoozeUntil?: string;
  messages?: {
    step1: string;
    step2_followup1: string;
    step3_followup2: string;
  };
  notes?: string;
  manualWebChecked?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SqliteEventRecord {
  id: number;
  leadId: string;
  status: string;
  action: string;
  note?: string;
  createdAt: string;
}

export interface PipelineMetrics {
  totalLeads: number;
  belumDihubungi: number;
  terkirim: number;
  followUp: number;
  balas: number;
  demo: number;
  negosiasi: number;
  deal: number;
  tidakTertarik: number;
  responseRatePct: number;
  totalEstimatedValue: number;
}

export class SqliteDatabase {
  private db: Database.Database;
  public dbPath: string;

  constructor(dbPath?: string) {
    const baseDir = process.env.VERCEL ? os.tmpdir() : process.cwd();
    this.dbPath = dbPath || path.join(baseDir, 'data', 'leads.db');
    try {
      const dir = path.dirname(this.dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    } catch {
      // Safe fallback on read-only serverless filesystems
    }
    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.initSchema();
  }

  public close(): void {
    if (this.db) {
      this.db.close();
    }
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS leads (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        primary_channel TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'belum_dihubungi',
        score INTEGER NOT NULL DEFAULT 0,
        score_reasons TEXT,
        phone TEXT,
        whatsapp_url TEXT,
        instagram_url TEXT,
        address TEXT,
        area TEXT,
        maps_url TEXT,
        website_verification_status TEXT,
        website_audit_evidence TEXT,
        review_evidence TEXT,
        estimated_value INTEGER DEFAULT 0,
        last_contacted_at TEXT,
        next_follow_up_at TEXT,
        snooze_until TEXT,
        messages TEXT,
        notes TEXT,
        manual_web_checked INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
      CREATE INDEX IF NOT EXISTS idx_leads_score ON leads(score DESC);
      CREATE INDEX IF NOT EXISTS idx_leads_category ON leads(category);

      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        lead_id TEXT NOT NULL,
        status TEXT NOT NULL,
        action TEXT NOT NULL,
        note TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_events_lead_id ON events(lead_id);
    `);

    // Migrasi kolom bila tabel sudah ada sebelumnya
    try {
      this.db.exec('ALTER TABLE leads ADD COLUMN manual_web_checked INTEGER DEFAULT 0');
    } catch {
      // Kolom sudah ada
    }
  }

  /**
   * Menyimpan atau mengupdate lead baru tanpa menimpa status/catatan yang sudah diproses user
   */
  public upsertLead(lead: SqliteLeadRecord): void {
    const existing = this.getLeadById(lead.id);
    const nowIso = new Date().toISOString();

    if (existing) {
      // Pertahankan status kerjaan user jika sudah bukan default
      const statusToKeep = existing.status !== 'belum_dihubungi' ? existing.status : lead.status;
      const notesToKeep = existing.notes || lead.notes;
      const estimatedValueToKeep = existing.estimatedValue || lead.estimatedValue || 0;
      const lastContactedAt = existing.lastContactedAt || lead.lastContactedAt;
      const nextFollowUpAt = existing.nextFollowUpAt || lead.nextFollowUpAt;
      const snoozeUntil = existing.snoozeUntil || lead.snoozeUntil;

      const stmt = this.db.prepare(`
        UPDATE leads SET
          name = ?, category = ?, primary_channel = ?, status = ?, score = ?,
          score_reasons = ?, phone = ?, whatsapp_url = ?, instagram_url = ?,
          address = ?, area = ?, maps_url = ?, website_verification_status = ?,
          website_audit_evidence = ?, review_evidence = ?, estimated_value = ?,
          last_contacted_at = ?, next_follow_up_at = ?, snooze_until = ?,
          messages = ?, notes = ?, updated_at = ?
        WHERE id = ?
      `);

      stmt.run(
        lead.name,
        lead.category,
        lead.primaryChannel,
        statusToKeep,
        lead.score,
        JSON.stringify(lead.scoreReasons || []),
        lead.phone || null,
        lead.whatsappUrl || null,
        lead.instagramUrl || null,
        lead.address || null,
        lead.area || null,
        lead.mapsUrl || null,
        lead.websiteVerificationStatus,
        lead.websiteAuditEvidence ? JSON.stringify(lead.websiteAuditEvidence) : null,
        lead.reviewEvidence ? JSON.stringify(lead.reviewEvidence) : null,
        estimatedValueToKeep,
        lastContactedAt || null,
        nextFollowUpAt || null,
        snoozeUntil || null,
        lead.messages ? JSON.stringify(lead.messages) : null,
        notesToKeep || null,
        nowIso,
        lead.id
      );
    } else {
      const stmt = this.db.prepare(`
        INSERT INTO leads (
          id, name, category, primary_channel, status, score, score_reasons,
          phone, whatsapp_url, instagram_url, address, area, maps_url,
          website_verification_status, website_audit_evidence, review_evidence,
          estimated_value, last_contacted_at, next_follow_up_at, snooze_until,
          messages, notes, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?
        )
      `);

      stmt.run(
        lead.id,
        lead.name,
        lead.category,
        lead.primaryChannel,
        lead.status || 'belum_dihubungi',
        lead.score || 0,
        JSON.stringify(lead.scoreReasons || []),
        lead.phone || null,
        lead.whatsappUrl || null,
        lead.instagramUrl || null,
        lead.address || null,
        lead.area || null,
        lead.mapsUrl || null,
        lead.websiteVerificationStatus || 'tidak punya website',
        lead.websiteAuditEvidence ? JSON.stringify(lead.websiteAuditEvidence) : null,
        lead.reviewEvidence ? JSON.stringify(lead.reviewEvidence) : null,
        lead.estimatedValue || 0,
        lead.lastContactedAt || null,
        lead.nextFollowUpAt || null,
        lead.snoozeUntil || null,
        lead.messages ? JSON.stringify(lead.messages) : null,
        lead.notes || null,
        lead.createdAt || nowIso,
        lead.updatedAt || nowIso
      );

      // Catat event pertama
      this.addEvent(lead.id, lead.status || 'belum_dihubungi', 'Lead dimasukkan ke database sistem');
    }
  }

  public getLeadById(id: string): SqliteLeadRecord | null {
    const row: any = this.db.prepare(`SELECT * FROM leads WHERE id = ?`).get(id);
    if (!row) return null;
    return this.mapRowToLead(row);
  }

  public addEvent(leadId: string, status: string, action: string, note?: string): void {
    const stmt = this.db.prepare(`
      INSERT INTO events (lead_id, status, action, note, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(leadId, status, action, note || null, new Date().toISOString());
  }

  public getLeadEvents(leadId: string): SqliteEventRecord[] {
    const rows: any[] = this.db
      .prepare(`SELECT * FROM events WHERE lead_id = ? ORDER BY id DESC`)
      .all(leadId);
    return rows.map((r) => ({
      id: r.id,
      leadId: r.lead_id,
      status: r.status,
      action: r.action,
      note: r.note || undefined,
      createdAt: r.created_at,
    }));
  }

  /**
   * Logika transisi status otomatis:
   * - Terkirim: jika belum_dihubungi -> status 'terkirim', follow up 1 dijadwalkan H+3
   *   jika terkirim/follow_up_1 -> status 'follow_up_1', follow up 2 dijadwalkan H+7
   * - Balas: menghentikan jadwal follow-up otomatis
   * - Jangan hubungi & Tidak tertarik: permanent opt-out
   * - Tunda: menjadwalkan snooze sampai tanggal tertentu
   */
  public updateLeadStatus(
    leadId: string,
    newStatus: LeadPipelineStatus,
    note?: string,
    snoozeDate?: string
  ): void {
    const lead = this.getLeadById(leadId);
    if (!lead) return;

    // Jika status tidak berubah dan tidak ada catatan atau tunda baru, jangan lakukan apa pun
    if (lead.status === newStatus && !note && !snoozeDate) {
      return;
    }

    const now = new Date();
    const nowIso = now.toISOString();
    let nextFollowUpAt: string | null = null;
    let actualStatus: LeadPipelineStatus = newStatus;
    let actionDesc = `Status diubah menjadi "${newStatus}"`;

    if (newStatus === 'terkirim') {
      actualStatus = 'terkirim';
      if (lead.status === 'belum_dihubungi') {
        const h3 = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
        nextFollowUpAt = h3.toISOString();
        actionDesc = 'Pesan 1 terkirim. Follow-up 1 otomatis dijadwalkan pada H+3.';
      } else {
        actionDesc = 'Status dipindahkan ke Terkirim.';
      }
    } else if (newStatus === 'follow_up_1') {
      actualStatus = 'follow_up_1';
      const h7 = new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000);
      nextFollowUpAt = h7.toISOString();
      actionDesc = 'Follow-up 1 terkirim. Follow-up 2 otomatis dijadwalkan pada H+7.';
    } else if (newStatus === 'follow_up_2' || newStatus === 'selesai_tidak_ada_respons') {
      actualStatus = newStatus;
      nextFollowUpAt = null;
      actionDesc = 'Follow-up selesai tanpa balasan. Ditandai selesai.';
    } else if (newStatus === 'balas') {
      actualStatus = 'balas';
      nextFollowUpAt = null; // Hentikan follow-up otomatis
      actionDesc = 'Calon klien merespons/membalas pesan. Jadwal follow-up otomatis dihentikan.';
    } else if (newStatus === 'jangan_hubungi' || newStatus === 'tidak_tertarik') {
      actualStatus = newStatus;
      nextFollowUpAt = null;
      actionDesc = `Lead dikeluarkan dari antrean permanen (${newStatus}).`;
    } else if (newStatus === 'tunda') {
      actualStatus = 'tunda';
      actionDesc = `Antrean ditunda sampai ${snoozeDate || 'tanggal ditentukan'}.`;
    } else {
      actualStatus = newStatus;
      nextFollowUpAt = null;
      actionDesc = `Status dipindahkan ke ${newStatus}.`;
    }

    const shouldUpdateContactedAt =
      (newStatus === 'terkirim' && (lead.status === 'belum_dihubungi' || !lead.lastContactedAt)) ||
      (newStatus === 'follow_up_1' && lead.status === 'terkirim');

    const stmt = this.db.prepare(`
      UPDATE leads SET
        status = ?,
        last_contacted_at = CASE WHEN ? = 1 THEN ? ELSE last_contacted_at END,
        next_follow_up_at = ?,
        snooze_until = ?,
        updated_at = ?
      WHERE id = ?
    `);

    stmt.run(
      actualStatus,
      shouldUpdateContactedAt ? 1 : 0,
      nowIso,
      nextFollowUpAt,
      snoozeDate || null,
      nowIso,
      leadId
    );

    this.addEvent(leadId, actualStatus, actionDesc, note);
  }

  public updateLeadNotes(leadId: string, notes: string): void {
    const nowIso = new Date().toISOString();
    this.db.prepare(`UPDATE leads SET notes = ?, updated_at = ? WHERE id = ?`).run(notes, nowIso, leadId);
    this.addEvent(leadId, 'catatan', 'Menambahkan catatan bebas', notes);
  }

  public updateLeadEstimatedValue(leadId: string, estimatedValue: number): void {
    const nowIso = new Date().toISOString();
    this.db.prepare(`UPDATE leads SET estimated_value = ?, updated_at = ? WHERE id = ?`).run(estimatedValue, nowIso, leadId);
    this.addEvent(leadId, 'nilai_proyek', `Memperbarui estimasi nilai proyek: Rp ${estimatedValue.toLocaleString('id-ID')}`);
  }

  public updateLeadMessage(leadId: string, step: 'step1' | 'step2_followup1' | 'step3_followup2', newText: string): void {
    const lead = this.getLeadById(leadId);
    if (!lead || !lead.messages) return;

    const msgs = { ...lead.messages, [step]: newText };
    const nowIso = new Date().toISOString();
    this.db.prepare(`UPDATE leads SET messages = ?, updated_at = ? WHERE id = ?`).run(JSON.stringify(msgs), nowIso, leadId);
    this.addEvent(leadId, 'edit_pesan', `Mengedit pesan ${step}`);
  }

  public setManualWebChecked(leadId: string, checked: boolean): void {
    const nowIso = new Date().toISOString();
    this.db.prepare(`UPDATE leads SET manual_web_checked = ?, updated_at = ? WHERE id = ?`).run(checked ? 1 : 0, nowIso, leadId);
    this.addEvent(
      leadId,
      'verifikasi_manual',
      checked ? 'Pengecekan manual medsos selesai (Sudah dicek)' : 'Status pengecekan manual dibatalkan'
    );
  }

  /**
   * Antrean Hari Ini: Maksimal N lead (default 12),
   * Urutan:
   * 1. Follow-up jatuh tempo lebih dulu (next_follow_up_at <= now)
   * 2. Lead baru (belum_dihubungi) diurutkan berdasarkan skor tertinggi
   * Mengecualikan: jangan_hubungi, tidak_tertarik, deal, selesai_tidak_ada_respons, dan yang sedang ditunda (snooze_until > now)
   */
  public getTodayQueue(limit = 12, category?: string): SqliteLeadRecord[] {
    const nowIso = new Date().toISOString();

    let query = `
      SELECT * FROM leads
      WHERE status NOT IN ('jangan_hubungi', 'tidak_tertarik', 'deal', 'selesai_tidak_ada_respons', 'data_lama')
        AND (snooze_until IS NULL OR snooze_until <= ?)
    `;
    const params: any[] = [nowIso];

    if (category && category !== 'all') {
      query += ` AND category = ?`;
      params.push(category);
    }

    query += `
      ORDER BY
        CASE
          WHEN next_follow_up_at IS NOT NULL AND next_follow_up_at <= ? THEN 0
          WHEN status = 'belum_dihubungi' THEN 1
          ELSE 2
        END ASC,
        score DESC
      LIMIT ?
    `;
    params.push(nowIso, limit);

    const rows: any[] = this.db.prepare(query).all(...params);
    return rows.map((r) => this.mapRowToLead(r));
  }

  /**
   * Mengambil semua lead untuk tabel filter & pencarian
   */
  public getAllLeads(filter?: {
    category?: string;
    status?: string;
    channel?: string;
    search?: string;
  }): SqliteLeadRecord[] {
    let query = `SELECT * FROM leads WHERE 1=1`;
    const params: any[] = [];

    if (filter?.category && filter.category !== 'all') {
      query += ` AND category = ?`;
      params.push(filter.category);
    }
    if (filter?.status && filter.status !== 'all') {
      query += ` AND status = ?`;
      params.push(filter.status);
    }
    if (filter?.channel && filter.channel !== 'all') {
      query += ` AND primary_channel = ?`;
      params.push(filter.channel);
    }
    if (filter?.search && filter.search.trim() !== '') {
      const term = `%${filter.search.trim()}%`;
      query += ` AND (name LIKE ? OR address LIKE ? OR area LIKE ? OR notes LIKE ?)`;
      params.push(term, term, term, term);
    }

    query += ` ORDER BY score DESC, created_at DESC`;

    const rows: any[] = this.db.prepare(query).all(...params);
    return rows.map((r) => this.mapRowToLead(r));
  }

  public getTodayContactedCount(): number {
    const todayPrefix = new Date().toISOString().substring(0, 10);
    const row: any = this.db
      .prepare(`SELECT COUNT(*) as count FROM leads WHERE last_contacted_at LIKE ?`)
      .get(`${todayPrefix}%`);
    return row?.count || 0;
  }

  public getDueFollowUpsCount(): number {
    const nowIso = new Date().toISOString();
    const row: any = this.db
      .prepare(`SELECT COUNT(*) as count FROM leads WHERE next_follow_up_at IS NOT NULL AND next_follow_up_at <= ? AND status NOT IN ('jangan_hubungi', 'tidak_tertarik', 'deal', 'data_lama')`)
      .get(nowIso);
    return row?.count || 0;
  }

  public getPipelineLeads(): SqliteLeadRecord[] {
    const rows: any[] = this.db
      .prepare(`SELECT * FROM leads WHERE status != 'data_lama' ORDER BY score DESC`)
      .all();
    return rows.map((r) => this.mapRowToLead(r));
  }

  public clearAllLeads(createBackup = true): { deletedLeads: number; deletedEvents: number; backupPath?: string } {
    let backupPath: string | undefined;

    if (createBackup) {
      try {
        const backupDir = path.join(process.cwd(), 'data', 'backups');
        if (!fs.existsSync(backupDir)) {
          fs.mkdirSync(backupDir, { recursive: true });
        }
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        backupPath = path.join(backupDir, `leads_backup_pre_reset_${timestamp}.db`);
        fs.copyFileSync(this.dbPath, backupPath);
      } catch (err: any) {
        console.warn('⚠️ Gagal membuat backup sebelum reset:', err.message);
      }
    }

    const leadsCount = (this.db.prepare(`SELECT COUNT(*) as count FROM leads`).get() as any).count;
    const eventsCount = (this.db.prepare(`SELECT COUNT(*) as count FROM events`).get() as any).count;

    this.db.prepare(`DELETE FROM events`).run();
    this.db.prepare(`DELETE FROM leads`).run();

    return {
      deletedLeads: leadsCount,
      deletedEvents: eventsCount,
      backupPath,
    };
  }

  public getPipelineMetrics(): PipelineMetrics {
    const totalLeads = (this.db.prepare(`SELECT COUNT(*) as count FROM leads`).get() as any).count;
    const belumDihubungi = (this.db.prepare(`SELECT COUNT(*) as count FROM leads WHERE status = 'belum_dihubungi'`).get() as any).count;
    const terkirim = (this.db.prepare(`SELECT COUNT(*) as count FROM leads WHERE status = 'terkirim'`).get() as any).count;
    const followUp = (this.db.prepare(`SELECT COUNT(*) as count FROM leads WHERE status IN ('follow_up_1', 'follow_up_2')`).get() as any).count;
    const balas = (this.db.prepare(`SELECT COUNT(*) as count FROM leads WHERE status = 'balas'`).get() as any).count;
    const demo = (this.db.prepare(`SELECT COUNT(*) as count FROM leads WHERE status = 'demo'`).get() as any).count;
    const negosiasi = (this.db.prepare(`SELECT COUNT(*) as count FROM leads WHERE status = 'negosiasi'`).get() as any).count;
    const deal = (this.db.prepare(`SELECT COUNT(*) as count FROM leads WHERE status = 'deal'`).get() as any).count;
    const tidakTertarik = (this.db.prepare(`SELECT COUNT(*) as count FROM leads WHERE status IN ('tidak_tertarik', 'jangan_hubungi')`).get() as any).count;

    const contactedCount = terkirim + followUp + balas + demo + negosiasi + deal;
    const responseCount = balas + demo + negosiasi + deal;
    const responseRatePct = contactedCount > 0 ? parseFloat(((responseCount / contactedCount) * 100).toFixed(1)) : 0;

    const sumValRow: any = this.db.prepare(`SELECT SUM(estimated_value) as sum_val FROM leads WHERE status NOT IN ('tidak_tertarik', 'jangan_hubungi', 'selesai_tidak_ada_respons')`).get();
    const totalEstimatedValue = sumValRow?.sum_val || 0;

    return {
      totalLeads,
      belumDihubungi,
      terkirim,
      followUp,
      balas,
      demo,
      negosiasi,
      deal,
      tidakTertarik,
      responseRatePct,
      totalEstimatedValue,
    };
  }

  private mapRowToLead(row: any): SqliteLeadRecord {
    return {
      id: row.id,
      name: row.name,
      category: row.category,
      primaryChannel: row.primary_channel,
      status: row.status,
      score: row.score,
      scoreReasons: row.score_reasons ? JSON.parse(row.score_reasons) : [],
      phone: row.phone || undefined,
      whatsappUrl: row.whatsapp_url || undefined,
      instagramUrl: row.instagram_url || undefined,
      address: row.address || undefined,
      area: row.area || undefined,
      mapsUrl: row.maps_url || undefined,
      websiteVerificationStatus: row.website_verification_status || 'tidak punya website',
      websiteAuditEvidence: row.website_audit_evidence ? JSON.parse(row.website_audit_evidence) : undefined,
      reviewEvidence: row.review_evidence ? JSON.parse(row.review_evidence) : undefined,
      estimatedValue: row.estimated_value || 0,
      lastContactedAt: row.last_contacted_at || undefined,
      nextFollowUpAt: row.next_follow_up_at || undefined,
      snoozeUntil: row.snooze_until || undefined,
      messages: row.messages ? JSON.parse(row.messages) : undefined,
      notes: row.notes || undefined,
      manualWebChecked: Boolean(row.manual_web_checked),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
