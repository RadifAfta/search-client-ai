import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { Config } from '../config';

export interface TwitterLead {
  keyword: string;
  text: string;
  author: string;      // Display name
  username: string;    // Handle (e.g. @username)
  timestamp: string;   // ISO timestamp
  tweetUrl: string;    // Full URL to tweet
}

export class TwitterScraper {
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
   * Initializes the Playwright browser and context with realistic user agent and viewport
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
      deviceScaleFactor: 1,
    });

    // Avoid simple webdriver detection
    await this.context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    // Inject cookies if available in config
    if (this.config.twitterCookies) {
      try {
        const cookies = JSON.parse(this.config.twitterCookies);
        await this.context.addCookies(cookies);
        console.log('✅ Injected Twitter session cookies from configuration.');
      } catch (err) {
        console.error('❌ Failed to parse TWITTER_COOKIES config:', err);
      }
    }

    return await this.context.newPage();
  }

  /**
   * Performs an automated login flow on x.com
   */
  private async performLogin(page: Page): Promise<boolean> {
    if (!this.config.twitterUsername || !this.config.twitterPassword) {
      console.log('⚠️ Twitter credentials missing. Attempting search without logging in (may get restricted)...');
      return false;
    }

    console.log('🔑 Navigating to X.com login page...');
    await page.goto('https://x.com/i/flow/login', { waitUntil: 'domcontentloaded' });
    await this.delay(2000);

    try {
      // 1. Enter Username/Email
      console.log('✏️ Entering username...');
      const usernameInput = page.locator('input[autocomplete="username"]');
      await usernameInput.waitFor({ state: 'visible', timeout: 15000 });
      await usernameInput.focus();
      await usernameInput.pressSequentially(this.config.twitterUsername, { delay: 100 });
      await this.delay(1000);
      await page.keyboard.press('Enter');
      await this.delay(2000);

      // Handle intermediate screen if X asks for phone number/username confirmation
      const verificationInput = page.locator('input[data-testid="ocfEnterTextTextInput"]');
      if (await verificationInput.isVisible()) {
        console.log('❓ X is asking for phone/email verification. Entering username again...');
        await verificationInput.pressSequentially(this.config.twitterUsername, { delay: 100 });
        await this.delay(1000);
        await page.keyboard.press('Enter');
        await this.delay(2000);
      }

      // 2. Enter Password
      console.log('✏️ Entering password...');
      const passwordInput = page.locator('input[name="password"]');
      await passwordInput.waitFor({ state: 'visible', timeout: 10000 });
      await passwordInput.focus();
      await passwordInput.pressSequentially(this.config.twitterPassword, { delay: 100 });
      await this.delay(1000);
      await page.keyboard.press('Enter');
      
      // Wait for navigation or search bar to confirm we are logged in
      await page.waitForURL((url) => url.toString().includes('/home') || url.toString().includes('/search') || url.toString() === 'https://x.com/', { timeout: 20000 });
      console.log('✅ Logged in successfully to Twitter/X!');
      
      // Print cookies so the user can save them for future runs
      const cookies = await this.context?.cookies();
      if (cookies) {
        console.log('💡 TIP: You can save these cookies in your .env as TWITTER_COOKIES to bypass login in the future:');
        console.log(JSON.stringify(cookies));
      }
      return true;
    } catch (error: any) {
      console.error('❌ Twitter login failed:', error.message || error);
      return false;
    }
  }

  /**
   * Scrapes tweets for a specific keyword query
   */
  public async scrapeKeyword(query: string, limit = 5): Promise<TwitterLead[]> {
    console.log(`\n🔍 Starting Twitter scrape for query: "${query}"`);
    const page = await this.initBrowser(true); // Headless mode
    const leads: TwitterLead[] = [];

    try {
      // If we don't have cookies, let's try to log in
      if (!this.config.twitterCookies) {
        await this.performLogin(page);
      }

      const searchUrl = `https://x.com/search?q=${encodeURIComponent(query)}&f=live`;
      console.log(`🌐 Navigating to search URL: ${searchUrl}`);
      
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });
      await this.delay(3000);

      // Check if redirected to login page (if not logged in)
      if (page.url().includes('/login') || page.url().includes('/i/flow/login')) {
        console.warn('⚠️ Redirected to login page. Scraping without authentication failed.');
        return [];
      }

      let previousTweetCount = 0;
      let noNewTweetsCounter = 0;
      const maxScrollAttempts = 5;

      for (let scrollAttempt = 0; scrollAttempt < maxScrollAttempts; scrollAttempt++) {
        // Wait for tweets to load
        const tweetSelector = '[data-testid="tweet"]';
        try {
          await page.waitForSelector(tweetSelector, { timeout: 10000 });
        } catch (e) {
          console.log('ℹ️ No tweets visible or selector timed out. Ending search for this keyword.');
          break;
        }

        const tweetLocators = page.locator(tweetSelector);
        const count = await tweetLocators.count();
        console.log(`   Found ${count} tweet cards on page (Attempt ${scrollAttempt + 1}/${maxScrollAttempts})`);

        for (let i = 0; i < count; i++) {
          const tweet = tweetLocators.nth(i);
          
          try {
            // Extract details safely
            const textElement = tweet.locator('[data-testid="tweetText"]');
            if (!(await textElement.isVisible())) continue;
            const text = (await textElement.innerText()).trim();

            const userNameElement = tweet.locator('[data-testid="User-Name"]');
            if (!(await userNameElement.isVisible())) continue;
            
            const authorText = await userNameElement.innerText();
            // X username block format: "Display Name\n@username\n·\n1h" or similar
            const lines = authorText.split('\n');
            const author = lines[0] || 'Unknown';
            const username = lines[1] || 'Unknown';

            const timeElement = tweet.locator('time');
            let timestamp = 'Unknown';
            if (await timeElement.isVisible()) {
              timestamp = (await timeElement.getAttribute('datetime')) || 'Unknown';
            }

            // Get tweet URL
            const links = tweet.locator('a[href*="/status/"]');
            let tweetUrl = 'Unknown';
            const linkCount = await links.count();
            for (let j = 0; j < linkCount; j++) {
              const href = await links.nth(j).getAttribute('href');
              if (href && href.includes('/status/')) {
                tweetUrl = `https://x.com${href.split('?')[0]}`;
                break;
              }
            }

            // Deduplicate
            if (tweetUrl !== 'Unknown' && !leads.some((l) => l.tweetUrl === tweetUrl)) {
              leads.push({
                keyword: query,
                text,
                author,
                username,
                timestamp,
                tweetUrl,
              });
              
              if (leads.length >= limit) {
                break;
              }
            }
          } catch (tweetErr) {
            // Silently continue for single tweet parsing issues
            continue;
          }
        }

        if (leads.length >= limit) {
          break;
        }

        // Stop if we aren't finding new tweets
        if (count === previousTweetCount) {
          noNewTweetsCounter++;
          if (noNewTweetsCounter >= 2) break;
        } else {
          noNewTweetsCounter = 0;
        }
        previousTweetCount = count;

        // Perform natural scrolling
        console.log('   Scrolling down to load more tweets...');
        await page.evaluate(() => {
          window.scrollBy(0, window.innerHeight + Math.random() * 200);
        });
        await this.delay(2000);
      }
    } catch (err: any) {
      console.error(`❌ Error scraping keyword "${query}":`, err.message || err);
    } finally {
      if (this.browser) {
        await this.browser.close();
      }
    }

    console.log(`📊 Extracted ${leads.length} leads for query: "${query}"`);
    return leads;
  }

  /**
   * Sequentially scrapes a list of keywords and aggregates leads
   */
  public async scrapeKeywords(queries: string[], limitPerQuery = 5): Promise<TwitterLead[]> {
    const allLeads: TwitterLead[] = [];
    for (const query of queries) {
      const leads = await this.scrapeKeyword(query, limitPerQuery);
      allLeads.push(...leads);
      // Wait between search keywords to appear human
      await this.delay(5000);
    }
    return allLeads;
  }
}
