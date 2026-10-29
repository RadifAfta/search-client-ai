import axios from 'axios';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

async function testReviewsEngine() {
  const apiKey = process.env.SERPAPI_KEY;
  // data_id dari De Terrace Cafe & Resto: 0x2dd6950154cbd23f:0x85b75a27cf4b3d13
  const dataId = '0x2dd6950154cbd23f:0x85b75a27cf4b3d13';

  console.log(`🌐 Memanggil SerpAPI engine "google_maps_reviews" untuk data_id: ${dataId}...`);

  try {
    const res = await axios.get('https://serpapi.com/search.json', {
      params: {
        engine: 'google_maps_reviews',
        data_id: dataId,
        api_key: apiKey,
        hl: 'id',
      },
      timeout: 15000,
    });

    const reviews = res.data.reviews || [];
    console.log(`✅ Berhasil mengambil ${reviews.length} ulasan nyata!`);
    if (reviews.length > 0) {
      console.log('\n--- 1 RAW REVIEW PERTAMA ---');
      console.log(JSON.stringify(reviews[0], null, 2));
      console.log('\n--- DAFTAR CUPLIKAN ULASAN NYATA ---');
      reviews.slice(0, 3).forEach((r: any, idx: number) => {
        console.log(`[Ulasan ${idx + 1}] ⭐ ${r.rating} oleh "${r.user?.name || 'Anonim'}":`);
        console.log(`   "${r.snippet || r.text || ''}"`);
      });
    }
  } catch (err: any) {
    console.error('❌ Gagal memanggil review engine:', err.response?.data || err.message);
  }
}

testReviewsEngine();

