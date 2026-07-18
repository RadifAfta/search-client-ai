import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { Config } from '../config';

export interface GoogleMapsLead {
  keyword: string;
  name: string;
  phone: string;
  website: string;
}

export class GoogleMapsScraper {
  private config: Config;
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;

  constructor(config: Config) {
    this.config = config;
  }

  /**
   * Helper to introduce a human-like delay with random variance
   */
  private async delay(ms: number): Promise<void> {
    const variance = Math.random() * 500;
    await new Promise((resolve) => setTimeout(resolve, ms + variance));
  }

  /**
   * Initializes the Playwright browser context
   */
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
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 },
    });

    // Bypassing automated detection
    await this.context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    return await this.context.newPage();
  }

  /**
   * Scrapes Google Maps for a given keyword query
   */
  public async scrapeKeyword(query: string, limit = 5): Promise<GoogleMapsLead[]> {
    console.log(`\n📍 Starting Google Maps scrape for query: "${query}"`);
    const page = await this.initBrowser(true); // Run headless
    const leads: GoogleMapsLead[] = [];

    try {
      const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
      console.log(`🌐 Navigating to Google Maps Search URL...`);
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });
      await this.delay(3000);

      // We need to scroll down the results panel (role="feed") to load businesses
      const feedSelector = 'div[role="feed"]';
      try {
        await page.waitForSelector(feedSelector, { timeout: 10000 });
        console.log('   Scrolling the results feed panel to load business listings...');
        
        const feed = page.locator(feedSelector);
        let lastHeight = await feed.evaluate((el) => el.scrollHeight);
        let scrollAttempts = 0;
        const maxScrollAttempts = 8; // Adjust based on how deep you want to search

        while (scrollAttempts < maxScrollAttempts) {
          await feed.evaluate((el) => {
            el.scrollTo(0, el.scrollHeight);
          });
          await this.delay(2000);

          const newHeight = await feed.evaluate((el) => el.scrollHeight);
          if (newHeight === lastHeight) {
            // Attempt to jog scroll if stuck
            await feed.evaluate((el) => el.scrollTo(0, el.scrollHeight - 400));
            await this.delay(1000);
            await feed.evaluate((el) => el.scrollTo(0, el.scrollHeight));
            await this.delay(2000);
            const jogHeight = await feed.evaluate((el) => el.scrollHeight);
            if (jogHeight === lastHeight) {
              console.log('   Reached the end of the listings feed.');
              break;
            }
          }
          lastHeight = newHeight;
          scrollAttempts++;
        }
      } catch (scrollErr) {
        console.log('ℹ️ Feed container did not load or scrolling timed out. Attempting to parse current screen...');
      }

      // Locate all business item links
      const itemSelector = 'a[href*="/maps/place/"]';
      const items = page.locator(itemSelector);
      const itemCount = await items.count();
      console.log(`   Found ${itemCount} potential business listings.`);

      for (let i = 0; i < itemCount; i++) {
        if (leads.length >= limit) break;

        const item = items.nth(i);
        try {
          // Scroll item into view before clicking
          await item.scrollIntoViewIfNeeded();

          // Get the business name from the list item as a fallback/reference
          const ariaLabel = await item.getAttribute('aria-label');
          const nameFromList = ariaLabel ? ariaLabel.trim() : `Business #${i + 1}`;

          console.log(`   👉 Clicking listing: "${nameFromList}"`);
          await item.click({ force: true });
          await this.delay(2500); // Wait for details card to open

          // Extract name from H1 inside details panel (ignoring the search feed heading)
          const h1Locator = page.locator('div[role="main"] h1').first();
          let name = nameFromList;
          if (await h1Locator.isVisible()) {
            const h1Text = (await h1Locator.innerText()).trim();
            if (h1Text && h1Text !== 'Hasil' && h1Text !== 'Hasil penelusuran') {
              name = h1Text;
            }
          }

          // Extract Website URL
          const websiteLocator = page.locator('a[data-item-id="authority"]').first();
          let website = '';
          if (await websiteLocator.isVisible()) {
            website = (await websiteLocator.getAttribute('href')) || '';
          }

          // Filter: Skip if there is no website
          if (!website) {
            console.log(`      ⚠️ No website found for "${name}". Filtering out.`);
            continue;
          }

          // Extract Phone Number
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

          console.log(`      ✅ Lead Captured: "${name}" | Phone: ${phone} | Website: ${website}`);
          leads.push({
            keyword: query,
            name,
            phone,
            website,
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

  /**
   * Sequentially scrapes multiple search keywords
   */
  public async scrapeKeywords(queries: string[], limitPerQuery = 5): Promise<GoogleMapsLead[]> {
    const allLeads: GoogleMapsLead[] = [];
    for (const query of queries) {
      const leads = await this.scrapeKeyword(query, limitPerQuery);
      allLeads.push(...leads);
      await this.delay(4000);
    }
    return allLeads;
  }
}
