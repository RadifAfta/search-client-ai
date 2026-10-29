import * as fs from 'fs';
import * as path from 'path';
import { OutreachChannel } from './contactDetector';
import { CategoryConfig } from '../config/categories.config';
import { PainPointEvidence } from './reviewAnalyzer';
import { validateMessageClaims, ClaimValidationResult } from '../validators/claimValidator';
import { config } from '../config';

export interface MessageSequence {
  channel: OutreachChannel;
  step1: string;
  step2_followup1: string;
  step3_followup2: string;
  validation: ClaimValidationResult;
}

/**
 * Menghasilkan angka integer positif deterministik dari sebuah string (leadId / businessName)
 */
export function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
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
      openers_standard: [
        "Halo Kak, saya {{sender_name}}, {{sender_role}} yang sempat melihat profil {{business_name}}{{area_phrase}} di pencarian Google Maps.",
        "Halo Kak, perkenalkan saya {{sender_name}}, {{sender_role}} yang memperhatikan profil usaha {{business_name}}{{area_phrase}} cukup aktif di Jember."
      ],
      openers_social: [
        "Halo Kak, saya {{sender_name}}, {{sender_role}} yang memperhatikan profil {{business_name}}{{area_phrase}} sudah aktif di {{social_platform}}."
      ],
      pitches_standard: [
        "Kebetulan saya ada membuat contoh tampilan website dengan fitur {{concrete_offer}} agar calon pelanggan bisa lebih mudah bertransaksi. Apakah boleh saya kirimkan tautan contohnya untuk dilihat santai?"
      ],
      pitches_social: [
        "Kebetulan saya menyiapkan contoh tampilan website praktis dengan fitur {{concrete_offer}} yang bisa disambungkan langsung ke link bio Kakak. Apakah boleh saya kirimkan tautan contohnya untuk dilihat santai?"
      ],
      closers: [
        "Kalau saat ini sedang belum membutuhkan, santai saja dan abaikan pesan ini ya Kak.",
        "Jika saat ini belum ada rencana pembuatan website, tidak masalah sama sekali ya Kak."
      ],
      step2_followup1: "Halo Kak, menyambung sapaan singkat saya tempo hari terkait ide website untuk {{business_name}}. Saya siapkan contoh fitur praktis seperti {{system_feature}} untuk mempermudah calon pelanggan. Jika Kakak berkenan melihat 1-2 menit, saya siap bagikan tautannya tanpa komitmen apa pun ya.",
      step3_followup2: "Halo Kak di {{business_name}}, izin pesan penutup agar tidak mengganggu kesibukan Kakak. Jika saat ini belum ada rencana pengembangan website atau sistem baru, tidak masalah sama sekali ya Kak. Sukses selalu untuk usahanya!"
    };
  }

  /**
   * Menyusun urutan 3 tahap pesan outreach berdasarkan data nyata bisnis.
   * Pesan 1 disusun secara deterministik dari varian pembuka, penawaran konkret, dan penutup.
   */
  public buildSequence(input: {
    leadId?: string;
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
    senderName?: string;
    senderRole?: string;
  }): MessageSequence {
    const rawTemplate = this.loadTemplate(input.primaryChannel);
    const hasProvenEvidence = input.evidence?.isProven && (input.evidence.evidenceQuotes?.length || 0) > 0;
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

    // 2. Pemilihan Deterministik Varian Pesan 1 (berdasarkan kombinasi hash leadId & businessName)
    const seed = hashString((input.leadId || '') + ':' + input.businessName);

    // A. Pilih Opener
    let openerPool: string[] = rawTemplate.openers_standard || [];
    if (hasProvenEvidence && rawTemplate.openers_proven?.length) {
      openerPool = rawTemplate.openers_proven;
    } else if (isSocialOnly && rawTemplate.openers_social?.length) {
      openerPool = rawTemplate.openers_social;
    }
    const openerIdx = seed % openerPool.length;
    const selectedOpener = openerPool[openerIdx] || 'Halo Kak...';

    // B. Pilih Pitch (memuat concrete_offer)
    let pitchPool: string[] = rawTemplate.pitches_standard || [];
    if (isSocialOnly && rawTemplate.pitches_social?.length) {
      pitchPool = rawTemplate.pitches_social;
    }
    const pitchIdx = Math.floor(seed / openerPool.length) % pitchPool.length;
    const selectedPitch = pitchPool[pitchIdx] || 'Saya ada menyiapkan konsep website...';

    // C. Pilih Closer
    const closerPool: string[] = rawTemplate.closers || [];
    const closerIdx = Math.floor(seed / (openerPool.length * pitchPool.length)) % closerPool.length;
    const selectedCloser = closerPool[closerIdx] || 'Kalau sedang tidak membutuhkan, abaikan saja ya Kak.';

    // Susun template step 1 utuh (Maksimal 3-4 kalimat pendek dan tepat satu pertanyaan)
    const templateStep1 = `${selectedOpener} ${selectedPitch} ${selectedCloser}`;
    const templateStep2 = rawTemplate.step2_followup1;
    const templateStep3 = rawTemplate.step3_followup2;

    const senderName = input.senderName || config.senderName || 'Radif';
    const senderRole = input.senderRole || config.senderRole || 'freelance web developer di Jember';
    const concreteOffer = input.categoryConfig.concreteOffer || 'katalog dan kontak WhatsApp praktis';
    const ratingStr = input.rating ? `${input.rating.toFixed(1)}` : 'bagus';
    const reviewsStr = input.reviewCount ? `${input.reviewCount}` : 'beberapa';
    const serviceName = input.categoryConfig.recommendedService;
    const systemFeature = input.categoryConfig.highValueSystems[0] || 'katalog dan kontak WhatsApp praktis';
    const highlight = input.categoryConfig.defaultHighlight;
    const provenQuote = input.evidence?.evidenceQuotes?.[0]?.quote || '';

    const replacePlaceholders = (text: string): string => {
      return text
        .replace(/\{\{sender_name\}\}/g, senderName)
        .replace(/\{\{sender_role\}\}/g, senderRole)
        .replace(/\{\{business_name\}\}/g, input.businessName)
        .replace(/\{\{area_phrase\}\}/g, areaPhrase)
        .replace(/\{\{area\}\}/g, input.area || 'Jember')
        .replace(/\{\{social_platform\}\}/g, socialPlatform)
        .replace(/\{\{concrete_offer\}\}/g, concreteOffer)
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
