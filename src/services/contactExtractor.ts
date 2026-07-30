import axios from 'axios';

export interface EnrichedContacts {
  rawPhone?: string;
  whatsappNumber?: string;
  whatsappUrl?: string;
  email?: string;
  instagramUrl?: string;
}

export class ContactExtractor {
  /**
   * Normalizes any Indonesian phone number string to 628... format.
   * e.g., "0812-3456-7890" => "6281234567890"
   * "+62 812 3456 7890" => "6281234567890"
   */
  public normalizeWhatsAppNumber(phoneStr: string): { cleanNumber: string; waUrl: string } | null {
    if (!phoneStr || phoneStr.toLowerCase() === 'unknown') return null;

    // Strip all non-digit characters
    let digits = phoneStr.replace(/\D/g, '');

    if (!digits) return null;

    // Convert local 08xxx or 8xxx to 628xxx
    if (digits.startsWith('0')) {
      digits = '62' + digits.substring(1);
    } else if (digits.startsWith('8')) {
      digits = '62' + digits;
    }

    // Indonesian mobile numbers start with 628 and are usually 10 to 15 digits
    if (digits.startsWith('628') && digits.length >= 10 && digits.length <= 15) {
      return {
        cleanNumber: digits,
        waUrl: `https://wa.me/${digits}`,
      };
    }

    return null;
  }

  /**
   * Fetches website content and extracts emails, WA links, and social links via regex
   */
  public async extractFromWebsite(websiteUrl: string): Promise<EnrichedContacts> {
    const contacts: EnrichedContacts = {};

    if (!websiteUrl) return contacts;

    if (websiteUrl.includes('instagram.com')) {
      contacts.instagramUrl = websiteUrl;
      return contacts;
    }

    if (websiteUrl.includes('facebook.com') || websiteUrl.includes('twitter.com') || websiteUrl.includes('x.com')) {
      return contacts;
    }

    try {
      const targetUrl = websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`;
      const response = await axios.get(targetUrl, {
        timeout: 6000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        maxRedirects: 3,
        validateStatus: () => true, // Don't throw errors on HTTP status codes
      });

      if (typeof response.data !== 'string') return contacts;

      const html = response.data;

      // 1. Extract Email
      const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
      const emails = html.match(emailRegex);
      if (emails && emails.length > 0) {
        const validEmails = emails.filter((e) =>
          !e.endsWith('.png') &&
          !e.endsWith('.jpg') &&
          !e.endsWith('.jpeg') &&
          !e.endsWith('.gif') &&
          !e.endsWith('.svg') &&
          !e.includes('w3.org') &&
          !e.includes('schema.org') &&
          !e.includes('sentry')
        );
        if (validEmails.length > 0) {
          contacts.email = validEmails[0];
        }
      }

      // 2. Extract WhatsApp links in website HTML (wa.me/..., api.whatsapp.com/send..., wa.wizard.id/...)
      const waRegex = /(?:wa\.me\/|api\.whatsapp\.com\/send\?phone=|wa\.wizard\.id\/)(\d+)/i;
      const waMatch = html.match(waRegex);
      if (waMatch && waMatch[1]) {
        const waNorm = this.normalizeWhatsAppNumber(waMatch[1]);
        if (waNorm) {
          contacts.whatsappNumber = waNorm.cleanNumber;
          contacts.whatsappUrl = waNorm.waUrl;
        }
      }

      // 3. Extract Instagram Link if present in footer/header
      const igRegex = /(https?:\/\/(?:www\.)?instagram\.com\/[a-zA-Z0-9._-]+)/i;
      const igMatch = html.match(igRegex);
      if (igMatch && igMatch[1]) {
        contacts.instagramUrl = igMatch[1];
      }
    } catch (err: any) {
      // Website crawl failed gracefully
    }

    return contacts;
  }

  /**
   * Enriches lead with normalized phone, website contacts, and WhatsApp direct URL
   */
  public async enrichLeadContacts(phoneStr?: string, websiteUrl?: string): Promise<EnrichedContacts> {
    const contacts: EnrichedContacts = {
      rawPhone: phoneStr,
    };

    // 1. Try to normalize phone number from Google Maps / Twitter contact info
    if (phoneStr) {
      const waNorm = this.normalizeWhatsAppNumber(phoneStr);
      if (waNorm) {
        contacts.whatsappNumber = waNorm.cleanNumber;
        contacts.whatsappUrl = waNorm.waUrl;
      }
    }

    // 2. Try to scrape website for deeper contacts (email, extra WA link, IG)
    if (websiteUrl) {
      const webContacts = await this.extractFromWebsite(websiteUrl);
      if (!contacts.whatsappUrl && webContacts.whatsappUrl) {
        contacts.whatsappNumber = webContacts.whatsappNumber;
        contacts.whatsappUrl = webContacts.whatsappUrl;
      }
      if (webContacts.email) contacts.email = webContacts.email;
      if (webContacts.instagramUrl) contacts.instagramUrl = webContacts.instagramUrl;
    }

    return contacts;
  }
}
