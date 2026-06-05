#!/usr/bin/env node
/**
 * ny-cli backend v5.5.14
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
const PORT   = Number(process.env.PORT || 3000);
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
  media(search:$q,type:ANIME){
    id idMal title{english romaji} status episodes
    coverImage{large} genres format
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
    poster: m.coverImage?.large || m.coverImage?.extraLarge || '',
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
    if (allEps.length === 0 && totalEps > 0) {
      // Generate synthetic episode list from totalEps count
      allEps = Array.from({ length: totalEps }, (_, i) => ({ mal_id: i + 1, title: `Episode ${i + 1}`, aired: { string: '' } }));
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

// ── MegaPlay ──────────────────────────────────────────────────────────────────
function megaplaySrc(malId, epNo, lang = 'sub') {
  if (!malId || !epNo) return null;
  const url = `https://megaplay.buzz/stream/mal/${malId}/${epNo}/${lang}`;
  return { url, embedUrl: url, quality: 'MegaPlay (Embed)', type: 'embed', isM3U8: false, tracks: [] };
}

// Anikoto embed (alternative embed source)
function anikotoSrc(malId, epNo) {
  if (!malId || !epNo) return null;
  const url = `https://anikoto.live/stream/mal/${malId}/${epNo}/sub`;
  return { url, embedUrl: url, quality: 'Anikoto (Embed)', type: 'embed', isM3U8: false, tracks: [] };
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
  const parts = String(id).split('::');
  if (parts[0] === 'anilist' && parts[1]) return { anilistId: Number(parts[1]) };
  return null;
}

// ── Routes ────────────────────────────────────────────────────────────────────
app.get('/', (req, res) => res.json({ status: 'ok', version: '5.5.14', providers: ['anilist', 'jikan', 'megaplay'] }));

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
        const data = await anilistGQL(`query{Page(page:1,perPage:10){media(type:ANIME,sort:TRENDING_DESC,status:RELEASING){id idMal title{english romaji}episodes coverImage{large}format status genres}}}`, {});
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

      const sources = [];
      const lang = cat === 'dub' ? 'dub' : 'sub';

      // Primary: MegaPlay embed
      const mp = megaplaySrc(malId, epNo, lang);
      if (mp) sources.push(mp);

      // Secondary: Anikoto embed
      const ak = anikotoSrc(malId, epNo);
      if (ak) sources.push(ak);

      if (!sources.length) return fail(res, 404, 'No sources available');

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
    function notify(u){document.getElementById('ui').style.display='none';document.getElementById('loader').style.display='none';document.getElementById('ok').style.display='block';fetch('http://localhost:${cliPort}/callback',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:u.uid,username:u.displayName||u.email||'AnimeFan'})}).catch(console.error);}
    auth.onAuthStateChanged(u=>{if(u){notify(u);}else{document.getElementById('loader').style.display='none';new firebaseui.auth.AuthUI(auth).start('#ui',{callbacks:{signInSuccessWithAuthResult:function(r){notify(r.user);return false;}},signInFlow:'popup',signInOptions:[firebase.auth.EmailAuthProvider.PROVIDER_ID,firebase.auth.GoogleAuthProvider.PROVIDER_ID]});}});
  </script></body></html>`);
});

app.listen(PORT, HOST, () => {
  console.log(`[ny-cli] backend v5.5.14 on http://${HOST}:${PORT}`);
  console.log(`[ny-cli] providers: AniList (search/info) + Jikan (episodes) + MegaPlay/Anikoto (streaming)`);
});
