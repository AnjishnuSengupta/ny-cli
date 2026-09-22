const ANIPUB_BASE = 'https://anipub.xyz';
const MEGAPLAY_BASE = 'https://megaplay.buzz';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function anipubFetchText(url, referer) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Referer: referer }, signal: AbortSignal.timeout(5000) });
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
  // 1. Search for title
  const results = await anipubSearch(title);
  if (!results.length) {
    throw new Error(`No search results on Anipub for title: ${title}`);
  }
  
  // Exact or closest match
  let match = results.find(r => (r?.Name ?? r?.name ?? '').toLowerCase() === title.toLowerCase());
  if (!match) match = results[0]; // fallback to first result

  const anipubId = match?.Id ?? match?.id;
  
  // 2. Fetch episode page to extract the video URL
  // e.g. https://anipub.xyz/AniPlayer/113/0 for ep 1
  const epIndex = epNo - 1;
  const playerPageHtml = await anipubFetchText(`${ANIPUB_BASE}/AniPlayer/${anipubId}/${epIndex}`, `${ANIPUB_BASE}/`);
  
  const iframeMatch = playerPageHtml.match(/<iframe\s+src=['"]?([^'"\s>]+)['"]?/i);
  if (!iframeMatch) {
    throw new Error(`Anipub nested iframe not found for title: ${title} (Anipub ID: ${anipubId}, epIndex: ${epIndex})`);
  }
  
  let videoLink = iframeMatch[1];
  
  if (videoLink.includes('anipub.xyz/video/') || videoLink.includes('anipub.xyz/Video/')) {
    // Override sub/dub if mode differs
    if (mode === 'dub') {
      videoLink = videoLink.replace(/\/sub$/, '/dub');
    } else {
      videoLink = videoLink.replace(/\/dub$/, '/sub');
    }
    return await resolveMegaplayDataId(videoLink, mode);
  }

  // Otherwise, it's a direct embed (like gogoanime)
  return {
    url: videoLink,
    embedUrl: videoLink,
    quality: 'Anipub (Embed)',
    type: 'embed',
    isM3U8: false,
    provider: 'anipub'
  };
}

export async function resolveMegaplayDataId(videoLink, mode = 'sub') {
  const m = videoLink.match(/\/[Vv]ideo\/(\d+)\/(sub|dub)/);
  if (!m) throw new Error(`unsupported anipub video link: ${videoLink}`);

  // Fetch intermediate page (anipub.xyz/video/...)
  const intermediateHtml = await anipubFetchText(videoLink, `${ANIPUB_BASE}/`);
  const embedMatch = intermediateHtml.match(/<iframe\s+src=['"]?(https:\/\/(megaplay\.buzz|anikoto\.live)\/[^'"\s>]+)['"]?/i);
  if (!embedMatch) throw new Error(`megaplay/anikoto iframe not found in intermediate page ${videoLink}`);
  
  const streamPage = embedMatch[1];
  
  // Megaplay recently encrypted their getSources response, meaning we can no longer
  // easily extract the raw m3u8 link. However, ny-cli supports embeds, so we can 
  // just return the Megaplay stream page itself as an embed.
  
  return { 
    url: streamPage, 
    embedUrl: streamPage,
    quality: `Anipub (Embed)`,
    type: 'embed',
    isM3U8: false,
    subtitle: '', 
    referer: `${MEGAPLAY_BASE}/`,
    provider: 'anipub' 
  };
}
