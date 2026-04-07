#!/usr/bin/env node
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';

// Provider configuration - AnimeKAI is primary, AllAnime is fallback
const ANIMEKAI_PROVIDER = 'animekai';
const ANIMEKAI_URL = 'https://anikai.to';
const ANIMEKAI_SEARCH_URL = 'https://anikai.to/ajax/anime/search';
const ANIMEKAI_EPISODES_URL = 'https://anikai.to/ajax/episodes/list';
const ANIMEKAI_SERVERS_URL = 'https://anikai.to/ajax/links/list';
const ANIMEKAI_LINKS_VIEW_URL = 'https://anikai.to/ajax/links/view';
const ENCDEC_URL = 'https://enc-dec.app/api/enc-kai';
const ENCDEC_DEC_KAI = 'https://enc-dec.app/api/dec-kai';

const ALLANIME_PROVIDER = 'allanime';
const ALLANIME_API = process.env.ALLANIME_API_URL || 'https://api.allanime.day/api';
const ALLANIME_REFERER = process.env.ALLANIME_REFERER || 'https://allmanga.to';
const ID_SEPARATOR = '::';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
};

const AJAX_HEADERS = {
  ...HEADERS,
  'X-Requested-With': 'XMLHttpRequest',
  'Accept': 'application/json, text/javascript, */*; q=0.01',
};

app.use(express.json({ limit: '256kb' }));
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

function ok(res, data, cacheSecs = 60) {
  res.setHeader('Cache-Control', `public, s-maxage=${cacheSecs}, stale-while-revalidate=300`);
  return res.status(200).json({ success: true, data });
}

function fail(res, status, error) {
  return res.status(status).json({ success: false, error });
}

function sanitizeMediaUrl(value) {
  if (typeof value !== 'string') return '';
  let url = value.trim().replace(/^['"]|['"]$/g, '');
  if (!url) return '';
  const replaceIdx = url.indexOf('.replace(');
  if (replaceIdx > 0) url = url.slice(0, replaceIdx);
  try {
    return new URL(url).toString();
  } catch {
    return '';
  }
}

function encodeProviderId(provider, value) {
  if (!value) return '';
  if (value.includes(ID_SEPARATOR)) {
    const [prefix] = value.split(ID_SEPARATOR);
    if (isKnownProvider(prefix)) return value;
  }
  return `${provider}${ID_SEPARATOR}${value}`;
}

function isKnownProvider(value) {
  return value === ALLANIME_PROVIDER || value === ANIMEKAI_PROVIDER;
}

function decodeProviderId(value) {
  if (typeof value !== 'string') return { provider: ANIMEKAI_PROVIDER, rawId: '' };
  if (!value.includes(ID_SEPARATOR)) return { provider: ANIMEKAI_PROVIDER, rawId: value };
  const [provider, ...rest] = value.split(ID_SEPARATOR);
  const rawId = rest.join(ID_SEPARATOR);
  if (!provider || !rawId || !isKnownProvider(provider)) {
    return { provider: ANIMEKAI_PROVIDER, rawId: value };
  }
  return { provider, rawId };
}

// AnimeKAI token encoding via enc-dec.app
async function encodeToken(text) {
  try {
    const response = await fetch(`${ENCDEC_URL}?text=${encodeURIComponent(text)}`, { headers: HEADERS });
    const data = await response.json();
    return data.status === 200 ? data.result : null;
  } catch {
    return null;
  }
}

// Decrypt AnimeKAI embedded URL response (POST method with JSON body)
async function decodeKai(encrypted) {
  try {
    const response = await fetch(ENCDEC_DEC_KAI, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...HEADERS
      },
      body: JSON.stringify({ text: encrypted })
    });
    const data = await response.json();
    if (data.status !== 200) return null;
    // Handle both string and object responses
    if (typeof data.result === 'object') return data.result;
    return JSON.parse(data.result);
  } catch {
    return null;
  }
}

// Decrypt mega/megacloud media response using enc-dec.app
async function decodeMega(encrypted) {
  try {
    const ENCDEC_DEC_MEGA = 'https://enc-dec.app/api/dec-mega';
    const response = await fetch(ENCDEC_DEC_MEGA, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...HEADERS
      },
      body: JSON.stringify({
        text: encrypted,
        agent: HEADERS['User-Agent']
      })
    });
    const data = await response.json();
    if (data.status !== 200) return null;
    if (typeof data.result === 'object') return data.result;
    return JSON.parse(data.result);
  } catch {
    return null;
  }
}

// Parse HTML to extract info spans (sub/dub counts, type)
function parseInfoSpans(html) {
  if (!html) return { sub: '', dub: '', type: '' };
  const subMatch = html.match(/<span class="sub">.*?<\/svg>(\d+)<\/span>/);
  const dubMatch = html.match(/<span class="dub">.*?<\/svg>(\d+)<\/span>/);
  const typeMatch = html.match(/<b>(TV|MOVIE|OVA|ONA|SPECIAL|MUSIC)<\/b>/i);
  return {
    sub: subMatch ? subMatch[1] : '',
    dub: dubMatch ? dubMatch[1] : '',
    type: typeMatch ? typeMatch[1].toUpperCase() : 'TV',
  };
}

// AnimeKAI search
async function animeKaiSearch(query) {
  const response = await fetch(`${ANIMEKAI_SEARCH_URL}?keyword=${encodeURIComponent(query)}`, {
    headers: AJAX_HEADERS,
  });
  const data = await response.json();
  if (data.status !== 'ok' || !data.result?.html) return [];

  const html = data.result.html;
  const results = [];
  const itemRegex = /<a class="aitem" href="([^"]+)"[^>]*>[\s\S]*?<img src="([^"]+)"[\s\S]*?<h6 class="title"[^>]*data-jp="([^"]*)"[^>]*>([^<]+)<\/h6>[\s\S]*?<div class="info">([\s\S]*?)<\/div>/g;
  
  let match;
  while ((match = itemRegex.exec(html)) !== null) {
    const [, href, poster, jpTitle, title, infoHtml] = match;
    const slug = href.replace('/watch/', '');
    const info = parseInfoSpans(infoHtml);
    
    results.push({
      id: encodeProviderId(ANIMEKAI_PROVIDER, slug),
      name: title.trim(),
      jname: jpTitle,
      poster: poster,
      type: info.type,
      episodes: {
        sub: info.sub ? parseInt(info.sub) : 0,
        dub: info.dub ? parseInt(info.dub) : 0,
      },
    });
  }
  return results;
}

// AnimeKAI get anime info from watch page
async function animeKaiInfo(slug) {
  const url = `${ANIMEKAI_URL}/watch/${slug}`;
  const response = await fetch(url, { headers: HEADERS });
  const html = await response.text();

  // Extract ani_id from syncData script
  const syncMatch = html.match(/<script id="syncData"[^>]*>([^<]+)<\/script>/);
  let aniId = '';
  if (syncMatch) {
    try {
      const syncData = JSON.parse(syncMatch[1]);
      aniId = syncData.anime_id || '';
    } catch {}
  }

  // Extract title (handle itemprop="name" before class="title")
  const titleMatch = html.match(/<h1[^>]*class="title"[^>]*data-jp="([^"]*)"[^>]*>([^<]+)<\/h1>/);
  const title = titleMatch ? titleMatch[2].trim() : '';
  const jname = titleMatch ? titleMatch[1] : '';

  // Extract description
  const descMatch = html.match(/<div class="desc[^"]*"[^>]*>([\s\S]*?)<\/div>/);
  const description = descMatch ? descMatch[1].replace(/<[^>]+>/g, '').trim() : '';

  // Extract poster
  const posterMatch = html.match(/<img[^>]*itemprop="image"[^>]*src="([^"]+)"/);
  const poster = posterMatch ? posterMatch[1] : '';

  // Extract info spans
  const infoMatch = html.match(/<div class="info">([\s\S]*?)<\/div>/);
  const info = parseInfoSpans(infoMatch ? infoMatch[1] : '');

  // Extract genres
  const genres = [];
  const genreSection = html.match(/Genres?:\s*<span[^>]*>([\s\S]*?)<\/span>/i);
  if (genreSection) {
    const genreLinks = genreSection[1].match(/<a[^>]*>([^<]+)<\/a>/g) || [];
    genreLinks.forEach(link => {
      const name = link.match(/>([^<]+)</);
      if (name) genres.push(name[1].trim());
    });
  }

  // Extract status
  const statusMatch = html.match(/Status:\s*<span[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/i);
  const status = statusMatch ? statusMatch[1].trim() : 'Unknown';

  return {
    aniId,
    title,
    jname,
    description,
    poster,
    sub: info.sub ? parseInt(info.sub) : 0,
    dub: info.dub ? parseInt(info.dub) : 0,
    type: info.type,
    status,
    genres,
  };
}

// AnimeKAI get episodes list
async function animeKaiEpisodes(aniId) {
  const encoded = await encodeToken(aniId);
  if (!encoded) return [];

  const response = await fetch(`${ANIMEKAI_EPISODES_URL}?ani_id=${aniId}&_=${encoded}`, {
    headers: AJAX_HEADERS,
  });
  const data = await response.json();
  if (!data.result) return [];

  const html = data.result;
  const episodes = [];
  // Episodes are in format: <li><a href="#" num="1" slug="1" langs="3" token="xxx" class=""> 1 <span>Title</span> </a></li>
  const epRegex = /<a[^>]*\bnum="(\d+)"[^>]*\bslug="([^"]*)"[^>]*\blangs="(\d+)"[^>]*\btoken="([^"]*)"[^>]*>/g;

  let match;
  while ((match = epRegex.exec(html)) !== null) {
    const [, num, slug, langs, token] = match;
    const langsNum = parseInt(langs) || 0;
    episodes.push({
      number: parseInt(num),
      slug,
      token,
      hasSub: Boolean(langsNum & 1),
      hasDub: Boolean(langsNum & 2),
    });
  }
  
  // If first regex didn't match, try alternative order (token before langs)
  if (episodes.length === 0) {
    const epRegex2 = /<a[^>]*\bnum="(\d+)"[^>]*\bslug="([^"]*)"[^>]*\btoken="([^"]*)"[^>]*>/g;
    let match2;
    while ((match2 = epRegex2.exec(html)) !== null) {
      const [, num, slug, token] = match2;
      // Extract langs separately
      const langsMatch = html.slice(match2.index, match2.index + 200).match(/langs="(\d+)"/);
      const langsNum = langsMatch ? parseInt(langsMatch[1]) : 3;
      episodes.push({
        number: parseInt(num),
        slug,
        token,
        hasSub: Boolean(langsNum & 1),
        hasDub: Boolean(langsNum & 2),
      });
    }
  }
  
  return episodes;
}

// AnimeKAI get servers for an episode
async function animeKaiServers(epToken) {
  const encoded = await encodeToken(epToken);
  if (!encoded) return { sub: [], dub: [], softsub: [] };

  const response = await fetch(`${ANIMEKAI_SERVERS_URL}?token=${epToken}&_=${encoded}`, {
    headers: AJAX_HEADERS,
  });
  const data = await response.json();
  if (!data.result) return { sub: [], dub: [], softsub: [] };

  const html = data.result;
  const servers = { sub: [], dub: [], softsub: [] };

  // Parse servers by data-id attribute
  const parseServers = (dataId) => {
    const list = [];
    const sectionRegex = new RegExp(`<div[^>]*class="server-items[^"]*"[^>]*data-id="${dataId}"[^>]*>([\\s\\S]*?)<\\/div>`);
    const match = html.match(sectionRegex);
    if (match) {
      const serverRegex = /<span[^>]*class="server"[^>]*data-lid="([^"]*)"[^>]*>([^<]+)<\/span>/g;
      let m;
      while ((m = serverRegex.exec(match[1])) !== null) {
        list.push({ linkId: m[1], name: m[2].trim() });
      }
    }
    return list;
  };

  servers.sub = parseServers('sub');
  servers.softsub = parseServers('softsub');
  servers.dub = parseServers('dub');

  return servers;
}

// AnimeKAI resolve streaming source
async function animeKaiSource(linkId) {
  const encoded = await encodeToken(linkId);
  if (!encoded) return null;

  const response = await fetch(`${ANIMEKAI_LINKS_VIEW_URL}?id=${linkId}&_=${encoded}`, {
    headers: AJAX_HEADERS,
  });
  const data = await response.json();
  if (!data.result) return null;

  // Decrypt the embed URL
  const embedData = await decodeKai(data.result);
  if (!embedData?.url) return null;

  const embedUrl = embedData.url;
  const videoId = embedUrl.split('/').filter(Boolean).pop()?.split('?')[0];
  const embedBase = embedUrl.includes('/e/') 
    ? embedUrl.split('/e/')[0] 
    : embedUrl.substring(0, embedUrl.lastIndexOf('/'));

  // Use /media/ endpoint directly (getSources returns 404 on megaup)
  let mediaData;
  try {
    const mediaResponse = await fetch(`${embedBase}/media/${videoId}`, { 
      headers: {
        ...HEADERS,
        'Referer': embedUrl,
      }
    });
    if (mediaResponse.ok) {
      mediaData = await mediaResponse.json();
    }
  } catch {}
  
  if (!mediaData) return null;

  // Decrypt the encrypted result
  let finalData;
  if (mediaData.result) {
    finalData = await decodeMega(mediaData.result);
  } else if (mediaData.sources) {
    // Sources might already be decrypted or need decryption
    if (typeof mediaData.sources === 'string') {
      finalData = await decodeMega(mediaData.sources);
    } else {
      finalData = mediaData;
    }
  }
  
  if (!finalData) return null;

  return {
    embedUrl,
    skip: embedData.skip || {},
    sources: finalData.sources || [],
    tracks: finalData.tracks || [],
    download: finalData.download || '',
  };
}

async function allAnimeGraphQL(query, variables) {
  const url = `${ALLANIME_API}?variables=${encodeURIComponent(JSON.stringify(variables))}&query=${encodeURIComponent(query)}`;
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      Referer: ALLANIME_REFERER,
      'User-Agent': 'ny-cli/allanime-adapter',
    },
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`AllAnime ${response.status}: ${text.slice(0, 180)}`);
  }

  const parsed = JSON.parse(text);
  if (Array.isArray(parsed.errors) && parsed.errors.length > 0) {
    throw new Error(parsed.errors[0]?.message || 'AllAnime GraphQL error');
  }
  return parsed.data;
}

const ALLANIME_DECODE_MAP = {
  '79': 'A', '7a': 'B', '7b': 'C', '7c': 'D', '7d': 'E', '7e': 'F', '7f': 'G', '70': 'H', '71': 'I', '72': 'J', '73': 'K', '74': 'L', '75': 'M', '76': 'N', '77': 'O', '68': 'P', '69': 'Q', '6a': 'R', '6b': 'S', '6c': 'T', '6d': 'U', '6e': 'V', '6f': 'W', '60': 'X', '61': 'Y', '62': 'Z',
  '59': 'a', '5a': 'b', '5b': 'c', '5c': 'd', '5d': 'e', '5e': 'f', '5f': 'g', '50': 'h', '51': 'i', '52': 'j', '53': 'k', '54': 'l', '55': 'm', '56': 'n', '57': 'o', '48': 'p', '49': 'q', '4a': 'r', '4b': 's', '4c': 't', '4d': 'u', '4e': 'v', '4f': 'w', '40': 'x', '41': 'y', '42': 'z',
  '08': '0', '09': '1', '0a': '2', '0b': '3', '0c': '4', '0d': '5', '0e': '6', '0f': '7', '00': '8', '01': '9',
  '15': '-', '16': '.', '67': '_', '46': '~', '02': ':', '17': '/', '07': '?', '1b': '#', '63': '[', '65': ']', '78': '@', '19': '!', '1c': '$', '1e': '&', '10': '(', '11': ')', '12': '*', '13': '+', '14': ',', '03': ';', '05': '=', '1d': '%',
};

function decodeAllAnimeSourceUrl(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return sanitizeMediaUrl(trimmed);
  if (!trimmed.startsWith('--')) {
    if (trimmed.startsWith('//')) return sanitizeMediaUrl(`https:${trimmed}`);
    if (trimmed.startsWith('/')) return sanitizeMediaUrl(`https://allanime.day${trimmed}`);
    return sanitizeMediaUrl(trimmed);
  }

  const encoded = trimmed.slice(2).replace(/\s+/g, '');
  let decoded = '';
  for (let i = 0; i < encoded.length; i += 2) {
    const pair = encoded.slice(i, i + 2).toLowerCase();
    decoded += ALLANIME_DECODE_MAP[pair] || '';
  }

  if (decoded.includes('/clock')) decoded = decoded.replace('/clock', '/clock.json');
  if (decoded.startsWith('//')) decoded = `https:${decoded}`;
  if (decoded.startsWith('/')) decoded = `https://allanime.day${decoded}`;
  return sanitizeMediaUrl(decoded);
}

function looksPlayableMediaUrl(url) {
  const value = String(url || '').toLowerCase();
  if (!value.startsWith('http')) return false;
  if (value.includes('.m3u8') || value.includes('/media') || value.includes('/videos/')) return true;
  if (value.includes('.mp4') || value.includes('.webm') || value.includes('.m4v')) return true;
  if (value.includes('tools.fast4speed') || value.includes('clock.json')) return true;
  if (value.includes('streaming.php') || value.includes('/embed') || value.endsWith('.html')) return false;
  return true;
}

const ALLANIME_SEARCH_QUERY =
  'query ($search: SearchInput, $limit: Int, $page: Int, $translationType: VaildTranslationTypeEnumType, $countryOrigin: VaildCountryOriginEnumType) { shows(search: $search, limit: $limit, page: $page, translationType: $translationType, countryOrigin: $countryOrigin) { edges { _id name englishName thumbnail availableEpisodesDetail } } }';
const ALLANIME_SHOW_QUERY =
  'query ($showId: String!) { show(_id: $showId) { _id name englishName description thumbnail availableEpisodesDetail genres status type } }';
const ALLANIME_EPISODE_QUERY =
  'query ($showId: String!, $translationType: VaildTranslationTypeEnumType!, $episodeString: String!) { episode(showId: $showId, translationType: $translationType, episodeString: $episodeString) { sourceUrls } }';

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ status: 'ok', version: '5.2.0', provider: ANIMEKAI_PROVIDER });
});

app.get('/api/aniwatch', async (req, res) => {
  const action = String(req.query.action || '');

  try {
    if (action === 'home' || action === 'random') {
      // Get a random anime by searching popular terms
      const popularTerms = ['demon slayer', 'attack on titan', 'naruto', 'one piece', 'jujutsu kaisen', 'bleach', 'dragon ball', 'my hero academia', 'death note', 'fullmetal alchemist', 'chainsaw man', 'spy x family', 'one punch man', 'mob psycho', 'sword art online', 'tokyo ghoul', 'hunter x hunter', 'black clover', 'fairy tail', 'blue lock'];
      const randomTerm = popularTerms[Math.floor(Math.random() * popularTerms.length)];
      
      try {
        const results = await animeKaiSearch(randomTerm);
        if (results.length > 0) {
          // Pick random anime from results
          const randomAnime = results[Math.floor(Math.random() * results.length)];
          return ok(res, {
            randomAnime,
            suggestedAnimes: results.slice(0, 10),
            provider: ANIMEKAI_PROVIDER,
          }, 30);
        }
      } catch (e) {
        console.error('[Random anime error]', e.message);
      }
      
      return ok(res, {
        randomAnime: null,
        suggestedAnimes: [],
        provider: ANIMEKAI_PROVIDER,
      }, 30);
    }

    if (action === 'search') {
      const query = String(req.query.q || '').trim();
      if (!query) return fail(res, 400, 'Missing q');

      // Try AnimeKAI first
      try {
        const results = await animeKaiSearch(query);
        if (results.length > 0) {
          return ok(res, {
            currentPage: 1,
            totalPages: 1,
            hasNextPage: false,
            provider: ANIMEKAI_PROVIDER,
            animes: results,
          }, 120);
        }
      } catch (e) {
        console.error('[AnimeKAI search error]', e.message);
      }

      // Fallback to AllAnime
      try {
        const allanimeData = await allAnimeGraphQL(ALLANIME_SEARCH_QUERY, {
          search: { allowAdult: false, allowUnknown: false, query },
          limit: 40,
          page: 1,
          translationType: 'sub',
          countryOrigin: 'ALL',
        });
        const edges = Array.isArray(allanimeData?.shows?.edges) ? allanimeData.shows.edges : [];
        if (edges.length > 0) {
          return ok(res, {
            currentPage: 1,
            totalPages: 1,
            hasNextPage: false,
            provider: ALLANIME_PROVIDER,
            animes: edges.map((item) => {
              const sub = Array.isArray(item?.availableEpisodesDetail?.sub) ? item.availableEpisodesDetail.sub.length : 0;
              const dub = Array.isArray(item?.availableEpisodesDetail?.dub) ? item.availableEpisodesDetail.dub.length : 0;
              return {
                id: encodeProviderId(ALLANIME_PROVIDER, item?._id || ''),
                name: item?.englishName || item?.name || '',
                poster: item?.thumbnail || '',
                type: 'TV',
                episodes: { sub, dub },
              };
            }),
          }, 120);
        }
      } catch (e) {
        console.error('[AllAnime search fallback error]', e.message);
      }

      return fail(res, 502, 'All providers failed');
    }

    if (action === 'suggestions') {
      const query = String(req.query.q || '').trim();
      if (!query) return fail(res, 400, 'Missing q');

      // Try AnimeKAI first
      try {
        const results = await animeKaiSearch(query);
        if (results.length > 0) {
          return ok(res, results.slice(0, 10), 60);
        }
      } catch {}

      // Fallback to AllAnime
      try {
        const allanimeData = await allAnimeGraphQL(ALLANIME_SEARCH_QUERY, {
          search: { allowAdult: false, allowUnknown: false, query },
          limit: 10,
          page: 1,
          translationType: 'sub',
          countryOrigin: 'ALL',
        });
        const edges = Array.isArray(allanimeData?.shows?.edges) ? allanimeData.shows.edges : [];
        if (edges.length > 0) {
          const suggestions = edges.slice(0, 10).map((item) => ({
            id: encodeProviderId(ALLANIME_PROVIDER, item?._id || ''),
            name: item?.englishName || item?.name || '',
            poster: item?.thumbnail || '',
            type: 'TV',
            episodes: {
              sub: Array.isArray(item?.availableEpisodesDetail?.sub) ? item.availableEpisodesDetail.sub.length : 0,
              dub: Array.isArray(item?.availableEpisodesDetail?.dub) ? item.availableEpisodesDetail.dub.length : 0,
            },
          }));
          return ok(res, suggestions, 60);
        }
      } catch {}

      return fail(res, 502, 'Suggestions failed');
    }

    if (action === 'info') {
      const rawId = String(req.query.id || '').trim();
      if (!rawId) return fail(res, 400, 'Missing id');

      const decoded = decodeProviderId(rawId);

      // Handle AnimeKAI provider
      if (decoded.provider === ANIMEKAI_PROVIDER) {
        try {
          const slug = decoded.rawId;
          const info = await animeKaiInfo(slug);
          if (!info.aniId) return fail(res, 404, 'Anime not found');

          // Get episodes
          const episodes = await animeKaiEpisodes(info.aniId);

          return ok(res, {
            id: rawId,
            name: info.title,
            jname: info.jname,
            poster: info.poster,
            description: info.description,
            stats: {
              type: info.type,
              status: info.status,
              episodes: { sub: info.sub, dub: info.dub },
            },
            genres: info.genres,
            episodes: {
              sub: episodes.filter(ep => ep.hasSub).map(ep => ({
                number: ep.number,
                title: `Episode ${ep.number}`,
                episodeId: encodeProviderId(ANIMEKAI_PROVIDER, `${slug}${ID_SEPARATOR}${ep.token}`),
                isFiller: false,
              })),
              dub: episodes.filter(ep => ep.hasDub).map(ep => ({
                number: ep.number,
                title: `Episode ${ep.number}`,
                episodeId: encodeProviderId(ANIMEKAI_PROVIDER, `${slug}${ID_SEPARATOR}${ep.token}${ID_SEPARATOR}dub`),
                isFiller: false,
              })),
            },
            provider: ANIMEKAI_PROVIDER,
            _aniId: info.aniId,
          }, 300);
        } catch (e) {
          console.error('[AnimeKAI info error]', e.message);
          return fail(res, 502, 'Failed to fetch anime info');
        }
      }

      // AllAnime provider
      const showId = decoded.rawId;
      const data = await allAnimeGraphQL(ALLANIME_SHOW_QUERY, { showId });
      const show = data?.show;
      if (!show?._id) return fail(res, 404, 'Anime not found');

      const subEpisodes = Array.isArray(show?.availableEpisodesDetail?.sub) ? show.availableEpisodesDetail.sub.map(String) : [];
      const dubEpisodes = Array.isArray(show?.availableEpisodesDetail?.dub) ? show.availableEpisodesDetail.dub.map(String) : [];

      return ok(res, {
        id: encodeProviderId(ALLANIME_PROVIDER, show._id),
        name: show.englishName || show.name || '',
        poster: show.thumbnail || '',
        description: show.description || '',
        stats: {
          type: show.type || 'TV',
          status: show.status || 'Unknown',
          episodes: { sub: subEpisodes.length, dub: dubEpisodes.length },
        },
        genres: Array.isArray(show.genres) ? show.genres : [],
        episodes: {
          sub: subEpisodes.map((episodeString) => ({
            number: Number(episodeString),
            title: `Episode ${episodeString}`,
            episodeId: encodeProviderId(ALLANIME_PROVIDER, `${show._id}${ID_SEPARATOR}${episodeString}`),
            isFiller: false,
          })),
          dub: dubEpisodes.map((episodeString) => ({
            number: Number(episodeString),
            title: `Episode ${episodeString}`,
            episodeId: encodeProviderId(ALLANIME_PROVIDER, `${show._id}${ID_SEPARATOR}${episodeString}`),
            isFiller: false,
          })),
        },
        provider: ALLANIME_PROVIDER,
      }, 300);
    }

    if (action === 'episodes') {
      const rawId = String(req.query.id || '').trim();
      if (!rawId) return fail(res, 400, 'Missing id');

      const decoded = decodeProviderId(rawId);

      if (decoded.provider === ANIMEKAI_PROVIDER) {
        try {
          const slug = decoded.rawId;
          const info = await animeKaiInfo(slug);
          if (!info.aniId) return fail(res, 404, 'Anime not found');

          const episodes = await animeKaiEpisodes(info.aniId);
          return ok(res, {
            totalEpisodes: episodes.length,
            episodes: episodes.map(ep => ({
              number: ep.number,
              title: `Episode ${ep.number}`,
              episodeId: encodeProviderId(ANIMEKAI_PROVIDER, `${slug}${ID_SEPARATOR}${ep.token}`),
              isFiller: false,
              hasSub: ep.hasSub,
              hasDub: ep.hasDub,
            })),
            provider: ANIMEKAI_PROVIDER,
          }, 300);
        } catch (e) {
          console.error('[AnimeKAI episodes error]', e.message);
          return fail(res, 502, 'Failed to fetch episodes');
        }
      }

      // AllAnime fallback
      const showId = decoded.rawId;
      const data = await allAnimeGraphQL(ALLANIME_SHOW_QUERY, { showId });
      const subEpisodes = Array.isArray(data?.show?.availableEpisodesDetail?.sub)
        ? data.show.availableEpisodesDetail.sub.map(String)
        : [];
      const episodes = subEpisodes.map((episodeString) => ({
        number: Number(episodeString),
        title: `Episode ${episodeString}`,
        episodeId: encodeProviderId(ALLANIME_PROVIDER, `${showId}${ID_SEPARATOR}${episodeString}`),
        isFiller: false,
      }));
      return ok(res, { totalEpisodes: episodes.length, episodes, provider: ALLANIME_PROVIDER }, 300);
    }

    if (action === 'servers') {
      const rawEpisodeId = String(req.query.episodeId || '').trim();
      if (!rawEpisodeId) return fail(res, 400, 'Missing episodeId');

      const decoded = decodeProviderId(rawEpisodeId);

      if (decoded.provider === ANIMEKAI_PROVIDER) {
        // Extract token from episodeId: slug::token or slug::token::dub
        const parts = decoded.rawId.split(ID_SEPARATOR);
        const epToken = parts[1] || '';
        const isDub = parts[2] === 'dub';

        try {
          const servers = await animeKaiServers(epToken);
          const serverList = isDub ? servers.dub : servers.sub;

          return ok(res, {
            episodeId: rawEpisodeId,
            episodeNo: 0,
            sub: isDub ? [] : serverList.map((s, i) => ({ serverId: i + 1, serverName: s.name, linkId: s.linkId })),
            dub: isDub ? serverList.map((s, i) => ({ serverId: i + 1, serverName: s.name, linkId: s.linkId })) : [],
            raw: [],
          }, 60);
        } catch (e) {
          console.error('[AnimeKAI servers error]', e.message);
          return fail(res, 502, 'Failed to fetch servers');
        }
      }

      return ok(res, {
        episodeId: rawEpisodeId,
        episodeNo: 0,
        sub: [{ serverId: 1, serverName: ALLANIME_PROVIDER }],
        dub: [],
        raw: [],
      }, 60);
    }

    if (action === 'sources') {
      const rawEpisodeId = String(req.query.episodeId || '').trim();
      const category = req.query.category === 'dub' ? 'dub' : 'sub';
      const serverId = req.query.server || '';
      if (!rawEpisodeId) return fail(res, 400, 'Missing episodeId');

      const decoded = decodeProviderId(rawEpisodeId);

      if (decoded.provider === ANIMEKAI_PROVIDER) {
        const parts = decoded.rawId.split(ID_SEPARATOR);
        const epToken = parts[1] || '';

        try {
          // If serverId contains linkId, use it directly
          let linkId = serverId;
          
          // If no linkId provided, get servers first and use the first one
          if (!linkId) {
            const servers = await animeKaiServers(epToken);
            const serverList = category === 'dub' ? servers.dub : servers.sub;
            if (serverList.length === 0) return fail(res, 404, 'No servers available');
            linkId = serverList[0].linkId;
          }

          const source = await animeKaiSource(linkId);
          if (!source || !source.sources?.length) {
            return fail(res, 404, 'No streaming sources found');
          }

          // Extract referer from embed URL (megaup.nl for AnimeKAI)
          let embedHost = 'https://megaup.nl'; // Default
          if (source.embedUrl) {
            try {
              embedHost = new URL(source.embedUrl).origin;
            } catch {}
          }

          return ok(res, {
            headers: {
              Referer: embedHost + '/',
              Origin: embedHost,
              'User-Agent': 'Mozilla/5.0',
            },
            sources: source.sources.map(s => ({
              url: s.file || s.url,
              quality: s.label || 'auto',
              isM3U8: (s.file || s.url || '').includes('.m3u8'),
            })),
            tracks: source.tracks || [],
            subtitles: (source.tracks || []).filter(t => t.kind === 'captions'),
            intro: source.skip?.intro || null,
            outro: source.skip?.outro || null,
            provider: ANIMEKAI_PROVIDER,
          }, 0);
        } catch (e) {
          console.error('[AnimeKAI sources error]', e.message);
          return fail(res, 502, 'Failed to fetch sources');
        }
      }

      // AllAnime fallback
      const episodeValue = decoded.rawId;
      const splitAt = episodeValue.indexOf(ID_SEPARATOR);
      if (splitAt <= 0) return fail(res, 400, 'Invalid episodeId');
      const showId = episodeValue.slice(0, splitAt);
      const episodeString = episodeValue.slice(splitAt + ID_SEPARATOR.length);

      const data = await allAnimeGraphQL(ALLANIME_EPISODE_QUERY, {
        showId,
        translationType: category,
        episodeString,
      });

      const rawSources = Array.isArray(data?.episode?.sourceUrls) ? data.episode.sourceUrls : [];
      const seen = new Set();
      const sources = rawSources
        .map((source) => {
          const decodedUrl = decodeAllAnimeSourceUrl(source?.sourceUrl || '');
          if (!decodedUrl || !looksPlayableMediaUrl(decodedUrl) || seen.has(decodedUrl)) return null;
          seen.add(decodedUrl);
          const qualityMatch = String(source?.sourceName || '').match(/(360|480|720|1080|1440|2160)/);
          return {
            url: decodedUrl,
            quality: qualityMatch ? `${qualityMatch[1]}p` : 'auto',
            isM3U8: decodedUrl.includes('.m3u8'),
          };
        })
        .filter(Boolean);

      if (!sources.length) return fail(res, 404, 'No streaming sources found');

      return ok(res, {
        headers: {
          Referer: ALLANIME_REFERER,
          Origin: 'https://allanime.day',
          'User-Agent': 'Mozilla/5.0',
        },
        sources,
        tracks: [],
        subtitles: [],
        provider: ALLANIME_PROVIDER,
      }, 0);
    }

    return fail(res, 400, `Unknown action: ${action}`);
  } catch (error) {
    return fail(res, 500, error instanceof Error ? error.message : 'Internal error');
  }
});

app.get('/api/stream', async (req, res) => {
  const target = String(req.query.url || '').trim();
  const headersB64 = typeof req.query.h === 'string' ? req.query.h : '';

  if (!target) return fail(res, 400, 'Missing or invalid url parameter');

  let targetUrl;
  try {
    targetUrl = new URL(target);
  } catch {
    return fail(res, 400, 'Invalid URL format');
  }

  let customHeaders = {};
  if (headersB64) {
    try {
      customHeaders = JSON.parse(Buffer.from(headersB64, 'base64').toString('utf-8'));
    } catch {
      customHeaders = {};
    }
  }

  const hostname = targetUrl.hostname.toLowerCase();
  const megacloudDomains = [
    'megacloud', 'haildrop', 'rapid-cloud', 'megaup', 'lightningspark', 'sunshinerays', 'surfparadise',
    'moonjump', 'skydrop', 'wetransfer', 'bicdn', 'bcdn', 'b-cdn', 'bunny', 'mcloud', 'fogtwist',
    'statics', 'mgstatics', 'lasercloud', 'cloudrax', 'stormshade', 'thunderwave', 'raincloud', 'snowfall',
    'rainveil', 'thunderstrike', 'sunburst', 'clearskyline', 'crimsonstorm', 'netmagcdn',
    'hub26link', 'hub27link', 'hub28link', 'hub29link', 'hub30link',  // AnimeKAI CDN domains
  ];

  let referer = customHeaders.Referer || customHeaders.referer || '';
  if (!referer) {
    if (megacloudDomains.some((domain) => hostname.includes(domain))) referer = 'https://megacloud.blog/';
    else if (hostname.includes('vidcloud') || hostname.includes('vidstreaming')) referer = 'https://vidcloud.blog/';
    else if (hostname.includes('hianime') || hostname.includes('aniwatch')) referer = 'https://hianime.to/';
    else referer = 'https://megacloud.blog/';
  }

  const requestHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    Accept: '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
    Referer: referer,
    ...customHeaders,
  };

  try {
    const upstream = await fetch(targetUrl.toString(), {
      method: 'GET',
      redirect: 'follow',
      headers: requestHeaders,
    });

    if (!upstream.ok && upstream.status !== 206) {
      return fail(res, upstream.status, `Upstream error: ${upstream.statusText || 'unknown'}`);
    }

    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    const pathname = targetUrl.pathname.toLowerCase();
    const isM3u8 = contentType.includes('mpegurl') || pathname.endsWith('.m3u8');

    res.setHeader('Content-Type', contentType.includes('application/octet-stream') && /\/media\d*\/videos\//.test(pathname)
      ? 'video/mp4'
      : contentType);
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

    const contentLength = upstream.headers.get('content-length');
    const contentRange = upstream.headers.get('content-range');
    const acceptRanges = upstream.headers.get('accept-ranges');
    if (contentLength) res.setHeader('Content-Length', contentLength);
    if (contentRange) res.setHeader('Content-Range', contentRange);
    if (acceptRanges) res.setHeader('Accept-Ranges', acceptRanges);

    if (isM3u8) {
      const host = req.headers.host || `localhost:${PORT}`;
      const origin = `${host.includes('localhost') ? 'http' : 'https'}://${host}`;
      const body = await upstream.text();
      const basePath = targetUrl.pathname.slice(0, targetUrl.pathname.lastIndexOf('/') + 1);
      const rewritten = body
        .split('\n')
        .map((line) => {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) {
            if (trimmed.includes('URI="')) {
              return trimmed.replace(/URI="([^"]+)"/, (_, uri) => {
                const abs = new URL(uri, `${targetUrl.origin}${basePath}`).toString();
                return `URI="${origin}/api/stream?url=${encodeURIComponent(abs)}${headersB64 ? `&h=${headersB64}` : ''}"`;
              });
            }
            return line;
          }
          const abs = trimmed.startsWith('http://') || trimmed.startsWith('https://')
            ? trimmed
            : new URL(trimmed, `${targetUrl.origin}${basePath}`).toString();
          return `${origin}/api/stream?url=${encodeURIComponent(abs)}${headersB64 ? `&h=${headersB64}` : ''}`;
        })
        .join('\n');

      return res.status(upstream.status).send(rewritten);
    }

    res.status(upstream.status);
    if (!upstream.body) return res.end();

    for await (const chunk of upstream.body) {
      res.write(Buffer.from(chunk));
    }
    return res.end();
  } catch (error) {
    return fail(res, 502, error instanceof Error ? error.message : 'Stream proxy failed');
  }
});

const distPath = path.join(__dirname, 'dist');

app.listen(PORT, HOST, () => {
  console.log(`[ny-cli] backend running on http://${HOST}:${PORT}`);
  console.log(`[ny-cli] providers: ${ANIMEKAI_PROVIDER} (primary), ${ALLANIME_PROVIDER} (fallback)`);
});
