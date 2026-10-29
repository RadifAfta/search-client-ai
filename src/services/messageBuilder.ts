import * as fs from 'fs';
import * as path from 'path';
import { OutreachChannel } from './contactDetector';
import { CategoryConfig } from '../config/categories.config';
import { PainPointEvidence } from './reviewAnalyzer';
import { validateMessageClaims, ClaimValidationResult } from '../validators/claimValidator';

export interface MessageSequence {
  channel: OutreachChannel;
  step1: string;
  step2_followup1: string;
  step3_followup2: string;
  validation: ClaimValidationResult;
}

export class MessageBuilder {
  private templatesDir: string;

  constructor(templatesDir = path.join(process.cwd(), 'templates', 'messages')) {
    this.templatesDir = templatesDir;
  }

  private loadTemplate(channel: OutreachChannel): any {
    let filename = 'whatsapp.json';
    if (channel === 'Instagram') filename = 'instagram.json';
    else if (channel === 'Telepon') filename = 'phone.json';
    else if (channel === 'Kunjungan Langsung') filename = 'onsite.json';

    const fullPath = path.join(this.templatesDir, filename);
    if (fs.existsSync(fullPath)) {
      try {
        return JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
      } catch (err: any) {
        console.warn(`⚠️ Failed to parse template ${filename}:`, err.message);
      }
    }

    // Default inline fallback if template file is missing
    return {
      step1: "Halo Kak, salam kenal dari saya di Jember. Saya melihat profil {{business_name}}{{area_phrase}} dengan rating bagus {{rating}} bintang di Google Maps. Kebetulan saya ada contoh tampilan website untuk bisnis sejenis yang bisa disesuaikan, bolehkah saya kirimkan tautannya untuk dilihat santai? Kalau sedang belum membutuhkan, santai saja dan boleh abaikan pesan ini ya Kak.",
      step1_proven: "Halo Kak, salam kenal dari saya di Jember. Saya melihat ulasan {{business_name}}{{area_phrase}} di Google Maps sempat menyinggung tentang {{proven_quote}}. Kebetulan saya menyiapkan contoh tampilan website praktis untuk bisnis sejenis yang bisa mempermudah info tersebut, bolehkah saya kirimkan contohnya untuk dilihat santai? Bila sedang tidak membutuhkan, abaikan saja ya Kak.",
      step1_fallback: "Halo Kak, salam kenal dari saya di Jember. Saya melihat profil {{business_name}}{{area_phrase}} yang cukup aktif di Google Maps. Kebetulan saya ada contoh tampilan website untuk bisnis sejenis yang bisa disesuaikan dengan produk Kakak, bolehkah saya kirimkan contohnya untuk dilihat santai? Bila belum membutuhkan, abaikan saja ya Kak.",
      step2_followup1: "Halo Kak, menyambung sapaan singkat saya tempo hari terkait ide tampilan website untuk {{business_name}}. Saya siapkan contoh fitur praktis seperti {{system_feature}} untuk mempermudah calon pelanggan. Jika Kakak berkenan melihat 1-2 menit, saya siap bagikan tautannya tanpa komitmen apa pun ya.",
      step3_followup2: "Halo Kak di {{business_name}}, izin pesan penutup agar tidak mengganggu kesibukan Kakak. Jika saat ini belum ada rencana pengembangan website atau sistem baru, tidak masalah sama sekali ya Kak. Sukses selalu untuk usahanya!"
    };
  }

  /**
   * Menyusun urutan 3 tahap pesan outreach berdasarkan data nyata bisnis (Tahap 3)
   */
  public buildSequence(input: {
    businessName: string;
    area?: string;
    address?: string;
    rating?: number;
    reviewCount?: number;
    primaryChannel: OutreachChannel;
    categoryConfig: CategoryConfig;
    evidence?: PainPointEvidence;
    isPersonalizedDemo?: boolean;
    websiteVerificationStatus?: string;
    detectedPlatform?: string;
    websiteUrl?: string;
  }): MessageSequence {
    const rawTemplate = this.loadTemplate(input.primaryChannel);
    const hasProvenEvidence = input.evidence?.isProven && (input.evidence.evidenceQuotes?.length || 0) > 0;
    const hasRatingData = typeof input.rating === 'number' && input.rating > 0;
    const isSocialOnly = input.websiteVerificationStatus === 'hanya media sosial';

    // 1. Format area phrase (hanya kecamatan/kelurahan singkat, jangan masukkan alamat jalan Google)
    let areaPhrase = '';
    if (input.area && input.area.trim() !== '' && input.area.toLowerCase() !== 'jember') {
      const cleanArea = input.area.replace(/^(Kec\.|Kel\.|Kecamatan|Kelurahan)\s+/i, '').trim();
      areaPhrase = ` di daerah ${cleanArea}`;
    }

    // Resolusi nama platform medsos (Instagram, Linktree, TikTok, dll.)
    let socialPlatform = input.detectedPlatform || 'media sosial';
    if (!input.detectedPlatform && input.websiteUrl) {
      const lower = input.websiteUrl.toLowerCase();
      if (lower.includes('instagram.com')) socialPlatform = 'Instagram';
      else if (lower.includes('linktr.ee')) socialPlatform = 'Linktree';
      else if (lower.includes('tiktok.com')) socialPlatform = 'TikTok';
      else if (lower.includes('facebook.com')) socialPlatform = 'Facebook';
    }

    // 2. Pilih template step 1:
    // - Jika ulasan terbukti riil dari SerpAPI -> gunakan template step1_proven
    // - Jika terbukti hanya media sosial -> gunakan template step1_social (akui bahwa mereka sudah aktif di medsos)
    // - Jika ada rating riil -> gunakan template rating step1
    // - Selain itu -> gunakan template fallback netral
    let templateStep1 = rawTemplate.step1_fallback;
    if (hasProvenEvidence && rawTemplate.step1_proven) {
      templateStep1 = rawTemplate.step1_proven;
    } else if (isSocialOnly && rawTemplate.step1_social) {
      templateStep1 = rawTemplate.step1_social;
    } else if (hasRatingData && rawTemplate.step1) {
      templateStep1 = rawTemplate.step1;
    }

    const templateStep2 = rawTemplate.step2_followup1;
    const templateStep3 = rawTemplate.step3_followup2;

    const ratingStr = input.rating ? `${input.rating.toFixed(1)}` : 'bagus';
    const reviewsStr = input.reviewCount ? `${input.reviewCount}` : 'beberapa';
    const serviceName = input.categoryConfig.recommendedService;
    const systemFeature = input.categoryConfig.highValueSystems[0] || 'katalog dan kontak WhatsApp praktis';
    const highlight = input.categoryConfig.defaultHighlight;
    const provenQuote = input.evidence?.evidenceQuotes?.[0]?.quote || '';

    const replacePlaceholders = (text: string): string => {
      return text
        .replace(/\{\{business_name\}\}/g, input.businessName)
        .replace(/\{\{area_phrase\}\}/g, areaPhrase)
        .replace(/\{\{area\}\}/g, input.area || 'Jember')
        .replace(/\{\{social_platform\}\}/g, socialPlatform)
        .replace(/\{\{rating\}\}/g, ratingStr)
        .replace(/\{\{review_count\}\}/g, reviewsStr)
        .replace(/\{\{proven_quote\}\}/g, provenQuote)
        .replace(/\{\{service_name\}\}/g, serviceName)
        .replace(/\{\{system_feature\}\}/g, systemFeature)
        .replace(/\{\{highlight\}\}/g, highlight);
    };

    const step1 = replacePlaceholders(templateStep1);
    const step2 = replacePlaceholders(templateStep2);
    const step3 = replacePlaceholders(templateStep3);

    // 3. Validasi ketat klaim pada step 1
    const validation = validateMessageClaims(step1, {
      rating: input.rating,
      reviewCount: input.reviewCount,
      area: input.area,
      address: input.address,
      hasProvenEvidence: input.evidence?.isProven,
      provenQuote: input.evidence?.evidenceQuotes?.[0]?.quote,
      isPersonalizedDemo: input.isPersonalizedDemo,
      isStep1: true,
    });

    return {
      channel: input.primaryChannel,
      step1,
      step2_followup1: step2,
      step3_followup2: step3,
      validation,
    };
  }
}
