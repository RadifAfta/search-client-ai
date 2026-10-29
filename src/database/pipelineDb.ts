import * as fs from 'fs';
import * as path from 'path';
import { OutreachChannel } from '../services/contactDetector';
import { getNextFollowUpSchedule } from '../services/followUpScheduler';
import { WebsiteAuditEvidence } from '../auditors/webAuditor';

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
  | 'perlu_riset_kontak';

export interface LeadHistoryEntry {
  timestamp: string;
  action: string;
  note?: string;
}

export interface PipelineLeadRecord {
  id: string; // placeId atau slug
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
  websiteVerificationStatus: string;
  websiteAuditEvidence?: WebsiteAuditEvidence;
  reviewEvidence?: {
    isProven: boolean;
    quote?: string;
    rating?: number;
    date?: string;
    label?: string;
  };
  lastContactedAt?: string;
  nextFollowUpAt?: string;
  messages?: {
    step1: string;
    step2_followup1: string;
    step3_followup2: string;
  };
  notes?: string;
  history?: LeadHistoryEntry[];
}

export class PipelineDatabase {
  private filePath: string;

  constructor(filePath = path.join(process.cwd(), 'data', 'leads_pipeline.json')) {
    this.filePath = filePath;
    this.ensureDb();
  }

  private ensureDb(): void {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(this.filePath)) {
      fs.writeFileSync(this.filePath, JSON.stringify([], null, 2), 'utf-8');
    }
  }

  public getAllLeads(): PipelineLeadRecord[] {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      return JSON.parse(raw) as PipelineLeadRecord[];
    } catch (err: any) {
      console.error('❌ Failed to read pipeline database:', err.message);
      return [];
    }
  }

  public getLeadById(id: string): PipelineLeadRecord | null {
    const leads = this.getAllLeads();
    return leads.find((l) => l.id === id) || null;
  }

  public saveOrUpdateLead(lead: PipelineLeadRecord): void {
    const leads = this.getAllLeads();
    const idx = leads.findIndex((l) => l.id === lead.id);

    if (idx >= 0) {
      leads[idx] = { ...leads[idx], ...lead };
    } else {
      leads.push(lead);
    }

    fs.writeFileSync(this.filePath, JSON.stringify(leads, null, 2), 'utf-8');
  }

  public bulkSaveLeads(newLeads: PipelineLeadRecord[]): void {
    const leads = this.getAllLeads();
    for (const newLead of newLeads) {
      const idx = leads.findIndex((l) => l.id === newLead.id);
      if (idx >= 0) {
        leads[idx] = { ...leads[idx], ...newLead };
      } else {
        leads.push(newLead);
      }
    }
    fs.writeFileSync(this.filePath, JSON.stringify(leads, null, 2), 'utf-8');
  }

  /**
   * Mengubah status pipeline lead dan secara otomatis memperbarui jadwal follow up
   */
  public updateStatus(id: string, newStatus: LeadPipelineStatus, note?: string): boolean {
    const leads = this.getAllLeads();
    const lead = leads.find((l) => l.id === id);
    if (!lead) return false;

    const now = new Date();
    lead.status = newStatus;
    lead.lastContactedAt = now.toISOString();

    const schedule = getNextFollowUpSchedule(newStatus, now);
    lead.nextFollowUpAt = schedule.nextFollowUpAt;

    if (!lead.history) lead.history = [];
    lead.history.push({
      timestamp: now.toISOString(),
      action: `Status diubah menjadi "${newStatus}"`,
      note: note || (schedule.nextFollowUpAt ? `Jadwal follow up berikutnya: ${schedule.nextFollowUpAt}` : undefined),
    });

    fs.writeFileSync(this.filePath, JSON.stringify(leads, null, 2), 'utf-8');
    return true;
  }
}

