import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Config } from '../config';

export interface SerpApiReview {
  rating: number;
  snippet: string;
  date?: string;
  isoDate?: string;
}

export interface SerpApiWebResult {
  title: string;
  link: string;
  snippet: string;
}

export interface SerpApiPlaceResult {
  placeId: string;
  dataId?: string;
  name: string;
  phone?: string;
  website?: string;
  mapsUrl?: string;
  address?: string;
  area?: string;
  category?: string;
  rating?: number;
  reviewCount?: number;
  openingHours?: string;
  lat?: number;
  lng?: number;
  reviews?: SerpApiReview[];
}

export interface SerpApiAccountInfo {
  totalSearchesLeft: number;
  searchesPerMonth: number;
  thisMonthUsage: number;
}

export class SerpApiClient {
  private config: Config;
  private cacheDir: string;
  public creditsUsedInRun = 0;

  constructor(config: Config) {
    this.config = config;
    const baseDir = process.env.VERCEL ? os.tmpdir() : process.cwd();
    this.cacheDir = path.join(baseDir, 'data', 'cache', 'serpapi');
    this.ensureCacheDir();
  }

  private ensureCacheDir(): void {
    try {
      if (!fs.existsSync(this.cacheDir)) {
        fs.mkdirSync(this.cacheDir, { recursive: true });
      }
    } catch {
      // Fallback ke os.tmpdir() jika direktori utama read-only (misal Vercel Serverless)
      try {
        this.cacheDir = path.join(os.tmpdir(), 'serpapi_cache');
        if (!fs.existsSync(this.cacheDir)) {
          fs.mkdirSync(this.cacheDir, { recursive: true });
        }
      } catch {
        // Jangan pernah lempar error fatal jika filesystem serverless sepenuhnya read-only
      }
    }
  }

  private getCacheFilename(prefix: string, key: string): string {
    const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 100);
    return path.join(this.cacheDir, `${prefix}_${safeKey}.json`);
  }

  private readFromCache<T>(cacheFile: string): T | null {
    try {
      if (!fs.existsSync(cacheFile)) return null;
      const raw = fs.readFileSync(cacheFile, 'utf-8');
      const data = JSON.parse(raw);
      const ttlMs = (this.config.cacheTtlDays || 14) * 24 * 60 * 60 * 1000;
      if (data._cachedAt && Date.now() - data._cachedAt < ttlMs) {
        return data.payload as T;
      }
      return null;
    } catch {
      return null;
    }
  }

  private saveToCache<T>(cacheFile: string, payload: T): void {
    try {
      if (!fs.existsSync(this.cacheDir)) {
        fs.mkdirSync(this.cacheDir, { recursive: true });
      }
      const data = {
        _cachedAt: Date.now(),
        payload,
      };
      fs.writeFileSync(cacheFile, JSON.stringify(data, null, 2), 'utf-8');
    } catch {
      // Safe fallback: jika cache gagal disimpan di serverless, jangan crash
    }
  }

  /**
   * Mengambil informasi sisa kredit akun SerpAPI (endpoint ini tidak memotong kuota)
   */
  public async getAccountCredits(): Promise<SerpApiAccountInfo> {
    if (!this.config.serpApiKey) {
      throw new Error('SERPAPI_KEY tidak ditemukan di file .env. Mohon isi kunci API sebelum menjalankan pipeline.');
    }

    try {
      const res = await axios.get('https://serpapi.com/account', {
        params: { api_key: this.config.serpApiKey },
        timeout: 10000,
      });

      const data = res.data;
      return {
        totalSearchesLeft: data.total_searches_left ?? data.plan_searches_left ?? 0,
        searchesPerMonth: data.searches_per_month ?? 250,
        thisMonthUsage: data.this_month_usage ?? 0,
      };
    } catch (err: any) {
      const errMsg = err.response?.data?.error || err.message;
      throw new Error(`Gagal menghubungi server SerpAPI (/account): ${errMsg}`);
    }
  }

  /**
   * Ekstraksi area/kelurahan ringkas dari alamat lengkap
   */
  public extractAreaFromAddress(address?: string): string {
    if (!address) return 'Jember';
    const lower = address.toLowerCase();

    // Deteksi kecamatan & kelurahan utama di Jember
    const areas = [
      'kaliwates', 'kepatihan', 'sumbersari', 'patrang', 'tegal boto',
      'kebonsari', 'kranjingan', 'manggisan', 'sukorambi', 'ajung',
      'rambipuji', 'jember kidul', 'jember lor', 'gebang', 'slawu'
    ];

    for (const a of areas) {
      if (lower.includes(a)) {
        return a.charAt(0).toUpperCase() + a.slice(1);
      }
    }

    return 'Jember';
  }

  /**
   * Mencari data bisnis di Google Maps menggunakan SerpAPI (engine: google_maps)
   */
  public async searchGoogleMaps(query: string, limit = 20): Promise<SerpApiPlaceResult[]> {
    if (!this.config.serpApiKey) {
      throw new Error('SERPAPI_KEY tidak dikonfigurasi. Pipeline berhenti untuk mencegah pemakaian data mock yang tidak valid.');
    }

    const cacheFile = this.getCacheFilename('search', query);
    const cached = this.readFromCache<SerpApiPlaceResult[]>(cacheFile);
    if (cached) {
      console.log(`      📦 [Cache Hit] Membaca ${cached.length} data bisnis dari disk untuk query: "${query}" (0 kredit)`);
      return cached.slice(0, limit);
    }

    // Cek batas kredit per run
    if (this.creditsUsedInRun >= this.config.serpApiMaxCreditsPerRun) {
      console.warn(`      🛑 Batas anggaran (${this.config.serpApiMaxCreditsPerRun} kredit/run) tercapai. Menghentikan request baru.`);
      return [];
    }

    console.log(`      🌐 [SerpAPI Engine: google_maps] Memanggil API untuk query: "${query}"...`);
    this.creditsUsedInRun++;

    try {
      const response = await axios.get('https://serpapi.com/search.json', {
        params: {
          engine: 'google_maps',
          q: query,
          api_key: this.config.serpApiKey,
          hl: 'id',
        },
        timeout: 15000,
      });

      if (response.data.error) {
        throw new Error(`SerpAPI error: ${response.data.error}`);
      }

      const localResults = response.data?.local_results || [];
      const results: SerpApiPlaceResult[] = [];

      for (const item of localResults) {
        if (!item.title) continue;

        results.push({
          placeId: item.place_id || item.data_id || `serp_${Math.random().toString(36).substring(7)}`,
          dataId: item.data_id || undefined,
          name: item.title.trim(),
          phone: item.phone ? item.phone.trim() : undefined,
          website: item.website ? item.website.trim() : undefined,
          mapsUrl: item.link || (item.place_id ? `https://www.google.com/maps/place/?q=place_id:${item.place_id}` : undefined),
          address: item.address ? item.address.trim() : undefined,
          area: this.extractAreaFromAddress(item.address),
          category: item.type || (Array.isArray(item.types) ? item.types[0] : undefined),
          rating: typeof item.rating === 'number' ? item.rating : undefined,
          reviewCount: typeof item.reviews === 'number' ? item.reviews : undefined,
          openingHours: item.open_state || undefined,
          lat: item.gps_coordinates?.latitude,
          lng: item.gps_coordinates?.longitude,
          reviews: [], // Ulasan tidak ada di engine google_maps, diambil terpisah via fetchReviewsForPlace
        });
      }

      this.saveToCache(cacheFile, results);
      return results.slice(0, limit);
    } catch (err: any) {
      const status = err.response?.status;
      const data = err.response?.data;
      if (status === 429) {
        throw new Error('SerpAPI Rate Limit (HTTP 429) tercapai. Mohon tunggu beberapa saat sebelum mencoba kembali.');
      }
      throw new Error(`SerpAPI Search gagal: ${data?.error || err.message}`);
    }
  }

  /**
   * Mengambil ulasan riil via engine google_maps_reviews menggunakan data_id
   * HANYA dipanggil untuk lead lolos seleksi awal yang memiliki data_id
   */
  public async fetchReviewsForPlace(dataId: string, limit = 5): Promise<SerpApiReview[]> {
    if (!dataId) return [];

    const cacheFile = this.getCacheFilename('reviews', dataId);
    const cached = this.readFromCache<SerpApiReview[]>(cacheFile);
    if (cached) {
      return cached.slice(0, limit);
    }

    if (this.creditsUsedInRun >= this.config.serpApiMaxCreditsPerRun) {
      console.warn(`      🛑 Batas kredit (${this.config.serpApiMaxCreditsPerRun}) tercapai, melewati pengambilan ulasan untuk data_id: ${dataId}`);
      return [];
    }

    this.creditsUsedInRun++;

    try {
      const response = await axios.get('https://serpapi.com/search.json', {
        params: {
          engine: 'google_maps_reviews',
          data_id: dataId,
          api_key: this.config.serpApiKey,
          hl: 'id',
        },
        timeout: 12000,
      });

      const rawReviews = response.data?.reviews || [];
      const parsedReviews: SerpApiReview[] = [];

      for (const r of rawReviews) {
        const text = r.snippet || r.text || '';
        if (text && text.trim().length > 5) {
          // Potong kutipan maksimal 200 karakter
          let shortSnippet = text.trim();
          if (shortSnippet.length > 200) {
            shortSnippet = shortSnippet.substring(0, 197) + '...';
          }

          parsedReviews.push({
            rating: typeof r.rating === 'number' ? r.rating : 5,
            snippet: shortSnippet,
            date: r.date || undefined,
            isoDate: r.iso_date || undefined,
          });
        }
      }

      this.saveToCache(cacheFile, parsedReviews);
      return parsedReviews.slice(0, limit);
    } catch (err: any) {
      console.warn(`      ⚠️ Gagal mengambil ulasan untuk data_id ${dataId}:`, err.response?.data?.error || err.message);
      return [];
    }
  }

  /**
   * Melakukan pencarian ringan Google Web (engine: google) untuk verifikasi website UMKM
   * Dibatasi oleh kredit dan di-cache per query untuk menghemat kredit
   */
  public async searchGoogleWeb(query: string, limit = 5): Promise<SerpApiWebResult[]> {
    if (!query) return [];

    const cacheFile = this.getCacheFilename('web', query);
    const cached = this.readFromCache<SerpApiWebResult[]>(cacheFile);
    if (cached) {
      return cached.slice(0, limit);
    }

    if (this.creditsUsedInRun >= this.config.serpApiMaxCreditsPerRun) {
      console.warn(`      🛑 Batas kredit (${this.config.serpApiMaxCreditsPerRun}) tercapai, melewati pencarian web untuk "${query}"`);
      return [];
    }

    this.creditsUsedInRun++;

    try {
      const response = await axios.get('https://serpapi.com/search.json', {
        params: {
          engine: 'google',
          q: query,
          api_key: this.config.serpApiKey,
          gl: 'id',
          hl: 'id',
          num: limit,
        },
        timeout: 12000,
      });

      const organic = response.data?.organic_results || [];
      const parsed: SerpApiWebResult[] = [];

      for (const item of organic) {
        if (item.link) {
          parsed.push({
            title: item.title || '',
            link: item.link || '',
            snippet: item.snippet || '',
          });
        }
      }

      this.saveToCache(cacheFile, parsed);
      return parsed.slice(0, limit);
    } catch (err: any) {
      console.warn(`      ⚠️ Gagal melakukan pencarian web untuk "${query}":`, err.response?.data?.error || err.message);
      return [];
    }
  }
}
