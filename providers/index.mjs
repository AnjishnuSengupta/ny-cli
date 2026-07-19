import { senshiGetSource } from './senshi.mjs';
import { anipubGetSource } from './anipub.mjs';
import { allanimeGetSource } from './allanime.mjs';

// The fallback megaplay logic is implemented via anipub, so we don't strictly need a standalone megaplay provider unless we want to try the raw url.
// We'll just export the waterfall function.

export async function resolveStream(title, epNo, mode = 'sub', malId = null) {
  let src = null;
  
  // 1. Senshi
  if (malId) {
    console.log(`[resolveStream] Trying Senshi for ${title} (MAL: ${malId})`);
    src = await senshiGetSource(malId, epNo, mode);
    if (src) return src;
  }
  
  // 2. Anipub
  console.log(`[resolveStream] Trying Anipub for ${title}`);
  src = await anipubGetSource(title, epNo, mode);
  if (src) return src;
  
  // 3. AllAnime
  console.log(`[resolveStream] Trying AllAnime for ${title}`);
  src = await allanimeGetSource(title, epNo, mode, malId);
  if (src) return src;
  
  // All failed
  return null;
}
