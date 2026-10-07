import * as fs from 'fs';
import * as path from 'path';
import { config } from '../src/config';
import { BusinessBriefService } from '../src/services/businessBriefService';
import { ContactExtractor } from '../src/services/contactExtractor';
import { UnifiedLead } from '../src/index';

interface ProcessedRecord {
  referenceUrl: string;
  name: string;
  source: string;
  processedAt: string;
}

async function main() {
  console.log('🚀 Generating BUSINESS_BRIEF.md for all recorded businesses in data/processed_leads.json...\n');

  const filePath = path.join(__dirname, '../data/processed_leads.json');
  if (!fs.existsSync(filePath)) {
    console.error('❌ File data/processed_leads.json not found!');
    return;
  }

  const rawData = fs.readFileSync(filePath, 'utf-8');
  const records: ProcessedRecord[] = JSON.parse(rawData);

  console.log(`Found ${records.length} businesses to generate briefs for.`);

  const briefService = new BusinessBriefService(config);
  const contactExtractor = new ContactExtractor();

  const generatedBriefs: Array<{ name: string; folder: string; filePath: string }> = [];

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    console.log(`\n[${i + 1}/${records.length}] 🏢 Processing: "${record.name}"...`);

    // Determine basic keyword/category from name
    let keyword = 'UMKM Jember';
    const lower = record.name.toLowerCase();
    if (lower.includes('oleh')) keyword = 'Oleh-oleh Khas Jember';
    else if (lower.includes('cafe') || lower.includes('coffee')) keyword = 'Cafe Jember';
    else if (lower.includes('katering') || lower.includes('catering')) keyword = 'Catering Jember';
    else if (lower.includes('wedding') || lower.includes('organizer')) keyword = 'Wedding Organizer Jember';
    else if (lower.includes('percetakan') || lower.includes('printing')) keyword = 'Percetakan Jember';
    else if (lower.includes('konveksi') || lower.includes('garment') || lower.includes('cloth')) keyword = 'Konveksi Jember';
    else if (lower.includes('klinik') || lower.includes('beauty') || lower.includes('kecantikan')) keyword = 'Klinik Kecantikan Jember';
    else if (lower.includes('resto')) keyword = 'Resto Jember';
    else if (lower.includes('bengkel') || lower.includes('mobil') || lower.includes('motor')) keyword = 'Bengkel Mobil Jember';

    // Enrich contacts
    const isMaps = record.referenceUrl.includes('google.com/maps') || record.referenceUrl.includes('goo.gl');
    const isIg = record.referenceUrl.includes('instagram.com');
    const isWa = record.referenceUrl.includes('wa.me');

    const contacts = await contactExtractor.enrichLeadContacts(
      undefined,
      isIg || isWa ? record.referenceUrl : undefined
    );

    if (isMaps) {
      contacts.whatsappUrl = contacts.whatsappUrl || undefined;
    }

    const lead: UnifiedLead = {
      source: (record.source as any) || 'GoogleMaps',
      name: record.name,
      keyword,
      contactInfo: contacts.whatsappNumber || 'Jember',
      referenceUrl: record.referenceUrl,
      mapsUrl: isMaps ? record.referenceUrl : undefined,
      websiteUrl: isIg || isWa ? undefined : record.referenceUrl,
      contacts,
    };

    try {
      const { filePath, content } = await briefService.generateAndSaveBrief(lead);
      const slug = briefService.generateSlug(lead.name);
      console.log(`   ✅ Brief created: briefs/${slug}/BUSINESS_BRIEF.md`);
      generatedBriefs.push({
        name: lead.name,
        folder: slug,
        filePath,
      });

      // Small delay between LLM calls to prevent rate limits
      await new Promise((r) => setTimeout(r, 1200));
    } catch (err: any) {
      console.error(`   ❌ Failed to generate brief for "${record.name}":`, err.message || err);
    }
  }

  // Create an index file in briefs/README.md
  const briefsDir = path.join(process.cwd(), 'briefs');
  let indexContent = `# DAFTAR BUSINESS BRIEF UMKM JEMBER\n\n`;
  indexContent += `Total Dokumen Brief: **${generatedBriefs.length} Bisnis**\n\n`;
  indexContent += `| No | Nama Bisnis | Folder | Tautan Dokumen |\n`;
  indexContent += `|---|---|---|---|\n`;

  generatedBriefs.forEach((item, idx) => {
    indexContent += `| ${idx + 1} | **${item.name}** | \`${item.folder}\` | [BUSINESS_BRIEF.md](./${item.folder}/BUSINESS_BRIEF.md) |\n`;
  });

  fs.writeFileSync(path.join(briefsDir, 'README.md'), indexContent, 'utf-8');

  console.log(`\n==================================================`);
  console.log(`🎉 Berhasil membuat ${generatedBriefs.length} BUSINESS_BRIEF.md!`);
  console.log(`📑 Index daftar brief tersedia di: briefs/README.md`);
  console.log(`==================================================\n`);
}

main().catch((err) => {
  console.error('Fatal error in generator:', err);
  process.exit(1);
});
