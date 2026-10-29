import {
  checkSocialOrBioUrl,
  auditWebsite,
  verifyBusinessWebsite,
  WebsiteVerificationStatus,
} from '../src/auditors/webAuditor';

export async function runWebAuditorTests(): Promise<void> {
  console.log('🧪 Testing: Strict Website Verifier (Tahap 2)...');

  // 1. Uji deteksi saluran medsos, bio link, dan marketplace
  const socialCases = [
    { url: 'https://www.instagram.com/de_terrace_jember', expectedPlatform: 'Instagram' },
    { url: 'http://linktr.ee/senjadijember', expectedPlatform: 'Linktree' },
    { url: 'https://wa.me/6281237090009', expectedPlatform: 'WhatsApp Link' },
    { url: 'https://kedai-kopi.canva.site', expectedPlatform: 'Canva Site' },
    { url: 'https://warungmakan.business.site', expectedPlatform: 'Google Business Site' },
    { url: 'https://tokopedia.com/toko-percetakan', expectedPlatform: 'Tokopedia Marketplace' },
    { url: 'https://shopee.co.id/konveksi_jember', expectedPlatform: 'Shopee Marketplace' },
  ];

  for (const c of socialCases) {
    const res = checkSocialOrBioUrl(c.url);
    if (!res.isSocial || res.platform !== c.expectedPlatform) {
      throw new Error(`Gagal mendeteksi medsos/bio untuk ${c.url}. Dapat: ${res.platform}, Diharapkan: ${c.expectedPlatform}`);
    }

    const audit = await auditWebsite(c.url);
    if (audit.verificationStatus !== 'hanya media sosial') {
      throw new Error(`Status audit salah untuk ${c.url}: ${audit.verificationStatus}`);
    }
    if (!audit.evidence || audit.evidence.checkedUrls.length === 0) {
      throw new Error(`Bukti pengecekan kosong untuk ${c.url}`);
    }
  }
  console.log('   ✅ 7 varian saluran medsos/bio-link terdeteksi dengan tepat sebagai "hanya media sosial"');

  // 2. Uji URL kosong atau link Google Maps
  const mapsAudit = await auditWebsite('https://www.google.com/maps/place/?q=place_id:ChIJT-9KrzOU1i0RAAeRUdXzH24');
  if (mapsAudit.verificationStatus !== 'tidak punya website') {
    throw new Error(`Tautan Google Maps harus berstatus "tidak punya website", didapat: ${mapsAudit.verificationStatus}`);
  }

  const emptyAudit = await auditWebsite('');
  if (emptyAudit.verificationStatus !== 'tidak punya website') {
    throw new Error(`URL kosong harus berstatus "tidak punya website"`);
  }
  console.log('   ✅ URL kosong dan tautan Google Maps listing diverifikasi sebagai "tidak punya website"');

  // 3. Uji verifikasi Google Search mock jika tidak ada URL di listing
  const mockSerpClientEmpty: any = {
    searchGoogleWeb: async () => [],
  };
  const verifiedNoWeb = await verifyBusinessWebsite({
    businessName: 'Bengkel Maestro Service 1',
    city: 'Jember',
    serpApiClient: mockSerpClientEmpty,
    canSearchGoogleWeb: true,
  });

  if (verifiedNoWeb.verificationStatus !== 'tidak punya website') {
    throw new Error(`Gagal memverifikasi ketiadaan website via pencarian Google: ${verifiedNoWeb.verificationStatus}`);
  }
  if (!verifiedNoWeb.evidence.checkedUrls[0].includes('Bengkel Maestro Service 1')) {
    throw new Error(`Bukti URL harus mencatat query pencarian Google yang dilakukan`);
  }
  console.log('   ✅ Verifikasi pencarian Google tanpa hasil berhasil melabeli "tidak punya website" lengkap dengan bukti query');

  // 4. Uji verifikasi Google Search menemukan Instagram
  const mockSerpClientFoundIg: any = {
    searchGoogleWeb: async () => [
      {
        title: 'Grand Cafe Jember (@grandcafejember) • Instagram photos and videos',
        link: 'https://www.instagram.com/grandcafejember',
        snippet: 'Grand Cafe Jember Official Instagram account',
      },
    ],
  };
  const verifiedFoundIg = await verifyBusinessWebsite({
    businessName: 'Grand Cafe Jember',
    city: 'Jember',
    serpApiClient: mockSerpClientFoundIg,
    canSearchGoogleWeb: true,
  });

  if (verifiedFoundIg.verificationStatus !== 'hanya media sosial') {
    throw new Error(`Google search yang menemukan Instagram harus berstatus "hanya media sosial", didapat: ${verifiedFoundIg.verificationStatus}`);
  }
  if (verifiedFoundIg.evidence.checkedUrls[0] !== 'https://www.instagram.com/grandcafejember') {
    throw new Error(`Bukti pengecekan harus mencatat URL Instagram yang ditemukan`);
  }
  console.log('   ✅ Pencarian Google yang menemukan akun medsos berhasil melabeli "hanya media sosial"');

  console.log('   ✅ Semua 4 kategori pengujian Web Auditor Tahap 2 Lulus!\n');
}

