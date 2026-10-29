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
      step1: "Halo Kak, salam kenal. Saya melihat profil {{business_name}} di {{area}} dengan rating {{rating}} ({{review_count}} ulasan). Kebetulan saya membuat contoh konsep website {{service_name}} yang bisa disesuaikan dengan logo dan produk Kakak, boleh saya kirimkan tautan contohnya untuk dilihat santai? Bila tidak membutuhkan, abaikan saja ya Kak.",
      step1_fallback: "Halo Kak, salam kenal. Saya melihat profil {{business_name}} di {{area}} dengan {{highlight}}. Kebetulan saya membuat contoh tampilan website yang bisa disesuaikan dengan brand Kakak, boleh saya kirimkan preview-nya? Bila tidak butuh, abaikan saja ya Kak.",
      step2_followup1: "Halo Kak, menyambung pesan 3 hari lalu terkait konsep website untuk {{business_name}}. Saya siapkan contoh fitur praktis seperti {{system_feature}} untuk mempermudah pelanggan. Jika Kakak berkenan meluangkan waktu 2 menit, saya siap bagikan tautannya tanpa komitmen apa pun.",
      step3_followup2: "Halo Kak di {{business_name}}, izin follow up terakhir agar tidak mengganggu waktu Kakak. Jika saat ini belum ada rencana pengembangan website atau sistem digital, tidak masalah sama sekali ya Kak. Sukses selalu untuk usahanya!"
    };
  }

  /**
   * Menyusun urutan 3 tahap pesan outreach berdasarkan data nyata bisnis
   */
  public buildSequence(input: {
    businessName: string;
    area?: string;
    rating?: number;
    reviewCount?: number;
    primaryChannel: OutreachChannel;
    categoryConfig: CategoryConfig;
    evidence?: PainPointEvidence;
    isPersonalizedDemo?: boolean;
  }): MessageSequence {
    const rawTemplate = this.loadTemplate(input.primaryChannel);
    const hasRatingData = typeof input.rating === 'number' && input.rating > 0 && typeof input.reviewCount === 'number';

    // Pilih template step 1: jika ada rating riil, gunakan data rating; jika tidak, gunakan fallback netral
    let templateStep1 = hasRatingData ? rawTemplate.step1 : rawTemplate.step1_fallback;
    let templateStep2 = rawTemplate.step2_followup1;
    let templateStep3 = rawTemplate.step3_followup2;

    const area = input.area || 'Jember';
    const ratingStr = input.rating ? `${input.rating.toFixed(1)}` : 'bagus';
    const reviewsStr = input.reviewCount ? `${input.reviewCount}` : 'beberapa';
    const serviceName = input.categoryConfig.recommendedService;
    const systemFeature = input.categoryConfig.highValueSystems[0] || 'katalog dan kontak WhatsApp praktis';
    const highlight = input.categoryConfig.defaultHighlight;

    const replacePlaceholders = (text: string): string => {
      return text
        .replace(/\{\{business_name\}\}/g, input.businessName)
        .replace(/\{\{area\}\}/g, area)
        .replace(/\{\{rating\}\}/g, ratingStr)
        .replace(/\{\{review_count\}\}/g, reviewsStr)
        .replace(/\{\{service_name\}\}/g, serviceName)
        .replace(/\{\{system_feature\}\}/g, systemFeature)
        .replace(/\{\{highlight\}\}/g, highlight);
    };

    const step1 = replacePlaceholders(templateStep1);
    const step2 = replacePlaceholders(templateStep2);
    const step3 = replacePlaceholders(templateStep3);

    // Validasi klaim pada step 1
    const validation = validateMessageClaims(step1, {
      rating: input.rating,
      reviewCount: input.reviewCount,
      hasProvenEvidence: input.evidence?.isProven,
      isPersonalizedDemo: input.isPersonalizedDemo,
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

