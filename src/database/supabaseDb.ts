import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  SqliteLeadRecord,
  SqliteEventRecord,
  LeadPipelineStatus,
  PipelineMetrics,
} from './sqliteDb';

export class SupabaseDatabase {
  private client: SupabaseClient;

  constructor(supabaseUrl: string, supabaseKey: string) {
    this.client = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false },
    });
  }

  public async upsertLead(lead: SqliteLeadRecord): Promise<void> {
    const existing = await this.getLeadById(lead.id);
    const nowIso = new Date().toISOString();

    if (existing) {
      const statusToKeep = existing.status !== 'belum_dihubungi' ? existing.status : lead.status;
      const notesToKeep = existing.notes || lead.notes;
      const estimatedValueToKeep = existing.estimatedValue || lead.estimatedValue || 0;
      const lastContactedAt = existing.lastContactedAt || lead.lastContactedAt;
      const nextFollowUpAt = existing.nextFollowUpAt || lead.nextFollowUpAt;
      const snoozeUntil = existing.snoozeUntil || lead.snoozeUntil;

      const updateRow = {
        name: lead.name,
        category: lead.category,
        primary_channel: lead.primaryChannel,
        status: statusToKeep,
        score: lead.score,
        score_reasons: lead.scoreReasons || [],
        phone: lead.phone || null,
        whatsapp_url: lead.whatsappUrl || null,
        instagram_url: lead.instagramUrl || null,
        address: lead.address || null,
        area: lead.area || null,
        maps_url: lead.mapsUrl || null,
        website_verification_status: lead.websiteVerificationStatus,
        website_audit_evidence: lead.websiteAuditEvidence || null,
        review_evidence: lead.reviewEvidence || null,
        estimated_value: estimatedValueToKeep,
        last_contacted_at: lastContactedAt || null,
        next_follow_up_at: nextFollowUpAt || null,
        snooze_until: snoozeUntil || null,
        messages: lead.messages || null,
        notes: notesToKeep || null,
        updated_at: nowIso,
      };

      const { error } = await this.client.from('leads').update(updateRow).eq('id', lead.id);
      if (error) {
        throw new Error(`Supabase update error: ${error.message}`);
      }
    } else {
      const insertRow = {
        id: lead.id,
        name: lead.name,
        category: lead.category,
        primary_channel: lead.primaryChannel,
        status: lead.status || 'belum_dihubungi',
        score: lead.score || 0,
        score_reasons: lead.scoreReasons || [],
        phone: lead.phone || null,
        whatsapp_url: lead.whatsappUrl || null,
        instagram_url: lead.instagramUrl || null,
        address: lead.address || null,
        area: lead.area || null,
        maps_url: lead.mapsUrl || null,
        website_verification_status: lead.websiteVerificationStatus || 'tidak punya website',
        website_audit_evidence: lead.websiteAuditEvidence || null,
        review_evidence: lead.reviewEvidence || null,
        estimated_value: lead.estimatedValue || 0,
        last_contacted_at: lead.lastContactedAt || null,
        next_follow_up_at: lead.nextFollowUpAt || null,
        snooze_until: lead.snoozeUntil || null,
        messages: lead.messages || null,
        notes: lead.notes || null,
        manual_web_checked: Boolean(lead.manualWebChecked),
        created_at: lead.createdAt || nowIso,
        updated_at: lead.updatedAt || nowIso,
      };

      const { error } = await this.client.from('leads').insert(insertRow);
      if (error) {
        throw new Error(`Supabase insert error: ${error.message}`);
      }
      await this.addEvent(lead.id, lead.status || 'belum_dihubungi', 'Lead dimasukkan ke database sistem');
    }
  }

  public async getLeadById(id: string): Promise<SqliteLeadRecord | null> {
    const { data, error } = await this.client.from('leads').select('*').eq('id', id).maybeSingle();
    if (error) {
      throw new Error(`Supabase getLeadById error: ${error.message}`);
    }
    if (!data) return null;
    return this.mapRowToLead(data);
  }

  public async addEvent(leadId: string, status: string, action: string, note?: string): Promise<void> {
    const { error } = await this.client.from('events').insert({
      lead_id: leadId,
      status,
      action,
      note: note || null,
      created_at: new Date().toISOString(),
    });
    if (error) {
      console.warn('⚠️ Supabase addEvent error:', error.message);
    }
  }

  public async getLeadEvents(leadId: string): Promise<SqliteEventRecord[]> {
    const { data, error } = await this.client
      .from('events')
      .select('*')
      .eq('lead_id', leadId)
      .order('id', { ascending: false });

    if (error || !data) return [];
    return data.map((r: any) => ({
      id: Number(r.id),
      leadId: r.lead_id,
      status: r.status,
      action: r.action,
      note: r.note || undefined,
      createdAt: r.created_at,
    }));
  }

  public async updateLeadStatus(
    leadId: string,
    newStatus: LeadPipelineStatus,
    note?: string,
    snoozeDate?: string
  ): Promise<void> {
    const lead = await this.getLeadById(leadId);
    if (!lead) return;

    const now = new Date();
    const nowIso = now.toISOString();
    let nextFollowUpAt: string | null = null;
    let actualStatus: LeadPipelineStatus = newStatus;
    let actionDesc = `Status diubah menjadi "${newStatus}"`;

    if (newStatus === 'terkirim') {
      if (lead.status === 'belum_dihubungi') {
        actualStatus = 'terkirim';
        const h3 = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
        nextFollowUpAt = h3.toISOString();
        actionDesc = 'Pesan 1 terkirim. Follow-up 1 otomatis dijadwalkan pada H+3.';
      } else if (lead.status === 'terkirim' || lead.status === 'follow_up_1') {
        actualStatus = 'follow_up_1';
        const h7 = new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000);
        nextFollowUpAt = h7.toISOString();
        actionDesc = 'Follow-up 1 terkirim. Follow-up 2 otomatis dijadwalkan pada H+7.';
      } else if (lead.status === 'follow_up_2') {
        actualStatus = 'selesai_tidak_ada_respons';
        nextFollowUpAt = null;
        actionDesc = 'Follow-up 2 selesai tanpa balasan. Ditandai selesai.';
      }
    } else if (newStatus === 'balas') {
      actualStatus = 'balas';
      nextFollowUpAt = null;
      actionDesc = 'Calon klien merespons/membalas pesan. Jadwal follow-up otomatis dihentikan.';
    } else if (newStatus === 'jangan_hubungi' || newStatus === 'tidak_tertarik') {
      actualStatus = newStatus;
      nextFollowUpAt = null;
      actionDesc = `Lead dikeluarkan dari antrean permanen (${newStatus}).`;
    } else if (newStatus === 'tunda') {
      actualStatus = 'tunda';
      actionDesc = `Antrean ditunda sampai ${snoozeDate || 'tanggal ditentukan'}.`;
    }

    const payload: any = {
      status: actualStatus,
      next_follow_up_at: nextFollowUpAt,
      snooze_until: snoozeDate || null,
      updated_at: nowIso,
    };
    if (newStatus === 'terkirim') {
      payload.last_contacted_at = nowIso;
    }

    const { error } = await this.client.from('leads').update(payload).eq('id', leadId);
    if (error) throw new Error(`Supabase updateLeadStatus error: ${error.message}`);

    await this.addEvent(leadId, actualStatus, actionDesc, note);
  }

  public async updateLeadNotes(leadId: string, notes: string): Promise<void> {
    const nowIso = new Date().toISOString();
    const { error } = await this.client.from('leads').update({ notes, updated_at: nowIso }).eq('id', leadId);
    if (error) throw new Error(`Supabase updateLeadNotes error: ${error.message}`);
    await this.addEvent(leadId, 'catatan', 'Menambahkan catatan bebas', notes);
  }

  public async updateLeadEstimatedValue(leadId: string, estimatedValue: number): Promise<void> {
    const nowIso = new Date().toISOString();
    const { error } = await this.client.from('leads').update({ estimated_value: estimatedValue, updated_at: nowIso }).eq('id', leadId);
    if (error) throw new Error(`Supabase updateLeadEstimatedValue error: ${error.message}`);
    await this.addEvent(leadId, 'nilai_proyek', `Memperbarui estimasi nilai proyek: Rp ${estimatedValue.toLocaleString('id-ID')}`);
  }

  public async updateLeadMessage(
    leadId: string,
    step: 'step1' | 'step2_followup1' | 'step3_followup2',
    newText: string
  ): Promise<void> {
    const lead = await this.getLeadById(leadId);
    if (!lead || !lead.messages) return;

    const msgs = { ...lead.messages, [step]: newText };
    const nowIso = new Date().toISOString();
    const { error } = await this.client.from('leads').update({ messages: msgs, updated_at: nowIso }).eq('id', leadId);
    if (error) throw new Error(`Supabase updateLeadMessage error: ${error.message}`);
    await this.addEvent(leadId, 'edit_pesan', `Mengedit pesan ${step}`);
  }

  public async setManualWebChecked(leadId: string, checked: boolean): Promise<void> {
    const nowIso = new Date().toISOString();
    const { error } = await this.client
      .from('leads')
      .update({ manual_web_checked: checked, updated_at: nowIso })
      .eq('id', leadId);
    if (error) throw new Error(`Supabase setManualWebChecked error: ${error.message}`);
    await this.addEvent(
      leadId,
      'verifikasi_manual',
      checked ? 'Pengecekan manual medsos selesai (Sudah dicek)' : 'Status pengecekan manual dibatalkan'
    );
  }

  public async getTodayQueue(limit = 12): Promise<SqliteLeadRecord[]> {
    const nowIso = new Date().toISOString();
    const { data, error } = await this.client
      .from('leads')
      .select('*')
      .not('status', 'in', "('jangan_hubungi','tidak_tertarik','deal','selesai_tidak_ada_respons','data_lama')");

    if (error) throw new Error(`Supabase getTodayQueue error: ${error.message}`);
    if (!data) return [];

    const activeLeads = data
      .filter((row: any) => !row.snooze_until || row.snooze_until <= nowIso)
      .map((r: any) => this.mapRowToLead(r));

    activeLeads.sort((a, b) => {
      const aDue = a.nextFollowUpAt && a.nextFollowUpAt <= nowIso ? 0 : (a.status === 'belum_dihubungi' ? 1 : 2);
      const bDue = b.nextFollowUpAt && b.nextFollowUpAt <= nowIso ? 0 : (b.status === 'belum_dihubungi' ? 1 : 2);
      if (aDue !== bDue) return aDue - bDue;
      return (b.score || 0) - (a.score || 0);
    });

    return activeLeads.slice(0, limit);
  }

  public async getAllLeads(filter?: {
    category?: string;
    status?: string;
    channel?: string;
    search?: string;
  }): Promise<SqliteLeadRecord[]> {
    let query = this.client.from('leads').select('*');

    if (filter?.category && filter.category !== 'all') {
      query = query.eq('category', filter.category);
    }
    if (filter?.status && filter.status !== 'all') {
      query = query.eq('status', filter.status);
    }
    if (filter?.channel && filter.channel !== 'all') {
      query = query.eq('primary_channel', filter.channel);
    }
    if (filter?.search && filter.search.trim() !== '') {
      const term = filter.search.trim();
      query = query.or(`name.ilike.%${term}%,address.ilike.%${term}%,area.ilike.%${term}%,notes.ilike.%${term}%`);
    }

    query = query.order('score', { ascending: false }).order('created_at', { ascending: false });

    const { data, error } = await query;
    if (error) throw new Error(`Supabase getAllLeads error: ${error.message}`);
    return (data || []).map((r: any) => this.mapRowToLead(r));
  }

  public async getTodayContactedCount(): Promise<number> {
    const todayPrefix = new Date().toISOString().substring(0, 10);
    const { count, error } = await this.client
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .gte('last_contacted_at', `${todayPrefix}T00:00:00Z`);

    if (error) return 0;
    return count || 0;
  }

  public async getDueFollowUpsCount(): Promise<number> {
    const nowIso = new Date().toISOString();
    const { count, error } = await this.client
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .not('status', 'in', "('jangan_hubungi','tidak_tertarik','deal','data_lama')")
      .lte('next_follow_up_at', nowIso);

    if (error) return 0;
    return count || 0;
  }

  public async getPipelineLeads(): Promise<SqliteLeadRecord[]> {
    const { data, error } = await this.client
      .from('leads')
      .select('*')
      .neq('status', 'data_lama')
      .order('score', { ascending: false });

    if (error) throw new Error(`Supabase getPipelineLeads error: ${error.message}`);
    return (data || []).map((r: any) => this.mapRowToLead(r));
  }

  public async clearAllLeads(): Promise<{ deletedLeads: number; deletedEvents: number; backupPath?: string }> {
    const { count: leadsCount } = await this.client.from('leads').select('*', { count: 'exact', head: true });
    const { count: eventsCount } = await this.client.from('events').select('*', { count: 'exact', head: true });

    await this.client.from('events').delete().gte('id', 0);
    await this.client.from('leads').delete().neq('id', '___non_existent___');

    return {
      deletedLeads: leadsCount || 0,
      deletedEvents: eventsCount || 0,
    };
  }

  public async getPipelineMetrics(): Promise<PipelineMetrics> {
    const { data, error } = await this.client.from('leads').select('status, estimated_value');

    if (error || !data) {
      return {
        totalLeads: 0,
        belumDihubungi: 0,
        terkirim: 0,
        followUp: 0,
        balas: 0,
        demo: 0,
        negosiasi: 0,
        deal: 0,
        tidakTertarik: 0,
        responseRatePct: 0,
        totalEstimatedValue: 0,
      };
    }

    const totalLeads = data.length;
    const belumDihubungi = data.filter((l) => l.status === 'belum_dihubungi').length;
    const terkirim = data.filter((l) => l.status === 'terkirim').length;
    const followUp = data.filter((l) => l.status === 'follow_up_1' || l.status === 'follow_up_2').length;
    const balas = data.filter((l) => l.status === 'balas').length;
    const demo = data.filter((l) => l.status === 'demo').length;
    const negosiasi = data.filter((l) => l.status === 'negosiasi').length;
    const deal = data.filter((l) => l.status === 'deal').length;
    const tidakTertarik = data.filter((l) => l.status === 'tidak_tertarik' || l.status === 'jangan_hubungi').length;

    const contactedCount = terkirim + followUp + balas + demo + negosiasi + deal;
    const responseCount = balas + demo + negosiasi + deal;
    const responseRatePct = contactedCount > 0 ? parseFloat(((responseCount / contactedCount) * 100).toFixed(1)) : 0;

    const totalEstimatedValue = data
      .filter((l) => !['tidak_tertarik', 'jangan_hubungi', 'selesai_tidak_ada_respons'].includes(l.status))
      .reduce((acc, curr) => acc + (Number(curr.estimated_value) || 0), 0);

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
      score: Number(row.score) || 0,
      scoreReasons: Array.isArray(row.score_reasons)
        ? row.score_reasons
        : (typeof row.score_reasons === 'string' ? JSON.parse(row.score_reasons) : []),
      phone: row.phone || undefined,
      whatsappUrl: row.whatsapp_url || undefined,
      instagramUrl: row.instagram_url || undefined,
      address: row.address || undefined,
      area: row.area || undefined,
      mapsUrl: row.maps_url || undefined,
      websiteVerificationStatus: row.website_verification_status || 'tidak punya website',
      websiteAuditEvidence: row.website_audit_evidence
        ? (typeof row.website_audit_evidence === 'string' ? JSON.parse(row.website_audit_evidence) : row.website_audit_evidence)
        : undefined,
      reviewEvidence: row.review_evidence
        ? (typeof row.review_evidence === 'string' ? JSON.parse(row.review_evidence) : row.review_evidence)
        : undefined,
      estimatedValue: Number(row.estimated_value) || 0,
      lastContactedAt: row.last_contacted_at || undefined,
      nextFollowUpAt: row.next_follow_up_at || undefined,
      snoozeUntil: row.snooze_until || undefined,
      messages: row.messages
        ? (typeof row.messages === 'string' ? JSON.parse(row.messages) : row.messages)
        : undefined,
      notes: row.notes || undefined,
      manualWebChecked: Boolean(row.manual_web_checked),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

