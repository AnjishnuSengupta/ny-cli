import { senshiGetSource } from './senshi.mjs';
import { anipubGetSource } from './anipub.mjs';
import { allanimeGetSource } from './allanime.mjs';

// The fallback megaplay logic is implemented via anipub, so we don't strictly need a standalone megaplay provider unless we want to try the raw url.
// We'll just export the waterfall function.

export async function resolveStream(title, epNo, mode = 'sub', malId = null, { enableAllanime = false } = {}) {
  const attempts = [];

  // 1. Senshi
  if (malId) {
    console.log(`[resolveStream] Trying Senshi for ${title} (MAL: ${malId})`);
    try {
      const src = await senshiGetSource(malId, epNo, mode);
      if (src) return src;
    } catch (e) {
      attempts.push({ provider: 'senshi', error: e.message });
    }
  } else {
    attempts.push({ provider: 'senshi', error: 'Missing MAL ID' });
  }
  
  // 2. Anipub
  console.log(`[resolveStream] Trying Anipub for ${title}`);
  try {
    const src = await anipubGetSource(title, epNo, mode);
    if (src) return src;
  } catch (e) {
    attempts.push({ provider: 'anipub', error: e.message });
  }
  
  // 3. Fallback: AllAnime (default enabled now)
  console.log(`[providers] falling back to allanime for ${title}`);
  try {
    const src = await allanimeGetSource(title, epNo, mode, malId);
    if (src) return src;
  } catch (e) {
    attempts.push({ provider: 'allanime', error: e.message });
  }
  
  // All failed
  const err = new Error('No playable sources available');
  err.attempts = attempts;
  throw err;
}
