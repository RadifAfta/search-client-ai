import { config, validateConfig } from './config';
import { TwitterScraper, TwitterLead } from './scrapers/twitterScraper';
import { MetaAdsScraper, MetaAdLead } from './scrapers/metaAdsScraper';

async function main() {
  console.log('🇮🇩 Starting Day 1 - Indonesian AI Lead Gen Agent Scrapers...');
  
  // Validate configurations loaded from environment
  const configIsValid = validateConfig();
  if (!configIsValid) {
    console.log('⚠️ Running with incomplete configurations. Some scraping steps may fail or run in restricted modes.\n');
  }

  // 1. Define target queries for Twitter/X (Job-hunting / business opportunities in ID)
  const twitterKeywords = [
    'butuh web developer',
    'nyari dev laravel',
    'bisa benerin web',
    'jasa bikin website',
  ];

  // 2. Define target local business niches for Meta Ads Library
  const metaNiches = [
    'skincare',
    'fashion',
    'herbal',
  ];

  const results = {
    timestamp: new Date().toISOString(),
    twitterLeads: [] as TwitterLead[],
    metaAdLeads: [] as MetaAdLead[],
  };

  // --- Run Twitter/X Scraper ---
  try {
    const twitterScraper = new TwitterScraper(config);
    console.log('🤖 Initializing Twitter Scraper...');
    // Limit to 2 leads per keyword for Day 1 demo purposes
    const twitterLeads = await twitterScraper.scrapeKeywords(twitterKeywords, 2);
    results.twitterLeads = twitterLeads;
  } catch (err: any) {
    console.error('❌ Twitter scraper critical failure:', err.message || err);
  }

  // --- Run Meta Ads Archive Scraper ---
  try {
    const metaScraper = new MetaAdsScraper(config);
    console.log('🤖 Initializing Meta Ads Scraper...');
    // Limit to 3 leads per niche for Day 1 demo purposes
    const metaLeads = await metaScraper.scrapeNiches(metaNiches, 3);
    results.metaAdLeads = metaLeads;
  } catch (err: any) {
    console.error('❌ Meta Ads scraper critical failure:', err.message || err);
  }

  // --- Print Final Aggregate Leads ---
  console.log('\n==================================================');
  console.log('🎉 Scraping completed successfully! Indonesian Leads raw output:');
  console.log('==================================================\n');
  
  console.log(JSON.stringify(results, null, 2));
}

main().catch((error) => {
  console.error('💥 Execution halted on unexpected error:', error);
  process.exit(1);
});
