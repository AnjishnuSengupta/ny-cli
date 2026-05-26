#!/usr/bin/env node
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import https from 'node:https';
import dns from 'node:dns';
import WebTorrent from 'webtorrent';

dns.setDefaultResultOrder('ipv4first');

function ipv4Fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { family: 4 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, json: async () => json });
        } catch(e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

dns.setDefaultResultOrder('ipv4first');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const torrentClient = new WebTorrent();

const PROVIDER = 'anipy';

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

app.get('/', (req, res) => {
  res.json({ status: 'ok', version: '5.2.0', provider: PROVIDER });
});

app.get('/api/aniwatch', async (req, res) => {
  const action = String(req.query.action || '');

  try {
    if (action === 'home' || action === 'random') {
      const r = await ipv4Fetch('https://api.jikan.moe/v4/random/anime');
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
      const r = await ipv4Fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(query)}&limit=20`);
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
      const r = await ipv4Fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(query)}&limit=10`);
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
      if (!/^[1-9]\d*$/.test(malId)) return fail(res, 400, 'Invalid id');

      const r = await ipv4Fetch(`https://api.jikan.moe/v4/anime/${malId}`);
      const data = await r.json();
      if (!data?.data) return fail(res, 404, 'Anime not found');

      const info = data.data;
      let jikanEps = [];
      try {
        const epRes = await ipv4Fetch(`https://api.jikan.moe/v4/anime/${malId}/episodes`);
        const epData = await epRes.json();
        if (epData?.data) {
          jikanEps = epData.data;
        }
      } catch(e) {
        console.error('[Jikan] Failed to fetch episodes', e.message);
      }

      const formatEps = (epsList) => {
        return epsList.map((ep, idx) => {
          return {
            number: Number(ep.mal_id) || (idx + 1),
            title: ep.title || ep.title_japanese || `Episode ${ep.mal_id || idx + 1}`,
            episodeId: String(ep.mal_id || idx + 1), // Using mal_id or index as the identifier
            isFiller: ep.filler || false,
            hasSub: true,
            hasDub: true // Default to true since our source resolver can often find dubs
          };
        });
      };
      
      // Jikan doesn't distinguish sub/dub episodes by default this way, just return a single list as "sub"
      const subFormatted = formatEps(jikanEps);
      const dubFormatted = formatEps(jikanEps); // Use the same episodes list for dubs as Anipy handles the stream type

      if (action === 'episodes') {
         return ok(res, {
            totalEpisodes: subFormatted.length || info.episodes || 0,
            episodes: [...subFormatted],
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
          episodes: { sub: subFormatted.length || info.episodes || 0, dub: dubFormatted.length || info.episodes || 0 },
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
      
      return ok(res, {
        episodeId: rawEpisodeId,
        episodeNo: episodeNo,
        sub: servers,
        dub: servers,
        raw: [],
      }, 60);
    }

    if (action === 'sources') {
      const linkId = String(req.query.server || req.query.episodeId || '').trim();
      let title = String(req.query.title || '').trim();
      if (title.toLowerCase() === 'one piece') title = '1P';
      const titleRo = String(req.query.title_ro || '').trim();
      const episodeNo = req.query.episodeNo || '1';
      const audio = String(req.query.category || req.query.audio || 'sub').trim();
      const totalEpisodes = req.query.totalEpisodes ? parseInt(req.query.totalEpisodes, 10) : null;
      if (!linkId) return fail(res, 400, 'Missing server linkId');

      let mappedSources = [];
      let subtitles = [];

      // Helper: call anipy /sources with a given title
      const fetchAnipySources = async (queryTitle) => {
        let anipyUrl = `https://anipy-ziq7.onrender.com/sources?title=${encodeURIComponent(queryTitle)}&episode=${episodeNo}&audio=${encodeURIComponent(audio)}`;
        if (titleRo) anipyUrl += `&title_ro=${encodeURIComponent(titleRo)}`;
        console.log(`[Anipy] Fetching: ${anipyUrl}`);
        const anipyRes = await ipv4Fetch(anipyUrl);
        if (!anipyRes.ok) return null;
        return anipyRes.json();
      };

      if (title) {
        try {
          // Primary attempt
          let anipyData = await fetchAnipySources(title);
          console.log(`[Anipy] Got ${anipyData?.sources?.length || 0} sources for "${title}" ep ${episodeNo} (${audio}), matched="${anipyData?.matched_title || '?'}"`);

          // Smart disambiguation: if we got 0 sources AND totalEpisodes hint shows this
          // is a long series (>12), anipy likely matched the wrong short series (OVA/special).
          // Use /episodes with total_episodes to get the correct matched_title, then retry.
          if ((!anipyData?.sources?.length) && totalEpisodes && totalEpisodes > 12) {
            console.log(`[Anipy] Zero sources and totalEpisodes=${totalEpisodes} — trying disambiguation via /episodes...`);
            try {
              const epUrl = `https://anipy-ziq7.onrender.com/episodes?title=${encodeURIComponent(title)}&audio=${encodeURIComponent(audio)}&total_episodes=${totalEpisodes}`;
              const epRes = await ipv4Fetch(epUrl);
              if (epRes.ok) {
                const epData = await epRes.json();
                const matchedTitle = epData?.matched_title;
                if (matchedTitle && matchedTitle !== title) {
                  console.log(`[Anipy] Disambiguation: matched title "${matchedTitle}" — retrying sources...`);
                  const retryData = await fetchAnipySources(matchedTitle);
                  if (retryData?.sources?.length) {
                    anipyData = retryData;
                    console.log(`[Anipy] Retry success: ${retryData.sources.length} sources with title "${matchedTitle}"`);
                  }
                }
              }
            } catch(e) {
              console.error('[Anipy disambiguation error]', e.message);
            }
          }

          if (anipyData && anipyData.sources && anipyData.sources.length > 0) {
            mappedSources = anipyData.sources.map(s => ({
              url: s.url,
              quality: s.quality || 'auto',
              isM3U8: !!(s.url.includes('.m3u8') || s.isM3U8),
              headers: s.headers || { Referer: 'https://allanime.day' },
            }));
            subtitles = anipyData.subtitles || [];
          }
        } catch(e) {
          console.error('[Anipy sources error]', e.message);
        }
      } else {
        console.warn('[Sources] No title provided — cannot fetch from anipy!');
      }

      // Torrent fallback (only when anipy found nothing)
      if (title && mappedSources.length === 0) {
        try {
          const tRes = await ipv4Fetch(`https://nyanime.qzz.io/api/torrent-search?title=${encodeURIComponent(title)}&episode=${episodeNo}`);
          if (tRes.ok) {
            const tData = await tRes.json();
            if (tData && tData.magnet) {
              mappedSources.push({
                url: `http://localhost:${PORT}/api/torrent-stream?magnet=${encodeURIComponent(tData.magnet)}`,
                quality: '1080p (Torrent)',
                isM3U8: false,
                headers: {},
              });
            }
          }
        } catch(e) {
          console.error('[Torrent search error]', e.message);
        }
      }

      // Use the referer from the first source, or fall back to allanime.day
      const primaryReferer = mappedSources[0]?.headers?.Referer || 'https://allanime.day';

      return ok(res, {
        headers: {
          Referer: primaryReferer,
          Origin: new URL(primaryReferer).origin,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        sources: mappedSources,
        tracks: subtitles,
        subtitles: subtitles.filter(t => t.kind === 'captions'),
        intro: null,
        outro: null,
        provider: PROVIDER,
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
      signal: AbortSignal.timeout(10000)
    });

    if (!upstream.ok && upstream.status !== 206) {
      console.error(`[Proxy Error] Upstream returned ${upstream.status} for ${targetUrl.toString()}`);
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
    console.error(`[Proxy Failed] for ${targetUrl.toString()}: ${error.message}`);
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

app.get('/api/auth/login', (req, res) => {
  const cliPort = req.query.port || 4000;
  const html = `
<!DOCTYPE html>
<html>
<head>
  <title>NyAnime CLI Login</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <script src="https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/10.7.1/firebase-auth-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/ui/6.1.0/firebase-ui-auth.js"></script>
  <link type="text/css" rel="stylesheet" href="https://www.gstatic.com/firebasejs/ui/6.1.0/firebase-ui-auth.css" />
  <style>
    body {
      background-color: #1a1b26;
      color: #a9b1d6;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
    }
    .container {
      background-color: #24283b;
      padding: 2rem;
      border-radius: 12px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
      text-align: center;
      max-width: 400px;
      width: 100%;
    }
    h1 { color: #bb9af7; margin-top: 0; }
    p { margin-bottom: 2rem; line-height: 1.5; }
    .success-msg { display: none; color: #9ece6a; font-weight: bold; margin-top: 1rem; }
    #firebaseui-auth-container { margin-top: 1rem; }
  </style>
</head>
<body>
  <div class="container">
    <h1>NyAnime CLI</h1>
    <p>Sign in to sync your watch history and preferences across devices.</p>
    <div id="firebaseui-auth-container"></div>
    <div id="loader">Loading...</div>
    <div id="success" class="success-msg">Successfully authenticated! You can close this window and return to your terminal.</div>
  </div>

  <script>
    const firebaseConfig = {
      apiKey: "AIzaSyAfwO_c-_BbkiI0NcipTvGIya_R1EYyyTI",
      authDomain: "nyanime-tech.firebaseapp.com",
      projectId: "nyanime-tech",
      storageBucket: "nyanime-tech.firebasestorage.app",
      messagingSenderId: "677407184955",
      appId: "1:677407184955:web:b3cc5095e838c9017e241e",
      measurementId: "G-EGFFFWT8DK"
    };
    
    firebase.initializeApp(firebaseConfig);
    const auth = firebase.auth();
    
    // Check if returning from redirect
    auth.onAuthStateChanged(function(user) {
      if (user) {
        document.getElementById('firebaseui-auth-container').style.display = 'none';
        document.getElementById('loader').style.display = 'none';
        document.getElementById('success').style.display = 'block';
        
        const username = user.displayName || user.email || 'AnimeFan';
        
        // Send token to CLI
        fetch('http://localhost:${cliPort}/callback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: user.uid, username: username })
        }).catch(err => console.error('Failed to notify CLI:', err));
        
      } else {
        document.getElementById('loader').style.display = 'none';
        // Initialize the FirebaseUI Widget using Firebase.
        var ui = new firebaseui.auth.AuthUI(auth);
        var uiConfig = {
          callbacks: {
            signInSuccessWithAuthResult: function(authResult, redirectUrl) {
              const user = authResult.user;
              const username = user.displayName || user.email || 'AnimeFan';
              
              document.getElementById('firebaseui-auth-container').style.display = 'none';
              document.getElementById('success').style.display = 'block';
              
              fetch('http://localhost:${cliPort}/callback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: user.uid, username: username })
              }).catch(err => console.error('Failed to notify CLI:', err));
              
              return false; // Do not redirect
            }
          },
          signInFlow: 'popup',
          signInOptions: [
            firebase.auth.EmailAuthProvider.PROVIDER_ID,
            firebase.auth.GoogleAuthProvider.PROVIDER_ID
          ]
        };
        ui.start('#firebaseui-auth-container', uiConfig);
      }
    });
  </script>
</body>
</html>
  `;
  res.send(html);
});

app.listen(PORT, HOST, () => {
  console.log(`[ny-cli] backend running on http://${HOST}:${PORT}`);
  console.log(`[ny-cli] providers: ${PROVIDER}`);
});
