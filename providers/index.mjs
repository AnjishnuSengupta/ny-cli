import { senshiGetSource } from './senshi.mjs';
import { anipubGetSource } from './anipub.mjs';
import { hianimeGetSource } from './hianime.mjs';

// The fallback megaplay logic is implemented via anipub, so we don't strictly need a standalone megaplay provider unless we want to try the raw url.
// We'll just export the waterfall function.

export async function resolveStream(title, epNo, mode = 'sub', malId = null) {
  const promises = [];

  // 1. Anipub
  promises.push((async () => {
    console.log(`[resolveStream] Trying Anipub for ${title}`);
    const src = await anipubGetSource(title, epNo, mode);
    if (!src) throw new Error('Anipub returned no source');
    return src;
  })());
  
  // 2. HiAnime
  promises.push((async () => {
    console.log(`[resolveStream] Trying HiAnime for ${title}`);
    const src = await hianimeGetSource(title, epNo, mode);
    if (!src) throw new Error('HiAnime returned no source');
    return src;
  })());

  try {
    // Wait for the FIRST successful provider to resolve
    return await Promise.any(promises);
  } catch (aggregateError) {
    // If ALL providers fail, Promise.any throws an AggregateError
    const attempts = aggregateError.errors.map((e, i) => ({
      provider: i === 0 ? 'anipub' : 'hianime',
      error: e.message
    }));
    
    const err = new Error('No playable sources available');
    err.attempts = attempts;
    throw err;
  }
}
