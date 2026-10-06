import axios from 'axios';

export type AuditStatus = 'UP' | 'DOWN' | 'NO_CUSTOM_WEBSITE';

export interface AuditResult {
  status: AuditStatus;
  statusCode: number | null;
}

/**
 * Checks the status of a given website URL.
 * Handles social media checks and pings other websites with a strict 5-second timeout.
 */
export async function auditWebsite(url: string): Promise<AuditResult> {
  if (!url || url === 'Unknown') {
    return { status: 'NO_CUSTOM_WEBSITE', statusCode: null };
  }

  const lowerUrl = url.toLowerCase();
  
  // Flag social networks, link-in-bios, and map URLs as having no custom company profile/landing page
  if (
    lowerUrl.includes('instagram.com') ||
    lowerUrl.includes('facebook.com') ||
    lowerUrl.includes('fb.me') ||
    lowerUrl.includes('twitter.com') ||
    lowerUrl.includes('x.com') ||
    lowerUrl.includes('tiktok.com') ||
    lowerUrl.includes('linktr.ee') ||
    lowerUrl.includes('campsite.bio') ||
    lowerUrl.includes('wa.me') ||
    lowerUrl.includes('whatsapp.com') ||
    lowerUrl.includes('bit.ly') ||
    lowerUrl.includes('canva.site') ||
    lowerUrl.includes('blogspot.') ||
    lowerUrl.includes('wordpress.com') ||
    lowerUrl.includes('google.com/maps') ||
    lowerUrl.includes('maps.google.com') ||
    lowerUrl.includes('goo.gl')
  ) {
    return { status: 'NO_CUSTOM_WEBSITE', statusCode: null };
  }

  try {
    const response = await axios.get(url, {
      timeout: 5000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      // Do not throw on 4xx or 5xx responses so we can extract the status code easily
      validateStatus: () => true,
    });

    const statusCode = response.status;

    if (statusCode >= 200 && statusCode < 400) {
      return {
        status: 'UP',
        statusCode,
      };
    } else {
      return {
        status: 'DOWN',
        statusCode,
      };
    }
  } catch (error: any) {
    // If request failed entirely (DNS error, connection refused, timeout, etc.)
    return {
      status: 'DOWN',
      statusCode: error.response?.status || null,
    };
  }
}
