import { httpFetch } from '../net.mjs';
import { findBestMatch } from './match.mjs';

export const name = 'owais';
export const tier = 2;

const BASE_URL = 'https://owais-anime-stream-open.onrender.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function fetchJson(url, signal) {
  const timeoutSignal = AbortSignal.timeout(6000);
  const effectiveSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

  const res = await httpFetch(url, {
    headers: { 'User-Agent': UA, 'Accept': 'application/json' },
    signal: effectiveSignal,
  });
  if (!res.ok) throw new Error(`Owais HTTP ${res.status}`);
  return res.json();
}

export async function owaisSearch(query, signal) {
  const data = await fetchJson(`${BASE_URL}/api/search?q=${encodeURIComponent(query)}&perPage=10`, signal);
  return data.results || [];
}

export async function owaisGetSource(title, epNo, mode = 'sub') {
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
    throw new Error('Title is required for Owais');
  }

  // 1. Search for title
  const results = await owaisSearch(title, signal);
  if (!results.length) {
    throw new Error(`No search results on Owais for title: ${title}`);
  }

  const matchResult = findBestMatch(results, context, {
    extractors: {
      getTitle: (r) => r.title?.english || r.title?.romaji || r.slug || '',
      getYear: (r) => r.year,
    },
  });

  if (!matchResult.match) {
    throw new Error(matchResult.reason || 'no confident match');
  }

  const match = matchResult.match;
  const slug = match.slug;
  if (!slug) throw new Error(`Owais search result missing slug for title: ${title}`);

  // 2. Fetch stream data
  const streamData = await fetchJson(`${BASE_URL}/api/stream/${slug}/${episodeNumber}?lang=${audioKind}`, signal);
  
  if (!streamData.sources || streamData.sources.length === 0) {
    throw new Error(`No sources found on Owais for title: ${title} ep: ${episodeNumber}`);
  }

  const source = streamData.sources[0];
  
  return [
    {
      url: source.url,
      embedUrl: source.embed || source.url,
      quality: 'Owais (Embed)',
      type: 'embed',
      referer: source.embed || source.url,
      subtitleTracks: [],
      audioKind,
      provider: name,
      tier,
    },
  ];
}
