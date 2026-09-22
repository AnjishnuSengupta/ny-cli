import { senshiGetSource } from './senshi.mjs';
import { anipubGetSource } from './anipub.mjs';
import { hianimeGetSource } from './hianime.mjs';
import { owaisGetSource } from './owais.mjs';

// The fallback megaplay logic is implemented via anipub, so we don't strictly need a standalone megaplay provider unless we want to try the raw url.
// We'll just export the waterfall function.

async function withStreamRetry(fn, maxRetries = 2) {
  let attempt = 0;
  while (attempt <= maxRetries) {
    try {
      return await fn();
    } catch (err) {
      attempt++;
      if (attempt > maxRetries) throw err;
      console.log(`[retry] Streaming provider failed, retrying (${attempt}/${maxRetries}): ${err.message}`);
      // Small backoff before retry (e.g. 500ms, 1000ms)
      await new Promise(resolve => setTimeout(resolve, attempt * 500));
    }
  }
}

export async function resolveStream(title, epNo, mode = 'sub', malId = null) {
  const promises = [];

  // 1. Anipub
  promises.push(withStreamRetry(async () => {
    console.log(`[resolveStream] Trying Anipub for ${title}`);
    const src = await anipubGetSource(title, epNo, mode);
    if (!src) throw new Error('Anipub returned no source');
    return src;
  }, 2));
  
  // 2. HiAnime
  promises.push(withStreamRetry(async () => {
    console.log(`[resolveStream] Trying HiAnime for ${title}`);
    const src = await hianimeGetSource(title, epNo, mode);
    if (!src) throw new Error('HiAnime returned no source');
    return src;
  }, 2));

  // 3. Owais
  promises.push(withStreamRetry(async () => {
    console.log(`[resolveStream] Trying Owais for ${title}`);
    const src = await owaisGetSource(title, epNo, mode);
    if (!src) throw new Error('Owais returned no source');
    return src;
  }, 2));

  try {
    // Wait for the FIRST successful provider to resolve
    return await Promise.any(promises);
  } catch (aggregateError) {
    // If ALL providers fail, Promise.any throws an AggregateError
    const providerNames = ['anipub', 'hianime', 'owais'];
    const attempts = aggregateError.errors.map((e, i) => ({
      provider: providerNames[i] || 'unknown',
      error: e.message
    }));
    
    const err = new Error('No playable sources available');
    err.attempts = attempts;
    throw err;
  }
}
