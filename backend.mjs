#!/usr/bin/env node
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';

const ALLANIME_PROVIDER = 'allanime';
const ALLANIME_API = process.env.ALLANIME_API_URL || 'https://api.allanime.day/api';
const ALLANIME_REFERER = process.env.ALLANIME_REFERER || 'https://allmanga.to';
const ID_SEPARATOR = '::';

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
  return value === ALLANIME_PROVIDER;
}

function decodeProviderId(value) {
  if (typeof value !== 'string') return { provider: ALLANIME_PROVIDER, rawId: '' };
  if (!value.includes(ID_SEPARATOR)) return { provider: ALLANIME_PROVIDER, rawId: value };
  const [provider, ...rest] = value.split(ID_SEPARATOR);
  const rawId = rest.join(ID_SEPARATOR);
  if (!provider || !rawId || !isKnownProvider(provider)) {
    return { provider: ALLANIME_PROVIDER, rawId: value };
  }
  return { provider, rawId };
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
  res.json({ status: 'ok', version: '5.0.0' });
});

app.get('/api/aniwatch', async (req, res) => {
  const action = String(req.query.action || '');

  try {
    if (action === 'home') {
      return ok(res, {
        spotlightAnimes: [],
        trendingAnimes: [],
        latestEpisodeAnimes: [],
        top10Animes: { today: [], week: [], month: [] },
        provider: ALLANIME_PROVIDER,
        providerPriority: [ALLANIME_PROVIDER],
      }, 30);
    }

    if (action === 'search') {
      const query = String(req.query.q || '').trim();
      const page = Number(req.query.page || 1);
      if (!query) return fail(res, 400, 'Missing q');

      try {
        const allanimeData = await allAnimeGraphQL(ALLANIME_SEARCH_QUERY, {
          search: { allowAdult: false, allowUnknown: false, query },
          limit: 40,
          page,
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
      } catch {
        // Search failed.
      }

      return fail(res, 502, 'AllAnime search failed');
    }

    if (action === 'suggestions') {
      const query = String(req.query.q || '').trim();
      if (!query) return fail(res, 400, 'Missing q');

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
      } catch {
        // Suggestions failed.
      }

      return fail(res, 502, 'AllAnime suggestions failed');
    }

    if (action === 'info') {
      const rawId = String(req.query.id || '').trim();
      if (!rawId) return fail(res, 400, 'Missing id');

      const decoded = decodeProviderId(rawId);
      const showId = decoded.provider === ALLANIME_PROVIDER ? decoded.rawId : rawId;
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
      const showId = decoded.provider === ALLANIME_PROVIDER ? decoded.rawId : rawId;
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
      if (!rawEpisodeId) return fail(res, 400, 'Missing episodeId');

      const decoded = decodeProviderId(rawEpisodeId);
      const episodeValue = decoded.provider === ALLANIME_PROVIDER ? decoded.rawId : rawEpisodeId;
      const splitAt = episodeValue.indexOf(ID_SEPARATOR);
      if (splitAt <= 0) return fail(res, 400, 'Invalid Allanime episodeId');
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
  console.log(`[ny-cli] provider: ${ALLANIME_PROVIDER} (only)`);
});
