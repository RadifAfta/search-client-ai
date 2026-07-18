import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environmental variables from .env file
dotenv.config({ path: path.join(__dirname, '../.env') });

export interface Config {
  metaAdsAccessToken?: string;
  twitterUsername?: string;
  twitterPassword?: string;
  twitterCookies?: string;
  groqApiKey: string;
  groqModel: string;
  telegramBotToken?: string;
  telegramChatId?: string;
}

export const config: Config = {
  metaAdsAccessToken: process.env.META_ADS_ACCESS_TOKEN || undefined,
  twitterUsername: process.env.TWITTER_USERNAME || undefined,
  twitterPassword: process.env.TWITTER_PASSWORD || undefined,
  twitterCookies: process.env.TWITTER_COOKIES || undefined,
  groqApiKey: process.env.GROQ_API_KEY || '',
  groqModel: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || undefined,
  telegramChatId: process.env.TELEGRAM_CHAT_ID || undefined,
};

/**
 * Validates the loaded configurations and prints helpful warnings if keys are missing.
 */
export function validateConfig(): boolean {
  let isValid = true;

  if (!config.groqApiKey) {
    console.warn(
      '⚠️ WARNING: GROQ_API_KEY is not set in your .env file.\n' +
      '   The AI Filter layer will not function and will skip qualification.'
    );
    isValid = false;
  }

  if (!config.telegramBotToken || !config.telegramChatId) {
    console.warn(
      '⚠️ WARNING: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is not set in your .env file.\n' +
      '   The Telegram Messenger layer will not send live notifications.'
    );
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
