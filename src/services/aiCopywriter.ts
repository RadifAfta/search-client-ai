import Groq from 'groq-sdk';
import { Config } from '../config';
import { QualifiedLead } from '../index';

export class AICopywriter {
  private config: Config;
  private groqClient: Groq | null = null;

  constructor(config: Config) {
    this.config = config;
    if (this.config.groqApiKey) {
      this.groqClient = new Groq({
        apiKey: this.config.groqApiKey,
      });
    }
  }

  /**
   * Generates a personalized sales pitch proposal in Indonesian.
   * Leverages Llama 3 70B via Groq, with a robust local fallback template system.
   */
  public async generateProposal(lead: QualifiedLead): Promise<string> {
    // Check if the lead is qualified for pitching
    if (!lead.qualification.shouldPitch) {
      return '';
    }

    if (!this.groqClient) {
      return this.getFallbackProposal(lead);
    }

    const systemPrompt = `You are a Senior Tech Sales Copywriter specializing in the Indonesian market.
Your task is to write a highly personalized, polite, and persuasive cold outreach proposal in Bahasa Indonesia (using formal yet warm business-appropriate Indonesian: "tim", "rekan-rekan", "kak", "Anda", "kami").

Guidelines:
- DO NOT sound like a robotic machine translation (avoid phrases like "Saya menulis untuk Anda..." or "Kami adalah penyedia terkemuka...").
- Keep it concise (around 100-150 words). It must fit easily into a WhatsApp message, Instagram DM, or short email.
- Tone should be respectful (sopan), appreciative, and supportive. Use warm local business expressions like "Semoga bisnis berjalan lancar" or "izin menyampaikan masukan/penawaran".

Outreach Message Structure:
1. Greet the business politely (e.g. "Halo Tim [Nama Toko/Bisnis]" or "Halo Kak [Username/Nama]").
2. Appreciate their presence or product (e.g. "Instagram bisnis Anda memiliki konten yang sangat menarik..." or "Kami menyukai koleksi produk butik Anda...").
3. Gently highlight the specific pain point discovered:
   - For social links: They rely on Instagram/Facebook and lack a dedicated custom website (e.g., "belum memiliki landing page mandiri untuk memproses pesanan").
   - For broken sites: Their website is down/cannot be reached (e.g., "website resmi saat ini sedang tidak dapat diakses").
   - For revamp needs: Their website needs optimization or new features to increase sales.
4. Pitch the recommended service (New Website Development, Website Revamp, or Bug Fixing) as a helpful, practical solution.
5. End with a soft Call to Action (CTA) for a short chat (e.g. inviting them for a 10-minute casual discussion via WhatsApp/Zoom).

Return ONLY the final generated outreach proposal message text. No explanations, no labels, no markdown formatting.`;

    const userMessage = {
      leadSource: lead.source,
      businessName: lead.name,
      keyword: lead.keyword,
      url: lead.referenceUrl,
      painPoint: lead.qualification.painPointDetected,
      recommendedService: lead.qualification.recommendedService,
      auditStatus: lead.audit.status,
    };

    try {
      const response = await this.groqClient.chat.completions.create({
        model: this.config.groqModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: JSON.stringify(userMessage) },
        ],
        temperature: 0.7, // Add a bit of creativity for copywriting
      });

      const proposal = response.choices[0]?.message?.content?.trim();
      if (!proposal) {
        throw new Error('Groq returned an empty text response.');
      }

      return proposal;
    } catch (err: any) {
      console.error(`⚠️ AI Proposal generation failed for "${lead.name}":`, err.message || err);
      return this.getFallbackProposal(lead);
    }
  }

  /**
   * Generates a natural, human-written Indonesian outreach proposal using local templates
   */
  private getFallbackProposal(lead: QualifiedLead): string {
    const name = lead.name;
    const service = lead.qualification.recommendedService;
    const cta = '\n\nJika Tim sekalian tertarik, bolehkah saya mengundang Anda untuk diskusi santai selama 5-10 menit via WhatsApp atau Zoom minggu depan?\n\nSalam hangat,\n[Nama Anda]';

    if (lead.source === 'Twitter') {
      const intro = `Halo Kak ${name},\n\nSemoga Kakak dalam keadaan sehat selalu. Saya melihat postingan Kakak di Twitter/X terkait kebutuhan bantuan developer baru-baru ini.`;
      
      let body = '';
      if (service === 'Bug Fixing') {
        body = 'Saya kebetulan memiliki spesialisasi di perbaikan kendala teknis cepat (Bug Fixing) dan optimasi website. Saya ingin menawarkan bantuan untuk menyelesaikan masalah teknis tersebut agar sistem Kakak berjalan lancar kembali.';
      } else {
        body = 'Saya kebetulan fokus membantu pembuatan website kustom (New Website Development) yang responsif, modern, dan siap pakai sesuai kebutuhan bisnis Kakak.';
      }

      return `${intro}\n\n${body}${cta}`;
    } else {
      const intro = `Halo Tim ${name},\n\nSemoga bisnis Anda sedang berjalan dengan lancar. Kami sangat mengagumi produk/layanan yang Anda tawarkan ke publik.`;
      
      let body = '';
      if (lead.audit.status === 'NO_CUSTOM_WEBSITE') {
        body = `Kami melihat ${name} memiliki kehadiran media sosial yang sangat baik, namun saat ini masih mengandalkan Instagram dan belum memiliki website kustom resmi sendiri. Kami ingin menawarkan solusi pembuatan website/landing page profesional agar bisnis Anda terlihat lebih kredibel dan dapat memudahkan pembeli melakukan pemesanan secara otomatis.`;
      } else if (lead.audit.status === 'DOWN') {
        body = `Kami memperhatikan bahwa link website resmi Anda saat ini sedang tidak dapat diakses. Kami ingin membantu Anda melakukan perbaikan teknis cepat (Bug Fixing) atau penataan ulang web (Website Revamp) agar para pelanggan bisa kembali mengunjungi website Anda tanpa hambatan.`;
      } else {
        body = `Kami melihat website resmi Anda sudah berjalan dengan baik. Kami ingin menawarkan penataan ulang performa (Website Revamp) untuk meningkatkan kecepatan loading website, kenyamanan navigasi, dan pada akhirnya membantu mendongkrak konversi penjualan produk Anda.`;
      }

      return `${intro}\n\n${body}${cta}`;
    }
  }
}
