import { scoreMatch } from './match.mjs';

export const name = 'anidb';
export const tier = 1;

const ANIDB_BASE = 'https://anidb.app';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

let impitModule = null;
let impitClient = null;
let impitError = null;

try {
  const { Impit, Browser } = await import('impit');
  impitClient = new Impit({ browser: Browser.Chrome });
} catch (err) {
  impitError = err?.message || 'failed to load impit package';
}

/**
 * Checks if HTML contains a Cloudflare challenge page.
 */
export function isCloudflareChallenge(text) {
  if (!text || typeof text !== 'string') return false;
  return (
    text.includes('Just a moment...') ||
    text.includes('Enable JavaScript and cookies to continue') ||
    text.includes('cf-browser-verification') ||
    text.includes('challenge-platform') ||
    text.includes('cf-turnstile')
  );
}

/**
 * Fetches an address using Chrome-impersonating impit client.
 */
export async function anidbFetch(url, options = {}) {
  if (!impitClient) {
    throw new Error(`impit unavailable: ${impitError || 'not loaded'}`);
  }

  const { signal, timeout = 10000, ...rest } = options;
  const timeoutSignal = AbortSignal.timeout(timeout);
  const effectiveSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

  const res = await impitClient.fetch(url, {
    ...rest,
    signal: effectiveSignal,
    headers: {
      'User-Agent': UA,
      'Referer': `${ANIDB_BASE}/`,
      ...(options.headers || {}),
    },
  });

  const text = await res.text();
  const finalUrl = res.url || url;

  if (isCloudflareChallenge(text)) {
    throw new Error('Cloudflare challenge detected on anidb.app');
  }

  return { status: res.status, text, finalUrl, ok: res.ok };
}

/**
 * Extracts language code and name fields from anidb language entry.
 */
export function extractLangFields(lang) {
  const code = String(lang?.code || lang?.language || '').toLowerCase().trim();
  const name = String(lang?.name || lang?.label || lang?.title || '').trim();
  return { code, name };
}

/**
 * Classifies an anidb language entry as 'sub' or 'dub' from code and name only.
 * Rule: 'English Subtitles' must NEVER be treated as a dub.
 */
export function classifyLanguage(lang) {
  const { code, name } = extractLangFields(lang);
  const nameL = name.toLowerCase();

  // If subtitle in name -> always sub
  if (nameL.includes('subtitle') || nameL.includes('subtitles') || nameL.includes('napisy')) {
    return 'sub';
  }

  // Japanese code or original audio indicator -> sub
  if (['jpn', 'ja', 'japanese'].includes(code) ||
      nameL.includes('og soundtrack') ||
      nameL.includes('original') ||
      nameL.includes('japanese')) {
    return 'sub';
  }

  // English code or dub in name -> dub
  if (['eng', 'en', 'english'].includes(code) || nameL.includes('dub')) {
    return 'dub';
  }

  return 'sub';
}

/**
 * Returns human-readable label for language entry.
 */
export function getLanguageLabel(lang, kind) {
  const { code, name } = extractLangFields(lang);
  if (name) return name;
  if (kind === 'dub') return 'English Dub';
  if (['jpn', 'ja', 'japanese'].includes(code)) return 'OG Soundtrack';
  return 'English Subtitles';
}

/**
 * Extracts media link (.m3u8 or .mp4) from embed page HTML.
 */
export function extractMediaUrl(html) {
  if (!html || typeof html !== 'string') return null;

  // 1. file: assignment (highest priority)
  const fileMatch = html.match(/file:\s*['"]([^'"]+)['"]/i);
  if (fileMatch && fileMatch[1]) {
    return fileMatch[1].replace(/\\\//g, '/');
  }

  // 2. Quoted address ending in .m3u8 or .mp4
  const quotedMatch = html.match(/['"](https?:\/\/[^'"]+\.(?:m3u8|mp4)[^'"]*)['"]/i);
  if (quotedMatch && quotedMatch[1]) {
    return quotedMatch[1].replace(/\\\//g, '/');
  }

  return null;
}

/**
 * Resolves streams from anidb.app.
 */
export async function resolve(context) {
  if (!impitClient) {
    throw new Error(`impit unavailable: ${impitError || 'package not loaded'}`);
  }

  const { titles = {}, episodeNumber, audioKind = 'sub', signal } = context;
  const englishTitle = titles.english || context.title || '';
  const romajiTitle = titles.romaji || '';
  const titlesToTry = [englishTitle, romajiTitle].filter(Boolean);

  if (!titlesToTry.length) {
    throw new Error('Title required for anidb.app');
  }

  let anidbId = null;

  // 1. Search browse page with English title, then Romaji title
  for (const tTitle of titlesToTry) {
    const q = encodeURIComponent(tTitle).replace(/%20/g, '+');
    let searchPage, finalUrl;
    try {
      const res = await anidbFetch(`${ANIDB_BASE}/browse?q=${q}`, { signal });
      searchPage = res.text;
      finalUrl = res.finalUrl;
    } catch (err) {
      if (err.message.includes('Cloudflare challenge')) {
        throw err;
      }
      continue;
    }

    if (!searchPage) continue;

    // Check if direct redirect to anime details
    if (finalUrl && finalUrl.includes('/anime/')) {
      const m = finalUrl.match(/\/anime\/.*?-([0-9]+)/);
      if (m) {
        anidbId = m[1];
        break;
      }
    }

    // Match links: /anime/{slug}-{id}
    const matches = [...searchPage.matchAll(/\/anime\/([^"'>]+)-([0-9]+)["']/g)];
    if (matches.length > 0) {
      const candidates = matches.map(m => ({
        slug: m[1],
        title: m[1].replace(/-/g, ' '),
        id: m[2],
      }));

      // Score candidates with match.mjs scoring (including season bonus / penalty)
      let bestMatch = null;
      let bestScore = -1;

      for (const cand of candidates) {
        const { score } = scoreMatch(cand, context);
        if (score > bestScore) {
          bestScore = score;
          bestMatch = cand;
        }
      }

      // Minimum score threshold (45)
      if (bestMatch && bestScore >= 45) {
        anidbId = bestMatch.id;
        break;
      }
    }
  }

  if (!anidbId) {
    throw new Error('Anime not found on anidb.app');
  }

  // 2. Fetch series episode list
  const epsRes = await anidbFetch(`${ANIDB_BASE}/api/frontend/anime/${anidbId}/episodes`, { signal });
  let epsData = [];
  try {
    const parsed = JSON.parse(epsRes.text);
    epsData = Array.isArray(parsed) ? parsed : (parsed.data || parsed.episodes || []);
  } catch {
    throw new Error('Failed to parse episodes JSON from anidb.app');
  }

  if (!Array.isArray(epsData) || epsData.length === 0) {
    throw new Error(`No episodes found for anidb.app anime ID ${anidbId}`);
  }

  let epId = null;

  // 2a. Direct episode number match
  for (const ep of epsData) {
    if (ep && String(ep.number) === String(episodeNumber)) {
      epId = ep.id;
      break;
    }
  }

  // 2b. Absolute numbering fallback (sort numerically and take Nth)
  if (!epId) {
    const validEps = epsData.filter(ep => ep && ep.number != null && !isNaN(parseFloat(ep.number)));
    validEps.sort((a, b) => parseFloat(a.number) - parseFloat(b.number));
    const targetIdx = parseInt(episodeNumber, 10) - 1;
    if (targetIdx >= 0 && targetIdx < validEps.length) {
      epId = validEps[targetIdx].id;
    }
  }

  if (!epId) {
    throw new Error(`Episode ${episodeNumber} not found on anidb.app`);
  }

  // 3. Fetch episode languages
  const langsRes = await anidbFetch(`${ANIDB_BASE}/api/frontend/episode/${epId}/languages`, { signal });
  let langsData = [];
  try {
    const parsed = JSON.parse(langsRes.text);
    langsData = Array.isArray(parsed) ? parsed : (parsed.data || parsed.languages || []);
  } catch {
    throw new Error('Failed to parse languages JSON from anidb.app');
  }

  if (!Array.isArray(langsData) || langsData.length === 0) {
    throw new Error(`No languages available for episode ${episodeNumber} on anidb.app`);
  }

  // 4. Fetch each embed page and extract media address
  const candidates = [];
  let sourceIndex = 1;

  for (const lang of langsData) {
    if (!lang || !lang.embed_url) continue;

    const kind = classifyLanguage(lang);
    if (audioKind && kind !== audioKind) {
      continue;
    }

    const label = getLanguageLabel(lang, kind);
    const cleanEmbedUrl = lang.embed_url.replace(/\\\//g, '/');

    try {
      const embedPage = await anidbFetch(cleanEmbedUrl, { signal });
      const mediaUrl = extractMediaUrl(embedPage.text);

      if (mediaUrl) {
        const isHls = mediaUrl.includes('.m3u8');
        candidates.push({
          url: mediaUrl,
          type: isHls ? 'hls' : 'mp4',
          referer: `${ANIDB_BASE}/`,
          headers: {
            'User-Agent': UA,
            'Referer': `${ANIDB_BASE}/`,
          },
          subtitleTracks: [],
          audioKind: kind,
          quality: `anidb.app (${label} ${sourceIndex++})`,
          provider: name,
          tier,
        });
      }
    } catch (e) {
      // Continue to next embed if one fails
    }
  }

  if (candidates.length === 0) {
    throw new Error(`No playable streams found on anidb.app for mode ${audioKind}`);
  }

  return candidates;
}
