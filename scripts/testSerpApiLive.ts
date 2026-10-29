import axios from 'axios';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

async function testLiveSerpApi() {
  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) {
    console.error('❌ SERPAPI_KEY tidak ditemukan di .env!');
    process.exit(1);
  }

  console.log('🌐 Memanggil SerpAPI live untuk query: "Cafe Jember" (engine: google_maps)...');

  try {
    const res = await axios.get('https://serpapi.com/search.json', {
      params: {
        engine: 'google_maps',
        q: 'Cafe Jember',
        api_key: apiKey,
        hl: 'id',
      },
      timeout: 15000,
    });

    const searchMetadata = res.data.search_metadata;
    const localResults = res.data.local_results || [];

    console.log('\n--- SEARCH METADATA ---');
    console.log('Status:', searchMetadata.status);
    console.log('Total Results returned:', localResults.length);

    console.log('\n--- 1 CONTOH RAW ITEM PERTAMA (SEMUA FIELD ASLI) ---');
    if (localResults.length > 0) {
      console.log(JSON.stringify(localResults[0], null, 2));
    }

    console.log('\n--- RINGKASAN FIELD 5 HASIL PERTAMA ---');
    localResults.slice(0, 5).forEach((item: any, i: number) => {
      console.log(`\n[Hasil ${i + 1}]`);
      console.log(`- title: ${item.title}`);
      console.log(`- place_id: ${item.place_id}`);
      console.log(`- data_id: ${item.data_id}`);
      console.log(`- rating: ${item.rating}`);
      console.log(`- reviews: ${item.reviews}`);
      console.log(`- type / types: ${item.type} | ${JSON.stringify(item.types)}`);
      console.log(`- address: ${item.address}`);
      console.log(`- phone: ${item.phone}`);
      console.log(`- website: ${item.website}`);
      console.log(`- gps_coordinates: ${JSON.stringify(item.gps_coordinates)}`);
      console.log(`- open_state: ${item.open_state}`);
    });

  } catch (err: any) {
    console.error('❌ Gagal memanggil SerpAPI:', err.response?.data || err.message);
  }
}

testLiveSerpApi();

