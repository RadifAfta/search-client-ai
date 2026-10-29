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
  googlePlacesApiKey?: string;
  serpApiKey?: string;
  maxPlacesApiCalls: number;
}

export const config: Config = {
  metaAdsAccessToken: process.env.META_ADS_ACCESS_TOKEN || undefined,
  twitterUsername: process.env.TWITTER_USERNAME || undefined,
  twitterPassword: process.env.TWITTER_PASSWORD || undefined,
  twitterCookies: process.env.TWITTER_COOKIES || undefined,
  groqApiKey: process.env.GROQ_API_KEY || '',
  groqModel: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || undefined,
  telegramChatId: process.env.TELEGRAM_CHAT_ID || undefined,
  googlePlacesApiKey: process.env.GOOGLE_PLACES_API_KEY || undefined,
  serpApiKey: process.env.SERPAPI_KEY || undefined,
  maxPlacesApiCalls: parseInt(process.env.MAX_PLACES_API_CALLS || '20', 10),
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

  return isValid;
}
