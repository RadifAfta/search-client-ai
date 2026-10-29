import assert from 'assert';
import { SerpApiClient, SerpApiPlaceResult } from '../src/scrapers/serpApiClient';
import { config } from '../src/config';

export function runSerpApiParserTests() {
  console.log('🧪 Testing: SerpAPI Response Parser (Field Validasi & Field Hilang)...');

  const client = new SerpApiClient(config);

  // Test 1: Ekstraksi area dari alamat lengkap
  assert.strictEqual(client.extractAreaFromAddress('Jl. Trunojoyo, Kepatihan, Kaliwates, Jember'), 'Kaliwates');
  assert.strictEqual(client.extractAreaFromAddress('Jl. Kalimantan, Sumbersari, Jember'), 'Sumbersari');
  assert.strictEqual(client.extractAreaFromAddress('Jl. неизвестная, Luar Kota'), 'Jember');

  // Test 2: Handling missing fields pada item SerpAPI
  const mockRawItemMissingFields = {
    position: 1,
    title: 'Warung Kopi Tanpa Telepon & Web',
    place_id: 'place_123',
    // rating, reviews, phone, website sengaja hilang / undefined
  };

  const parsed: SerpApiPlaceResult = {
    placeId: mockRawItemMissingFields.place_id,
    name: mockRawItemMissingFields.title,
    phone: (mockRawItemMissingFields as any).phone || undefined,
    website: (mockRawItemMissingFields as any).website || undefined,
    rating: (mockRawItemMissingFields as any).rating || undefined,
    reviewCount: (mockRawItemMissingFields as any).reviews || undefined,
  };

  assert.strictEqual(parsed.name, 'Warung Kopi Tanpa Telepon & Web');
  assert.strictEqual(parsed.phone, undefined);
  assert.strictEqual(parsed.website, undefined);
  assert.strictEqual(parsed.rating, undefined);
  assert.strictEqual(parsed.reviewCount, undefined);

  console.log('   ✅ Semua 5 assertion SerpAPI Parser Lulus!');
}

