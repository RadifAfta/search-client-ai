import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { Config } from '../config';
import { SerpApiReview } from './serpApiClient';

export interface GoogleMapsLead {
  placeId?: string;
  keyword: string;
  name: string;
  phone: string;
  website: string;
  mapsUrl: string;
  address?: string;
  category?: string;
  openingHours?: string;
  rating?: number;
  reviewCount?: number;
  reviews?: SerpApiReview[];
}

export class GoogleMapsScraper {
  private config: Config;
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;

  constructor(config: Config) {
    this.config = config;
  }

  private async delay(ms: number): Promise<void> {
    const variance = Math.random() * 500;
    await new Promise((resolve) => setTimeout(resolve, ms + variance));
  }

  private async initBrowser(headless = true): Promise<Page> {
    this.browser = await chromium.launch({
      headless,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disable-setuid-sandbox',
      ],
    });

    this.context = await this.browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 },
    });

    await this.context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    return await this.context.newPage();
  }

  public async scrapeKeyword(query: string, limit = 5): Promise<GoogleMapsLead[]> {
    console.log(`\n📍 Starting Google Maps scrape for query: "${query}"`);
    const page = await this.initBrowser(true);
    const leads: GoogleMapsLead[] = [];

    try {
      const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
      console.log(`🌐 Navigating to Google Maps Search URL...`);
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });
      await this.delay(3000);

      const feedSelector = 'div[role="feed"]';
      try {
        await page.waitForSelector(feedSelector, { timeout: 10000 });
        const feed = page.locator(feedSelector);
        let lastHeight = await feed.evaluate((el) => el.scrollHeight);
        let scrollAttempts = 0;
        const maxScrollAttempts = 6;

        while (scrollAttempts < maxScrollAttempts) {
          await feed.evaluate((el) => {
            el.scrollTo(0, el.scrollHeight);
          });
          await this.delay(1800);

          const newHeight = await feed.evaluate((el) => el.scrollHeight);
          if (newHeight === lastHeight) {
            await feed.evaluate((el) => el.scrollTo(0, el.scrollHeight - 400));
            await this.delay(800);
            await feed.evaluate((el) => el.scrollTo(0, el.scrollHeight));
            await this.delay(1500);
            const jogHeight = await feed.evaluate((el) => el.scrollHeight);
            if (jogHeight === lastHeight) break;
          }
          lastHeight = newHeight;
          scrollAttempts++;
        }
      } catch {
        console.log('ℹ️ Feed container loaded or direct screen parsing...');
      }

      const itemSelector = 'a[href*="/maps/place/"]';
      const items = page.locator(itemSelector);
      const itemCount = await items.count();
      console.log(`   Found ${itemCount} potential business listings.`);

      for (let i = 0; i < itemCount; i++) {
        if (leads.length >= limit) break;

        const item = items.nth(i);
        try {
          await item.scrollIntoViewIfNeeded();
          const ariaLabel = await item.getAttribute('aria-label');
          const nameFromList = ariaLabel ? ariaLabel.trim() : `Business #${i + 1}`;
          const mapsUrl = (await item.getAttribute('href')) || page.url();

          // Ekstrak place_id dari maps URL jika ada
          const placeIdMatch = mapsUrl.match(/place\/([^/?]+)/);
          const placeId = placeIdMatch ? placeIdMatch[1] : undefined;

          console.log(`   👉 Clicking listing: "${nameFromList}"`);
          await item.click({ force: true });
          await this.delay(2200);

          // Name
          const h1Locator = page.locator('div[role="main"] h1').first();
          let name = nameFromList;
          if (await h1Locator.isVisible()) {
            const h1Text = (await h1Locator.innerText()).trim();
            if (h1Text && h1Text !== 'Hasil' && h1Text !== 'Hasil penelusuran') {
              name = h1Text;
            }
          }

          // Rating & Reviews
          let rating: number | undefined = undefined;
          let reviewCount: number | undefined = undefined;
          try {
            const ratingLocator = page.locator('div[role="main"] span[aria-hidden="true"]').first();
            if (await ratingLocator.isVisible()) {
              const rText = (await ratingLocator.innerText()).trim();
              const parsedR = parseFloat(rText.replace(',', '.'));
              if (!isNaN(parsedR) && parsedR >= 1.0 && parsedR <= 5.0) {
                rating = parsedR;
              }
            }

            const reviewBtn = page.locator('div[role="main"] button[aria-label*="ulasan"], div[role="main"] button[aria-label*="reviews"]').first();
            if (await reviewBtn.isVisible()) {
              const revText = (await reviewBtn.innerText()).trim();
              const numMatch = revText.replace(/\D/g, '');
              if (numMatch) {
                reviewCount = parseInt(numMatch, 10);
              }
            }
          } catch {}

          // Website URL
          const websiteLocator = page.locator('a[data-item-id="authority"]').first();
          let website = '';
          if (await websiteLocator.isVisible()) {
            website = (await websiteLocator.getAttribute('href')) || '';
          }

          // Phone
          const phoneLocator = page.locator('[data-item-id^="phone:tel:"]').first();
          let phone = 'Unknown';
          if (await phoneLocator.isVisible()) {
            const dataItemId = await phoneLocator.getAttribute('data-item-id');
            if (dataItemId) {
              phone = dataItemId.replace('phone:tel:', '').trim();
            } else {
              phone = (await phoneLocator.innerText()).trim();
            }
          }

          // Address
          const addressLocator = page.locator('button[data-item-id="address"], [data-item-id="address"]').first();
          let address = '';
          if (await addressLocator.isVisible()) {
            address = (await addressLocator.innerText()).trim();
          }

          // Category
          const categoryLocator = page.locator('button[jsaction*="category"]').first();
          let category = '';
          if (await categoryLocator.isVisible()) {
            category = (await categoryLocator.innerText()).trim();
          }

          // Opening Hours
          const hoursLocator = page.locator('[data-item-id*="oh"], [aria-label*="Jam operasional"]').first();
          let openingHours = '';
          if (await hoursLocator.isVisible()) {
            openingHours = (await hoursLocator.innerText()).trim();
          }

          // Review snippets
          const reviews: SerpApiReview[] = [];
          try {
            const snippetElements = page.locator('span.wiI7pd');
            const count = await snippetElements.count();
            for (let s = 0; s < Math.min(count, 3); s++) {
              const text = (await snippetElements.nth(s).innerText()).trim();
              if (text && text.length > 10) {
                reviews.push({
                  rating: rating || 5,
                  snippet: text,
                });
              }
            }
          } catch {}

          if (!website && phone === 'Unknown') {
            continue;
          }

          leads.push({
            placeId,
            keyword: query,
            name,
            phone,
            website,
            mapsUrl,
            address: address || undefined,
            category: category || undefined,
            openingHours: openingHours || undefined,
            rating,
            reviewCount,
            reviews,
          });
        } catch (itemErr: any) {
          console.error(`      ❌ Error parsing item #${i + 1}:`, itemErr.message || itemErr);
        }
      }
    } catch (err: any) {
      console.error(`❌ Error during Google Maps scrape for "${query}":`, err.message || err);
    } finally {
      if (this.browser) {
        await this.browser.close();
      }
    }

    console.log(`📊 Extracted ${leads.length} filtered leads for query: "${query}"`);
    return leads;
  }

  public async scrapeKeywords(queries: string[], limitPerQuery = 5): Promise<GoogleMapsLead[]> {
    const allLeads: GoogleMapsLead[] = [];
    for (const query of queries) {
      const leads = await this.scrapeKeyword(query, limitPerQuery);
      allLeads.push(...leads);
      await this.delay(3000);
    }
    return allLeads;
  }
}
