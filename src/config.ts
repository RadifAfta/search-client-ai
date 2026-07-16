import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environmental variables from .env file
dotenv.config({ path: path.join(__dirname, '../.env') });

export interface Config {
  metaAdsAccessToken: string;
  twitterUsername?: string;
  twitterPassword?: string;
  twitterCookies?: string;
}

export const config: Config = {
  metaAdsAccessToken: process.env.META_ADS_ACCESS_TOKEN || '',
  twitterUsername: process.env.TWITTER_USERNAME || undefined,
  twitterPassword: process.env.TWITTER_PASSWORD || undefined,
  twitterCookies: process.env.TWITTER_COOKIES || undefined,
};

/**
 * Validates the loaded configurations and prints helpful warnings if keys are missing.
 */
export function validateConfig(): boolean {
  let isValid = true;

  if (!config.metaAdsAccessToken) {
    console.warn(
      '⚠️ WARNING: META_ADS_ACCESS_TOKEN is not set in your .env file.\n' +
      '   Meta Ads Library API scraper queries will fail without a valid token.'
    );
    isValid = false;
  }

  if (!config.twitterUsername || !config.twitterPassword) {
    if (!config.twitterCookies) {
      console.warn(
        '⚠️ WARNING: Neither Twitter credentials (TWITTER_USERNAME & TWITTER_PASSWORD)\n' +
        '   nor TWITTER_COOKIES are set in your .env file.\n' +
        '   The Twitter scraper will attempt unauthenticated access, which x.com may block or redirect.'
      );
    }
  }

  return isValid;
}
