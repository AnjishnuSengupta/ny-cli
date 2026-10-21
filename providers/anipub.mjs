import { httpFetch } from '../net.mjs';
import { findBestMatch } from './match.mjs';

export const name = 'anipub';
export const tier = 2;

const ANIPUB_BASE = 'https://anipub.xyz';
const MEGAPLAY_BASE = 'https://megaplay.buzz';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function anipubFetchText(url, referer, signal) {
  const timeoutSignal = AbortSignal.timeout(6000);
  const effectiveSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

  const res = await httpFetch(url, {
    headers: { 'User-Agent': UA, Referer: referer },
    signal: effectiveSignal,
  });
  if (!res.ok) throw new Error(`anipub HTTP ${res.status}`);
  return res.text();
}

async function anipubFetchJson(url, referer, signal) {
  return JSON.parse(await anipubFetchText(url, referer, signal));
}

export async function anipubSearch(query, signal) {
  const results = await anipubFetchJson(`${ANIPUB_BASE}/api/search/${encodeURIComponent(query)}`, `${ANIPUB_BASE}/`, signal);
  return Array.isArray(results) ? results : [];
}

export async function anipubGetSource(title, epNo, mode = 'sub') {
  return resolve({
    titles: { english: title, romaji: title },
    episodeNumber: epNo,
    audioKind: mode,
  }).then(candidates => candidates[0]);
}

export async function resolve(context) {
  const { titles = {}, episodeNumber, audioKind = 'sub', signal } = context;
  const title = titles.english || titles.romaji || titles.native;
  if (!title) {
    throw new Error('Title is required for Anipub');
  }

  // 1. Search for title
  const results = await anipubSearch(title, signal);
  if (!results.length) {
    throw new Error(`No search results on Anipub for title: ${title}`);
  }
  
  const matchResult = findBestMatch(results, context, {
    extractors: {
      getTitle: (r) => r?.Name ?? r?.name ?? '',
    },
  });

  if (!matchResult.match) {
    throw new Error(matchResult.reason || 'no confident match');
  }

  const match = matchResult.match;
  const anipubId = match?.Id ?? match?.id;
  
  // 2. Fetch episode page to extract the video URL
  const epIndex = episodeNumber - 1;
  const playerPageHtml = await anipubFetchText(`${ANIPUB_BASE}/AniPlayer/${anipubId}/${epIndex}`, `${ANIPUB_BASE}/`, signal);
  
  const iframeMatch = playerPageHtml.match(/<iframe\s+src=['"]?([^'"\s>]+)['"]?/i);
  if (!iframeMatch) {
    throw new Error(`Anipub nested iframe not found for title: ${title} (Anipub ID: ${anipubId}, epIndex: ${epIndex})`);
  }
  
  let videoLink = iframeMatch[1];
  
  if (videoLink.includes('anipub.xyz/video/') || videoLink.includes('anipub.xyz/Video/')) {
    if (audioKind === 'dub') {
      videoLink = videoLink.replace(/\/sub$/, '/dub');
    } else {
      videoLink = videoLink.replace(/\/dub$/, '/sub');
    }
    const mega = await resolveMegaplayDataId(videoLink, audioKind, signal);
    return [mega];
  }

  // Direct embed fallback
  return [
    {
      url: videoLink,
      embedUrl: videoLink,
      quality: 'Anipub (Embed)',
      type: 'embed',
      referer: `${ANIPUB_BASE}/`,
      subtitleTracks: [],
      audioKind,
      provider: name,
      tier,
    },
  ];
}

export async function resolveMegaplayDataId(videoLink, mode = 'sub', signal) {
  const m = videoLink.match(/\/[Vv]ideo\/(\d+)\/(sub|dub)/);
  if (!m) throw new Error(`unsupported anipub video link: ${videoLink}`);

  const intermediateHtml = await anipubFetchText(videoLink, `${ANIPUB_BASE}/`, signal);
  const embedMatch = intermediateHtml.match(/<iframe\s+src=['"]?(https:\/\/(megaplay\.buzz|anikoto\.live)\/[^'"\s>]+)['"]?/i);
  if (!embedMatch) throw new Error(`megaplay/anikoto iframe not found in intermediate page ${videoLink}`);
  
  const streamPage = embedMatch[1];
  
  return { 
    url: streamPage, 
    embedUrl: streamPage,
    quality: `Anipub (Embed)`,
    type: 'embed',
    referer: `${MEGAPLAY_BASE}/`,
    subtitleTracks: [],
    audioKind: mode,
    provider: name,
    tier,
  };
}
