#!/usr/bin/env node
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dns from 'node:dns';
import WebTorrent from 'webtorrent';

dns.setDefaultResultOrder('ipv4first');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const torrentClient = new WebTorrent();

const PROVIDER = 'aniflix';

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

const aniflixCache = new Map();

async function getAnilistId(malId) {
  const mappingKey = `mal_to_anilist:${malId}`;
  if (aniflixCache.has(mappingKey)) {
    return aniflixCache.get(mappingKey);
  }
  try {
    const r = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: 'query($id: Int) { Media(idMal: $id, type: ANIME) { id } }',
        variables: { id: parseInt(malId, 10) }
      }),
      signal: AbortSignal.timeout(5000)
    });
    const d = await r.json();
    if (d?.data?.Media?.id) {
      const anilistId = d.data.Media.id.toString();
      aniflixCache.set(mappingKey, anilistId);
      return anilistId;
    }
  } catch(e) {
    console.error('[AniList] Failed to map MAL ID', e.message);
  }
  return null;
}

app.get('/', (req, res) => {
  res.json({ status: 'ok', version: '5.2.0', provider: PROVIDER });
});

app.get('/api/aniwatch', async (req, res) => {
  const action = String(req.query.action || '');

  try {
    if (action === 'home' || action === 'random') {
      const r = await fetch('https://api.jikan.moe/v4/random/anime');
      const data = await r.json();
      if (data?.data) {
        const item = data.data;
        const randomAnime = {
          id: String(item.mal_id),
          name: item.title_english || item.title || '',
          poster: item.images?.webp?.large_image_url || item.images?.jpg?.large_image_url || '',
          type: item.type || 'TV',
          episodes: { sub: item.episodes || 0, dub: 0 },
        };
        return ok(res, { randomAnime, suggestedAnimes: [randomAnime], provider: PROVIDER }, 30);
      }
      return fail(res, 502, 'Random failed');
    }

    if (action === 'search') {
      const query = String(req.query.q || '').trim();
      if (!query) return fail(res, 400, 'Missing q');
      const r = await fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(query)}&limit=20`);
      const data = await r.json();
      if (data?.data) {
        const animes = data.data.map(item => ({
          id: String(item.mal_id),
          name: item.title_english || item.title || '',
          poster: item.images?.webp?.large_image_url || item.images?.jpg?.large_image_url || '',
          type: item.type || 'TV',
          episodes: { sub: item.episodes || 0, dub: 0 },
        }));
        return ok(res, { currentPage: 1, totalPages: 1, hasNextPage: false, provider: PROVIDER, animes }, 120);
      }
      return fail(res, 502, 'Search failed');
    }

    if (action === 'suggestions') {
      const query = String(req.query.q || '').trim();
      if (!query) return fail(res, 400, 'Missing q');
      const r = await fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(query)}&limit=10`);
      const data = await r.json();
      if (data?.data) {
        const suggestions = data.data.map(item => ({
          id: String(item.mal_id),
          name: item.title_english || item.title || '',
          poster: item.images?.webp?.large_image_url || item.images?.jpg?.large_image_url || '',
          type: item.type || 'TV',
          episodes: { sub: item.episodes || 0, dub: 0 },
        }));
        return ok(res, suggestions, 60);
      }
      return fail(res, 502, 'Suggestions failed');
    }

    if (action === 'info' || action === 'episodes') {
      const malId = String(req.query.id || '').trim();
      if (!malId) return fail(res, 400, 'Missing id');

      const r = await fetch(`https://api.jikan.moe/v4/anime/${malId}`);
      const data = await r.json();
      if (!data?.data) return fail(res, 404, 'Anime not found');

      const info = data.data;
      const anilistId = await getAnilistId(malId);
      
      let episodesSub = [];
      let episodesDub = [];
      
      if (anilistId) {
        try {
          const epRes = await fetch(`https://aniflix.n1yshi.dev/episodes/${anilistId}`);
          if (epRes.ok) {
            const epData = await epRes.json();
            if (epData.providers) {
              for (const prov of Object.values(epData.providers)) {
                if (prov?.episodes?.sub?.length > 0) { episodesSub = prov.episodes.sub; break; }
              }
              for (const prov of Object.values(epData.providers)) {
                if (prov?.episodes?.dub?.length > 0) { episodesDub = prov.episodes.dub; break; }
              }
            } else if (epData.provider && Array.isArray(epData.episodes)) {
               episodesSub = epData.episodes.map(ep => ({
                 ...ep,
                 id: `watch/${epData.provider}/${anilistId}/sub/${ep.id || ep.token || ep.slug}`
               }));
               episodesDub = epData.episodes.map(ep => ({
                 ...ep,
                 id: `watch/${epData.provider}/${anilistId}/dub/${ep.id || ep.token || ep.slug}`
               }));
            }
          }
        } catch (e) {
          console.error('[Aniflix] Failed to fetch episodes', e.message);
        }
      }

      const formatEps = (epsList, audio) => {
        return epsList.map((ep, idx) => {
          let epId = ep.id;
          if (epId && !epId.startsWith('watch/')) {
             epId = `watch/miruro/${anilistId}/${audio}/${epId}`;
          }
          return {
            number: Number(ep.number) || (idx + 1),
            title: ep.title || ep.japaneseTitle || `Episode ${ep.number || idx + 1}`,
            episodeId: epId,
            isFiller: false,
            hasSub: audio === 'sub',
            hasDub: audio === 'dub'
          };
        });
      };
      
      const subFormatted = formatEps(episodesSub, 'sub');
      const dubFormatted = formatEps(episodesDub, 'dub');

      if (action === 'episodes') {
         return ok(res, {
            totalEpisodes: subFormatted.length || info.episodes || 0,
            episodes: [...subFormatted, ...dubFormatted],
            provider: PROVIDER
         }, 300);
      }

      return ok(res, {
        id: malId,
        name: info.title_english || info.title || '',
        jname: info.title_japanese || '',
        poster: info.images?.webp?.large_image_url || info.images?.jpg?.large_image_url || '',
        description: info.synopsis || '',
        stats: {
          type: info.type || 'TV',
          status: info.status || 'Unknown',
          episodes: { sub: subFormatted.length || info.episodes || 0, dub: dubFormatted.length || 0 },
        },
        genres: info.genres?.map(g => g.name) || [],
        episodes: {
          sub: subFormatted,
          dub: dubFormatted,
        },
        provider: PROVIDER,
      }, 300);
    }

    if (action === 'servers') {
      const rawEpisodeId = String(req.query.episodeId || '').trim();
      const title = req.query.title || '';
      const episodeNo = req.query.episodeNo || '1';
      if (!rawEpisodeId) return fail(res, 400, 'Missing episodeId');
      
      const servers = [];
      
      // Anipy (Primary)
      servers.push({ serverId: 10, serverName: 'Anipy (Primary)', linkId: `anipy-${rawEpisodeId}` });
      
      // Aniflix (Secondary)
      servers.push({ serverId: 1, serverName: 'Aniflix', linkId: rawEpisodeId });
      
      return ok(res, {
        episodeId: rawEpisodeId,
        episodeNo: episodeNo,
        sub: servers,
        dub: [],
        raw: [],
      }, 60);
    }

    if (action === 'sources') {
      const linkId = String(req.query.server || req.query.episodeId || '').trim();
      const title = req.query.title || '';
      const episodeNo = req.query.episodeNo || '1';
      if (!linkId) return fail(res, 400, 'Missing server linkId');

      let mappedSources = [];
      let subtitles = [];
      
      if (linkId.startsWith('anipy-')) {
        // Fetch from Anipy
        if (title) {
          try {
             const anipyRes = await fetch(`https://anipy-yhba.onrender.com/sources?title=${encodeURIComponent(title)}&episode=${episodeNo}`);
             if (anipyRes.ok) {
               const anipyData = await anipyRes.json();
               if (anipyData && anipyData.sources) {
                 mappedSources = anipyData.sources.map(s => ({
                   url: s.url,
                   quality: s.quality || 'auto',
                   isM3U8: s.url.includes('.m3u8')
                 }));
                 subtitles = anipyData.subtitles || [];
               }
             }
          } catch(e) {}
        }
      } else {
        // Fetch from Aniflix
        let watchUrl = linkId.startsWith('watch/') ? `https://aniflix.n1yshi.dev/${linkId}` : `https://aniflix.n1yshi.dev/watch/${linkId}`;
        try {
          const sRes = await fetch(watchUrl);
          const sourceData = await sRes.json();
          
          let streams = sourceData.streams || sourceData.sources || [];
          subtitles = sourceData.subtitleTracks || sourceData.subtitles || [];
          
          mappedSources = streams
            .filter(s => s.url && s.type !== 'embed')
            .map(s => ({
               url: s.url,
               quality: s.quality || 'auto',
               isM3U8: s.type === 'hls' || s.url.includes('.m3u8')
            }));
        } catch(e) {}
      }
        
      // Add torrent source if available
      if (title) {
        try {
          const tRes = await fetch(`https://nyanime.qzz.io/api/torrent-search?title=${encodeURIComponent(title)}&episode=${episodeNo}`);
          if (tRes.ok) {
            const tData = await tRes.json();
            if (tData && tData.magnet) {
              mappedSources.push({
                url: `http://localhost:${PORT}/api/torrent-stream?magnet=${encodeURIComponent(tData.magnet)}`,
                quality: '1080p (Torrent)',
                isM3U8: false
              });
            }
          }
        } catch(e) {}
      }

        return ok(res, {
          headers: {
            Referer: 'https://megacloud.blog/',
            Origin: 'https://megacloud.blog/',
            'User-Agent': 'Mozilla/5.0',
          },
          sources: mappedSources,
          tracks: subtitles,
          subtitles: subtitles.filter(t => t.kind === 'captions'),
          intro: sourceData.intro || null,
          outro: sourceData.outro || null,
          provider: PROVIDER,
        }, 0);
      } catch (e) {
        console.error('[Aniflix sources error]', e.message);
        return fail(res, 502, 'Failed to fetch sources');
      }
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
  let referer = customHeaders.Referer || customHeaders.referer || '';
  if (!referer) {
    referer = 'https://megacloud.blog/'; // default for everything to bypass checks
  }

  const requestHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    Accept: '*/*',
    'Cache-Control': 'no-cache',
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

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

    const contentLength = upstream.headers.get('content-length');
    if (contentLength) res.setHeader('Content-Length', contentLength);

    if (isM3u8) {
      const host = req.headers.host || `localhost:${PORT}`;
      const origin = `${host.includes('localhost') ? 'http' : 'https'}://${host}`;
      const body = await upstream.text();
      const basePath = targetUrl.pathname.slice(0, targetUrl.pathname.lastIndexOf('/') + 1);
      const rewritten = body
        .split('\n')
        .map((line) => {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) return line;
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
    for await (const chunk of upstream.body) { res.write(Buffer.from(chunk)); }
    return res.end();
  } catch (error) {
    return fail(res, 502, error instanceof Error ? error.message : 'Stream proxy failed');
  }
});

app.get('/api/torrent-stream', (req, res) => {
  const magnet = req.query.magnet;
  if (!magnet) return res.status(400).send('Missing magnet');

  try {
    let torrent = torrentClient.get(magnet);
    if (!torrent) {
      torrent = torrentClient.add(magnet, { path: '/tmp/webtorrent' });
    }

    if (torrent.ready) {
      handleTorrentStream(torrent, req, res);
    } else {
      torrent.on('ready', () => handleTorrentStream(torrent, req, res));
      torrent.on('error', (err) => {
        console.error('Torrent error:', err);
        if (!res.headersSent) res.status(500).send('Torrent Error');
      });
    }
  } catch (err) {
    if (!res.headersSent) res.status(500).send('Server Error');
  }
});

function handleTorrentStream(torrent, req, res) {
  const file = torrent.files.find(f => f.name.endsWith('.mkv') || f.name.endsWith('.mp4'));
  if (!file) {
    if (!res.headersSent) res.status(404).send('No video file found in torrent');
    return;
  }

  const range = req.headers.range;
  if (!range) {
    res.writeHead(200, {
      'Content-Length': file.length,
      'Content-Type': 'video/mp4',
    });
    const stream = file.createReadStream();
    stream.pipe(res);
    return;
  }

  const parts = range.replace(/bytes=/, "").split("-");
  const start = parseInt(parts[0], 10);
  const end = parts[1] ? parseInt(parts[1], 10) : file.length - 1;
  const chunksize = (end - start) + 1;

  res.writeHead(206, {
    'Content-Range': `bytes ${start}-${end}/${file.length}`,
    'Accept-Ranges': 'bytes',
    'Content-Length': chunksize,
    'Content-Type': 'video/mp4',
  });
  
  const stream = file.createReadStream({ start, end });
  stream.pipe(res);
  
  res.on('close', () => {
    stream.destroy();
  });
}

app.listen(PORT, HOST, () => {
  console.log(`[ny-cli] backend running on http://${HOST}:${PORT}`);
  console.log(`[ny-cli] providers: ${PROVIDER}`);
});
