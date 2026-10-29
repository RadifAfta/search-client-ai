import axios from 'axios';

export type WebsiteVerificationStatus =
  | 'tidak punya website'
  | 'hanya media sosial'
  | 'punya website tapi buruk/tidak mobile-friendly'
  | 'tidak pasti'
  | 'punya website aktif';

export type LegacyAuditStatus = 'UP' | 'DOWN' | 'NO_CUSTOM_WEBSITE';

export interface AuditResult {
  // New granular verification status
  verificationStatus: WebsiteVerificationStatus;
  statusReason: string;
  needsManualCheck: boolean;
  isHttps: boolean;
  isMobileResponsive?: boolean;
  statusCode: number | null;
  detectedPlatform?: string;
  // Legacy compatibility fields
  status: LegacyAuditStatus;
}

// Daftar domain media sosial, link-in-bio, marketplace, dan template builder
const SOCIAL_AND_BIO_DOMAINS: { pattern: string; name: string }[] = [
  { pattern: 'instagram.com', name: 'Instagram' },
  { pattern: 'facebook.com', name: 'Facebook' },
  { pattern: 'fb.me', name: 'Facebook' },
  { pattern: 'fb.com', name: 'Facebook' },
  { pattern: 'twitter.com', name: 'Twitter/X' },
  { pattern: 'x.com', name: 'Twitter/X' },
  { pattern: 'tiktok.com', name: 'TikTok' },
  { pattern: 'youtube.com', name: 'YouTube' },
  { pattern: 'wa.me', name: 'WhatsApp Link' },
  { pattern: 'whatsapp.com', name: 'WhatsApp Link' },
  { pattern: 'wa.wizard.id', name: 'WhatsApp Link' },
  { pattern: 'linktr.ee', name: 'Linktree' },
  { pattern: 'campsite.bio', name: 'Campsite Bio' },
  { pattern: 'bio.link', name: 'Bio.link' },
  { pattern: 'heylink.me', name: 'Heylink' },
  { pattern: 'beacons.ai', name: 'Beacons' },
  { pattern: 'bit.ly', name: 'Bitly Shortener' },
  { pattern: 'tinyurl.com', name: 'TinyURL' },
  { pattern: 's.id', name: 's.id Shortener' },
  { pattern: 'shopee.co.id', name: 'Shopee Marketplace' },
  { pattern: 'tokopedia.com', name: 'Tokopedia Marketplace' },
  { pattern: 'lazada.co.id', name: 'Lazada Marketplace' },
  { pattern: 'bukalapak.com', name: 'Bukalapak Marketplace' },
  { pattern: 'blibli.com', name: 'Blibli Marketplace' },
  { pattern: 'canva.site', name: 'Canva Site' },
  { pattern: 'blogspot.com', name: 'Blogspot' },
  { pattern: 'wordpress.com', name: 'WordPress.com Gratis' },
  { pattern: 'business.site', name: 'Google Business Site' },
  { pattern: 'sites.google.com', name: 'Google Sites' },
];

const MAPS_DOMAINS = [
  'google.com/maps',
  'maps.google.com',
  'goo.gl/maps',
  'maps.app.goo.gl',
  'goo.gl',
];

/**
 * Memeriksa dan memverifikasi status website suatu bisnis UMKM
 */
export async function auditWebsite(url?: string): Promise<AuditResult> {
  // 1. Cek ketiadaan website atau link Google Maps
  if (!url || typeof url !== 'string' || url.trim() === '' || url.trim().toLowerCase() === 'unknown' || url.trim() === '-') {
    return {
      verificationStatus: 'tidak punya website',
      statusReason: 'Tidak ada URL website yang dicantumkan pada listing bisnis.',
      needsManualCheck: false,
      isHttps: false,
      statusCode: null,
      status: 'NO_CUSTOM_WEBSITE',
    };
  }

  const cleanUrl = url.trim();
  const lowerUrl = cleanUrl.toLowerCase();

  // Jika URL hanya link Google Maps listing
  if (MAPS_DOMAINS.some((domain) => lowerUrl.includes(domain))) {
    return {
      verificationStatus: 'tidak punya website',
      statusReason: 'Tautan merujuk ke halaman listing Google Maps, bukan website independen.',
      needsManualCheck: false,
      isHttps: true,
      statusCode: null,
      status: 'NO_CUSTOM_WEBSITE',
    };
  }

  // 2. Cek apakah link merupakan media sosial, link-in-bio, atau marketplace
  for (const item of SOCIAL_AND_BIO_DOMAINS) {
    if (lowerUrl.includes(item.pattern)) {
      return {
        verificationStatus: 'hanya media sosial',
        statusReason: `Profil bisnis hanya mengandalkan saluran ${item.name} (${cleanUrl}).`,
        needsManualCheck: false,
        isHttps: true,
        detectedPlatform: item.name,
        statusCode: 200,
        status: 'NO_CUSTOM_WEBSITE',
      };
    }
  }

  // 3. Website Kustom: Lakukan HTTP request audit
  const isHttps = cleanUrl.startsWith('https://');
  const targetUrl = cleanUrl.startsWith('http://') || cleanUrl.startsWith('https://') ? cleanUrl : `https://${cleanUrl}`;

  try {
    const response = await axios.get(targetUrl, {
      timeout: 6000,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
      },
      maxRedirects: 4,
      validateStatus: () => true, // Jangan throw pada HTTP 4xx/5xx
    });

    const statusCode = response.status;
    const contentType = String(response.headers['content-type'] || '');
    const html = typeof response.data === 'string' ? response.data : '';

    // Cek apakah web mati/error status code
    if (statusCode >= 400) {
      return {
        verificationStatus: 'punya website tapi buruk/tidak mobile-friendly',
        statusReason: `Situs mengembalikan HTTP status error ${statusCode}.`,
        needsManualCheck: false,
        isHttps,
        statusCode,
        status: 'DOWN',
      };
    }

    // Cek apakah bukan HTML (misal redirect ke file pdf atau error text)
    if (!contentType.includes('html')) {
      return {
        verificationStatus: 'tidak pasti',
        statusReason: `Respon server bukan berupa halaman HTML (${contentType}). Perlu dicek manual.`,
        needsManualCheck: true,
        isHttps,
        statusCode,
        status: 'UP',
      };
    }

    // Cek mobile responsiveness (viewport meta tag)
    const hasViewport = /<meta\s+name=["']viewport["']\s+content=["'][^"']*width=device-width[^"']*["']/i.test(html);
    const hasAnyViewport = /<meta\s+[^>]*name=["']viewport["']/i.test(html);
    const isMobileResponsive = hasViewport || hasAnyViewport;

    // Jika tanpa HTTPS atau tanpa viewport mobile
    if (!isHttps || !isMobileResponsive) {
      const issues: string[] = [];
      if (!isHttps) issues.push('belum menggunakan enkripsi HTTPS');
      if (!isMobileResponsive) issues.push('tidak memiliki tag viewport mobile-friendly');

      return {
        verificationStatus: 'punya website tapi buruk/tidak mobile-friendly',
        statusReason: `Situs aktif namun berkualitas rendah (${issues.join(', ')}).`,
        needsManualCheck: false,
        isHttps,
        isMobileResponsive,
        statusCode,
        status: 'UP',
      };
    }

    // Website aktif, modern, dan fungsional
    return {
      verificationStatus: 'punya website aktif',
      statusReason: 'Bisnis sudah memiliki website mandiri aktif dengan HTTPS dan viewport mobile.',
      needsManualCheck: false,
      isHttps: true,
      isMobileResponsive: true,
      statusCode,
      status: 'UP',
    };
  } catch (error: any) {
    const errorMsg = error.message || '';
    const errCode = error.code || '';

    // Error koneksi spesifik (domain tidak ada, timeout, SSL certificate expired)
    if (
      errCode === 'ENOTFOUND' ||
      errCode === 'ECONNREFUSED' ||
      errCode === 'ETIMEDOUT' ||
      errorMsg.includes('timeout')
    ) {
      return {
        verificationStatus: 'punya website tapi buruk/tidak mobile-friendly',
        statusReason: `Domain terdaftar namun server tidak dapat diakses (${errCode || errorMsg}).`,
        needsManualCheck: false,
        isHttps,
        statusCode: null,
        status: 'DOWN',
      };
    }

    // SSL Handshake Error atau Captcha Block -> Tidak Pasti
    if (errorMsg.includes('certificate') || errorMsg.includes('SSL') || errorMsg.includes('TLS')) {
      return {
        verificationStatus: 'tidak pasti',
        statusReason: `Terjadi kendala sertifikat SSL/TLS (${errorMsg}). Perlu dicek manual.`,
        needsManualCheck: true,
        isHttps,
        statusCode: null,
        status: 'DOWN',
      };
    }

    return {
      verificationStatus: 'tidak pasti',
      statusReason: `Audit mengalami kendala jaringan tak terduga (${errorMsg}). Perlu verifikasi manual.`,
      needsManualCheck: true,
      isHttps,
      statusCode: null,
      status: 'DOWN',
    };
  }
}
