#!/usr/bin/env node
/**
 * ny-cli backend v6.0.8
 * Provider chain: AniList GraphQL (search/meta) + Jikan (episodes) + MegaPlay embed (streaming)
 * AnimeKAI is down. AllAnime is CF-blocked. MegaPlay works reliably via iframe embed.
 */
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebTorrent from 'webtorrent';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app    = express();
const PORT   = Number(process.env.PORT || 43201);
const HOST   = process.env.HOST || '0.0.0.0';
const client = new WebTorrent({ maxConns: 20 });

// ── Helpers ──────────────────────────────────────────────────────────────────
const ok   = (res, data, ttl = 60) => {
  res.setHeader('Cache-Control', `public,s-maxage=${ttl}`);
  return res.json({ success: true, data });
};
const fail = (res, code, err) => res.status(code).json({ success: false, error: err });

async function fetchJson(url, opts = {}) {
  const r = await fetch(url, { signal: AbortSignal.timeout(8000), ...opts });
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${url}`);
  return r.json();
}

app.use(express.json({ limit: '256kb' }));
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

// ── AniList ───────────────────────────────────────────────────────────────────
const ANILIST = 'https://graphql.anilist.co';

async function anilistGQL(query, variables) {
  return fetchJson(ANILIST, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
}

const AL_SEARCH_Q = `query($q:String,$page:Int){Page(page:$page,perPage:20){
  pageInfo{hasNextPage currentPage}
  media(search:$q,type:ANIME,sort:[SEARCH_MATCH,POPULARITY_DESC]){
    id idMal title{english romaji} status episodes
    nextAiringEpisode{episode airingAt}
    coverImage{large extraLarge} genres format
  }
}}`;

const AL_INFO_Q = `query($id:Int){Media(id:$id,type:ANIME){
  id idMal title{english romaji native} status episodes
  description coverImage{large extraLarge} bannerImage
  genres tags{name} format averageScore popularity
  startDate{year month day} endDate{year month day}
  nextAiringEpisode{episode airingAt}
  studios(isMain:true){nodes{name}}
}}`;

function mapALAnime(m) {
  const name = m.title?.english || m.title?.romaji || '';
  const epCount = m.episodes || (m.nextAiringEpisode ? m.nextAiringEpisode.episode - 1 : 0) || 0;
  return {
    id: `anilist::${m.id}`,
    malId: m.idMal,
    name,
    jname: m.title?.romaji || name,
    poster: m.coverImage?.extraLarge || m.coverImage?.large || '',
    type: m.format || 'TV',
    episodes: { sub: epCount, dub: 0 },
    status: m.status || 'Unknown',
    genres: m.genres || [],
  };
}

// ── Jikan (MAL) ───────────────────────────────────────────────────────────────
const JIKAN = 'https://api.jikan.moe/v4';

// Simple rate-limit: 1 req / 400ms
let jikanLast = 0;
async function jikanFetch(endpoint) {
  const now = Date.now();
  const wait = 400 - (now - jikanLast);
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  jikanLast = Date.now();
  return fetchJson(`${JIKAN}${endpoint}`);
}

// cache: malId → episode list
const epCache = new Map();

async function getEpisodesForMal(malId, totalEps = 0) {
  if (!malId) return [];
  const key = `${malId}`;
  if (epCache.has(key)) return epCache.get(key);

  try {
    // Jikan paginates at 100 per page
    let allEps = [], page = 1, hasNext = true;
    while (hasNext) {
      const j = await jikanFetch(`/anime/${malId}/episodes?page=${page}`);
      const eps = j?.data || [];
      allEps.push(...eps);
      hasNext = j?.pagination?.has_next_page && eps.length > 0;
      page++;
      if (page > 10) break; // safety
    }

    // If Jikan returned very few episodes and AniList didn't give us a count,
    // query Jikan's /anime/{malId} endpoint to get the real episode count
    if (totalEps === 0 && allEps.length < 5) {
      try {
        const meta = await jikanFetch(`/anime/${malId}`);
        const jikanEpCount = meta?.data?.episodes || 0;
        if (jikanEpCount > allEps.length) {
          totalEps = jikanEpCount;
        }
      } catch {}
    }

    if (allEps.length === 0 && totalEps > 0) {
      // Generate synthetic episode list from totalEps count
      allEps = Array.from({ length: totalEps }, (_, i) => ({ mal_id: i + 1, title: `Episode ${i + 1}`, aired: { string: '' } }));
    } else if (allEps.length > 0 && allEps.length < totalEps) {
      // Jikan is lagging behind AniList (e.g., Jikan has 6, AniList says 9)
      const missing = totalEps - allEps.length;
      const lastEp = allEps[allEps.length - 1].mal_id || allEps.length;
      for (let i = 1; i <= missing; i++) {
        allEps.push({ mal_id: lastEp + i, title: `Episode ${lastEp + i}`, aired: { string: '' } });
      }
    }
    const mapped = allEps.map((e, i) => ({
      number: e.mal_id || i + 1,
      title: e.title || `Episode ${e.mal_id || i + 1}`,
      isFiller: e.filler || false,
      episodeId: `ep::${malId}::${e.mal_id || i + 1}`,
    }));
    epCache.set(key, mapped);
    return mapped;
  } catch {
    if (totalEps > 0) {
      const synthetic = Array.from({ length: totalEps }, (_, i) => ({
        number: i + 1, title: `Episode ${i + 1}`, isFiller: false, episodeId: `ep::${malId}::${i + 1}`,
      }));
      return synthetic;
    }
    return [];
  }
}

// ── Source Verification ───────────────────────────────────────────────────────
async function verifyEmbed(src) {
  if (!src || !src.url) return false;
  try {
    const res = await fetch(src.url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return false;
    const text = await res.text();
    // Catch fake 200 HTTP responses that are actually error pages
    if (text.includes("We can't find the file you are looking for") || 
        text.includes("Oops! Something went wrong") || 
        text.includes("<title>Error")) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

// ── MegaPlay ──────────────────────────────────────────────────────────────────
function megaplaySrc(id, epNo, lang = 'sub', type = 'mal') {
  if (!id || !epNo) return null;
  const url = `https://megaplay.buzz/stream/${type}/${id}/${epNo}/${lang}`;
  return { url, embedUrl: url, quality: `MegaPlay (${type})`, type: 'embed', isM3U8: false, tracks: [] };
}

// Anikoto embed (alternative embed source)
function anikotoSrc(id, epNo, type = 'mal') {
  if (!id || !epNo) return null;
  const url = `https://anikoto.live/stream/${type}/${id}/${epNo}/sub`;
  return { url, embedUrl: url, quality: `Anikoto (${type})`, type: 'embed', isM3U8: false, tracks: [] };
}

// ── Decode episodeId → malId + epNo ──────────────────────────────────────────
// Format: "ep::malId::epNo"  or  "anilist::anilistId" (info only)
function parseEpId(epId) {
  if (!epId) return null;
  const parts = String(epId).split('::');
  if (parts[0] === 'ep' && parts.length === 3) return { malId: Number(parts[1]), epNo: Number(parts[2]) };
  return null;
}

function parseAnimeId(id) {
  if (!id) return null;
  const s = String(id).trim();
  const parts = s.split('::');
  // Standard format: "anilist::12345"
  if (parts[0] === 'anilist' && parts[1]) return { anilistId: Number(parts[1]) };
  // Backward compat: bare numeric ID — treat as AniList ID
  // (older history entries stored raw AniList IDs before the anilist:: prefix was added)
  if (/^\d+$/.test(s)) return { anilistId: Number(s) };
  return null;
}

// ── Routes ────────────────────────────────────────────────────────────────────
app.get('/', (req, res) => res.json({ status: 'ok', version: '6.0.8', providers: ['anilist', 'jikan', 'megaplay'] }));

app.get('/api/aniwatch', async (req, res) => {
  const { action, q, id, episodeId, category, page, malId: qMalId, episodeNo: qEpNo } = req.query;
  const cat = category === 'dub' ? 'dub' : 'sub';
  const pageNum = Number(page) || 1;

  try {
    // ── search ──────────────────────────────────────────────────────────────
    if (action === 'search' || action === 'suggestions') {
      if (!q) return fail(res, 400, 'Missing q');
      const data = await anilistGQL(AL_SEARCH_Q, { q, page: pageNum });
      const media = data?.data?.Page?.media || [];
      const animes = media.map(mapALAnime);
      if (action === 'suggestions') return ok(res, animes.slice(0, 8), 120);
      return ok(res, {
        currentPage: pageNum,
        totalPages: data?.data?.Page?.pageInfo?.hasNextPage ? pageNum + 1 : pageNum,
        hasNextPage: !!data?.data?.Page?.pageInfo?.hasNextPage,
        animes,
        provider: 'anilist',
      }, 120);
    }

    // ── home / random ────────────────────────────────────────────────────────
    if (action === 'home' || action === 'random') {
      try {
        const data = await anilistGQL(`query{Page(page:1,perPage:10){media(type:ANIME,sort:TRENDING_DESC,status:RELEASING){id idMal title{english romaji}episodes nextAiringEpisode{episode airingAt} coverImage{large}format status genres}}}`, {});
        const trending = (data?.data?.Page?.media || []).map(mapALAnime);
        return ok(res, { spotlightAnimes: trending.slice(0, 5), trendingAnimes: trending, latestEpisodeAnimes: [], provider: 'anilist' }, 300);
      } catch (e) {
        return ok(res, { spotlightAnimes: [], trendingAnimes: [], latestEpisodeAnimes: [], provider: 'anilist' }, 60);
      }
    }

    // ── info ─────────────────────────────────────────────────────────────────
    if (action === 'info' || action === 'episodes') {
      if (!id) return fail(res, 400, 'Missing id');
      const parsed = parseAnimeId(id);
      if (!parsed) return fail(res, 400, 'Invalid id format — expected anilist::ID');

      const data = await anilistGQL(AL_INFO_Q, { id: parsed.anilistId });
      const m = data?.data?.Media;
      if (!m) return fail(res, 404, 'Anime not found');

      const epCount = m.episodes || (m.nextAiringEpisode ? m.nextAiringEpisode.episode - 1 : 0) || 0;
      const malId   = m.idMal;

      const episodes = await getEpisodesForMal(malId, epCount);

      if (action === 'episodes') {
        return ok(res, {
          totalEpisodes: episodes.length,
          episodes: { sub: episodes, dub: [] },
          provider: 'jikan',
        }, 300);
      }

      const name = m.title?.english || m.title?.romaji || '';
      return ok(res, {
        id: `anilist::${m.id}`,
        malId,
        name,
        jname: m.title?.romaji || name,
        poster: m.coverImage?.extraLarge || m.coverImage?.large || '',
        description: (m.description || '').replace(/<[^>]*>/g, ''),
        stats: {
          type: m.format || 'TV',
          status: m.status || 'Unknown',
          episodes: { sub: epCount, dub: 0 },
          score: m.averageScore ? `${m.averageScore / 10}/10` : '',
        },
        genres: m.genres || [],
        episodes: { sub: episodes, dub: [] },
        provider: 'anilist+jikan',
      }, 300);
    }

    // ── sources ──────────────────────────────────────────────────────────────
    if (action === 'sources') {
      if (!episodeId && !qMalId) return fail(res, 400, 'Missing episodeId');

      let malId  = qMalId ? Number(qMalId) : null;
      let epNo   = qEpNo  ? Number(qEpNo)  : null;

      // Parse from episodeId
      const ep = parseEpId(episodeId);
      if (ep) { malId = malId || ep.malId; epNo = epNo || ep.epNo; }

      if (!malId || !epNo) return fail(res, 400, 'Cannot resolve malId/epNo from episodeId');

      let anilistId = req.query.anilistId ? Number(req.query.anilistId) : null;
      let candidateSources = [];
      const lang = cat === 'dub' ? 'dub' : 'sub';

      if (malId) {
        candidateSources.push(megaplaySrc(malId, epNo, lang, 'mal'));
        candidateSources.push(anikotoSrc(malId, epNo, 'mal'));
      }

      if (anilistId) {
        candidateSources.push(megaplaySrc(anilistId, epNo, lang, 'anilist'));
        candidateSources.push(anikotoSrc(anilistId, epNo, 'anilist'));
      }

      candidateSources = candidateSources.filter(Boolean);

      // Verify all candidate sources concurrently to filter out fake 200 error pages
      const verificationResults = await Promise.all(candidateSources.map(src => verifyEmbed(src)));
      const sources = candidateSources.filter((_, i) => verificationResults[i]);

      if (!sources.length) return fail(res, 404, 'No playable sources available');

      return ok(res, {
        sources,
        tracks: [],
        headers: {},
        embedUrls: sources.filter(s => s.embedUrl).map(s => s.embedUrl),
        provider: 'megaplay',
      }, 0);
    }

    // ── servers ──────────────────────────────────────────────────────────────
    if (action === 'servers') {
      return ok(res, { sub: [{ serverId: 1, serverName: 'MegaPlay' }, { serverId: 2, serverName: 'Anikoto' }], dub: [], raw: [] }, 60);
    }

    return fail(res, 400, `Unknown action: ${action}`);

  } catch (e) {
    console.error('[/api/aniwatch]', e.message);
    return fail(res, 500, e.message || 'Internal error');
  }
});

// ── Torrents (Nyaa.si Scraper) ────────────────────────────────────────────────
app.get('/api/torrent', async (req, res) => {
  const { title, ep } = req.query;
  if (!title || !ep) return fail(res, 400, 'Missing title or ep');

  try {
    // Basic formatting for Nyaa search
    const cleanTitle = title.replace(/[^a-zA-Z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    const epString = String(ep).padStart(2, '0');
    
    const query = encodeURIComponent(`[SubsPlease] ${cleanTitle} ${epString} 1080p`);
    const fallbackQuery = encodeURIComponent(`${cleanTitle} ${epString} 1080p`);
    const ultimateFallback = encodeURIComponent(`${cleanTitle} ${epString}`);
    
    let feedUrl = `https://nyaa.si/?page=rss&q=${query}&c=1_2&f=0`;
    let response = await fetch(feedUrl, { signal: AbortSignal.timeout(5000) });
    let text = await response.text();
    
    // If no items found, try fallback query
    if (!text.includes('<item>')) {
      feedUrl = `https://nyaa.si/?page=rss&q=${fallbackQuery}&c=1_2&f=0`;
      response = await fetch(feedUrl, { signal: AbortSignal.timeout(5000) });
      text = await response.text();
    }
    
    if (!text.includes('<item>')) {
      feedUrl = `https://nyaa.si/?page=rss&q=${ultimateFallback}&c=1_2&f=0`;
      response = await fetch(feedUrl, { signal: AbortSignal.timeout(5000) });
      text = await response.text();
    }

    const items = [...text.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map(m => m[1]);
    
    let bestMagnet = null;
    let maxScore = -1;

    for (const item of items) {
      const hashMatch = item.match(/<nyaa:infoHash>([a-zA-Z0-9]+)<\/nyaa:infoHash>/i);
      const titleMatch = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/i) || item.match(/<title>(.*?)<\/title>/i);
      const seedersMatch = item.match(/<nyaa:seeders>(\d+)<\/nyaa:seeders>/i);
      
      if (hashMatch && hashMatch[1] && titleMatch && titleMatch[1]) {
        const title = titleMatch[1];
        
        // Exclude French or Raw
        if (/\b(FR|French|Raw|VF|VOSTFR)\b/i.test(title)) continue;
        if (/^\[FR\]/i.test(title)) continue;
        
        // Calculate score
        const seeders = seedersMatch ? parseInt(seedersMatch[1], 10) : 0;
        let score = seeders * 10; // Base score heavily depends on seeders
        
        // Bonus for English/Multi indicators
        if (/\b(Multi|Dual Audio|Eng Sub|English)\b/i.test(title)) score += 500;
        if (/\.mkv\b/i.test(title)) score += 200;
        if (/\[(SubsPlease|Erai-raws)\]/i.test(title)) score += 1000; // Trusted groups
        
        if (score > maxScore) {
          maxScore = score;
          const infoHash = hashMatch[1];
          const torrentName = encodeURIComponent(title);
          bestMagnet = `magnet:?xt=urn:btih:${infoHash}&dn=${torrentName}&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337%2Fannounce&tr=udp%3A%2F%2Ftracker.leechers-paradise.org%3A6969%2Fannounce`;
        }
      }
    }

    if (bestMagnet) {
      return ok(res, { magnet: bestMagnet, seeders: maxSeeders }, 3600);
    }
    
    return fail(res, 404, 'No torrent found');
  } catch (e) {
    console.error('[/api/torrent]', e.message);
    return fail(res, 500, e.message);
  }
});

// ── Image proxy ──────────────────────────────────────────────────────────────
app.get('/api/image', async (req, res) => {
  const imageUrl = req.query.url;
  if (!imageUrl) return res.status(400).send('Missing url parameter');
  
  try {
    const response = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://anilist.co/',
      }
    });
    
    if (!response.ok) {
      return res.status(response.status).send('Failed to fetch image');
    }
    
    const contentType = response.headers.get('content-type');
    if (contentType) res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    
    const buffer = Buffer.from(await response.arrayBuffer());
    res.send(buffer);
  } catch (error) {
    console.error('Image proxy error:', error);
    res.status(500).send('Error fetching image');
  }
});

// ── Stream proxy ──────────────────────────────────────────────────────────────
app.get('/api/stream', async (req, res) => {
  const target = String(req.query.url || '').trim();
  if (!target) return fail(res, 400, 'Missing url');
  let targetUrl;
  try { targetUrl = new URL(target); } catch { return fail(res, 400, 'Invalid URL'); }

  let hdrs = {};
  if (req.query.h) { try { hdrs = JSON.parse(Buffer.from(String(req.query.h), 'base64').toString()); } catch {} }

  const reqHdrs = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    Accept: '*/*',
    Referer: hdrs.Referer || hdrs.referer || 'https://megaplay.buzz/',
    Origin: hdrs.Origin || hdrs.origin || 'https://megaplay.buzz',
    ...hdrs,
  };

  try {
    const up = await fetch(targetUrl.toString(), { headers: reqHdrs, redirect: 'follow', signal: AbortSignal.timeout(12000) });
    if (!up.ok && up.status !== 206) return fail(res, up.status, `Upstream ${up.status}`);

    const ct = up.headers.get('content-type') || 'application/octet-stream';
    res.setHeader('Content-Type', ct);
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    const cl = up.headers.get('content-length');
    if (cl) res.setHeader('Content-Length', cl);

    if (ct.includes('mpegurl') || targetUrl.pathname.endsWith('.m3u8')) {
      const host = req.headers.host || `localhost:${PORT}`;
      const origin = `${host.includes('localhost') ? 'http' : 'https'}://${host}`;
      const body = await up.text();
      const base = targetUrl.pathname.slice(0, targetUrl.pathname.lastIndexOf('/') + 1);
      const rewritten = body.split('\n').map(line => {
        const t = line.trim();
        if (!t || t.startsWith('#')) return line;
        const abs = (t.startsWith('http://') || t.startsWith('https://'))
          ? t : new URL(t, `${targetUrl.origin}${base}`).toString();
        const hParam = req.query.h ? `&h=${req.query.h}` : '';
        return `${origin}/api/stream?url=${encodeURIComponent(abs)}${hParam}`;
      }).join('\n');
      return res.status(up.status).send(rewritten);
    }

    res.status(up.status);
    if (!up.body) return res.end();
    for await (const chunk of up.body) res.write(Buffer.from(chunk));
    return res.end();
  } catch (e) {
    return fail(res, 502, e.message || 'Proxy error');
  }
});

// ── Torrent stream ────────────────────────────────────────────────────────────
app.get('/api/torrent-stream', (req, res) => {
  const magnet = req.query.magnet;
  if (!magnet) return res.status(400).send('Missing magnet');
  try {
    let torrent = client.get(magnet);
    if (!torrent) torrent = client.add(magnet, { path: '/tmp/webtorrent' });
    const serve = () => {
      const file = torrent.files.find(f => /\.(mkv|mp4|webm)$/i.test(f.name));
      if (!file) return res.status(404).send('No video file found');
      const { range } = req.headers;
      if (!range) {
        res.writeHead(200, { 'Content-Length': file.length, 'Content-Type': 'video/mp4' });
        return file.createReadStream().pipe(res);
      }
      const [s, e] = range.replace(/bytes=/, '').split('-');
      const start = parseInt(s, 10), end = e ? parseInt(e, 10) : file.length - 1;
      res.writeHead(206, { 'Content-Range': `bytes ${start}-${end}/${file.length}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1, 'Content-Type': 'video/mp4' });
      const stream = file.createReadStream({ start, end });
      stream.pipe(res);
      res.on('close', () => stream.destroy());
    };
    if (torrent.ready) serve();
    else {
      torrent.on('ready', serve);
      torrent.on('error', () => { if (!res.headersSent) res.status(500).send('Torrent error'); });
    }
  } catch { if (!res.headersSent) res.status(500).send('Server error'); }
});

// ── Auth page ─────────────────────────────────────────────────────────────────
app.get('/api/auth/login', (req, res) => {
  const cliPort = req.query.port || 4000;
  res.send(`<!DOCTYPE html><html><head><title>NyAnime CLI Login</title>
  <script src="https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/10.7.1/firebase-auth-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/ui/6.1.0/firebase-ui-auth.js"></script>
  <link rel="stylesheet" href="https://www.gstatic.com/firebasejs/ui/6.1.0/firebase-ui-auth.css"/>
  <style>body{background:#1a1b26;color:#a9b1d6;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}.box{background:#24283b;padding:2rem;border-radius:12px;max-width:400px;width:100%;text-align:center}h1{color:#bb9af7}.ok{display:none;color:#9ece6a;font-weight:bold;margin-top:1rem}</style>
  </head><body><div class="box"><h1>NyAnime CLI</h1><p>Sign in to sync your watch history.</p>
  <div id="ui"></div><div id="loader">Loading…</div><div id="ok" class="ok">✓ Done! You may close this window.</div></div>
  <script>
    firebase.initializeApp({apiKey:"AIzaSyAfwO_c-_BbkiI0NcipTvGIya_R1EYyyTI",authDomain:"nyanime-tech.firebaseapp.com",projectId:"nyanime-tech",storageBucket:"nyanime-tech.firebasestorage.app",messagingSenderId:"677407184955",appId:"1:677407184955:web:b3cc5095e838c9017e241e"});
    const auth=firebase.auth();
    function notify(u){
      document.getElementById('ui').style.display='none';
      document.getElementById('loader').style.display='none';
      document.getElementById('ok').style.display='block';
      u.getIdToken().then(idToken => {
        fetch('http://localhost:${cliPort}/callback',{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({
            token:u.uid,
            idToken:idToken,
            refreshToken:u.refreshToken,
            username:u.displayName||u.email||'AnimeFan'
          })
        }).catch(console.error);
      });
    }
    auth.onAuthStateChanged(u=>{if(u){notify(u);}else{document.getElementById('loader').style.display='none';new firebaseui.auth.AuthUI(auth).start('#ui',{callbacks:{signInSuccessWithAuthResult:function(r){notify(r.user);return false;}},signInFlow:'popup',signInOptions:[firebase.auth.EmailAuthProvider.PROVIDER_ID,firebase.auth.GoogleAuthProvider.PROVIDER_ID]});}});
  </script></body></html>`);
});

app.listen(PORT, HOST, () => {
  console.log(`[ny-cli] backend v6.0.8 on http://${HOST}:${PORT}`);
  console.log(`[ny-cli] providers: AniList (search/info) + Jikan (episodes) + MegaPlay/Anikoto (streaming)`);
});
