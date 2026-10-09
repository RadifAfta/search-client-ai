import * as fs from 'fs';
import * as path from 'path';
import { chromium } from 'playwright';
import { ContactExtractor } from '../src/services/contactExtractor';

interface LeadRecord {
  referenceUrl: string;
  name: string;
  source: string;
  processedAt: string;
  phone?: string;
  whatsappUrl?: string;
  address?: string;
  instagramUrl?: string;
}

async function main() {
  const filePath = path.join(__dirname, '../data/processed_leads.json');
  const records: LeadRecord[] = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

  const extractor = new ContactExtractor();

  console.log(`🚀 Extracting LIVE Contact Info (WA & Instagram) for ${records.length} businesses...\n`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });

  const results: Array<{
    name: string;
    waUrl?: string;
    phone?: string;
    instagramUrl?: string;
    address?: string;
    status: string;
  }> = [];

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    console.log(`[${i + 1}/${records.length}] 🔍 Checking "${record.name}"...`);

    let waUrl: string | undefined = undefined;
    let phone: string | undefined = undefined;
    let instagramUrl: string | undefined = undefined;
    let address: string | undefined = undefined;

    // Check if reference is direct WA or IG
    if (record.referenceUrl.includes('wa.me')) {
      const match = record.referenceUrl.match(/wa\.me\/(\d+)/);
      if (match && match[1]) {
        const norm = extractor.normalizeWhatsAppNumber(match[1]);
        if (norm) {
          waUrl = norm.waUrl;
          phone = norm.cleanNumber;
        }
      }
    } else if (record.referenceUrl.includes('instagram.com')) {
      instagramUrl = record.referenceUrl;
    }

    // If it's a Google Maps URL, fetch the card details
    if (record.referenceUrl.includes('google.com/maps') || record.referenceUrl.includes('goo.gl')) {
      const page = await context.newPage();
      try {
        await page.goto(record.referenceUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(2500);

        // Phone
        const phoneEl = page.locator('[data-item-id^="phone:tel:"]').first();
        if (await phoneEl.isVisible()) {
          const rawPhone = await phoneEl.innerText();
          const cleanPhone = rawPhone.replace(/[^\d+]/g, '');
          phone = cleanPhone;
          const norm = extractor.normalizeWhatsAppNumber(cleanPhone);
          if (norm) {
            waUrl = norm.waUrl;
          }
        }

        // Address
        const addrEl = page.locator('[data-item-id="address"]').first();
        if (await addrEl.isVisible()) {
          address = (await addrEl.innerText()).replace(/^[^\w\d]+/, '').trim();
        }

        // Website / Social
        const authEl = page.locator('[data-item-id="authority"]').first();
        if (await authEl.isVisible()) {
          const webHref = (await authEl.getAttribute('href')) || '';
          if (webHref.includes('instagram.com')) {
            instagramUrl = webHref;
          } else if (webHref.includes('wa.me')) {
            const norm = extractor.normalizeWhatsAppNumber(webHref);
            if (norm) waUrl = norm.waUrl;
          }
        }
      } catch (err: any) {
        console.error(`   ⚠️ Failed to load maps page:`, err.message || err);
      } finally {
        await page.close();
      }
    } else if (record.referenceUrl.startsWith('http') && !record.referenceUrl.includes('instagram.com')) {
      // It's a blog / bitly link
      const page = await context.newPage();
      try {
        await page.goto(record.referenceUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
        const content = await page.content();
        const extracted = await extractor.extractFromWebsite(page.url());
        if (extracted.whatsappUrl) waUrl = extracted.whatsappUrl;
        if (extracted.whatsappNumber) phone = extracted.whatsappNumber;
        if (extracted.instagramUrl) instagramUrl = extracted.instagramUrl;
      } catch (err: any) {
        // ignore
      } finally {
        await page.close();
      }
    }

    record.phone = phone;
    record.whatsappUrl = waUrl;
    record.address = address;
    record.instagramUrl = instagramUrl;

    const status = waUrl ? '✅ WA Siap' : (instagramUrl ? '📸 IG Siap' : '⚠️ Hanya Maps');
    console.log(`   -> Hasil: ${status} | WA: ${waUrl || phone || '-'} | IG: ${instagramUrl || '-'}`);

    results.push({
      name: record.name,
      waUrl,
      phone,
      instagramUrl,
      address,
      status,
    });
  }

  await browser.close();

  // Save enriched leads back to processed_leads.json
  fs.writeFileSync(filePath, JSON.stringify(records, null, 2), 'utf-8');

  // Update BUSINESS_BRIEF.md for each business with real contacts
  console.log('\n📝 Updating BUSINESS_BRIEF.md files with extracted contacts...');
  const briefsDir = path.join(process.cwd(), 'briefs');

  for (const item of records) {
    const slug = item.name
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');

    const briefFile = path.join(briefsDir, slug, 'BUSINESS_BRIEF.md');
    if (fs.existsSync(briefFile)) {
      let content = fs.readFileSync(briefFile, 'utf-8');

      // Replace WA line
      if (item.whatsappUrl || item.phone) {
        const waText = item.whatsappUrl || `+${item.phone}`;
        content = content.replace(/- WA:[^\n]*/i, `- WA: ${waText}`);
      }

      // Replace IG line
      if (item.instagramUrl) {
        content = content.replace(/- Instagram:[^\n]*/i, `- Instagram: ${item.instagramUrl}`);
      }

      // Replace Address line
      if (item.address) {
        content = content.replace(/- Alamat lengkap:[^\n]*/i, `- Alamat lengkap: ${item.address}`);
      }

      fs.writeFileSync(briefFile, content, 'utf-8');
    }
  }

  console.log('\n========================================================');
  console.log('🎉 DAFTAR KONTAK LENGKAP YANG BISA DIHUBUNGI UNTUK PROPOSAL:');
  console.log('========================================================\n');

  console.log(JSON.stringify(results, null, 2));
}

main().catch(console.error);
