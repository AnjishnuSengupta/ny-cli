import { senshiGetSource } from '../providers/senshi.mjs';
import { anipubGetSource } from '../providers/anipub.mjs';
import { allanimeGetSource } from '../providers/allanime.mjs';

const [,, malIdStr, title, epNoStr] = process.argv;

if (!malIdStr || !title || !epNoStr) {
  console.error("Usage: node scripts/test-providers.mjs <malId> <title> <epNo>");
  process.exit(1);
}

const malId = parseInt(malIdStr);
const epNo = parseInt(epNoStr);

async function run() {
  console.log(`\n=== Testing Senshi ===`);
  try {
    const res = await senshiGetSource(malId, epNo, 'sub');
    console.log("Result:", res);
  } catch(e) {
    console.log("Error:", e.message);
  }

  console.log(`\n=== Testing Anipub ===`);
  try {
    const res = await anipubGetSource(title, epNo, 'sub');
    console.log("Result:", res);
  } catch(e) {
    console.log("Error:", e.message);
  }

  console.log(`\n=== Testing AllAnime ===`);
  try {
    const res = await allanimeGetSource(title, epNo, 'sub', malId);
    console.log("Result:", res);
  } catch(e) {
    console.log("Error:", e.message);
  }
}

run();
