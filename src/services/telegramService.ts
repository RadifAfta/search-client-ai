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

    // Build the rich HTML message body
    const messageText = [
      '🚀 <b>LEAD BARU DITEMUKAN!</b>',
      '',
      `<b>Nama Bisnis:</b> ${name}`,
      `<b>Sumber:</b> ${source}`,
      `<b>Pain Point:</b> ${painPoint}`,
      `<b>Rekomendasi:</b> ${service}`,
      '',
      '<b>Draf Proposal:</b>',
      `<blockquote>${proposal}</blockquote>`,
    ].join('\n');

    try {
      console.log(`   📤 Sending Telegram notification to Chat ID: ${this.chatId}...`);
      await this.bot.telegram.sendMessage(this.chatId, messageText, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🌐 Buka Link Target', url: lead.referenceUrl }
            ],
            [
              { text: '✅ Siap Kirim', callback_data: `lead_ready:${lead.contactInfo.substring(0, 30)}` }
            ]
          ]
        }
      });
      console.log('      Telegram notification sent successfully.');
      return true;
    } catch (err: any) {
      console.error(`❌ Failed to send Telegram message for "${lead.name}":`, err.message || err);
      return false;
    }
  }
}
