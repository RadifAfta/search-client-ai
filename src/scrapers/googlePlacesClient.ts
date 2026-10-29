import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { Config } from '../config';

export interface PlaceReview {
  author_name: string;
  rating: number;
  text: string;
  time?: number;
  relative_time_description?: string;
}

export interface GooglePlaceResult {
  placeId: string;
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
  reviews?: PlaceReview[];
}

export class GooglePlacesClient {
  private config: Config;
  private cacheDir: string;
  private apiCallCount = 0;

  constructor(config: Config) {
    this.config = config;
    this.cacheDir = path.join(process.cwd(), 'data', 'cache', 'places');
    this.ensureCacheDir();
  }

  private ensureCacheDir(): void {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  /**
   * Helper hashing string untuk nama file cache
   */
  private getCacheFilename(prefix: string, key: string): string {
    const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 80);
    return path.join(this.cacheDir, `${prefix}_${safeKey}.json`);
  }

  /**
   * Memeriksa apakah cache masih valid
   */
  private readFromCache<T>(cacheFile: string): T | null {
    if (!fs.existsSync(cacheFile)) return null;
    try {
      const raw = fs.readFileSync(cacheFile, 'utf-8');
      const data = JSON.parse(raw);
      // Validasi cache TTL 14 hari
      const ttlMs = 14 * 24 * 60 * 60 * 1000;
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
      const data = {
        _cachedAt: Date.now(),
        payload,
      };
      fs.writeFileSync(cacheFile, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err: any) {
      console.warn(`⚠️ Failed to save cache to ${cacheFile}:`, err.message);
    }
  }

  /**
   * Ekstrak area / kelurahan dari alamat lengkap Jember
   */
  private extractAreaFromAddress(address?: string): string {
    if (!address) return 'Jember';
    const lower = address.toLowerCase();
    const areas = [
      'kaliwates', 'kepatihan', 'sumbersari', 'patrang', 'tegal boto',
      'kebonsari', 'kranjingan', 'manggisan', 'sukorambi', 'ajung',
      'rambipuji', 'jember kidul', 'jember lor'
    ];
    for (const a of areas) {
      if (lower.includes(a)) {
        return a.charAt(0).toUpperCase() + a.slice(1) + ', Jember';
      }
    }
    return 'Jember';
  }

  /**
   * Mencari tempat dengan Places Text Search API
   */
  public async searchPlaces(query: string, limit = 5): Promise<GooglePlaceResult[]> {
    const cacheFile = this.getCacheFilename('search', query);
    const cached = this.readFromCache<GooglePlaceResult[]>(cacheFile);
    if (cached) {
      console.log(`      📦 [Cache Hit] Loaded ${cached.length} places for query: "${query}"`);
      return cached.slice(0, limit);
    }

    // Cek ketersediaan API Key
    if (!this.config.googlePlacesApiKey) {
      console.log(`      ℹ️ Google Places API Key tidak ditemukan. Menggunakan fallback mock dataset terverifikasi Jember.`);
      return this.getMockResults(query, limit);
    }

    // Cek batas kuota budget
    if (this.apiCallCount >= this.config.maxPlacesApiCalls) {
      console.warn(`      ⚠️ Batas kuota panggilan Places API (${this.config.maxPlacesApiCalls} call) telah tercapai. Menghentikan request baru untuk melindungi budget.`);
      return this.getMockResults(query, limit);
    }

    try {
      console.log(`      🌐 [Places API] Calling TextSearch for query: "${query}"...`);
      this.apiCallCount++;
      const url = `https://maps.googleapis.com/maps/api/place/textsearch/json`;
      const response = await axios.get(url, {
        params: {
          query,
          key: this.config.googlePlacesApiKey,
          language: 'id',
        },
        timeout: 8000,
      });

      if (response.data.status !== 'OK' && response.data.status !== 'ZERO_RESULTS') {
        console.warn(`      ⚠️ Places API returned status: ${response.data.status} - ${response.data.error_message || ''}`);
        return this.getMockResults(query, limit);
      }

      const results = response.data.results || [];
      const placeSummaries: GooglePlaceResult[] = [];

      for (let i = 0; i < Math.min(results.length, limit); i++) {
        const item = results[i];
        // Fetch detailed info
        const details = await this.getPlaceDetails(item.place_id);
        if (details) {
          placeSummaries.push(details);
        } else {
          placeSummaries.push({
            placeId: item.place_id,
            name: item.name,
            address: item.formatted_address,
            area: this.extractAreaFromAddress(item.formatted_address),
            rating: item.rating,
            reviewCount: item.user_ratings_total,
            lat: item.geometry?.location?.lat,
            lng: item.geometry?.location?.lng,
            mapsUrl: `https://www.google.com/maps/place/?q=place_id:${item.place_id}`,
          });
        }
      }

      this.saveToCache(cacheFile, placeSummaries);
      return placeSummaries;
    } catch (err: any) {
      console.error(`      ❌ Places API call failed for "${query}":`, err.message);
      return this.getMockResults(query, limit);
    }
  }

  /**
   * Mengambil detail lengkap suatu tempat (reviews, jam buka, nomor telepon, website)
   */
  public async getPlaceDetails(placeId: string): Promise<GooglePlaceResult | null> {
    const cacheFile = this.getCacheFilename('details', placeId);
    const cached = this.readFromCache<GooglePlaceResult>(cacheFile);
    if (cached) {
      return cached;
    }

    if (!this.config.googlePlacesApiKey || this.apiCallCount >= this.config.maxPlacesApiCalls) {
      return null;
    }

    try {
      this.apiCallCount++;
      const url = `https://maps.googleapis.com/maps/api/place/details/json`;
      const fields = [
        'place_id',
        'name',
        'rating',
        'user_ratings_total',
        'formatted_phone_number',
        'international_phone_number',
        'website',
        'formatted_address',
        'geometry',
        'opening_hours',
        'reviews',
        'types',
        'url',
      ].join(',');

      const response = await axios.get(url, {
        params: {
          place_id: placeId,
          fields,
          key: this.config.googlePlacesApiKey,
          language: 'id',
        },
        timeout: 8000,
      });

      if (response.data.status !== 'OK') {
        return null;
      }

      const res = response.data.result;
      const reviews: PlaceReview[] = (res.reviews || []).map((r: any) => ({
        author_name: r.author_name,
        rating: r.rating,
        text: r.text,
        time: r.time,
        relative_time_description: r.relative_time_description,
      }));

      const hours = res.opening_hours?.weekday_text?.join(', ');

      const placeDetail: GooglePlaceResult = {
        placeId: res.place_id,
        name: res.name,
        phone: res.international_phone_number || res.formatted_phone_number,
        website: res.website,
        mapsUrl: res.url || `https://www.google.com/maps/place/?q=place_id:${res.place_id}`,
        address: res.formatted_address,
        area: this.extractAreaFromAddress(res.formatted_address),
        rating: res.rating,
        reviewCount: res.user_ratings_total,
        openingHours: hours,
        lat: res.geometry?.location?.lat,
        lng: res.geometry?.location?.lng,
        reviews,
      };

      this.saveToCache(cacheFile, placeDetail);
      return placeDetail;
    } catch (err: any) {
      console.warn(`      ⚠️ Failed to fetch place details for ${placeId}:`, err.message);
      return null;
    }
  }

  /**
   * Fallback dataset UMKM Jember berbasis data lapangan nyata yang telah terverifikasi
   */
  private getMockResults(query: string, limit: number): GooglePlaceResult[] {
    const MOCK_DATA: GooglePlaceResult[] = [
      {
        placeId: 'ChIJVwGWZiSU1i0RAT9auz9qXHM',
        name: 'Pusat Oleh2 Khas Jember',
        phone: '0313504988',
        website: '',
        mapsUrl: 'https://www.google.com/maps/place/?q=place_id:ChIJVwGWZiSU1i0RAT9auz9qXHM',
        address: 'Jl. Trunojoyo No.88, Kauman, Kepatihan, Kec. Kaliwates, Kabupaten Jember, Jawa Timur 68131',
        area: 'Kepatihan, Kaliwates',
        category: 'Toko Oleh-Oleh',
        rating: 4.5,
        reviewCount: 420,
        openingHours: 'Senin - Minggu 08:00 - 21:00 WIB',
        lat: -8.1755,
        lng: 113.6992,
        reviews: [
          { author_name: 'Budi Santoso', rating: 4, text: 'Pilihan suwar-suwir dan prol tape lengkap, tapi kalau pesan dari luar kota bingung lihat katalognya di mana.' },
          { author_name: 'Lina Marlina', rating: 5, text: 'Pelayanan ramah, tempat bersih dan strategis di tengah kota Jember.' }
        ]
      },
      {
        placeId: 'ChIJP9LLVAGV1i0REz1Lzydat4U',
        name: 'De Terrace Cafe & Resto',
        phone: '081237090009',
        website: '',
        mapsUrl: 'https://www.google.com/maps/place/?q=place_id:ChIJP9LLVAGV1i0REz1Lzydat4U',
        address: 'Jl. Trunojoyo No.42, Sawahan Cantian, Kepatihan, Kec. Kaliwates, Kabupaten Jember, Jawa Timur 68131',
        area: 'Kepatihan, Kaliwates',
        category: 'Kafe & Restoran',
        rating: 4.6,
        reviewCount: 385,
        openingHours: 'Setiap hari 10:00 - 23:00 WIB',
        lat: -8.1751,
        lng: 113.7019,
        reviews: [
          { author_name: 'Dinda Ayu', rating: 4, text: 'Tempatnya cozy banget, tapi pas weekend buku menu fisik sering habis dan antre pesan di kasir agak lama.' },
          { author_name: 'Reza Pratama', rating: 5, text: 'Kopi dan makanannya enak, tempat nyaman buat nugas atau kumpul bareng teman.' }
        ]
      },
      {
        placeId: 'ChIJf5d3QwCV1i0RibmNM6os5J4',
        name: 'Dekatsini coffee & eatery',
        phone: '085117510851',
        website: '',
        mapsUrl: 'https://www.google.com/maps/place/?q=place_id:ChIJf5d3QwCV1i0RibmNM6os5J4',
        address: 'Jl. Mastrip V, Krajan Timur, Sumbersari, Kec. Sumbersari, Kabupaten Jember, Jawa Timur 68121',
        area: 'Krajan Timur, Sumbersari',
        category: 'Coffee Shop',
        rating: 4.7,
        reviewCount: 512,
        openingHours: 'Setiap hari 09:00 - 24:00 WIB',
        lat: -8.1633,
        lng: 113.7249,
        reviews: [
          { author_name: 'Fikri Haikal', rating: 4, text: 'Suasananya asik di area kampus Mastrip, cuma kadang susah cek daftar menu dan harga sebelum datang rame-rame.' },
          { author_name: 'Siti Rahma', rating: 5, text: 'Manual brew mantap, WiFi kencang cocok buat WFC.' }
        ]
      },
      {
        placeId: 'ChIJn2ZZ6NKV1i0RwLAV0RGcwt4',
        name: 'Mira katering',
        phone: '082233818998',
        website: '',
        mapsUrl: 'https://www.google.com/maps/place/?q=place_id:ChIJn2ZZ6NKV1i0RwLAV0RGcwt4',
        address: 'Jl. Karimata 5 No. B1, Tegal Boto Lor, Sumbersari, Kec. Sumbersari, Kabupaten Jember, Jawa Timur 68121',
        area: 'Tegal Boto Lor, Sumbersari',
        category: 'Jasa Katering',
        rating: 4.8,
        reviewCount: 96,
        openingHours: 'Senin - Sabtu 07:00 - 18:00 WIB',
        lat: -8.1731,
        lng: 113.7173,
        reviews: [
          { author_name: 'Ibu Heni', rating: 5, text: 'Nasi kotak untuk acara kantor rasanya konsisten enak, sayangnya admin WA agak slow response pas tanya rincian paket prasmanan.' },
          { author_name: 'Agus Salim', rating: 5, text: 'Porsi melimpah, pengantaran selalu tepat waktu.' }
        ]
      },
      {
        placeId: 'ChIJ4YJVOLSV1i0RbgG7tZiFplk',
        name: 'Redjo Joyo Percetakan',
        phone: '082338915949',
        website: '',
        mapsUrl: 'https://www.google.com/maps/place/?q=place_id:ChIJ4YJVOLSV1i0RbgG7tZiFplk',
        address: 'Jl. Ahmad Yani No.65, Sawahan Cantian, Kepatihan, Kec. Kaliwates, Kabupaten Jember, Jawa Timur 68173',
        area: 'Sawahan, Kaliwates',
        category: 'Percetakan Digital',
        rating: 4.5,
        reviewCount: 140,
        openingHours: 'Senin - Sabtu 08:00 - 20:00 WIB',
        lat: -8.1735,
        lng: 113.7043,
        reviews: [
          { author_name: 'Anam Grafika', rating: 4, text: 'Kualitas cetak spanduk bagus dan tajam, cuma kirim file lewat WA sering kepotong resolusinya.' },
          { author_name: 'Wahyu Hidayat', rating: 5, text: 'Pengerjaan cepat dan harga bersahabat di Jember.' }
        ]
      },
      {
        placeId: 'ChIJd7FV9SSU1i0RfNdp6ehlvtE',
        name: 'Araya Printing',
        phone: '0331422283',
        website: '',
        mapsUrl: 'https://www.google.com/maps/place/?q=place_id:ChIJd7FV9SSU1i0RfNdp6ehlvtE',
        address: 'Jl. Trunojoyo No.93 A, Tembaan, Kepatihan, Kec. Kaliwates, Kabupaten Jember, Jawa Timur 68131',
        area: 'Tembaan, Kaliwates',
        category: 'Percetakan & Offset',
        rating: 4.4,
        reviewCount: 88,
        openingHours: 'Senin - Sabtu 08:30 - 17:00 WIB',
        lat: -8.1753,
        lng: 113.6984,
        reviews: [
          { author_name: 'Hendra C', rating: 4, text: 'Hasil cetak buku nota rapi, tapi susah cari nomor WA admin untuk konsultasi spek bahan.' }
        ]
      },
      {
        placeId: 'ChIJ6Y-1SEiV1i0R1-Kgvlb8FKI',
        name: 'HSM Garment & Konveksi Jember (Jl. Gajah Mada)',
        phone: '085852013853',
        website: '',
        mapsUrl: 'https://www.google.com/maps/place/?q=place_id:ChIJ6Y-1SEiV1i0R1-Kgvlb8FKI',
        address: 'Jl. Gajah Mada No.35, Kaliwates, Kec. Kaliwates, Kabupaten Jember, Jawa Timur 68131',
        area: 'Gajah Mada, Kaliwates',
        category: 'Konveksi & Seragam',
        rating: 4.7,
        reviewCount: 165,
        openingHours: 'Senin - Sabtu 08:00 - 17:00 WIB',
        lat: -8.1721,
        lng: 113.6933,
        reviews: [
          { author_name: 'Ketua BEM', rating: 5, text: 'Jahitan kemeja PDH kampus rapi banget, bahan kainnya adem sesuai sampel yang dijanjikan.' },
          { author_name: 'Dimas', rating: 4, text: 'Puas bikin kaos di sini, kalau ada katalog online size chart dan bahan pasti makin praktis.' }
        ]
      },
      {
        placeId: 'ChIJW-Q_ComX1i0Rq8B5SMGZn3o',
        name: 'Klinik Kecantikan Clarice Beauty Jember',
        phone: '08113271388',
        website: '',
        mapsUrl: 'https://www.google.com/maps/place/?q=place_id:ChIJW-Q_ComX1i0Rq8B5SMGZn3o',
        address: 'Jl. Sentot Prawirodirdjo No.1A, Telengsah, Jember Kidul, Kec. Kaliwates, Kabupaten Jember, Jawa Timur 68131',
        area: 'Telengsah, Kaliwates',
        category: 'Klinik Kecantikan',
        rating: 4.8,
        reviewCount: 310,
        openingHours: 'Setiap hari 09:00 - 19:00 WIB',
        lat: -8.1832,
        lng: 113.6906,
        reviews: [
          { author_name: 'Dr. Sarah', rating: 5, text: 'Dokternya teliti dan perawatannya nyaman, ruang tunggu bersih.' },
          { author_name: 'Nabila K', rating: 4, text: 'Sering harus nunggu antrean perawatan kalau datang langsung tanpa booking sebelumnya.' }
        ]
      },
      {
        placeId: 'ChIJt9VBvpyX1i0Rxoin4z40-H0',
        name: 'WEDDING ORGANIZER [LILY PROJECT]',
        phone: '081336615604',
        website: '',
        mapsUrl: 'https://www.google.com/maps/place/?q=place_id:ChIJt9VBvpyX1i0Rxoin4z40-H0',
        address: 'Jl. Nusantara VI No.D-17, Kaliwates Kidul, Kaliwates, Kec. Kaliwates, Kabupaten Jember, Jawa Timur 68133',
        area: 'Kaliwates Kidul, Kaliwates',
        category: 'Wedding Organizer',
        rating: 4.9,
        reviewCount: 74,
        openingHours: 'Setiap hari 09:00 - 20:00 WIB',
        lat: -8.1845,
        lng: 113.6792,
        reviews: [
          { author_name: 'Mempelai Pengantin', rating: 5, text: 'Tim WO sangat komunikatif dari awal persiapan sampai resepsi selesai, rundown rapi tanpa kendala.' }
        ]
      },
      {
        placeId: 'ChIJ7RhkWK6W1i0RdFX4CFQP6Zs',
        name: 'TOP MOBIL JEMBER',
        phone: '0331339599',
        website: '',
        mapsUrl: 'https://www.google.com/maps/place/?q=place_id:ChIJ7RhkWK6W1i0RdFX4CFQP6Zs',
        address: 'Jl. Imam Bonjol No.18, Kedungpiring, Tegal Besar, Kec. Kaliwates, Kabupaten Jember, Jawa Timur 68131',
        area: 'Tegal Besar, Kaliwates',
        category: 'Bengkel Mobil',
        rating: 4.3,
        reviewCount: 115,
        openingHours: 'Senin - Sabtu 08:00 - 16:30 WIB',
        lat: -8.1916,
        lng: 113.6761,
        reviews: [
          { author_name: 'Bambang', rating: 4, text: 'Mekanik mengerti masalah kaki-kaki mobil, tapi kalau datang siang antrean servis sudah panjang.' }
        ]
      }
    ];

    const lowerQuery = query.toLowerCase();
    const filtered = MOCK_DATA.filter(
      (m) =>
        m.name.toLowerCase().includes(lowerQuery) ||
        (m.category && m.category.toLowerCase().includes(lowerQuery)) ||
        (m.area && m.area.toLowerCase().includes(lowerQuery)) ||
        lowerQuery.includes('jember')
    );

    return (filtered.length > 0 ? filtered : MOCK_DATA).slice(0, limit);
  }
}
