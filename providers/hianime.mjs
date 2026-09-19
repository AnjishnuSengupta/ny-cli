const BASE_URL = 'https://hianime.at';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

async function fetchHtml(url, referer) {
  const res = await fetch(url, { 
    headers: { 
      'User-Agent': UA, 
      'Referer': referer || BASE_URL,
      'X-Requested-With': 'XMLHttpRequest'
    },
    signal: AbortSignal.timeout(10000)
  });
  if (!res.ok) throw new Error(`HiAnime HTTP ${res.status}`);
  return res.text();
}

async function fetchJson(url, referer) {
  const res = await fetch(url, { 
    headers: { 
      'User-Agent': UA, 
      'Referer': referer || BASE_URL,
      'X-Requested-With': 'XMLHttpRequest'
    },
    signal: AbortSignal.timeout(10000)
  });
  if (!res.ok) throw new Error(`HiAnime HTTP ${res.status}`);
  return res.json();
}

export async function hianimeSearch(query) {
  const html = await fetchHtml(`${BASE_URL}/search?keyword=${encodeURIComponent(query)}`);
  
  // Strip out the main-sidebar so we don't match "Top Airing" anime by accident
  const mainContent = html.split('id="main-sidebar"')[0];
  
  const results = [];
  const regex = /<h3 class="film-name">\s*<a href="[^"]*\/([^"/]*)"[^>]*title="([^"]*)"/ig;
  let match;
  while ((match = regex.exec(mainContent)) !== null) {
    const slug = match[1]; // e.g. "naruto-1335"
    const title = match[2];
    const id = slug.split('-').pop(); // e.g. "1335"
    if (id) {
      results.push({ id, title, slug });
    }
  }
  return results;
}
export async function hianimeGetSource(title, epNo, mode = 'sub') {
  // 1. Search for title
  const results = await hianimeSearch(title);
  if (!results.length) {
    throw new Error(`No search results on HiAnime for title: ${title}`);
  }
  
  // Exact or closest match
  let match = results.find(r => r.title.toLowerCase() === title.toLowerCase());
  
  if (!match) {
    const targetSlug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    // Find the one that matches the slug best and is NOT a sequel (unless title implies sequel)
    match = results.find(r => r.slug.startsWith(targetSlug) && !r.slug.includes('-season-') && !r.slug.includes('-final') && !r.slug.includes('-part-'));
    if (!match) match = results.find(r => r.slug.startsWith(targetSlug));
  }
  
  if (!match) match = results[0]; // fallback to first result

  const animeId = match.id;

  // 2. Fetch episodes list
  const epApi = `${BASE_URL}/api/theme/episode/list/${animeId}`;
  let epListHtml;
  try {
    const epJson = await fetchJson(epApi, `${BASE_URL}/watch/${match.slug}`);
    epListHtml = epJson.html;
  } catch (e) {
    epListHtml = await fetchHtml(epApi, `${BASE_URL}/watch/${match.slug}`); // some endpoints return pure html
  }

  // Find the episode ID by extracting data-number="{epNo}" and grabbing its data-id
  const epRegex = new RegExp(`data-number="${epNo}"\\s+data-id="(\\d+)"`, 'i');
  const epMatch = epListHtml.match(epRegex);
  if (!epMatch) {
    throw new Error(`HiAnime episode ${epNo} not found for title: ${title}`);
  }
  const epId = epMatch[1];

  // 3. Fetch servers
  const serversApi = `${BASE_URL}/api/theme/episode/servers?episodeId=${epId}`;
  const serversJson = await fetchJson(serversApi, `${BASE_URL}/watch/${match.slug}?ep=${epId}`);
  const serversHtml = serversJson.html || '';

  // Extract ZokoAnime hash for the correct mode (sub/dub)
  const hashRegex = new RegExp(`data-type="${mode}".*?data-server-name="ZokoAnime".*?data-hash="([^"]*)"`, 'is');
  const hashMatch = serversHtml.match(hashRegex);
  
  if (!hashMatch) {
    throw new Error(`HiAnime ZokoAnime server not found for ${title} (mode: ${mode})`);
  }
  
  const embedUrl = Buffer.from(hashMatch[1], 'base64').toString('ascii');

  // 4. Fetch embed page and decrypt blob
  const embedHtml = await fetchHtml(embedUrl, `${BASE_URL}/`);
  const pMatch = embedHtml.match(/window\.__P\s*=\s*"([^"]*)"/);
  if (!pMatch) {
    throw new Error(`HiAnime window.__P blob not found in embed for ${title}`);
  }

  const pBase64 = pMatch[1];
  const bytes = Buffer.from(pBase64, 'base64').toString('binary');
  const key = "otaku-embed-v1";
  let output = "";
  for (let i = 0; i < bytes.length; i++) {
    output += String.fromCharCode(bytes.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  
  let payload;
  try {
    payload = JSON.parse(output);
  } catch (e) {
    throw new Error(`HiAnime decryption failed to parse JSON for ${title}`);
  }

  const streamUrl = payload.src;
  if (!streamUrl) {
    throw new Error(`HiAnime stream URL missing for ${title}`);
  }

  let subtitle = '';
  if (Array.isArray(payload.subtitles)) {
    const englishTrack = payload.subtitles.find(t =>
      (t.default || (t.lang && t.lang.toLowerCase() === 'en') || (t.label && /english/i.test(t.label)))
    );
    subtitle = englishTrack?.src || '';
  }

  return {
    url: streamUrl,
    embedUrl: embedUrl,
    quality: `HiAnime (HLS)`,
    type: 'hls',
    isM3U8: true,
    subtitle,
    referer: embedUrl,
    provider: 'hianime'
  };
}
