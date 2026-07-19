const ANIPUB_BASE = 'https://anipub.xyz';
const MEGAPLAY_BASE = 'https://megaplay.buzz';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function anipubFetchText(url, referer) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Referer: referer }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`anipub HTTP ${res.status}`);
  return res.text();
}
async function anipubFetchJson(url, referer) {
  return JSON.parse(await anipubFetchText(url, referer));
}

export async function anipubSearch(query) {
  const results = await anipubFetchJson(`${ANIPUB_BASE}/api/search/${encodeURIComponent(query)}`, `${ANIPUB_BASE}/`);
  return Array.isArray(results) ? results : [];
}

export async function anipubGetSource(title, epNo, mode = 'sub') {
  try {
    // 1. Search for title
    const results = await anipubSearch(title);
    if (!results.length) return null;
    
    // Exact or closest match
    let match = results.find(r => r.Name.toLowerCase() === title.toLowerCase());
    if (!match) match = results[0]; // fallback to first result

    const anipubId = match.Id;
    
    // 2. Fetch episode page to extract the video URL
    // e.g. https://anipub.xyz/AniPlayer/113/0 for ep 1
    const epIndex = epNo - 1;
    const playerPageHtml = await anipubFetchText(`${ANIPUB_BASE}/AniPlayer/${anipubId}/${epIndex}`, `${ANIPUB_BASE}/`);
    
    const iframeMatch = playerPageHtml.match(/<iframe\s+src=['"]?(https:\/\/(www\.)?anipub\.xyz\/[Vv]ideo\/\d+\/(sub|dub))['"]?/i);
    if (!iframeMatch) return null;
    
    let videoLink = iframeMatch[1];
    
    // Override sub/dub if mode differs
    if (mode === 'dub') {
      videoLink = videoLink.replace(/\/sub$/, '/dub');
    } else {
      videoLink = videoLink.replace(/\/dub$/, '/sub');
    }

    return await resolveMegaplayDataId(videoLink, mode);
  } catch (e) {
    console.error(`[anipub] Error: ${e.message}`);
    return null;
  }
}

export async function resolveMegaplayDataId(videoLink, mode = 'sub') {
  const m = videoLink.match(/\/[Vv]ideo\/(\d+)\/(sub|dub)/);
  if (!m) throw new Error(`unsupported anipub video link: ${videoLink}`);
  const [, embedId] = m;
  const linkMode = mode === 'dub' ? 'dub' : 'sub';

  const streamPage = `${MEGAPLAY_BASE}/stream/s-2/${embedId}/${linkMode}`;
  const html = await anipubFetchText(streamPage, `${ANIPUB_BASE}/`);

  const dataIdMatch = html.match(/data-id="(\d+)"/);
  if (!dataIdMatch) throw new Error('megaplay data-id not found');

  const sourcesUrl = `${MEGAPLAY_BASE}/stream/getSources?id=${dataIdMatch[1]}`;
  const payload = await anipubFetchJson(sourcesUrl, streamPage);

  const streamUrl = payload?.sources?.file;
  if (!streamUrl) throw new Error('megaplay stream url missing');

  let subtitle = '';
  if (mode !== 'dub' && Array.isArray(payload.tracks)) {
    const englishTrack = payload.tracks.find(t =>
      (t.kind || '').toLowerCase() === 'captions' &&
      (t.default || /english/i.test(t.label || ''))
    );
    subtitle = englishTrack?.file || payload.tracks.find(t => (t.kind || '').toLowerCase() === 'captions')?.file || '';
  }

  return { 
    url: streamUrl, 
    embedUrl: streamPage,
    quality: `Anipub (HLS)`,
    type: 'hls',
    isM3U8: true,
    subtitle, 
    referer: `${MEGAPLAY_BASE}/`,
    provider: 'anipub' 
  };
}
