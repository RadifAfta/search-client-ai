import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { Config } from '../config';
import { GooglePlaceResult } from './googlePlacesClient';

export class SerpApiClient {
  private config: Config;
  private cacheDir: string;

  constructor(config: Config) {
    this.config = config;
    this.cacheDir = path.join(process.cwd(), 'data', 'cache', 'serpapi');
    this.ensureCacheDir();
  }

  private ensureCacheDir(): void {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  private getCacheFilename(query: string): string {
    const safeKey = query.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 80);
    return path.join(this.cacheDir, `serp_${safeKey}.json`);
  }

  private readFromCache(cacheFile: string): GooglePlaceResult[] | null {
    if (!fs.existsSync(cacheFile)) return null;
    try {
      const raw = fs.readFileSync(cacheFile, 'utf-8');
      const data = JSON.parse(raw);
      // Validasi cache TTL 14 hari
      const ttlMs = 14 * 24 * 60 * 60 * 1000;
      if (data._cachedAt && Date.now() - data._cachedAt < ttlMs) {
        return data.payload;
      }
      return null;
    } catch {
      return null;
    }
  }

  private saveToCache(cacheFile: string, payload: GooglePlaceResult[]): void {
    try {
      const data = {
        _cachedAt: Date.now(),
        payload,
      };
      fs.writeFileSync(cacheFile, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err: any) {
      console.warn(`⚠️ Failed to save SerpApi cache:`, err.message);
    }
  }

  /**
   * Mengambil data bisnis dari Google Maps via SerpApi Engine
   */
  public async searchGoogleMaps(query: string, limit = 5): Promise<GooglePlaceResult[]> {
    const cacheFile = this.getCacheFilename(query);
    const cached = this.readFromCache(cacheFile);
    if (cached) {
      console.log(`      📦 [SerpApi Cache Hit] Membaca ${cached.length} data bisnis untuk query: "${query}"`);
      return cached.slice(0, limit);
    }

    if (!this.config.serpApiKey) {
      return [];
    }

    try {
      console.log(`      🌐 [SerpApi] Mencari Google Maps untuk query: "${query}"...`);
      const response = await axios.get('https://serpapi.com/search.json', {
        params: {
          engine: 'google_maps',
          q: query,
          api_key: this.config.serpApiKey,
          hl: 'id',
        },
        timeout: 10000,
      });

      const localResults = response.data?.local_results || [];
      const results: GooglePlaceResult[] = [];

      for (const item of localResults.slice(0, limit)) {
        results.push({
          placeId: item.place_id || item.data_id || `serp_${Math.random().toString(36).substring(7)}`,
          name: item.title,
          phone: item.phone,
          website: item.website,
          mapsUrl: item.link || (item.place_id ? `https://www.google.com/maps/place/?q=place_id:${item.place_id}` : undefined),
          address: item.address,
          category: item.type,
          rating: typeof item.rating === 'number' ? item.rating : undefined,
          reviewCount: typeof item.reviews === 'number' ? item.reviews : undefined,
          openingHours: item.open_state,
          lat: item.gps_coordinates?.latitude,
          lng: item.gps_coordinates?.longitude,
          reviews: (item.user_reviews || []).map((r: any) => ({
            author_name: r.username || 'Pelanggan',
            rating: r.rating || 5,
            text: r.description || '',
          })),
        });
      }

      this.saveToCache(cacheFile, results);
      return results;
    } catch (err: any) {
      console.warn(`      ⚠️ SerpApi call failed:`, err.response?.data?.error || err.message);
      return [];
    }
  }
}
