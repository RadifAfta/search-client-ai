import { Telegraf } from 'telegraf';
import { Config } from '../config';
import { QualifiedLead } from '../index';

export class TelegramService {
  private config: Config;
  private bot: Telegraf | null = null;
  private chatId: string | null = null;

  constructor(config: Config) {
    this.config = config;
    if (this.config.telegramBotToken && this.config.telegramChatId) {
      this.bot = new Telegraf(this.config.telegramBotToken);
      this.chatId = this.config.telegramChatId;
    }
  }

  /**
   * Helper function to escape HTML characters for Telegram HTML mode
   */
  private escapeHTML(text: string): string {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /**
   * Formats and sends a qualified lead notification to Telegram
   */
  public async sendLeadNotification(lead: QualifiedLead): Promise<boolean> {
    if (!this.bot || !this.chatId) {
      console.warn(`⚠️ Telegram Service not fully configured. Skipping notification for "${lead.name}".`);
      return false;
    }

    const name = this.escapeHTML(lead.name);
    const source = this.escapeHTML(lead.source);
    const painPoint = this.escapeHTML(lead.qualification.painPointDetected);
    const service = this.escapeHTML(lead.qualification.recommendedService || 'None');
    const proposal = this.escapeHTML(lead.proposalText || 'Tidak ada draf proposal.');

    // Extracted contacts formatting
    const rawContact = this.escapeHTML(lead.contactInfo);
    const waUrl = lead.contacts?.whatsappUrl;
    const waNum = lead.contacts?.whatsappNumber ? this.escapeHTML(lead.contacts.whatsappNumber) : null;
    const email = lead.contacts?.email ? this.escapeHTML(lead.contacts.email) : null;
    const instagram = lead.contacts?.instagramUrl ? this.escapeHTML(lead.contacts.instagramUrl) : null;

    let contactBlock = `<b>Kontak Utama:</b> ${rawContact}`;
    if (waNum) contactBlock += `\n<b>WhatsApp:</b> +${waNum}`;
    if (email) contactBlock += `\n<b>Email:</b> ${email}`;
    if (instagram) contactBlock += `\n<b>Instagram:</b> ${instagram}`;

    // Build the rich HTML message body
    const messageText = [
      '🚀 <b>LEAD BARU DITEMUKAN!</b>',
      '',
      `<b>Nama Bisnis:</b> ${name}`,
      `<b>Sumber:</b> ${source}`,
      contactBlock,
      `<b>Pain Point:</b> ${painPoint}`,
      `<b>Rekomendasi:</b> ${service}`,
      '',
      '<b>Draf Proposal:</b>',
      `<blockquote>${proposal}</blockquote>`,
    ].join('\n');

    // Inline buttons setup
    const buttons: any[][] = [];

    // WhatsApp Direct button if WA URL exists
    if (waUrl) {
      buttons.push([{ text: `💬 Chat WhatsApp (+${waNum || 'Direct'})`, url: waUrl }]);
    }

    // Reference URL button
    if (lead.referenceUrl) {
      buttons.push([{ text: '🌐 Buka Link Target/Website', url: lead.referenceUrl }]);
    }

    try {
      console.log(`   📤 Sending Telegram notification to Chat ID: ${this.chatId}...`);
      await this.bot.telegram.sendMessage(this.chatId, messageText, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: buttons,
        },
      });
      console.log('      Telegram notification sent successfully.');
      return true;
    } catch (err: any) {
      console.error(`❌ Failed to send Telegram message for "${lead.name}":`, err.message || err);
      return false;
    }
  }
}
