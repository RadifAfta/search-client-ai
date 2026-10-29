import * as fs from 'fs';
import * as path from 'path';
import { config, validateConfig } from '../src/config';
import { resolveCategory } from '../src/config/categories.config';
import { ContactExtractor } from '../src/services/contactExtractor';
import { auditWebsite, verifyBusinessWebsite } from '../src/auditors/webAuditor';
import { analyzeReviewPainPoints } from '../src/services/reviewAnalyzer';
import { calculateLeadScore } from '../src/services/leadScoringEngine';
import { MessageBuilder } from '../src/services/messageBuilder';
import { PipelineDatabase, PipelineLeadRecord } from '../src/database/pipelineDb';
import { QueueService } from '../src/services/queueService';
import { MasterReportGenerator, DetailedReportItem } from '../src/services/masterReportGenerator';
import { BusinessBriefService } from '../src/services/businessBriefService';
import { SerpApiClient, SerpApiPlaceResult } from '../src/scrapers/serpApiClient';
import { deduplicateLeads } from '../src/services/deduplicator';

async function runPipeline() {
  console.log(`================================================================`);
  console.log(`🚀 Menjalankan Pipeline Lead Generation (SerpAPI Google Maps Engine)`);
  console.log(`================================================================\n`);

  // Validasi Kunci API (Wajib SerpAPI, dilarang jatuh diam-diam ke mock)
  if (!validateConfig()) {
    console.error('❌ Pipeline dihentikan: SERPAPI_KEY wajib dikonfigurasi di file .env.');
    process.exit(1);
  }

  const serpClient = new SerpApiClient(config);
  const contactExtractor = new ContactExtractor();
  const messageBuilder = new MessageBuilder();
  const briefService = new BusinessBriefService(config);
  const pipelineDb = new PipelineDatabase();
  const reportGenerator = new MasterReportGenerator();

  // 1. Cek & Tampilkan Sisa Kredit Akun SerpAPI Sebelum Run
  let initialCredits = 0;
  try {
    const accountInfo = await serpClient.getAccountCredits();
    initialCredits = accountInfo.totalSearchesLeft;
    console.log(`💳 [Kredit SerpAPI Awal] Sisa: ${accountInfo.totalSearchesLeft} pencarian (Pemakaian bulan ini: ${accountInfo.thisMonthUsage}/${accountInfo.searchesPerMonth})\n`);
  } catch (err: any) {
    console.error(`❌ Gagal memeriksa saldo akun SerpAPI:`, err.message);
    process.exit(1);
  }

  // 2. Ambil Data Google Maps Riil via SerpAPI
  const searchQueries = [
    'Cafe Jember',
    'Catering Jember',
    'Percetakan Jember',
    'Konveksi Jember',
    'Bengkel Mobil Jember',
  ];

  console.log(`🔍 Mengambil data bisnis lokal Google Maps riil via SerpAPI...`);
  const rawPlaces: SerpApiPlaceResult[] = [];

  for (const q of searchQueries) {
    if (serpClient.creditsUsedInRun >= config.serpApiMaxCreditsPerRun) {
      console.warn(`🛑 Batas anggaran (${config.serpApiMaxCreditsPerRun} kredit/run) tercapai.`);
      break;
    }
    const results = await serpClient.searchGoogleMaps(q, 4); // Ambil 4 per query (total ~20 lead)
    rawPlaces.push(...results);
  }

  if (rawPlaces.length === 0) {
    console.error('❌ Tidak ada data bisnis yang berhasil diambil dari SerpAPI. Pipeline dihentikan.');
    process.exit(1);
  }

  // 3. Deduplikasi Lead Cerdas (Place ID, Kemiripan Nama, Nomor Telepon)
  const { uniqueLeads, duplicatesRemovedCount } = deduplicateLeads(rawPlaces);
  console.log(`\n📊 Total diambil: ${rawPlaces.length} | Duplikat dibersihkan: ${duplicatesRemovedCount} | Lead unik: ${uniqueLeads.length}\n`);

  const processedItems: DetailedReportItem[] = [];
  const pipelineRecordsToSave: PipelineLeadRecord[] = [];

  let reviewsFetchedCount = 0;
  let provenCount = 0;
  let unprovenCount = 0;

  // 4. Proses Setiap Lead
  for (let i = 0; i < uniqueLeads.length; i++) {
    const raw = uniqueLeads[i];
    console.log(`[${i + 1}/${uniqueLeads.length}] 🏢 Memproses Lead: "${raw.name}"...`);

    // A. Resolusi Kategori
    const categoryConfig = resolveCategory({ name: raw.name, category: raw.category });

    // B. Ekstraksi Kontak & Deteksi Channel
    const contacts = await contactExtractor.enrichLeadContacts(
      raw.phone,
      raw.website,
      raw.address,
      categoryConfig.name
    );
    const channelDecision = contacts.channelDecision!;

    // C. Verifikasi Status Website Ketat (Tahap 2)
    const auditRes = await verifyBusinessWebsite({
      businessName: raw.name,
      city: 'Jember',
      initialUrl: raw.website,
      serpApiClient: serpClient,
      canSearchGoogleWeb: false, // Hemat kredit pada run massal, diaktifkan on-demand
    });

    // D. Ambil Ulasan Asli via SerpAPI (engine: google_maps_reviews) HANYA untuk lead yang lolos filter awal
    let reviews = raw.reviews || [];
    const isEligibleForReviews =
      auditRes.verificationStatus !== 'punya website aktif' &&
      raw.dataId &&
      reviewsFetchedCount < config.maxReviewsEnrichmentPerRun;

    if (isEligibleForReviews && raw.dataId) {
      console.log(`   💬 Mengambil ulasan riil via SerpAPI untuk "${raw.name}" (data_id: ${raw.dataId})...`);
      reviews = await serpClient.fetchReviewsForPlace(raw.dataId, 5);
      reviewsFetchedCount++;
    }

    // E. Analisis Bukti Pain Point Riil
    const evidence = analyzeReviewPainPoints(reviews, categoryConfig.assumedPainPoint);
    if (evidence.isProven) {
      provenCount++;
    } else {
      unprovenCount++;
    }

    // F. Lead Scoring Engine (0-100) (Tahap 4 - Mode Default: cashflow_cepat)
    const scoreResult = calculateLeadScore({
      rating: raw.rating,
      reviewCount: raw.reviewCount,
      primaryChannel: channelDecision.primaryChannel,
      categoryConfig,
      websiteVerificationStatus: auditRes.verificationStatus,
      isProvenReviewPainPoint: evidence.isProven,
      lat: raw.lat,
      lng: raw.lng,
      address: raw.address,
    });

    // G. Message Builder 3 Tahap + Validasi Klaim (Tahap 3)
    const msgSeq = messageBuilder.buildSequence({
      businessName: raw.name,
      area: raw.area,
      address: raw.address,
      rating: raw.rating,
      reviewCount: raw.reviewCount,
      primaryChannel: channelDecision.primaryChannel,
      categoryConfig,
      evidence,
      isPersonalizedDemo: false,
    });

    const slug = briefService.generateSlug(raw.name);
    const leadId = raw.placeId || slug;

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
      area: raw.area,
      websiteVerificationStatus: auditRes.verificationStatus,
      websiteAuditEvidence: auditRes.evidence,
      reviewEvidence: {
        isProven: evidence.isProven,
        label: evidence.label,
        quote: evidence.relevantQuote?.quote,
        rating: evidence.relevantQuote?.rating,
        date: evidence.relevantQuote?.date,
      },
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

    // H. Generate & Save BUSINESS_BRIEF.md
    const unifiedLeadMock: any = {
      name: raw.name,
      keyword: categoryConfig.keywords[0],
      source: 'GoogleMaps',
      referenceUrl: raw.mapsUrl || 'https://maps.google.com',
      contactInfo: raw.phone || '-',
      contacts,
      address: raw.address,
      category: categoryConfig.name,
    };

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

  // 5. Simpan Record ke Database Pipeline
  pipelineDb.bulkSaveLeads(pipelineRecordsToSave);
  console.log(`\n💾 Berhasil menyimpan ${pipelineRecordsToSave.length} leads ke database pipeline.`);

  // 6. Generate Master Report & Rekomendasi
  const reportPaths = reportGenerator.saveMasterReport(processedItems);
  console.log(`📑 Master Report diperbarui di: ${reportPaths.masterReportPath}`);

  // 7. Generate TODAY_QUEUE.md (Antrean Hari Ini)
  const queueService = new QueueService(pipelineDb);
  const queueResult = queueService.saveTodayQueueToFile();
  console.log(`📋 Antrean Hari Ini diperbarui di: TODAY_QUEUE.md (${queueResult.totalQueue} lead siap dihubungi)\n`);

  // 8. Tampilkan Laporan Kredit SerpAPI Akhir
  try {
    const finalAccountInfo = await serpClient.getAccountCredits();
    console.log(`================================================================`);
    console.log(`💳 RINGKASAN KREDIT SERPAPI:`);
    console.log(`- Kredit Terpakai Sesi Ini: ${serpClient.creditsUsedInRun} request`);
    console.log(`- Sisa Kredit Akun Saat Ini: ${finalAccountInfo.totalSearchesLeft} request`);
    console.log(`- Total Pemakaian Bulan Ini: ${finalAccountInfo.thisMonthUsage}/${finalAccountInfo.searchesPerMonth}`);
    console.log(`- Status Bukti Ulasan: ${provenCount} Terbukti vs ${unprovenCount} Asumsi Kategori`);
    console.log(`================================================================\n`);
  } catch (err: any) {
    console.log(`- Kredit Terpakai Sesi Ini: ${serpClient.creditsUsedInRun} request`);
  }
}

runPipeline().catch((err) => {
  console.error('💥 Pipeline error:', err.message || err);
  process.exit(1);
});
