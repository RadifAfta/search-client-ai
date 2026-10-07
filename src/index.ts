import { config, validateConfig } from './config';
import { TwitterScraper } from './scrapers/twitterScraper';
import { GoogleMapsScraper } from './scrapers/googleMapsScraper';
import { auditWebsite, AuditResult } from './auditors/webAuditor';
import { AIFilter, AIQualification } from './services/aiFilter';
import { AICopywriter } from './services/aiCopywriter';
import { TelegramService } from './services/telegramService';
import { isLeadProcessed, saveProcessedLead } from './database/localDb';
import { ContactExtractor, EnrichedContacts } from './services/contactExtractor';
import { BusinessBriefService } from './services/businessBriefService';

export interface UnifiedLead {
  source: 'Twitter' | 'GoogleMaps';
  keyword: string;
  name: string;           // Display Name (Twitter) or Business Name (Google Maps)
  contactInfo: string;    // Username (Twitter) or Phone Number (Google Maps)
  referenceUrl: string;   // Tweet URL, Website URL, or Google Maps Place URL
  websiteUrl?: string;    // Business Website / Medsos URL (if any)
  mapsUrl?: string;       // Direct Google Maps listing URL
  address?: string;       // Physical address or area (Google Maps)
  category?: string;      // Business category (Google Maps)
  openingHours?: string;  // Operating hours (Google Maps)
  description?: string;   // Tweet content or niche keyword
  timestamp?: string;     // ISO timestamp (Twitter only)
  contacts?: EnrichedContacts; // Extracted WhatsApp, Email, and Social contacts
}

export interface QualifiedLead extends UnifiedLead {
  audit: AuditResult;
  qualification: AIQualification;
  proposalText?: string;  // Generated proposal copy (only if shouldPitch is true)
  briefPath?: string;     // Path to generated BUSINESS_BRIEF.md
}

async function main() {
  console.log('🇮🇩 Starting Indonesian AI Lead Gen Agent - Jember UMKM (Landing Page / Company Profile Focus)...');

  // Validate environment configurations
  validateConfig();

  // 1. Target queries for Twitter/X
  const twitterKeywords = [
    'butuh website jember',
    'jasa bikin website jember',
    'bikin landing page jember',
    'jasa web company profile jember',
    'butuh web developer jember',
  ];

  // 2. Target high-potential UMKM business queries in Jember for Google Maps
  const mapsKeywords = [
    'Oleh-oleh Khas Jember',
    'Cafe Jember',
    'Catering Jember',
    'Wedding Organizer Jember',
    'Percetakan Jember',
    'Konveksi Jember',
    'Klinik Kecantikan Jember',
    'Resto Jember',
    'Bengkel Mobil Jember',
  ];

  const rawLeads: UnifiedLead[] = [];

  // --- Run Twitter/X Scraper ---
  try {
    const twitterScraper = new TwitterScraper(config);
    console.log('\n🤖 Running Twitter Scraper...');
    // Limit to 2 leads per keyword for demo/development purposes
    const twitterLeads = await twitterScraper.scrapeKeywords(twitterKeywords, 2);

    for (const lead of twitterLeads) {
      rawLeads.push({
        source: 'Twitter',
        keyword: lead.keyword,
        name: lead.author,
        contactInfo: lead.username,
        referenceUrl: lead.tweetUrl,
        description: lead.text,
        timestamp: lead.timestamp,
      });
    }
  } catch (err: any) {
    console.error('❌ Twitter scraper failed:', err.message || err);
  }

  // --- Run Google Maps Scraper ---
  try {
    const mapsScraper = new GoogleMapsScraper(config);
    console.log('\n🤖 Running Google Maps Scraper for UMKM in Jember...');
    // Limit to 3 leads per query for demo/development purposes
    const mapsLeads = await mapsScraper.scrapeKeywords(mapsKeywords, 3);

    for (const lead of mapsLeads) {
      const primaryRef = lead.website || lead.mapsUrl;
      rawLeads.push({
        source: 'GoogleMaps',
        keyword: lead.keyword,
        name: lead.name,
        contactInfo: lead.phone,
        referenceUrl: primaryRef,
        websiteUrl: lead.website || undefined,
        mapsUrl: lead.mapsUrl,
        address: lead.address,
        category: lead.category,
        openingHours: lead.openingHours,
        description: `UMKM Jember (${lead.keyword})`,
      });
    }
  } catch (err: any) {
    console.error('❌ Google Maps scraper failed:', err.message || err);
  }

  // --- Pipe Scraped Leads into Auditor, Contact Enrichment, AI Filter, AI Copywriter, and Business Brief ---
  console.log(`\n==================================================`);
  console.log(`🤖 Processing, Enriching, Qualifying & Generating Briefs for ${rawLeads.length} Leads...`);
  console.log(`==================================================`);

  const qualifiedLeads: QualifiedLead[] = [];
  const aiFilter = new AIFilter(config);
  const aiCopywriter = new AICopywriter(config);
  const telegramService = new TelegramService(config);
  const contactExtractor = new ContactExtractor();
  const businessBriefService = new BusinessBriefService(config);

  for (const lead of rawLeads) {
    // 0. Anti-duplication check: Skip if lead has already been notified
    if (isLeadProcessed(lead.referenceUrl)) {
      console.log(`\n⏭️ Skipping lead (already processed): "${lead.name}" (${lead.referenceUrl})`);
      continue;
    }

    console.log(`\n🔍 Processing: "${lead.name}" (${lead.source})...`);
    
    // 1. Contact Enrichment (WA normalization, Email & Social Extraction)
    console.log(`   📞 Enriching Contact Info...`);
    const contacts = await contactExtractor.enrichLeadContacts(lead.contactInfo, lead.websiteUrl || lead.referenceUrl);
    lead.contacts = contacts;
    if (contacts.whatsappUrl) {
      console.log(`      ✅ Direct WhatsApp URL: ${contacts.whatsappUrl}`);
    }
    if (contacts.email) {
      console.log(`      ✉️ Extracted Email: ${contacts.email}`);
    }

    // 2. Audit URL (Check if business has a custom landing page/website or not)
    const urlToAudit = lead.websiteUrl || lead.referenceUrl;
    console.log(`   🕸️ Auditing URL: ${urlToAudit}`);
    const auditResult = await auditWebsite(urlToAudit);
    console.log(`      Status: ${auditResult.status} | StatusCode: ${auditResult.statusCode || 'None'}`);

    // 3. Qualify using Llama 3 on Groq (Filters specifically for businesses needing landing pages)
    console.log(`   🧠 Qualifying via AI Filter...`);
    const qualification = await aiFilter.qualifyLead(lead, auditResult);
    console.log(`      Should Pitch: ${qualification.shouldPitch} (Confidence: ${qualification.confidenceScore})`);
    console.log(`      Service: ${qualification.recommendedService}`);
    console.log(`      Pain Point: "${qualification.painPointDetected}"`);

    if (!qualification.shouldPitch) {
      console.log(`      ⏭️ Disqualified for pitch (Sudah punya website mandiri aktif atau tidak sesuai kriteria).`);
    }

    // 4. Copywrite proposal if qualified
    let proposalText: string | undefined = undefined;
    if (qualification.shouldPitch) {
      console.log(`   ✍️ Generating personalized pitch proposal...`);
      const tempLead: QualifiedLead = { ...lead, audit: auditResult, qualification };
      proposalText = await aiCopywriter.generateProposal(tempLead);
      console.log(`      Proposal generated successfully (Length: ${proposalText.length} chars).`);
    }

    const fullLead: QualifiedLead = {
      ...lead,
      audit: auditResult,
      qualification,
      proposalText,
    };

    // 5. Generate and Save Business Brief (.md file named BUSINESS_BRIEF.md per business)
    // Note: Telegram dispatch is disabled for now as requested.
    if (qualification.shouldPitch) {
      console.log(`   📋 Generating Business Brief (BUSINESS_BRIEF.md)...`);
      const briefResult = await businessBriefService.generateAndSaveBrief(fullLead);
      fullLead.briefPath = briefResult.filePath;
      console.log(`      ✅ Saved Business Brief to: ${briefResult.filePath}`);
      saveProcessedLead(fullLead);
    }

    qualifiedLeads.push(fullLead);
  }

  // --- Print Final Leads Array with custom Proposals ---
  console.log('\n==================================================');
  console.log(`🎉 Pipeline Completed! Final Leads & Proposals Output:`);
  console.log('==================================================\n');

  console.log(JSON.stringify(qualifiedLeads, null, 2));
}

main().catch((error) => {
  console.error('💥 Execution halted on unexpected error:', error);
  process.exit(1);
});
