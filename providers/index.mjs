import * as senshi from './senshi.mjs';
import * as hianime from './hianime.mjs';
import * as anipub from './anipub.mjs';
import * as owais from './owais.mjs';
import * as allanime from './allanime.mjs';
import * as anidb from './anidb.mjs';
import { loadConfig } from '../config.mjs';

export const providers = [
  senshi,
  hianime,
  anipub,
  owais,
  allanime,
  anidb,
];

const TIER1_ORDER = ['senshi', 'hianime', 'allanime', 'anidb'];
const TIER2_ORDER = ['anipub', 'owais'];

function sortCandidates(list, tierOrder) {
  return list.sort((a, b) => {
    // 1. Provider priority
    const pA = tierOrder.indexOf(a.provider);
    const pB = tierOrder.indexOf(b.provider);
    const idxA = pA === -1 ? 99 : pA;
    const idxB = pB === -1 ? 99 : pB;
    if (idxA !== idxB) return idxA - idxB;

    // 2. Type preference (HLS > MP4 > embed)
    const typeScore = (t) => (t === 'hls' ? 3 : t === 'mp4' ? 2 : 1);
    const scoreA = typeScore(a.type);
    const scoreB = typeScore(b.type);
    if (scoreA !== scoreB) return scoreB - scoreA;

    return 0;
  });
}

/**
 * Runs a group of providers concurrently with an AbortController.
 * When the first provider succeeds, a 1.5s grace period collects any other
 * providers that finish promptly, then aborts the remaining ones.
 */
async function resolveTierGroup(tierProviders, tierOrder, context, attempts) {
  const controller = new AbortController();
  const parentSignal = context.signal;
  if (parentSignal) {
    if (parentSignal.aborted) {
      controller.abort();
    } else {
      parentSignal.addEventListener('abort', () => controller.abort(), { once: true });
    }
  }

  const collected = [];
  let firstResolved = false;
  let graceTimer = null;

  const promises = tierProviders.map(async (p) => {
    const start = Date.now();
    try {
      const results = await p.resolve({
        ...context,
        signal: controller.signal,
      });
      const timeMs = Date.now() - start;

      if (Array.isArray(results) && results.length > 0) {
        attempts.push({ provider: p.name, tier: p.tier, success: true, count: results.length, timeMs });
        collected.push(...results);

        // Start grace period of 1.5 seconds after first provider returns candidates
        if (!firstResolved) {
          firstResolved = true;
          graceTimer = setTimeout(() => {
            controller.abort();
          }, 1500);
        }
      } else {
        attempts.push({ provider: p.name, tier: p.tier, success: false, timeMs, error: 'no candidates returned' });
      }
    } catch (err) {
      const timeMs = Date.now() - start;
      const isAborted = controller.signal.aborted || err.name === 'AbortError' || err.message?.includes('aborted');
      attempts.push({
        provider: p.name,
        tier: p.tier,
        success: false,
        timeMs,
        error: isAborted ? 'cancelled after first candidate' : (err.message || String(err)),
      });
    }
  });

  await Promise.allSettled(promises);
  if (graceTimer) clearTimeout(graceTimer);

  return sortCandidates(collected, tierOrder);
}

/**
 * Standard resolve function across provider tiers.
 * Tier 1: Direct HLS / MP4 streams (senshi, hianime, allanime)
 * Tier 2: Web embeds (anipub, owais) — executed ONLY if Tier 1 returns 0 candidates.
 *
 * @param {import('../docs/providers-types.md').ResolveContext} context
 * @returns {Promise<{ candidates: Array<any>, attempts: Array<{ provider: string, tier: number, success: boolean, timeMs: number, error?: string }> }>}
 */
export async function resolve(context) {
  const attempts = [];
  const cfg = context?.config || loadConfig();
  const providerFlags = cfg?.providers || {};

  const isEnabled = (p) => providerFlags[p.name] !== false;

  const tier1Providers = providers.filter(p => p.tier === 1 && isEnabled(p));
  const tier2Providers = providers.filter(p => p.tier === 2 && isEnabled(p));

  // Record disabled Tier 1 providers in attempts
  for (const p of providers.filter(p => p.tier === 1 && !isEnabled(p))) {
    attempts.push({
      provider: p.name,
      tier: p.tier,
      success: false,
      timeMs: 0,
      error: 'disabled in config',
    });
  }

  // 1. Run Tier 1 providers concurrently with 1.5s grace period after first success
  const tier1Candidates = await resolveTierGroup(tier1Providers, TIER1_ORDER, context, attempts);
  if (tier1Candidates.length > 0) {
    return { candidates: tier1Candidates, attempts };
  }

  // Record disabled Tier 2 providers in attempts (only when Tier 1 fails)
  for (const p of providers.filter(p => p.tier === 2 && !isEnabled(p))) {
    attempts.push({
      provider: p.name,
      tier: p.tier,
      success: false,
      timeMs: 0,
      error: 'disabled in config',
    });
  }

  // 2. Only if Tier 1 returned nothing, run Tier 2 (embeds)
  const tier2Candidates = await resolveTierGroup(tier2Providers, TIER2_ORDER, context, attempts);
  return { candidates: tier2Candidates, attempts };
}


/**
 * Backward compatibility helper for existing backend route.
 */
export async function resolveStream(title, epNo, mode = 'sub', malId = null) {
  const context = {
    malId,
    titles: {
      english: title,
      romaji: title,
    },
    episodeNumber: Number(epNo) || 1,
    audioKind: mode === 'dub' ? 'dub' : 'sub',
  };

  const { candidates, attempts } = await resolve(context);
  if (!candidates || candidates.length === 0) {
    const err = new Error('No playable sources available');
    err.attempts = attempts;
    throw err;
  }

  return candidates[0];
}
