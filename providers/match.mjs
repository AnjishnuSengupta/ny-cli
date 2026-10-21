/**
 * Scoring and matching engine for search results across anime providers.
 * Evaluates title similarity (English, romaji, native), season/part matching,
 * release year, episode counts, and external IDs (MAL / AniList).
 */

const ROMAN_NUMERALS = [
  [/\b(vii|7th)\b/gi, '7'],
  [/\b(vi|6th)\b/gi, '6'],
  [/\b(v|5th)\b/gi, '5'],
  [/\b(iv|4th)\b/gi, '4'],
  [/\b(iii|3rd)\b/gi, '3'],
  [/\b(ii|2nd)\b/gi, '2'],
  [/\b(i|1st)\b/gi, '1'],
];

/**
 * Normalizes title string for comparison.
 */
export function normalizeTitle(str) {
  if (!str || typeof str !== 'string') return '';
  let s = str.toLowerCase();

  // Normalize Roman numerals / ordinal season indicators
  for (const [regex, num] of ROMAN_NUMERALS) {
    s = s.replace(regex, num);
  }

  // Remove punctuation, collapse whitespace
  s = s.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  return s;
}

/**
 * Extracts season number from a string, or null if unspecified.
 */
export function extractSeason(str) {
  if (!str || typeof str !== 'string') return null;
  const s = str.toLowerCase();

  // Pattern: season 2, s2, 2nd season, etc.
  const seasonMatch = s.match(/\b(?:season|s)\s*(\d+)\b/i) ||
                      s.match(/\b(\d+)(?:nd|rd|th|st)\s*season\b/i);
  if (seasonMatch) return parseInt(seasonMatch[1], 10);

  // Check Roman numeral at end of title: e.g. "Mob Psycho 100 II" -> 2
  if (/\b(?:vii)\b/i.test(s)) return 7;
  if (/\b(?:vi)\b/i.test(s)) return 6;
  if (/\b(?:v)\b/i.test(s)) return 5;
  if (/\b(?:iv)\b/i.test(s)) return 4;
  if (/\b(?:iii)\b/i.test(s)) return 3;
  if (/\b(?:ii)\b/i.test(s)) return 2;

  // Final Season / The Final Season
  if (/\bfinal\s*season\b/i.test(s) || /\bthe\s*final\b/i.test(s)) {
    return 'final';
  }

  return null;
}

/**
 * Generates character bigrams for Dice coefficient.
 */
function getBigrams(str) {
  const bigrams = new Set();
  for (let i = 0; i < str.length - 1; i++) {
    bigrams.add(str.slice(i, i + 2));
  }
  return bigrams;
}

/**
 * Computes Dice similarity between two strings (0.0 to 1.0).
 */
export function diceSimilarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;

  const bgA = getBigrams(a);
  const bgB = getBigrams(b);
  if (bgA.size === 0 || bgB.size === 0) return 0;

  let intersection = 0;
  for (const bg of bgA) {
    if (bgB.has(bg)) intersection++;
  }

  return (2 * intersection) / (bgA.size + bgB.size);
}

/**
 * Computes token-based overlap similarity between two strings (0.0 to 1.0).
 */
export function tokenSimilarity(a, b) {
  const tokensA = new Set(a.split(' ').filter(Boolean));
  const tokensB = new Set(b.split(' ').filter(Boolean));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let intersection = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) intersection++;
  }

  const union = new Set([...tokensA, ...tokensB]).size;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Calculates overall title similarity (0 to 100) comparing a candidate title
 * against target context titles (English, romaji, native).
 */
export function computeTitleSimilarity(candTitle, contextTitles) {
  const normCand = normalizeTitle(candTitle);
  if (!normCand) return 0;

  const targetList = [
    contextTitles.english,
    contextTitles.romaji,
    contextTitles.native,
  ].filter(Boolean);

  if (targetList.length === 0) return 0;

  let maxSim = 0;
  for (const t of targetList) {
    const normTarget = normalizeTitle(t);
    if (!normTarget) continue;
    if (normCand === normTarget) {
      return 100;
    }

    const dice = diceSimilarity(normCand, normTarget);
    const token = tokenSimilarity(normCand, normTarget);
    // Weighted combination: 60% token overlap + 40% character bigrams
    const combined = (token * 0.6 + dice * 0.4) * 100;
    if (combined > maxSim) maxSim = combined;
  }

  return Math.round(maxSim);
}

/**
 * Evaluates candidate matching score against context.
 *
 * @param {object} candidate
 * @param {object} context Target context
 * @param {object} [extractors]
 * @returns {{ score: number, details: object }}
 */
export function scoreMatch(candidate, context, extractors = {}) {
  const getTitle = extractors.getTitle || ((c) => c.title || c.name || c.slug || '');
  const getYear = extractors.getYear || ((c) => c.year || c.releaseYear || null);
  const getEpCount = extractors.getEpCount || ((c) => c.episodeCount || c.episodes || c.availableEpisodes || null);
  const getMalId = extractors.getMalId || ((c) => c.malId || null);
  const getAniListId = extractors.getAniListId || ((c) => c.anilistId || null);

  const candTitle = getTitle(candidate);
  const candYear = parseInt(getYear(candidate), 10) || null;
  const candEps = parseInt(getEpCount(candidate), 10) || null;
  const candMalId = parseInt(getMalId(candidate), 10) || null;
  const candAniListId = parseInt(getAniListId(candidate), 10) || null;

  const contextTitles = context.titles || {
    english: context.title || '',
    romaji: context.title || '',
  };
  const contextYear = parseInt(context.year, 10) || null;
  const contextEps = parseInt(context.episodeCount, 10) || null;
  const contextMalId = parseInt(context.malId, 10) || null;
  const contextAniListId = parseInt(context.anilistId, 10) || null;

  // 1. Direct ID match check
  if ((contextMalId && candMalId && contextMalId === candMalId) ||
      (contextAniListId && candAniListId && contextAniListId === candAniListId)) {
    return {
      score: 100,
      details: { idMatch: true, titleScore: 100, reason: 'exact ID match' },
    };
  }

  // 2. Base title similarity (0..100)
  const titleScore = computeTitleSimilarity(candTitle, contextTitles);
  let totalScore = titleScore;

  // 3. Season matching
  // Extract season from context (using target titles or context.season)
  let targetSeason = context.season != null ? context.season : null;
  if (targetSeason == null) {
    for (const t of [contextTitles.english, contextTitles.romaji].filter(Boolean)) {
      const s = extractSeason(t);
      if (s != null) {
        targetSeason = s;
        break;
      }
    }
  }
  const candSeason = extractSeason(candTitle) || (candidate.slug ? extractSeason(candidate.slug) : null);

  let seasonBonus = 0;
  if (targetSeason != null && candSeason != null) {
    if (String(targetSeason) === String(candSeason)) {
      seasonBonus = 15;
    } else {
      // Severe mismatch penalty if seasons explicitly differ (e.g. season 2 vs season 1)
      seasonBonus = -40;
    }
  } else if (targetSeason != null && targetSeason !== 1 && candSeason == null) {
    // Target explicitly wanted Season 2+, but candidate didn't specify season (likely Season 1)
    seasonBonus = -30;
  } else if (targetSeason == null && candSeason != null && candSeason !== 1) {
    // Target had no season (implying season 1), but candidate is Season 2+
    seasonBonus = -30;
  }
  totalScore += seasonBonus;

  // 4. Release year matching
  let yearBonus = 0;
  if (contextYear && candYear) {
    const diff = Math.abs(contextYear - candYear);
    if (diff === 0) {
      yearBonus = 15;
    } else if (diff === 1) {
      yearBonus = 5;
    } else {
      yearBonus = -Math.min(25, diff * 5);
    }
  }
  totalScore += yearBonus;

  // 5. Episode count matching
  let epBonus = 0;
  if (contextEps && candEps) {
    const diff = Math.abs(contextEps - candEps);
    if (diff === 0) {
      epBonus = 10;
    } else if (diff <= 2) {
      epBonus = 5;
    } else if (diff > Math.max(contextEps, candEps) * 0.4) {
      epBonus = -15;
    }
  }
  totalScore += epBonus;

  // Clamp score between 0 and 100
  const finalScore = Math.max(0, Math.min(100, Math.round(totalScore)));

  return {
    score: finalScore,
    details: {
      titleScore,
      seasonBonus,
      yearBonus,
      epBonus,
      candTitle,
      candYear,
      candSeason,
      targetSeason,
    },
  };
}

/**
 * Evaluates a list of search results, ranks them by score, and returns
 * the best confident match or reports 'no confident match'.
 *
 * @param {Array<object>} candidates
 * @param {object} context Target context
 * @param {object} [options]
 * @returns {{ match: object | null, score: number, reason?: string, ranked: Array<object> }}
 */
export function findBestMatch(candidates, context, options = {}) {
  const minScore = options.minScore ?? 50;
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return { match: null, score: 0, reason: 'no search results to match', ranked: [] };
  }

  const ranked = candidates.map((c) => {
    const res = scoreMatch(c, context, options.extractors);
    return {
      candidate: c,
      score: res.score,
      details: res.details,
    };
  });

  ranked.sort((a, b) => b.score - a.score);

  const best = ranked[0];
  if (!best || best.score < minScore) {
    const bestScore = best ? best.score : 0;
    return {
      match: null,
      score: bestScore,
      reason: `no confident match (best score ${bestScore} < ${minScore})`,
      ranked,
    };
  }

  return {
    match: best.candidate,
    score: best.score,
    details: best.details,
    ranked,
  };
}
