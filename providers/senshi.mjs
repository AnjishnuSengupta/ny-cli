import { httpFetch } from '../net.mjs';

export const name = 'senshi';
export const tier = 1;

const SENSHI_BASE = 'https://senshi.live';
const SENSHI_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function senshiFetch(path, opts = {}) {
  const { headers: optHeaders, signal, ...restOpts } = opts;
  const timeoutSignal = AbortSignal.timeout(8000);
  const effectiveSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

  const res = await httpFetch(`${SENSHI_BASE}${path}`, {
    ...restOpts,
    signal: effectiveSignal,
    headers: {
      'User-Agent': SENSHI_UA,
      'Referer': `${SENSHI_BASE}/`,
      ...(optHeaders || {}),
    },
  });
  if (!res.ok) throw new Error(`senshi HTTP ${res.status}`);
  return res.json();
}

export async function senshiSearch(query, signal) {
  return senshiFetch('/anime/filter', {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ searchTerm: query, page: 1, limit: 25 }),
  });
}

export async function senshiGetSource(malId, epNo, mode = 'sub') {
  return resolve({
    malId,
    episodeNumber: epNo,
    audioKind: mode,
  }).then(candidates => candidates[0]);
}

export async function resolve(context) {
  const { malId, episodeNumber, audioKind = 'sub', signal } = context;
  if (!malId) {
    throw new Error('MAL ID is required for Senshi');
  }

  const embeds = await senshiFetch(`/episode-embeds/${malId}/${episodeNumber}`, { signal });
  if (!embeds || !embeds.length) {
    throw new Error(`No embeds found on Senshi for MAL ID ${malId} Ep ${episodeNumber}`);
  }

  const wantStatus = audioKind === 'dub' ? 'Dub' : 'HardSub';
  const match = embeds.find(e => (e.status || '').toLowerCase() === wantStatus.toLowerCase()) || embeds[0];

  if (!match?.url) {
    throw new Error(`No Senshi stream found for mode: ${audioKind}`);
  }

  return [
    {
      url: match.url,
      type: 'hls',
      referer: `${SENSHI_BASE}/`,
      headers: {
        'User-Agent': SENSHI_UA,
        'Referer': `${SENSHI_BASE}/`,
      },
      subtitleTracks: [],
      audioKind,
      quality: `Senshi (${match.status || 'HLS'})`,
      provider: name,
      tier,
    },
  ];
}
