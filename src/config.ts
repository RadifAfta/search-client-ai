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
  serpApiKey?: string;
  serpApiMaxCreditsPerRun: number;
  maxReviewsEnrichmentPerRun: number;
  serpApiMaxGoogleSearchPerRun: number;
  cacheTtlDays: number;
  senderName: string;
  senderRole: string;
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
  serpApiKey: process.env.SERPAPI_KEY || undefined,
  serpApiMaxCreditsPerRun: parseInt(process.env.SERPAPI_MAX_CREDITS || '20', 10),
  maxReviewsEnrichmentPerRun: parseInt(process.env.MAX_REVIEWS_ENRICHMENT || '15', 10),
  serpApiMaxGoogleSearchPerRun: parseInt(process.env.SERPAPI_MAX_GOOGLE_SEARCH || '5', 10),
  cacheTtlDays: parseInt(process.env.CACHE_TTL_DAYS || '14', 10),
  senderName: process.env.SENDER_NAME || 'Radif',
  senderRole: process.env.SENDER_ROLE || 'freelance web developer di Jember',
};

/**
 * Validates the loaded configurations and prints helpful warnings if keys are missing.
 */
export function validateConfig(): boolean {
  let isValid = true;

  if (!config.serpApiKey) {
    console.error(
      '❌ ERROR: SERPAPI_KEY belum diset di file .env Anda!\n' +
      '   Pipeline memerlukan SerpAPI aktif untuk mengambil data Google Maps riil.'
    );
    isValid = false;
  }

  return isValid;
}
