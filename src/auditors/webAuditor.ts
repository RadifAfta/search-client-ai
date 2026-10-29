import axios from 'axios';
import { SerpApiClient } from '../scrapers/serpApiClient';

export type WebsiteVerificationStatus =
  | 'tidak punya website'
  | 'hanya media sosial'
  | 'punya website tapi buruk'
  | 'punya website tapi buruk/tidak mobile-friendly' // alias kompatibilitas
  | 'tidak pasti'
  | 'punya website aktif';

export type LegacyAuditStatus = 'UP' | 'DOWN' | 'NO_CUSTOM_WEBSITE';

export interface WebsiteAuditEvidence {
  checkedUrls: string[];
  result: WebsiteVerificationStatus;
  details: string;
  checkedAt: string;
}

export interface AuditResult {
  verificationStatus: WebsiteVerificationStatus;
  statusReason: string;
  needsManualCheck: boolean;
  isHttps: boolean;
  isMobileResponsive?: boolean;
  statusCode: number | null;
  detectedPlatform?: string;
  checkedUrls: string[];
  evidence: WebsiteAuditEvidence;
  status: LegacyAuditStatus;
}

// Daftar domain media sosial, link-in-bio, marketplace, dan template builder gratis
export const SOCIAL_AND_BIO_DOMAINS: { pattern: string; name: string }[] = [
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
  { pattern: 'shopee.com', name: 'Shopee Marketplace' },
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

export const MAPS_DOMAINS = [
  'google.com/maps',
  'maps.google.com',
  'goo.gl/maps',
  'maps.app.goo.gl',
  'goo.gl',
];

// Domain agregator/direktori umum yang bukan website resmi bisnis
const GENERIC_DIRECTORY_DOMAINS = [
  'google.com',
  'maps.google.com',
  'tripadvisor.',
  'yellowpages.',
  'wikipedia.org',
  'kompas.com',
  'detik.com',
  'kumparan.com',
  'idalamat.com',
  'lokasitempat.com',
  'restaurantguru.com',
  'pergikuliner.com',
  'zomato.com',
  'traveloka.com',
  'linkedin.com',
  'facebook.com',
  'instagram.com',
  'tiktok.com',
  'youtube.com',
  'twitter.com',
  'x.com',
];

/**
 * Mendeteksi apakah URL merupakan saluran medsos, bio link, atau marketplace
 */
export function checkSocialOrBioUrl(url: string): { isSocial: boolean; platform?: string } {
  const lower = url.toLowerCase();
  for (const item of SOCIAL_AND_BIO_DOMAINS) {
    if (lower.includes(item.pattern)) {
      return { isSocial: true, platform: item.name };
    }
  }
  return { isSocial: false };
}

/**
 * Memeriksa URL spesifik (domain kustom atau link terdaftar)
 */
export async function auditWebsite(url?: string): Promise<AuditResult> {
  const nowIso = new Date().toISOString();

  // 1. Cek ketiadaan website atau link Google Maps
  if (
    !url ||
    typeof url !== 'string' ||
    url.trim() === '' ||
    url.trim().toLowerCase() === 'unknown' ||
    url.trim() === '-'
  ) {
    return {
      verificationStatus: 'tidak punya website',
      statusReason: 'Tidak ada URL website yang dicantumkan pada listing bisnis.',
      needsManualCheck: false,
      isHttps: false,
      statusCode: null,
      checkedUrls: [],
      evidence: {
        checkedUrls: [],
        result: 'tidak punya website',
        details: 'Field website Google Maps kosong',
        checkedAt: nowIso,
      },
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
      checkedUrls: [cleanUrl],
      evidence: {
        checkedUrls: [cleanUrl],
        result: 'tidak punya website',
        details: 'Tautan adalah URL Google Maps listing, bukan website independen',
        checkedAt: nowIso,
      },
      status: 'NO_CUSTOM_WEBSITE',
    };
  }

  // 2. Cek apakah link merupakan media sosial, link-in-bio, atau marketplace
  const socialCheck = checkSocialOrBioUrl(cleanUrl);
  if (socialCheck.isSocial) {
    return {
      verificationStatus: 'hanya media sosial',
      statusReason: `Profil bisnis hanya mengandalkan saluran ${socialCheck.platform} (${cleanUrl}).`,
      needsManualCheck: false,
      isHttps: true,
      detectedPlatform: socialCheck.platform,
      statusCode: 200,
      checkedUrls: [cleanUrl],
      evidence: {
        checkedUrls: [cleanUrl],
        result: 'hanya media sosial',
        details: `Terdaftar saluran ${socialCheck.platform}: ${cleanUrl}`,
        checkedAt: nowIso,
      },
      status: 'NO_CUSTOM_WEBSITE',
    };
  }

  // 3. Website Kustom: Lakukan HTTP request audit
  const isHttps = cleanUrl.startsWith('https://');
  const targetUrl =
    cleanUrl.startsWith('http://') || cleanUrl.startsWith('https://')
      ? cleanUrl
      : `https://${cleanUrl}`;

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

    // Cek apakah web mati / error HTTP status code
    if (statusCode >= 400) {
      return {
        verificationStatus: 'punya website tapi buruk',
        statusReason: `Situs mengembalikan HTTP status error ${statusCode}.`,
        needsManualCheck: false,
        isHttps,
        statusCode,
        checkedUrls: [targetUrl],
        evidence: {
          checkedUrls: [targetUrl],
          result: 'punya website tapi buruk',
          details: `HTTP status code error: ${statusCode}`,
          checkedAt: nowIso,
        },
        status: 'DOWN',
      };
    }

    // Cek apakah bukan HTML
    if (!contentType.includes('html')) {
      return {
        verificationStatus: 'tidak pasti',
        statusReason: `Respon server bukan berupa halaman HTML (${contentType}). Perlu dicek manual.`,
        needsManualCheck: true,
        isHttps,
        statusCode,
        checkedUrls: [targetUrl],
        evidence: {
          checkedUrls: [targetUrl],
          result: 'tidak pasti',
          details: `Bukan dokumen HTML (Content-Type: ${contentType})`,
          checkedAt: nowIso,
        },
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
        verificationStatus: 'punya website tapi buruk',
        statusReason: `Situs aktif namun berkualitas rendah (${issues.join(', ')}).`,
        needsManualCheck: false,
        isHttps,
        isMobileResponsive,
        statusCode,
        checkedUrls: [targetUrl],
        evidence: {
          checkedUrls: [targetUrl],
          result: 'punya website tapi buruk',
          details: `Isu teknis: ${issues.join(', ')}`,
          checkedAt: nowIso,
        },
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
      checkedUrls: [targetUrl],
      evidence: {
        checkedUrls: [targetUrl],
        result: 'punya website aktif',
        details: 'Website aktif, HTTPS valid, dan mobile-responsive (viewport meta tag ada)',
        checkedAt: nowIso,
      },
      status: 'UP',
    };
  } catch (error: any) {
    const errorMsg = error.message || '';
    const errCode = error.code || '';

    // Error koneksi spesifik (domain tidak ada, timeout, ditolak)
    if (
      errCode === 'ENOTFOUND' ||
      errCode === 'ECONNREFUSED' ||
      errCode === 'ETIMEDOUT' ||
      errorMsg.includes('timeout')
    ) {
      return {
        verificationStatus: 'punya website tapi buruk',
        statusReason: `Domain terdaftar namun server tidak dapat diakses (${errCode || errorMsg}).`,
        needsManualCheck: false,
        isHttps,
        statusCode: null,
        checkedUrls: [targetUrl],
        evidence: {
          checkedUrls: [targetUrl],
          result: 'punya website tapi buruk',
          details: `Koneksi gagal: ${errCode || errorMsg}`,
          checkedAt: nowIso,
        },
        status: 'DOWN',
      };
    }

    // Masalah sertifikat SSL / TLS -> Tidak Pasti
    if (errorMsg.includes('certificate') || errorMsg.includes('SSL') || errorMsg.includes('TLS')) {
      return {
        verificationStatus: 'tidak pasti',
        statusReason: `Terjadi kendala sertifikat SSL/TLS (${errorMsg}). Perlu dicek manual.`,
        needsManualCheck: true,
        isHttps,
        statusCode: null,
        checkedUrls: [targetUrl],
        evidence: {
          checkedUrls: [targetUrl],
          result: 'tidak pasti',
          details: `Kendala SSL/TLS: ${errorMsg}`,
          checkedAt: nowIso,
        },
        status: 'DOWN',
      };
    }

    return {
      verificationStatus: 'tidak pasti',
      statusReason: `Audit mengalami kendala jaringan tak terduga (${errorMsg}). Perlu verifikasi manual.`,
      needsManualCheck: true,
      isHttps,
      statusCode: null,
      checkedUrls: [targetUrl],
      evidence: {
        checkedUrls: [targetUrl],
        result: 'tidak pasti',
        details: `Kendala jaringan: ${errorMsg}`,
        checkedAt: nowIso,
      },
      status: 'DOWN',
    };
  }
}

/**
 * Verifikasi status website lebih ketat sesuai Tahap 2:
 * 1. Cek field website listing SerpAPI.
 * 2. Cek apakah medsos / link-in-bio / marketplace -> "hanya media sosial".
 * 3. Jika domain kustom -> uji audit teknis (status, HTTPS, viewport) -> "punya website tapi buruk" / "punya website aktif".
 * 4. Jika field kosong dan diizinkan Google search -> jalankan pencarian ringan (engine: google)
 *    untuk memastikan tidak ada website resmi yang terlewat.
 */
export async function verifyBusinessWebsite(params: {
  businessName: string;
  city?: string;
  initialUrl?: string;
  serpApiClient?: SerpApiClient;
  canSearchGoogleWeb?: boolean;
}): Promise<AuditResult> {
  const { businessName, city = 'Jember', initialUrl, serpApiClient, canSearchGoogleWeb } = params;
  const nowIso = new Date().toISOString();

  // A. Jika ada initialUrl dan bukan maps listing
  if (initialUrl && initialUrl.trim() !== '') {
    const isMaps = MAPS_DOMAINS.some((d) => initialUrl.toLowerCase().includes(d));
    if (!isMaps) {
      return await auditWebsite(initialUrl);
    }
  }

  // B. Jika initialUrl kosong atau hanya link Google Maps, cek apakah boleh Google Web Search
  if (canSearchGoogleWeb && serpApiClient) {
    const query = `${businessName} ${city}`.trim();
    console.log(`      🔎 Melakukan verifikasi web via SerpAPI Google Web untuk: "${query}"...`);
    const searchResults = (await serpApiClient.searchGoogleWeb(query, 5)) || [];

    // 1. Cek apakah ada profil medsos atau bio link
    for (const item of searchResults) {
      const social = checkSocialOrBioUrl(item.link);
      if (social.isSocial) {
        return {
          verificationStatus: 'hanya media sosial',
          statusReason: `Ditemukan profil ${social.platform} resmi via Google Web (${item.link}).`,
          needsManualCheck: false,
          isHttps: true,
          detectedPlatform: social.platform,
          statusCode: 200,
          checkedUrls: [item.link],
          evidence: {
            checkedUrls: [item.link],
            result: 'hanya media sosial',
            details: `Ditemukan akun ${social.platform} via pencarian Google Web: ${item.link}`,
            checkedAt: nowIso,
          },
          status: 'NO_CUSTOM_WEBSITE',
        };
      }
    }

    // 2. Cek apakah ada domain kustom independen (bukan agregator/direktori umum)
    for (const item of searchResults) {
      const lowerLink = item.link.toLowerCase();
      const isDirectory = GENERIC_DIRECTORY_DOMAINS.some((dom) => lowerLink.includes(dom));
      if (!isDirectory && (lowerLink.startsWith('http://') || lowerLink.startsWith('https://'))) {
        // Ditemukan kemungkinan domain kustom bisnis, audit website tersebut!
        const audit = await auditWebsite(item.link);
        audit.statusReason = `Ditemukan domain via Google Web (${item.link}): ${audit.statusReason}`;
        audit.evidence.details = `Ditemukan via pencarian Google Web '${query}': ${audit.evidence.details}`;
        return audit;
      }
    }

    // 3. Jika sudah dicari via Google dan tidak ada website mandiri maupun akun medsos dominan
    return {
      verificationStatus: 'tidak punya website',
      statusReason: `Terverifikasi via pencarian Google ("${query}"), tidak ditemukan website mandiri resmi.`,
      needsManualCheck: false,
      isHttps: false,
      statusCode: null,
      checkedUrls: [`Google: "${query}"`],
      evidence: {
        checkedUrls: [`Google: "${query}"`],
        result: 'tidak punya website',
        details: `Pencarian Google Web untuk '${query}' tidak menemukan website independen.`,
        checkedAt: nowIso,
      },
      status: 'NO_CUSTOM_WEBSITE',
    };
  }

  // C. Fallback jika Google search tidak dijalankan (misal kuota habis atau bukan prioritas)
  return {
    verificationStatus: 'tidak punya website',
    statusReason: 'Listing Google Maps tidak mencantumkan URL website.',
    needsManualCheck: false,
    isHttps: false,
    statusCode: null,
    checkedUrls: [],
    evidence: {
      checkedUrls: [],
      result: 'tidak punya website',
      details: 'Field website pada Google Maps kosong (belum verifikasi Google search)',
      checkedAt: nowIso,
    },
    status: 'NO_CUSTOM_WEBSITE',
  };
}
