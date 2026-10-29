import * as fs from 'fs';
import * as path from 'path';
import { config } from '../src/config';
import { resolveCategory } from '../src/config/categories.config';
import { ContactExtractor } from '../src/services/contactExtractor';
import { auditWebsite } from '../src/auditors/webAuditor';
import { analyzeReviewPainPoints } from '../src/services/reviewAnalyzer';
import { calculateLeadScore } from '../src/services/leadScoringEngine';
import { MessageBuilder } from '../src/services/messageBuilder';
import { PipelineDatabase, PipelineLeadRecord } from '../src/database/pipelineDb';
import { QueueService } from '../src/services/queueService';
import { MasterReportGenerator, DetailedReportItem } from '../src/services/masterReportGenerator';
import { BusinessBriefService } from '../src/services/businessBriefService';
import { GooglePlacesClient, GooglePlaceResult } from '../src/scrapers/googlePlacesClient';
import { deduplicateLeads } from '../src/services/deduplicator';

async function runPipeline() {
  console.log(`================================================================`);
  console.log(`🚀 Menjalankan Pipeline Lead Generation UMKM Jember Berkecepatan Tinggi`);
  console.log(`================================================================\n`);

  const placesClient = new GooglePlacesClient(config);
  const contactExtractor = new ContactExtractor();
  const messageBuilder = new MessageBuilder();
  const briefService = new BusinessBriefService(config);
  const pipelineDb = new PipelineDatabase();
  const reportGenerator = new MasterReportGenerator();

  // 1. Ambil data calon lead dari Google Places Client (dengan cache dan mock data terverifikasi)
  const initialPlaces = await placesClient.searchPlaces('UMKM Jember Kafe Katering Percetakan Konveksi', 15);

  // Baca juga data historis dari data/processed_leads.json jika ada
  const processedLeadsFile = path.join(process.cwd(), 'data', 'processed_leads.json');
  let historicalRecords: any[] = [];
  if (fs.existsSync(processedLeadsFile)) {
    try {
      historicalRecords = JSON.parse(fs.readFileSync(processedLeadsFile, 'utf-8'));
    } catch (e) {}
  }

  // Gabungkan ke pool kandidat
  const candidatePool: Array<{
    name: string;
    phone?: string;
    websiteUrl?: string;
    address?: string;
    referenceUrl?: string;
    rating?: number;
    reviewCount?: number;
    reviews?: any[];
    lat?: number;
    lng?: number;
  }> = [];

  for (const p of initialPlaces) {
    candidatePool.push({
      name: p.name,
      phone: p.phone,
      websiteUrl: p.website,
      address: p.address,
      referenceUrl: p.mapsUrl,
      rating: p.rating,
      reviewCount: p.reviewCount,
      reviews: p.reviews,
      lat: p.lat,
      lng: p.lng,
    });
  }

  for (const h of historicalRecords) {
    candidatePool.push({
      name: h.name,
      phone: h.phone,
      websiteUrl: h.websiteUrl || (h.referenceUrl && !h.referenceUrl.includes('google.com/maps') ? h.referenceUrl : undefined),
      address: h.address,
      referenceUrl: h.referenceUrl,
    });
  }

  // 2. Deduplikasi lead cerdas
  const { uniqueLeads, duplicatesRemovedCount } = deduplicateLeads(candidatePool);
  console.log(`🔍 Total calon lead: ${candidatePool.length} | Duplikat dibersihkan: ${duplicatesRemovedCount} | Lead unik: ${uniqueLeads.length}\n`);

  const processedItems: DetailedReportItem[] = [];
  const pipelineRecordsToSave: PipelineLeadRecord[] = [];

  // 3. Proses setiap lead
  for (let i = 0; i < uniqueLeads.length; i++) {
    const raw = uniqueLeads[i];
    console.log(`[${i + 1}/${uniqueLeads.length}] 🏢 Memproses Lead: "${raw.name}"...`);

    // A. Resolusi Kategori
    const categoryConfig = resolveCategory({ name: raw.name });

    // B. Ekstraksi Kontak & Deteksi Channel
    const contacts = await contactExtractor.enrichLeadContacts(
      raw.phone,
      raw.websiteUrl,
      raw.address,
      categoryConfig.name
    );
    const channelDecision = contacts.channelDecision!;

    // C. Verifikasi Status Website
    const auditRes = await auditWebsite(raw.websiteUrl || raw.referenceUrl);

    // D. Analisis Bukti Pain Point dari Ulasan Asli
    const evidence = analyzeReviewPainPoints(raw.reviews, categoryConfig.assumedPainPoint);

    // E. Lead Scoring Engine (0-100)
    const scoreResult = calculateLeadScore({
      rating: raw.rating,
      reviewCount: raw.reviewCount,
      primaryChannel: channelDecision.primaryChannel,
      categoryConfig,
      websiteVerificationStatus: auditRes.verificationStatus,
      lat: raw.lat,
      lng: raw.lng,
      address: raw.address,
    });

    // F. Message Builder 3 Tahap + Validasi Klaim
    const msgSeq = messageBuilder.buildSequence({
      businessName: raw.name,
      area: raw.address || 'Jember',
      rating: raw.rating,
      reviewCount: raw.reviewCount,
      primaryChannel: channelDecision.primaryChannel,
      categoryConfig,
      evidence,
      isPersonalizedDemo: false,
    });

    // Validasi klaim
    if (!msgSeq.validation.isValid) {
      console.warn(`   ⚠️ Klaim pada pesan ditolak: ${msgSeq.validation.flaggedClaims.join(', ')}`);
    }

    const slug = briefService.generateSlug(raw.name);
    const leadId = slug;

    // Periksa status lama dari database jika ada
    const existingDbLead = pipelineDb.getLeadById(leadId);
    let pipelineStatus = existingDbLead ? existingDbLead.status : 'belum_dihubungi';

    if (channelDecision.status === 'perlu_riset_kontak') {
      pipelineStatus = 'perlu_riset_kontak';
    }

    const pipelineRecord: PipelineLeadRecord = {
      id: leadId,
      name: raw.name,
      category: categoryConfig.name,
      primaryChannel: channelDecision.primaryChannel,
      status: pipelineStatus as any,
      score: scoreResult.totalScore,
      scoreReasons: scoreResult.reasons,
      phone: raw.phone || contacts.whatsappNumber || contacts.landlineNumber,
      whatsappUrl: contacts.whatsappUrl,
      instagramUrl: contacts.instagramUrl,
      address: raw.address,
      websiteVerificationStatus: auditRes.verificationStatus,
      lastContactedAt: existingDbLead?.lastContactedAt,
      nextFollowUpAt: existingDbLead?.nextFollowUpAt,
      messages: {
        step1: msgSeq.step1,
        step2_followup1: msgSeq.step2_followup1,
        step3_followup2: msgSeq.step3_followup2,
      },
      history: existingDbLead?.history || [],
    };

    pipelineRecordsToSave.push(pipelineRecord);

    const detailedItem: DetailedReportItem = {
      lead: pipelineRecord,
      evidence,
      folderSlug: slug,
    };
    processedItems.push(detailedItem);

    // G. Generate & Save BUSINESS_BRIEF.md
    const unifiedLeadMock: any = {
      name: raw.name,
      keyword: categoryConfig.keywords[0],
      source: 'GoogleMaps',
      referenceUrl: raw.referenceUrl || 'https://maps.google.com',
      contactInfo: raw.phone || '-',
      contacts,
      address: raw.address,
      category: categoryConfig.name,
    };

    // Ambil brief konten dasar
    const baseBrief = await briefService.generateBusinessBrief(unifiedLeadMock);
    briefService.saveEnhancedBusinessBrief(unifiedLeadMock, baseBrief, {
      score: scoreResult.totalScore,
      scoreReasons: scoreResult.reasons,
      websiteVerificationStatus: auditRes.verificationStatus,
      primaryChannel: channelDecision.primaryChannel,
      evidenceLabel: evidence.label,
      evidenceDescription: evidence.painPointDescription,
      evidenceQuotes: evidence.evidenceQuotes,
      messages: {
        step1: msgSeq.step1,
        step2_followup1: msgSeq.step2_followup1,
        step3_followup2: msgSeq.step3_followup2,
      },
    });

    console.log(`   ✅ Skor: ${scoreResult.totalScore}/100 | Channel: ${channelDecision.primaryChannel} | Web: ${auditRes.verificationStatus} | Bukti: ${evidence.isProven ? 'Ada' : 'Asumsi'}`);
  }

  // 4. Simpan semua record ke Pipeline DB
  pipelineDb.bulkSaveLeads(pipelineRecordsToSave);
  console.log(`\n💾 Berhasil menyimpan ${pipelineRecordsToSave.length} leads ke data/leads_pipeline.json`);

  // 5. Generate MASTER_REPORT.md dan sinkronkan REKOMENDASI_SERVICES_LEADS.md
  const reportPaths = reportGenerator.saveMasterReport(processedItems);
  console.log(`📑 Master Report diperbarui di: ${reportPaths.masterReportPath}`);

  // 6. Generate TODAY_QUEUE.md (Antrean Hari Ini: maks 12 lead)
  const queueService = new QueueService(pipelineDb);
  const queueResult = queueService.saveTodayQueueToFile();
  console.log(`📋 Antrean Hari Ini diperbarui di: TODAY_QUEUE.md (${queueResult.totalQueue} lead siap dihubungi)\n`);

  console.log(`================================================================`);
  console.log(`🎉 Pipeline Selesai Sukses!`);
  console.log(`================================================================\n`);
}

runPipeline().catch((err) => {
  console.error('💥 Pipeline error:', err);
  process.exit(1);
});

