import axios from 'axios';
import { Config } from '../config';

export interface MetaAdLead {
  adId: string;
  pageId: string;
  pageName: string;
  searchNiche: string;
  adText: string;
  landingPages: string[];
  adUrl: string;
}

export class MetaAdsScraper {
  private config: Config;
  private baseUrl = 'https://graph.facebook.com/v19.0/ads_archive';

  constructor(config: Config) {
    this.config = config;
  }

  /**
   * Helper function to extract URLs from text using Regex
   */
  private extractUrlsFromText(text: string): string[] {
    const urlRegex = /(https?:\/\/[^\s$.?#].[^\s]*)/gi;
    const matches = text.match(urlRegex) || [];
    // Clean and validate URLs
    return matches
      .map((url) => {
        try {
          // Remove trailing punctuation common in written text (periods, commas, etc.)
          const cleanUrl = url.replace(/[.,;:!?)]+$/, '');
          new URL(cleanUrl);
          return cleanUrl;
        } catch {
          return '';
        }
      })
      .filter((url) => url !== '');
  }

  /**
   * Queries the Meta Ads Library API for active ads in Indonesia within a specific niche
   */
  public async scrapeNiche(niche: string, limit = 10): Promise<MetaAdLead[]> {
    console.log(`\n📢 Starting Meta Ads scrape for niche: "${niche}"`);
    
    if (!this.config.metaAdsAccessToken) {
      console.warn('⚠️ Meta Ads API access token is missing. Skipping API request.');
      return [];
    }

    const leads: MetaAdLead[] = [];

    try {
      const response = await axios.get(this.baseUrl, {
        params: {
          access_token: this.config.metaAdsAccessToken,
          ad_reached_countries: JSON.stringify(['ID']), // Target only Indonesia
          ad_active_status: 'ACTIVE',                 // Target only active ads
          search_terms: niche,
          fields: [
            'id',
            'page_id',
            'page_name',
            'ad_creative_bodies',
            'ad_creative_link_urls',
          ].join(','),
          limit,
        },
      });

      const adsData = response.data?.data || [];
      console.log(`   Meta Ads Library API returned ${adsData.length} ads for "${niche}"`);

      for (const ad of adsData) {
        const adId = ad.id || '';
        const pageId = ad.page_id || '';
        const pageName = ad.page_name || 'Unknown Page';
        
        // Extract ad copy text
        const adTextArray: string[] = ad.ad_creative_bodies || [];
        const adText = adTextArray.join('\n');

        // Extract landing page links
        const landingPages: string[] = [...(ad.ad_creative_link_urls || [])];

        // Fallback: If no links, extract URLs directly from the ad copy text
        if (landingPages.length === 0 && adText) {
          const textUrls = this.extractUrlsFromText(adText);
          landingPages.push(...textUrls);
        }

        // Deduplicate URLs
        const uniqueLandingPages = Array.from(new Set(landingPages));

        leads.push({
          adId,
          pageId,
          pageName,
          searchNiche: niche,
          adText,
          landingPages: uniqueLandingPages,
          adUrl: `https://www.facebook.com/ads/library/?id=${adId}`,
        });
      }
    } catch (err: any) {
      const errorMsg = err.response?.data?.error?.message || err.message || err;
      console.error(`❌ Meta Ads API request failed for niche "${niche}":`, errorMsg);
    }

    console.log(`📊 Extracted ${leads.length} leads for niche: "${niche}"`);
    return leads;
  }

  /**
   * Sequentially scrapes a list of niches and aggregates leads
   */
  public async scrapeNiches(niches: string[], limitPerNiche = 5): Promise<MetaAdLead[]> {
    const allLeads: MetaAdLead[] = [];
    for (const niche of niches) {
      const leads = await this.scrapeNiche(niche, limitPerNiche);
      allLeads.push(...leads);
      // Brief pause between requests
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    return allLeads;
  }
}
