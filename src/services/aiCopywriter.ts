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

    const systemPrompt = `You are a Senior Tech Sales Copywriter specializing in outreach to local UMKM (Small-Medium Businesses) in Jember, East Java, Indonesia.
Your task is to write a highly personalized, polite, and persuasive outreach message in Bahasa Indonesia offering a professional, affordable custom Landing Page or Company Profile website.

Guidelines:
- Tone: Formal yet warm, respectful, and supportive local Indonesian business language ("Halo Tim [Nama Usaha]", "rekan-rekan", "kak", "Anda", "kami").
- Avoid robotic or overly aggressive sales phrasing (do NOT use "Saya menulis untuk Anda..." or "Kami adalah agensi terkemuka...").
- Keep it concise (around 100-140 words), perfectly formatted for a WhatsApp message or short email.
- Highlight the unique value for UMKM in Jember:
  * Membangun kredibilitas bisnis di mata calon pelanggan lokal Jember.
  * Memajang katalog produk, menu, foto portofolio, atau pricelist secara rapi tanpa batasan feed medsos.
  * Tombol otomatis terhubung langsung ke WhatsApp pemesanan/konsultasi agar closing order lebih cepat.
  * Tampil lebih profesional saat dicari di Google / Google Maps.

Outreach Message Structure:
1. Sapaan ramah: e.g. "Halo Tim [Nama Bisnis] di Jember,"
2. Apresiasi produk/layanan mereka yang menarik di Jember.
3. Soroti secara halus bahwa saat ini bisnis mereka belum memiliki website landing page/company profile resmi mandiri (hanya mengandalkan profil Google Maps / Instagram / WhatsApp).
4. Tawarkan solusi praktis: Pembuatan Landing Page / Company Profile modern, responsif di HP, dan siap pakai.
5. Soft Call to Action (CTA): Mengajak diskusi santai 5 menit via WhatsApp.

Return ONLY the final outreach message text. No labels, no explanations, no markdown code fences.`;

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
    const cta = '\n\nJika Tim sekalian berkenan, bolehkah saya kirimkan portofolio contoh landing page dan ngobrol santai 5 menit via WhatsApp?\n\nSalam hangat,\n[Nama Anda]';

    if (lead.source === 'Twitter') {
      const intro = `Halo Kak ${name},\n\nSemoga Kakak dalam keadaan sehat selalu. Saya melihat postingan Kakak di Twitter/X terkait kebutuhan pembuatan website baru-baru ini.`;
      const body = 'Saya kebetulan berfokus membantu pembuatan website Landing Page & Company Profile profesional yang simpel, modern, dan siap pakai sesuai kebutuhan bisnis Kakak.';
      return `${intro}\n\n${body}${cta}`;
    } else {
      const intro = `Halo Tim ${name} di Jember,\n\nSemoga usaha Anda senantiasa berkembang dan semakin ramai pelanggan. Kami melihat profil bisnis Anda di Jember memiliki produk/layanan yang sangat menarik.`;
      
      let body = '';
      if (lead.audit.status === 'NO_CUSTOM_WEBSITE') {
        body = `Saat ini kami melihat ${name} belum memiliki website landing page atau company profile resmi mandiri. Kami ingin menawarkan pembuatan Landing Page / Company Profile profesional yang ringan, rapi di smartphone, dan langsung terhubung ke tombol chat WhatsApp pesanan. Dengan website resmi, calon pembeli di Jember dapat melihat katalog produk dan profil bisnis Anda dengan jauh lebih percaya.`;
      } else if (lead.audit.status === 'DOWN') {
        body = `Kami memperhatikan bahwa tautan website resmi Anda saat ini sedang tidak dapat diakses. Kami ingin menawarkan bantuan teknis cepat (Bug Fixing) atau pembuatan ulang landing page agar calon pembeli tidak beralih ke kompetitor saat ingin menghubungi bisnis Anda.`;
      } else {
        body = `Kami ingin menawarkan pembuatan Landing Page modern untuk memperkuat branding ${name} di Jember serta mempermudah pelanggan melakukan pemesanan via WhatsApp.`;
      }

      return `${intro}\n\n${body}${cta}`;
    }
  }
}
