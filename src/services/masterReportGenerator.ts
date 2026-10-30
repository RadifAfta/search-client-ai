import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { PipelineLeadRecord } from '../database/pipelineDb';
import { PainPointEvidence } from './reviewAnalyzer';

export interface DetailedReportItem {
  lead: PipelineLeadRecord;
  evidence: PainPointEvidence;
  folderSlug: string;
}

export class MasterReportGenerator {
  private outputDir: string;

  constructor(outputDir?: string) {
    const baseDir = process.env.VERCEL ? os.tmpdir() : process.cwd();
    this.outputDir = outputDir || path.join(baseDir, 'briefs');
  }

  public generateMasterReport(items: DetailedReportItem[], modeName = 'Cash Flow Cepat (Default)'): string {
    // Urutkan dari skor tertinggi
    const sorted = [...items].sort((a, b) => b.lead.score - a.lead.score);

    let md = `# 📊 MASTER REPORT: REKOMENDASI SERVICES, LEAD SCORING & SISTEM LEADS UMKM JEMBER\n\n`;
    md += `**Mode Scoring Digunakan**: \`${modeName}\`\n\n`;
    md += `Dokumen ini adalah **ringkasan eksekutif & panduan outreach terstruktur** untuk calon klien UMKM di Jember. Laporan ini diurutkan dari **skor prioritas tertinggi (0–100)** berdasarkan mode **${modeName}**.\n\n`;
    md += `> **Catatan Integritas Data**: Seluruh pesan pertama dibatasi 2–3 kalimat santun, klaim didukung data nyata ulasan Google Places, dan deskripsi demo dijelaskan secara jujur sebagai contoh konsep yang dapat disesuaikan.\n\n`;
    md += `---\n\n`;

    // 1. TABEL RINGKASAN REKOMENDASI (QUICK OVERVIEW)
    md += `## 📌 TABEL RINGKASAN REKOMENDASI (URUT SKOR TERTINGGI)\n\n`;
    md += `| No | Nama Bisnis | Kategori | Skor | Channel Utama | Status Website | Bukti Pain Point | Tautan Dokumen |\n`;
    md += `|---|---|---|---|---|---|---|---|\n`;

    sorted.forEach((item, idx) => {
      const l = item.lead;
      const evidenceBadge = item.evidence.isProven ? '✅ Ulasan Nyata' : '⚠️ Asumsi Kategori';
      const webStatusBadge = `\`${l.websiteVerificationStatus}\``;
      md += `| ${idx + 1} | **${l.name}** | ${l.category} | **${l.score}/100** | **${l.primaryChannel}** | ${webStatusBadge} | ${evidenceBadge} | [Buka Brief](./${item.folderSlug}/BUSINESS_BRIEF.md) |\n`;
    });

    md += `\n---\n\n`;

    // 2. DETAIL ANALISIS & STRATEGI PENAWARAN PER BISNIS
    md += `## 🔍 DETAIL ANALISIS & STRATEGI OUTREACH PER BISNIS\n\n`;

    sorted.forEach((item, idx) => {
      const l = item.lead;
      md += `### ${idx + 1}. ${l.name} (${l.category}) — Skor: ${l.score}/100\n\n`;

      // Skor Breakdown
      md += `#### 🎯 Skor & Analisis Prioritas:\n`;
      l.scoreReasons.forEach((r) => {
        md += `- ${r}\n`;
      });
      md += `\n`;

      // Status Website & Kontak
      md += `#### 🌐 Status Verifikasi Website & Kontak:\n`;
      md += `- **Status Website**: \`${l.websiteVerificationStatus}\`\n`;
      md += `- **Channel Outreach Terpilih**: **${l.primaryChannel}**\n`;
      if (l.whatsappUrl) md += `- **WhatsApp**: [Kirim Pesan WhatsApp](${l.whatsappUrl}) (${l.phone || '-'})\n`;
      if (l.instagramUrl) md += `- **Instagram**: [Buka Profil](${l.instagramUrl})\n`;
      if (l.phone) md += `- **Nomor Telepon**: ${l.phone}\n`;
      if (l.address) md += `- **Alamat Fisik**: ${l.address}\n`;
      md += `\n`;

      // Bukti Pain Point
      md += `#### 💡 Masalah Bisnis (Pain Point) & Bukti Nyata:\n`;
      md += `- **Status**: \`${item.evidence.label}\`\n`;
      md += `- **Deskripsi Masalah**: ${item.evidence.painPointDescription}\n`;
      if (item.evidence.evidenceQuotes.length > 0) {
        md += `- **Kutipan Ulasan Pelanggan Riil**:\n`;
        item.evidence.evidenceQuotes.forEach((q) => {
          md += `  > "⭐ ${q.rating}/5 — ${q.quote}" *(${q.date || 'Ulasan Google'})*\n`;
        });
      } else {
        md += `- *Belum ditemukan keluhan spesifik pada ulasan Google. Outreach tidak menyertakan klaim asumsi ini.*\n`;
      }
      md += `\n`;

      // Pesan 3 Tahap
      if (l.messages) {
        md += `#### 💬 Urutan Pesan Outreach (3 Tahap):\n`;
        md += `- **Pesan 1 (Pembuka 2-3 Kalimat Santun + Pertanyaan Ringan)**:\n`;
        md += `  > "${l.messages.step1}"\n`;
        md += `- **Follow-up 1 (H+3: Nilai Tambah Singkat Tanpa Menekan)**:\n`;
        md += `  > "${l.messages.step2_followup1}"\n`;
        md += `- **Follow-up 2 (H+7: Penutup Sopan dengan Opsi Menolak)**:\n`;
        md += `  > "${l.messages.step3_followup2}"\n`;
        md += `\n`;
      }

      md += `- 📁 **File Dokumen Brief Lengkap:** [${item.folderSlug}/BUSINESS_BRIEF.md](./${item.folderSlug}/BUSINESS_BRIEF.md)\n\n`;
      md += `---\n\n`;
    });

    return md;
  }

  public saveMasterReport(items: DetailedReportItem[]): { masterReportPath: string; rekomendasiPath: string } {
    try {
      const content = this.generateMasterReport(items);
      if (!fs.existsSync(this.outputDir)) {
        fs.mkdirSync(this.outputDir, { recursive: true });
      }

      const masterReportPath = path.join(this.outputDir, 'MASTER_REPORT.md');
      const rekomendasiPath = path.join(this.outputDir, 'REKOMENDASI_SERVICES_LEADS.md');

      fs.writeFileSync(masterReportPath, content, 'utf-8');
      fs.writeFileSync(rekomendasiPath, content, 'utf-8');

      return { masterReportPath, rekomendasiPath };
    } catch {
      return { masterReportPath: '', rekomendasiPath: '' };
    }
  }
}

