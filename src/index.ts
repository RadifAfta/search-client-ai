import { config, validateConfig } from './config';
import { TwitterScraper } from './scrapers/twitterScraper';
import { GoogleMapsScraper } from './scrapers/googleMapsScraper';
import { auditWebsite, AuditResult } from './auditors/webAuditor';
import { AIFilter, AIQualification } from './services/aiFilter';
import { AICopywriter } from './services/aiCopywriter';
import { TelegramService } from './services/telegramService';
import { isLeadProcessed, saveProcessedLead } from './database/localDb';
import { ContactExtractor, EnrichedContacts } from './services/contactExtractor';

export interface UnifiedLead {
  source: 'Twitter' | 'GoogleMaps';
  keyword: string;
  name: string;           // Display Name (Twitter) or Business Name (Google Maps)
  contactInfo: string;    // Username (Twitter) or Phone Number (Google Maps)
  referenceUrl: string;   // Tweet URL or Business Website URL
  description?: string;   // Tweet content or niche keyword
  timestamp?: string;     // ISO timestamp (Twitter only)
  contacts?: EnrichedContacts; // Extracted WhatsApp, Email, and Social contacts
}

export interface QualifiedLead extends UnifiedLead {
  audit: AuditResult;
  qualification: AIQualification;
  proposalText?: string;  // Generated proposal copy (only if shouldPitch is true)
}

async function main() {
  console.log('🇮🇩 Starting Indonesian AI Lead Gen Agent - Bojonegoro Hyper-Local Pipeline with Contact Enrichment...');

  // Validate environment configurations
  validateConfig();

  // 1. Target queries for Twitter/X
  const twitterKeywords = [
    'butuh web developer',
    'jasa bikin website bojonegoro',
    'nyari dev laravel',
    'bikin website bojonegoro',
  ];

  // 2. Target Bojonegoro business queries for Google Maps
  const mapsKeywords = [
    'Klinik Kecantikan Bojonegoro',
    'Klinik Gigi Bojonegoro',
    'Kontraktor Bojonegoro',
    'Hotel Bojonegoro',
    'Resto Bojonegoro',
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
    console.log('\n🤖 Running Google Maps Scraper for Bojonegoro...');
    // Limit to 3 leads per query for demo/development purposes
    const mapsLeads = await mapsScraper.scrapeKeywords(mapsKeywords, 3);

    for (const lead of mapsLeads) {
      rawLeads.push({
        source: 'GoogleMaps',
        keyword: lead.keyword,
        name: lead.name,
        contactInfo: lead.phone,
        referenceUrl: lead.website,
        description: lead.keyword,
      });
    }
  } catch (err: any) {
    console.error('❌ Google Maps scraper failed:', err.message || err);
  }

  // --- Pipe Scraped Leads into Auditor, Contact Enrichment, AI Filter, AI Copywriter, and Telegram ---
  console.log(`\n==================================================`);
  console.log(`🤖 Processing, Enriching, Qualifying & Dispatching ${rawLeads.length} Leads...`);
  console.log(`==================================================`);

  const qualifiedLeads: QualifiedLead[] = [];
  const aiFilter = new AIFilter(config);
  const aiCopywriter = new AICopywriter(config);
  const telegramService = new TelegramService(config);
  const contactExtractor = new ContactExtractor();

  for (const lead of rawLeads) {
    // 0. Anti-duplication check: Skip if lead has already been notified
    if (isLeadProcessed(lead.referenceUrl)) {
      console.log(`\n⏭️ Skipping lead (already processed): "${lead.name}" (${lead.referenceUrl})`);
      continue;
    }

    console.log(`\n🔍 Processing: "${lead.name}" (${lead.source})...`);
    
    // 1. Contact Enrichment (WA normalization, Email & Social Extraction)
    console.log(`   📞 Enriching Contact Info...`);
    const contacts = await contactExtractor.enrichLeadContacts(lead.contactInfo, lead.referenceUrl);
    lead.contacts = contacts;
    if (contacts.whatsappUrl) {
      console.log(`      ✅ Direct WhatsApp URL: ${contacts.whatsappUrl}`);
    }
    if (contacts.email) {
      console.log(`      ✉️ Extracted Email: ${contacts.email}`);
    }

    // 2. Audit URL
    console.log(`   🕸️ Auditing URL: ${lead.referenceUrl}`);
    const auditResult = await auditWebsite(lead.referenceUrl);
    console.log(`      Status: ${auditResult.status} | StatusCode: ${auditResult.statusCode || 'None'}`);

    // 3. Qualify using Llama 3 on Groq
    console.log(`   🧠 Qualifying via AI Filter...`);
    const qualification = await aiFilter.qualifyLead(lead, auditResult);
    console.log(`      Should Pitch: ${qualification.shouldPitch} (Confidence: ${qualification.confidenceScore})`);
    console.log(`      Service: ${qualification.recommendedService}`);
    console.log(`      Pain Point: "${qualification.painPointDetected}"`);

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

    // 5. Send Telegram Notification if qualified and proposal exists
    if (qualification.shouldPitch && proposalText) {
      console.log(`   ✉️ Dispatching Telegram Bot Notification...`);
      const notified = await telegramService.sendLeadNotification(fullLead);
      if (notified) {
        saveProcessedLead(fullLead);
      }
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
