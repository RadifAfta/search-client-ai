import * as fs from 'fs';
import * as path from 'path';
import { config, Config } from '../config';
import { resolveCategory, CATEGORIES_CONFIG } from '../config/categories.config';
import { ContactExtractor } from './contactExtractor';
import { verifyBusinessWebsite } from '../auditors/webAuditor';
import { analyzeReviewPainPoints } from './reviewAnalyzer';
import { calculateLeadScore } from './leadScoringEngine';
import { MessageBuilder } from './messageBuilder';
import { BusinessBriefService } from './businessBriefService';
import { SerpApiClient, SerpApiPlaceResult } from '../scrapers/serpApiClient';
import { deduplicateLeads } from './deduplicator';
import { SqliteDatabase, SqliteLeadRecord } from '../database/sqliteDb';
import { MasterReportGenerator, DetailedReportItem } from './masterReportGenerator';
import { QueueService } from './queueService';
import { PipelineDatabase, PipelineLeadRecord } from '../database/pipelineDb';

export interface PipelineRunOptions {
  city?: string;
  categories?: string[]; // Daftar nama kategori (e.g. 'Kafe & Resto', 'Jasa Katering', dll)
  searchQueries?: string[]; // Jika query spesifik diisi langsung
  leadsPerQuery?: number; // Default: 4
  maxCredits?: number; // Default: config.serpApiMaxCreditsPerRun
  enrichReviews?: boolean; // Default: true
  scoringMode?: 'cashflow_cepat' | 'nilai_besar'; // Default: 'cashflow_cepat'
  clearCacheFirst?: boolean; // Default: false
}

export interface PipelineRunResult {
  success: boolean;
  creditsUsed: number;
  initialCredits: number;
  finalCredits: number;
  totalFetched: number;
  uniqueLeads: number;
  duplicatesRemoved: number;
  savedToDb: number;
  provenReviewCount: number;
  unprovenCount: number;
  error?: string;
}

export type PipelineLogFn = (message: string, type?: 'info' | 'warn' | 'error' | 'success') => void;

export class PipelineRunner {
  private customConfig: Config;
  private db: SqliteDatabase;

  constructor(customConfig = config, db?: SqliteDatabase) {
    this.customConfig = customConfig;
    this.db = db || new SqliteDatabase();
  }

  public async run(
    options: PipelineRunOptions = {},
    onLog?: PipelineLogFn
  ): Promise<PipelineRunResult> {
    const log: PipelineLogFn = (msg, type = 'info') => {
      console.log(msg);
      if (onLog) onLog(msg, type);
    };

    const city = options.city || 'Jember';
    const leadsPerQuery = options.leadsPerQuery || 4;
    const maxCredits = options.maxCredits || this.customConfig.serpApiMaxCreditsPerRun || 20;
    const enrichReviews = options.enrichReviews !== false;
    const scoringMode = options.scoringMode || 'cashflow_cepat';

    log(`================================================================`, 'info');
    log(`[START] MEMULAI PIPELINE LEAD GENERATION (SERPAPI GOOGLE MAPS)`, 'info');
    log(`   Target Kota: ${city} | Mode Skor: ${scoringMode}`, 'info');
    log(`================================================================`, 'info');

    if (!this.customConfig.serpApiKey) {
      const err = '[ERROR] SERPAPI_KEY tidak ditemukan di .env. Kunci API wajib diisi.';
      log(err, 'error');
      return {
        success: false,
        creditsUsed: 0,
        initialCredits: 0,
        finalCredits: 0,
        totalFetched: 0,
        uniqueLeads: 0,
        duplicatesRemoved: 0,
        savedToDb: 0,
        provenReviewCount: 0,
        unprovenCount: 0,
        error: err,
      };
    }

    // Opsi membersihkan cache jika user ingin SerpAPI murni baru
    if (options.clearCacheFirst) {
      log('[CACHE] Membersihkan cache SerpAPI lokal untuk mengambil data paling segar...', 'info');
      const cacheDir = path.join(process.cwd(), 'data', 'cache', 'serpapi');
      if (fs.existsSync(cacheDir)) {
        const files = fs.readdirSync(cacheDir);
        for (const file of files) {
          if (file.endsWith('.json')) {
            try {
              fs.unlinkSync(path.join(cacheDir, file));
            } catch {}
          }
        }
      }
    }

    const serpClient = new SerpApiClient(this.customConfig);
    const contactExtractor = new ContactExtractor();
    const messageBuilder = new MessageBuilder();
    const briefService = new BusinessBriefService(this.customConfig);
    const reportGenerator = new MasterReportGenerator();
    const legacyPipelineDb = new PipelineDatabase();

    // 1. Cek Saldo Kredit SerpAPI
    let initialCredits = 0;
    try {
      log('[AUTH] Memeriksa saldo kredit akun SerpAPI...', 'info');
      const accountInfo = await serpClient.getAccountCredits();
      initialCredits = accountInfo.totalSearchesLeft;
      log(`       Sisa: ${accountInfo.totalSearchesLeft} kredit (Bulan ini: ${accountInfo.thisMonthUsage}/${accountInfo.searchesPerMonth})`, 'info');
    } catch (err: any) {
      const msg = `[ERROR] Gagal menghubungi server SerpAPI: ${err.message}`;
      log(msg, 'error');
      return {
        success: false,
        creditsUsed: 0,
        initialCredits: 0,
        finalCredits: 0,
        totalFetched: 0,
        uniqueLeads: 0,
        duplicatesRemoved: 0,
        savedToDb: 0,
        provenReviewCount: 0,
        unprovenCount: 0,
        error: msg,
      };
    }

    // 2. Susun Query Pencarian
    let queriesToSearch: string[] = [];
    if (options.searchQueries && options.searchQueries.length > 0) {
      queriesToSearch = options.searchQueries;
    } else if (options.categories && options.categories.length > 0) {
      queriesToSearch = options.categories.map((c) => `${c} ${city}`);
    } else {
      // Default 5 kategori cash flow cepat
      queriesToSearch = [
        `Cafe ${city}`,
        `Catering ${city}`,
        `Percetakan ${city}`,
        `Konveksi ${city}`,
        `Bengkel Mobil ${city}`,
      ];
    }

    log(`[SEARCH] Mengambil data Google Maps riil untuk ${queriesToSearch.length} kata kunci (${leadsPerQuery} lead per kata kunci)...`, 'info');

    const rawPlaces: SerpApiPlaceResult[] = [];
    for (const q of queriesToSearch) {
      if (serpClient.creditsUsedInRun >= maxCredits) {
        log(`[BUDGET] Batas anggaran (${maxCredits} kredit/run) tercapai. Menghentikan pencarian baru.`, 'warn');
        break;
      }
      log(`   -> Memanggil SerpAPI (engine: google_maps) untuk: "${q}"...`, 'info');
      try {
        const results = await serpClient.searchGoogleMaps(q, leadsPerQuery);
        log(`      Ditemukan ${results.length} tempat bisnis dari SerpAPI.`, 'info');
        rawPlaces.push(...results);
      } catch (err: any) {
        log(`   [WARN] Gagal mencari "${q}": ${err.message}`, 'warn');
      }
    }

    if (rawPlaces.length === 0) {
      const err = '[ERROR] Tidak ada data bisnis yang berhasil diambil dari SerpAPI.';
      log(err, 'error');
      return {
        success: false,
        creditsUsed: serpClient.creditsUsedInRun,
        initialCredits,
        finalCredits: initialCredits - serpClient.creditsUsedInRun,
        totalFetched: 0,
        uniqueLeads: 0,
        duplicatesRemoved: 0,
        savedToDb: 0,
        provenReviewCount: 0,
        unprovenCount: 0,
        error: err,
      };
    }

    // 3. Deduplikasi
    const { uniqueLeads, duplicatesRemovedCount } = deduplicateLeads(rawPlaces);
    log(`[STATS] Total diambil: ${rawPlaces.length} | Duplikat: ${duplicatesRemovedCount} | Lead unik: ${uniqueLeads.length}`, 'info');

    const processedItems: DetailedReportItem[] = [];
    const legacyRecordsToSave: PipelineLeadRecord[] = [];
    let reviewsFetchedCount = 0;
    let provenCount = 0;
    let unprovenCount = 0;
    let savedCount = 0;

    // 4. Analisis & Simpan Setiap Lead
    for (let i = 0; i < uniqueLeads.length; i++) {
      const raw = uniqueLeads[i];
      log(`\n[${i + 1}/${uniqueLeads.length}] [LEAD] "${raw.name}" (${raw.area || city})...`, 'info');

      // A. Resolusi Kategori
      const categoryConfig = resolveCategory({ name: raw.name, category: raw.category });

      // B. Ekstraksi Kontak & Channel
      const contacts = await contactExtractor.enrichLeadContacts(
        raw.phone,
        raw.website,
        raw.address,
        categoryConfig.name
      );
      const channelDecision = contacts.channelDecision!;

      // C. Verifikasi Status Website
      const auditRes = await verifyBusinessWebsite({
        businessName: raw.name,
        city,
        initialUrl: raw.website,
        serpApiClient: serpClient,
        canSearchGoogleWeb: false, // Hemat kuota
      });

      // D. Ambil Ulasan Riil (Google Maps Reviews) jika memenuhi syarat
      let reviews = raw.reviews || [];
      const isEligibleForReviews =
        enrichReviews &&
        auditRes.verificationStatus !== 'punya website aktif' &&
        raw.dataId &&
        reviewsFetchedCount < (this.customConfig.maxReviewsEnrichmentPerRun || 15);

      if (isEligibleForReviews && raw.dataId) {
        log(`   -> Mengambil ulasan pelanggan riil via SerpAPI (data_id: ${raw.dataId})...`, 'info');
        try {
          reviews = await serpClient.fetchReviewsForPlace(raw.dataId, 5);
          reviewsFetchedCount++;
        } catch (err: any) {
          log(`   [WARN] Gagal mengambil ulasan: ${err.message}`, 'warn');
        }
      }

      // E. Analisis Bukti Pain Point Riil
      const evidence = analyzeReviewPainPoints(reviews, categoryConfig.assumedPainPoint);
      if (evidence.isProven) {
        provenCount++;
        log(`   [EVID] Pain point terbukti dari ulasan riil: "${evidence.evidenceQuotes?.[0]?.quote.substring(0, 50)}..."`, 'success');
      } else {
        unprovenCount++;
      }

      // F. Lead Scoring Engine (0-100)
      const scoreResult = calculateLeadScore(
        {
          rating: raw.rating,
          reviewCount: raw.reviewCount,
          primaryChannel: channelDecision.primaryChannel,
          categoryConfig,
          websiteVerificationStatus: auditRes.verificationStatus,
          isProvenReviewPainPoint: evidence.isProven,
          lat: raw.lat,
          lng: raw.lng,
          address: raw.address,
        },
        undefined,
        scoringMode
      );

      // G. Message Builder
      const slug = briefService.generateSlug(raw.name);
      const leadId = raw.placeId || slug;

      const msgSeq = messageBuilder.buildSequence({
        leadId,
        businessName: raw.name,
        area: raw.area,
        address: raw.address,
        rating: raw.rating,
        reviewCount: raw.reviewCount,
        primaryChannel: channelDecision.primaryChannel,
        categoryConfig,
        evidence,
        isPersonalizedDemo: false,
        websiteVerificationStatus: auditRes.verificationStatus,
        detectedPlatform: auditRes.evidence?.details?.includes('Instagram')
          ? 'Instagram'
          : auditRes.evidence?.details?.includes('Linktree')
          ? 'Linktree'
          : undefined,
        websiteUrl: raw.website || auditRes.evidence?.checkedUrls?.[0],
      });

      // H. Simpan ke SQLite Database
      const sqliteRecord: SqliteLeadRecord = {
        id: leadId,
        name: raw.name,
        category: categoryConfig.name,
        primaryChannel: channelDecision.primaryChannel,
        status: channelDecision.status === 'perlu_riset_kontak' ? 'perlu_riset_kontak' : 'belum_dihubungi',
        score: scoreResult.totalScore,
        scoreReasons: scoreResult.reasons,
        phone: raw.phone || contacts.whatsappNumber || contacts.landlineNumber,
        whatsappUrl: contacts.whatsappUrl,
        instagramUrl: contacts.instagramUrl,
        address: raw.address,
        area: raw.area,
        mapsUrl: raw.mapsUrl,
        websiteVerificationStatus: auditRes.verificationStatus,
        websiteAuditEvidence: auditRes.evidence,
        reviewEvidence: {
          isProven: evidence.isProven,
          label: evidence.label,
          quote: evidence.evidenceQuotes?.[0]?.quote,
          rating: evidence.evidenceQuotes?.[0]?.rating,
          date: evidence.evidenceQuotes?.[0]?.date,
        },
        estimatedValue: 0,
        messages: {
          step1: msgSeq.step1,
          step2_followup1: msgSeq.step2_followup1,
          step3_followup2: msgSeq.step3_followup2,
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      this.db.upsertLead(sqliteRecord);
      savedCount++;

      // I. Simpan Business Brief
      try {
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
      } catch (briefErr: any) {
        log(`   [WARN] Gagal menyimpan brief: ${briefErr.message}`, 'warn');
      }

      // Legacy sync
      const legacyRecord: PipelineLeadRecord = {
        id: leadId,
        name: raw.name,
        category: categoryConfig.name,
        primaryChannel: channelDecision.primaryChannel,
        status: sqliteRecord.status as any,
        score: sqliteRecord.score,
        scoreReasons: sqliteRecord.scoreReasons,
        phone: sqliteRecord.phone,
        whatsappUrl: sqliteRecord.whatsappUrl,
        instagramUrl: sqliteRecord.instagramUrl,
        address: sqliteRecord.address,
        area: sqliteRecord.area,
        websiteVerificationStatus: sqliteRecord.websiteVerificationStatus,
        websiteAuditEvidence: sqliteRecord.websiteAuditEvidence,
        reviewEvidence: sqliteRecord.reviewEvidence,
        messages: sqliteRecord.messages,
      };
      legacyRecordsToSave.push(legacyRecord);
      processedItems.push({ lead: legacyRecord, evidence, folderSlug: slug });

      log(`   [SAVED] Skor: ${scoreResult.totalScore}/100 | Channel: ${channelDecision.primaryChannel} | Web: ${auditRes.verificationStatus} -> Tersimpan ke SQLite!`, 'success');
    }

    // Simpan legacy file & master report
    try {
      legacyPipelineDb.bulkSaveLeads(legacyRecordsToSave);
      reportGenerator.saveMasterReport(processedItems);
      const queueService = new QueueService(legacyPipelineDb);
      queueService.saveTodayQueueToFile();
    } catch {}

    // 5. Cek Saldo Akhir
    let finalCredits = initialCredits - serpClient.creditsUsedInRun;
    try {
      const finalAccountInfo = await serpClient.getAccountCredits();
      finalCredits = finalAccountInfo.totalSearchesLeft;
    } catch {}

    log(`\n================================================================`, 'info');
    log(`[DONE] SELESAI: ${savedCount} lead baru berhasil disimpan ke database SQLite!`, 'success');
    log(`[USAGE] Pemakaian sesi ini: ${serpClient.creditsUsedInRun} request | Sisa kredit: ${finalCredits}`, 'info');
    log(`[STATS] Status bukti ulasan: ${provenCount} Terbukti riil vs ${unprovenCount} Asumsi kategori`, 'info');
    log(`================================================================\n`, 'info');

    return {
      success: true,
      creditsUsed: serpClient.creditsUsedInRun,
      initialCredits,
      finalCredits,
      totalFetched: rawPlaces.length,
      uniqueLeads: uniqueLeads.length,
      duplicatesRemoved: duplicatesRemovedCount,
      savedToDb: savedCount,
      provenReviewCount: provenCount,
      unprovenCount,
    };
  }
}
