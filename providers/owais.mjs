const BASE_URL = 'https://owais-anime-stream-open.onrender.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept': 'application/json' },
    signal: AbortSignal.timeout(5000)
  });
  if (!res.ok) throw new Error(`Owais HTTP ${res.status}`);
  return res.json();
}

export async function owaisSearch(query) {
  const data = await fetchJson(`${BASE_URL}/api/search?q=${encodeURIComponent(query)}&perPage=10`);
  return data.results || [];
}

export async function owaisGetSource(title, epNo, mode = 'sub') {
  // 1. Search for title
  const results = await owaisSearch(title);
  if (!results.length) {
    throw new Error(`No search results on Owais for title: ${title}`);
  }

  // 2. Exact or closest match
  // We prefer exact title match on romaji or english
  const lowerTitle = title.toLowerCase();
  let match = results.find(r => 
    (r.title?.english || '').toLowerCase() === lowerTitle || 
    (r.title?.romaji || '').toLowerCase() === lowerTitle
  );
  if (!match) match = results[0]; // fallback to first result

  const slug = match.slug;
  if (!slug) throw new Error(`Owais search result missing slug for title: ${title}`);

  // 3. Get stream
  // Mode isn't perfectly supported in this API format, we pass lang=sub or dub.
  const streamData = await fetchJson(`${BASE_URL}/api/stream/${slug}/${epNo}?lang=${mode}`);
  
  if (!streamData.sources || streamData.sources.length === 0) {
    throw new Error(`No sources found on Owais for title: ${title} ep: ${epNo}`);
  }

  // 4. Return highest priority stream (usually HD-1)
  const source = streamData.sources[0];
  
  // They return "embed" type which the CLI knows to open in browser
  return {
    url: source.url,
    embedUrl: source.embed || source.url,
    quality: 'Owais (Embed)',
    type: 'embed',
    isM3U8: false,
    provider: 'owais'
  };
}
