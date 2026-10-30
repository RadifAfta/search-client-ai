import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { PipelineDatabase, PipelineLeadRecord } from '../database/pipelineDb';
import { isFollowUpDue } from './followUpScheduler';

export interface TodayQueueItem {
  lead: PipelineLeadRecord;
  queueType: 'follow_up_due' | 'new_lead';
  targetMessage: string;
  stageName: string;
}

export interface TodayQueueResult {
  date: string;
  totalQueue: number;
  followUpsCount: number;
  newLeadsCount: number;
  items: TodayQueueItem[];
  markdownReport: string;
}

export class QueueService {
  private db: PipelineDatabase;

  constructor(db = new PipelineDatabase()) {
    this.db = db;
  }

  /**
   * Menghasilkan antrean lead yang siap dihubungi hari ini (maksimal 10 - 15 lead)
   */
  public generateTodayQueue(options: { maxLeads?: number; referenceDate?: Date } = {}): TodayQueueResult {
    const maxLeads = options.maxLeads || 12; // default 12 (antara 10 - 15)
    const refDate = options.referenceDate || new Date();
    const dateStr = refDate.toISOString().split('T')[0];

    const allLeads = this.db.getAllLeads();

    // 1. Filter out leads that must NOT be contacted
    const eligibleLeads = allLeads.filter(
      (l) =>
        l.status !== 'jangan_hubungi' &&
        l.status !== 'tidak_tertarik' &&
        l.status !== 'deal' &&
        l.status !== 'perlu_riset_kontak' &&
        l.primaryChannel !== 'None'
    );

    // 2. Identify due follow-ups
    const dueFollowUps: TodayQueueItem[] = [];
    for (const lead of eligibleLeads) {
      if (
        (lead.status === 'terkirim' || lead.status === 'follow_up_1') &&
        lead.nextFollowUpAt &&
        isFollowUpDue(lead.nextFollowUpAt, refDate)
      ) {
        const isStep2 = lead.status === 'terkirim';
        dueFollowUps.push({
          lead,
          queueType: 'follow_up_due',
          targetMessage: isStep2
            ? lead.messages?.step2_followup1 || ''
            : lead.messages?.step3_followup2 || '',
          stageName: isStep2 ? 'Follow-Up 1 (Nilai Tambah H+3)' : 'Follow-Up 2 (Penutup Sopan H+7)',
        });
      }
    }

    // 3. Identify fresh new leads
    const freshLeads = eligibleLeads
      .filter((l) => l.status === 'belum_dihubungi')
      .sort((a, b) => b.score - a.score);

    const newLeadItems: TodayQueueItem[] = [];
    for (const lead of freshLeads) {
      if (dueFollowUps.length + newLeadItems.length >= maxLeads) break;
      newLeadItems.push({
        lead,
        queueType: 'new_lead',
        targetMessage: lead.messages?.step1 || '',
        stageName: 'Pesan Pembuka (2-3 Kalimat Santun)',
      });
    }

    const combinedItems = [...dueFollowUps, ...newLeadItems].slice(0, maxLeads);

    // 4. Generate Clean Markdown Report
    let md = `# 📅 ANTREAN OUTREACH HARI INI (${dateStr})\n\n`;
    md += `> **Prinsip Keamanan**: Pesan disiapkan untuk dikirim **secara manual satu per satu**, bukan pengiriman massal otomatis (anti-spam & human-touch). Batas harian aman: **${maxLeads} lead/hari**.\n\n`;
    md += `### 📊 Ringkasan Antrean:\n`;
    md += `- Total Antrean Hari Ini: **${combinedItems.length} Lead**\n`;
    md += `- Follow-Up Jatuh Tempo: **${dueFollowUps.length} Lead**\n`;
    md += `- Lead Baru (Prioritas Skor): **${newLeadItems.length} Lead**\n\n`;
    md += `---\n\n`;

    if (combinedItems.length === 0) {
      md += `*Tidak ada antrean outreach untuk hari ini. Semua follow-up dan lead baru telah diproses.*\n`;
    } else {
      combinedItems.forEach((item, idx) => {
        const l = item.lead;
        const tag = item.queueType === 'follow_up_due' ? '🔔 FOLLOW-UP JATUH TEMPO' : '✨ LEAD BARU';
        md += `### ${idx + 1}. [${tag}] ${l.name} (Skor: ${l.score}/100)\n`;
        md += `- **Kategori**: ${l.category}\n`;
        md += `- **Channel Utama**: **${l.primaryChannel}**\n`;
        if (l.whatsappUrl) md += `- **Link Kontak**: [Buka WhatsApp](${l.whatsappUrl}) (${l.phone || '-'})\n`;
        else if (l.instagramUrl) md += `- **Link Kontak**: [Buka Instagram](${l.instagramUrl})\n`;
        else if (l.phone) md += `- **Nomor Telepon**: ${l.phone}\n`;
        if (l.address) md += `- **Alamat Fisik**: ${l.address}\n`;
        md += `- **Status Saat Ini**: \`${l.status}\` ➔ **Tahap Pesan**: *${item.stageName}*\n`;
        md += `- **Draf Pesan Siap Kirim (Tinggal Salin)**:\n`;
        md += `> "${item.targetMessage}"\n\n`;
        md += `---\n\n`;
      });
    }

    return {
      date: dateStr,
      totalQueue: combinedItems.length,
      followUpsCount: dueFollowUps.length,
      newLeadsCount: newLeadItems.length,
      items: combinedItems,
      markdownReport: md,
    };
  }

  /**
   * Menyimpan file TODAY_QUEUE.md ke root direktori proyek
   */
  public saveTodayQueueToFile(targetPath?: string): TodayQueueResult {
    const queue = this.generateTodayQueue();
    try {
      const baseDir = process.env.VERCEL ? os.tmpdir() : process.cwd();
      const finalPath = targetPath || path.join(baseDir, 'TODAY_QUEUE.md');
      fs.writeFileSync(finalPath, queue.markdownReport, 'utf-8');
    } catch {
      // Safe fallback on read-only serverless filesystems
    }
    return queue;
  }
}

