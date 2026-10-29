import * as fs from 'fs';
import * as path from 'path';
import { SqliteDatabase } from '../src/database/sqliteDb';
import { MessageBuilder } from '../src/services/messageBuilder';
import { resolveCategory } from '../src/config/categories.config';
import { checkSocialOrBioUrl } from '../src/auditors/webAuditor';

export function updateLeadsData(): void {
  console.log('🔄 Memperbarui status database leads (Pemisahan Data Lama & Sinkronisasi Template Medsos)...');
  const db = new SqliteDatabase();
  const messageBuilder = new MessageBuilder();
  const allLeads = db.getAllLeads();

  let oldMarkedCount = 0;
  let realUpdatedCount = 0;

  for (const lead of allLeads) {
    const isRealSerpApi = lead.id.startsWith('ChIJ');

    if (!isRealSerpApi) {
      // 1. Tandai lead migrasi JSON lama sebagai 'data_lama'
      db.updateLeadStatus(
        lead.id,
        'data_lama',
        'Ditandai sebagai data_lama (migrasi JSON awal). Dikecualikan dari antrean harian sampai diverifikasi SerpAPI.'
      );
      oldMarkedCount++;
    } else {
      // 2. Perbarui lead nyata dari SerpAPI
      const catConfig = resolveCategory({ name: lead.name, category: lead.category });
      const socialCheck = checkSocialOrBioUrl(lead.instagramUrl || lead.phone || '');

      // Ekstraksi rating & ulasan riil dari data tersimpan
      let rating: number | undefined;
      let reviewCount: number | undefined;
      for (const reason of lead.scoreReasons || []) {
        const matchRating = reason.match(/Rating\s+([\d\.]+)/i);
        if (matchRating) rating = parseFloat(matchRating[1]);
        const matchReviews = reason.match(/(\d+)\s+ulasan/i);
        if (matchReviews) reviewCount = parseInt(matchReviews[1], 10);
      }

      // Khusus Grand Cafe dan Senja Coffee
      let webStatus = lead.websiteVerificationStatus;
      let auditEvidence = lead.websiteAuditEvidence;
      let detectedPlatform = socialCheck.platform;

      if (lead.name.includes('Grand Cafe')) {
        webStatus = 'hanya media sosial';
        detectedPlatform = 'Instagram';
        auditEvidence = {
          checkedUrls: ['https://www.instagram.com/grandcafejember'],
          result: 'hanya media sosial',
          details: 'Terdaftar akun Instagram resmi: https://www.instagram.com/grandcafejember',
          checkedAt: new Date().toISOString(),
        };
      } else if (lead.name.includes('Senja Coffee')) {
        webStatus = 'hanya media sosial';
        detectedPlatform = 'Linktree';
        auditEvidence = {
          checkedUrls: ['http://linktr.ee/senjadijember'],
          result: 'hanya media sosial',
          details: 'Terdaftar tautan Linktree resmi: http://linktr.ee/senjadijember',
          checkedAt: new Date().toISOString(),
        };
      } else if (webStatus === 'tidak punya website') {
        auditEvidence = {
          checkedUrls: [],
          result: 'tidak punya website',
          details: 'Listing Google Maps tidak mencantumkan URL website resmi.',
          checkedAt: new Date().toISOString(),
        };
      }

      // Re-generate 3-step message sequence dengan template terbaru
      const msgSeq = messageBuilder.buildSequence({
        leadId: lead.id,
        businessName: lead.name,
        area: lead.area,
        address: lead.address,
        rating,
        reviewCount,
        primaryChannel: lead.primaryChannel,
        categoryConfig: catConfig,
        websiteVerificationStatus: webStatus,
        detectedPlatform,
        websiteUrl: lead.instagramUrl || (auditEvidence?.checkedUrls?.[0]),
      });

      // Update lead
      lead.websiteVerificationStatus = webStatus;
      lead.websiteAuditEvidence = auditEvidence;
      lead.messages = {
        step1: msgSeq.step1,
        step2_followup1: msgSeq.step2_followup1,
        step3_followup2: msgSeq.step3_followup2,
      };

      db.upsertLead(lead);
      realUpdatedCount++;
    }
  }

  console.log(`✅ Berhasil menandai ${oldMarkedCount} lead lama sebagai "data_lama" (keluar dari antrean).`);
  console.log(`✅ Berhasil memperbarui ${realUpdatedCount} lead nyata SerpAPI dengan bukti audit & template pesan terkini.\n`);
}

if (require.main === module) {
  updateLeadsData();
}
