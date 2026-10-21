import { httpFetch } from '../net.mjs';
import { findBestMatch } from './match.mjs';

export const name = 'hianime';
export const tier = 1;

const BASE_URL = 'https://hianime.at';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

async function fetchHtml(url, referer, signal) {
  const timeoutSignal = AbortSignal.timeout(6000);
  const effectiveSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

  const res = await httpFetch(url, { 
    headers: { 
      'User-Agent': UA, 
      'Referer': referer || BASE_URL,
      'X-Requested-With': 'XMLHttpRequest'
    },
    signal: effectiveSignal,
  });
  if (!res.ok) throw new Error(`HiAnime HTTP ${res.status}`);
  return res.text();
}

async function fetchJson(url, referer, signal) {
  const timeoutSignal = AbortSignal.timeout(6000);
  const effectiveSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

  const res = await httpFetch(url, { 
    headers: { 
      'User-Agent': UA, 
      'Referer': referer || BASE_URL,
      'X-Requested-With': 'XMLHttpRequest'
    },
    signal: effectiveSignal,
  });
  if (!res.ok) throw new Error(`HiAnime HTTP ${res.status}`);
  return res.json();
}

export async function hianimeSearch(query, signal) {
  const html = await fetchHtml(`${BASE_URL}/search?keyword=${encodeURIComponent(query)}`, BASE_URL, signal);
  
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

/**
 * Parses HiAnime episode list HTML into an array of { number, id, title } entries.
 */
export function parseEpisodeEntries(html) {
  const episodes = [];
  const epItemRegex = /<a\s+[^>]*class="[^"]*ep-item[^"]*"([^>]*)>/gi;
  let match;
  while ((match = epItemRegex.exec(html)) !== null) {
    const attrStr = match[1];
    const numMatch = attrStr.match(/data-number=["']([^"']*)["']/i);
    const idMatch = attrStr.match(/data-id=["']([^"']*)["']/i);
    const titleMatch = attrStr.match(/title=["']([^"']*)["']/i);
    if (numMatch && idMatch) {
      episodes.push({
        number: parseInt(numMatch[1], 10),
        id: idMatch[1],
        title: titleMatch ? titleMatch[1] : '',
      });
    }
  }
  return episodes;
}

/**
 * Parses HiAnime episode server HTML into structured entries per-entry.
 */
export function parseServerEntries(html) {
  const entries = [];
  const itemRegex = /<div\s+class="[^"]*server-item[^"]*"([^>]*)>/gi;
  let match;
  while ((match = itemRegex.exec(html)) !== null) {
    const attrStr = match[1];
    const typeMatch = attrStr.match(/data-type=["']([^"']*)["']/i);
    const serverNameMatch = attrStr.match(/data-server-name=["']([^"']*)["']/i);
    const hashMatch = attrStr.match(/data-hash=["']([^"']*)["']/i);
    const idMatch = attrStr.match(/data-id=["']([^"']*)["']/i);

    if (hashMatch) {
      entries.push({
        type: typeMatch ? typeMatch[1].toLowerCase() : '',
        serverName: serverNameMatch ? serverNameMatch[1] : '',
        hash: hashMatch[1],
        id: idMatch ? idMatch[1] : '',
      });
    }
  }
  return entries;
}

export async function hianimeGetSource(title, epNo, mode = 'sub') {
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
    throw new Error('Title is required for HiAnime search');
  }

  // 1. Search for title
  const results = await hianimeSearch(title, signal);
  if (!results.length) {
    throw new Error(`No search results on HiAnime for title: ${title}`);
  }
  
  const matchResult = findBestMatch(results, context, {
    extractors: {
      getTitle: (r) => r.title || r.slug,
    },
  });

  if (!matchResult.match) {
    throw new Error(matchResult.reason || 'no confident match');
  }

  const match = matchResult.match;
  const animeId = match.id;

  // 2. Fetch episodes list
  const epApi = `${BASE_URL}/api/theme/episode/list/${animeId}`;
  let epListHtml;
  try {
    const epJson = await fetchJson(epApi, `${BASE_URL}/watch/${match.slug}`, signal);
    epListHtml = epJson.html;
  } catch (e) {
    epListHtml = await fetchHtml(epApi, `${BASE_URL}/watch/${match.slug}`, signal);
  }

  // Parse episode entries per-entry
  const episodeEntries = parseEpisodeEntries(epListHtml);
  let epEntry = episodeEntries.find(e => e.number === Number(episodeNumber));

  if (!epEntry) {
    const epRegex = new RegExp(`data-number="${episodeNumber}"\\s+data-id="(\\d+)"`, 'i');
    const epMatch = epListHtml.match(epRegex);
    if (epMatch) {
      epEntry = { id: epMatch[1], number: Number(episodeNumber) };
    }
  }

  if (!epEntry || !epEntry.id) {
    throw new Error(`HiAnime episode ${episodeNumber} not found for title: ${title}`);
  }
  const epId = epEntry.id;

  // 3. Fetch servers
  const serversApi = `${BASE_URL}/api/theme/episode/servers?episodeId=${epId}`;
  const serversJson = await fetchJson(serversApi, `${BASE_URL}/watch/${match.slug}?ep=${epId}`, signal);
  const serversHtml = serversJson.html || '';

  // Parse servers per-entry
  const serverEntries = parseServerEntries(serversHtml);
  const targetType = audioKind.toLowerCase();

  const serverEntry = serverEntries.find(e => e.type === targetType && e.serverName.toLowerCase() === 'zokoanime') ||
                      serverEntries.find(e => e.type === targetType);

  if (!serverEntry || !serverEntry.hash) {
    throw new Error(`HiAnime server not found for ${title} (mode: ${audioKind})`);
  }

  const embedUrl = Buffer.from(serverEntry.hash, 'base64').toString('ascii');


  // 4. Fetch embed page and decrypt blob
  const embedHtml = await fetchHtml(embedUrl, `${BASE_URL}/`, signal);
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

  const subtitleTracks = [];
  if (Array.isArray(payload.subtitles)) {
    for (const t of payload.subtitles) {
      if (t.src) {
        subtitleTracks.push({
          label: t.label || t.lang || 'Subtitle',
          src: t.src,
          default: !!t.default || t.lang === 'en' || /english/i.test(t.label || ''),
        });
      }
    }
  }

  return [
    {
      url: streamUrl,
      type: 'hls',
      referer: embedUrl,
      headers: {
        'User-Agent': UA,
        'Referer': embedUrl,
      },
      subtitleTracks,
      audioKind,
      quality: 'HiAnime (HLS)',
      provider: name,
      tier,
    },
  ];
}
