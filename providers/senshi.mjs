const SENSHI_BASE = 'https://senshi.live';
const SENSHI_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function senshiFetch(path, opts = {}) {
  const res = await fetch(`${SENSHI_BASE}${path}`, {
    headers: { 'User-Agent': SENSHI_UA, 'Referer': `${SENSHI_BASE}/`, ...(opts.headers || {}) },
    signal: AbortSignal.timeout(8000),
    ...opts,
  });
  if (!res.ok) throw new Error(`senshi HTTP ${res.status}`);
  return res.json();
}

export async function senshiSearch(query) {
  return senshiFetch('/anime/filter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ searchTerm: query, page: 1, limit: 25 }),
  });
}

export async function senshiGetSource(malId, epNo, mode = 'sub') {
  const embeds = await senshiFetch(`/episode-embeds/${malId}/${epNo}`);
  if (!embeds?.length) {
    throw new Error(`No embeds found on Senshi for MAL ID ${malId} Ep ${epNo}`);
  }
  
  const wantStatus = mode === 'dub' ? 'Dub' : 'HardSub';
  const match = embeds.find(e => (e.status || '').toLowerCase() === wantStatus.toLowerCase());
  
  if (!match?.url) {
    throw new Error(`No match found on Senshi for mode: ${mode}`);
  }
  
  return {
    url: match.url,
    embedUrl: null,
    quality: 'Senshi (HLS)',
    type: 'hls',
    isM3U8: true,
    referer: `${SENSHI_BASE}/`,
    tracks: [], // verify if there are external tracks
    provider: 'senshi',
  };
}
