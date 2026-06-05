#!/usr/bin/env node
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebTorrent from 'webtorrent';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const torrentClient = new WebTorrent();

// ── Configuration ──────────────────────────────────────────────────────────
const CONSUMET_BASE = process.env.CONSUMET_BASE || 'https://consumet.nyanime.qzz.io';
const ALLANIME_API  = 'https://api.allanime.day/api';
const ALLANIME_REFERER = 'https://allmanga.to';
const PROVIDER_PRIORITY = ['animepahe', 'animesaturn', 'animekai', 'kickassanime'];
const ID_SEP = '::';

app.use(express.json({ limit: '256kb' }));
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

function ok(res, data, secs = 60) {
  res.setHeader('Cache-Control', `public, s-maxage=${secs}, stale-while-revalidate=300`);
  return res.status(200).json({ success: true, data });
}
function fail(res, status, error) { return res.status(status).json({ success: false, error }); }

// ── AllAnime helpers ───────────────────────────────────────────────────────
const AA_DECODE = {'79':'A','7a':'B','7b':'C','7c':'D','7d':'E','7e':'F','7f':'G','70':'H','71':'I','72':'J','73':'K','74':'L','75':'M','76':'N','77':'O','68':'P','69':'Q','6a':'R','6b':'S','6c':'T','6d':'U','6e':'V','6f':'W','60':'X','61':'Y','62':'Z','59':'a','5a':'b','5b':'c','5c':'d','5d':'e','5e':'f','5f':'g','50':'h','51':'i','52':'j','53':'k','54':'l','55':'m','56':'n','57':'o','48':'p','49':'q','4a':'r','4b':'s','4c':'t','4d':'u','4e':'v','4f':'w','40':'x','41':'y','42':'z','08':'0','09':'1','0a':'2','0b':'3','0c':'4','0d':'5','0e':'6','0f':'7','00':'8','01':'9','15':'-','16':'.','67':'_','46':'~','02':':','17':'/','07':'?','1b':'#','63':'[','65':']','78':'@','19':'!','1c':'$','1e':'&','10':'(','11':')','12':'*','13':'+','14':',','03':';','05':'=','1d':'%'};

const AA_SEARCH_Q = 'query($search:SearchInput,$limit:Int,$page:Int,$translationType:VaildTranslationTypeEnumType,$countryOrigin:VaildCountryOriginEnumType){shows(search:$search,limit:$limit,page:$page,translationType:$translationType,countryOrigin:$countryOrigin){edges{_id name englishName thumbnail availableEpisodesDetail}}}';
const AA_SHOW_Q   = 'query($showId:String!){show(_id:$showId){_id name englishName description thumbnail availableEpisodesDetail genres status type}}';
const AA_EP_Q     = 'query($showId:String!,$translationType:VaildTranslationTypeEnumType!,$episodeString:String!){episode(showId:$showId,translationType:$translationType,episodeString:$episodeString){sourceUrls}}';

async function aaGQL(query, variables) {
  const url = `${ALLANIME_API}?variables=${encodeURIComponent(JSON.stringify(variables))}&query=${encodeURIComponent(query)}`;
  const r = await fetch(url, { headers: { Accept: 'application/json', Referer: ALLANIME_REFERER } });
  const json = await r.json();
  if (!r.ok) throw new Error(`AllAnime ${r.status}`);
  return json.data;
}

function decodeAAUrl(raw) {
  const s = raw.trim();
  if (!s) return '';
  if (s.startsWith('http')) return s;
  if (!s.startsWith('--')) {
    if (s.startsWith('//')) return 'https:' + s;
    if (s.startsWith('/')) return 'https://allanime.day' + s;
    return s;
  }
  const enc = s.slice(2).replace(/\s+/g, '');
  let dec = '';
  for (let i = 0; i < enc.length; i += 2) dec += AA_DECODE[enc.slice(i,i+2).toLowerCase()] || '';
  if (dec.includes('/clock')) dec = dec.replace('/clock','/clock.json');
  if (dec.startsWith('//')) dec = 'https:' + dec;
  if (dec.startsWith('/')) dec = 'https://allanime.day' + dec;
  return dec;
}

function isPlayable(url) {
  const l = url.toLowerCase();
  if (l.includes('.html') || l.includes('.htm')) return false;
  return l.includes('.m3u8') || l.includes('.mp4') || l.includes('.webm') || l.includes('/media') || l.includes('tools.fast4speed');
}

function toEpList(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map(v => String(v).trim()).filter(Boolean).sort((a,b) => Number(a)-Number(b));
}

function encodeAAId(showId) { return `allanime${ID_SEP}${showId}`; }
function encodeAAEpId(showId, ep) { return `allanime${ID_SEP}${showId}${ID_SEP}${ep}`; }

function mapAASearch(edges) {
  return {
    currentPage:1, totalPages:1, hasNextPage:false, provider:'allanime',
    animes: edges.map(e => ({
      id: encodeAAId(e._id||''),
      name: e.englishName||e.name||'',
      poster: e.thumbnail||'',
      type: 'TV',
      episodes: { sub: toEpList(e.availableEpisodesDetail?.sub).length, dub: toEpList(e.availableEpisodesDetail?.dub).length }
    }))
  };
}

function mapAAInfo(show) {
  const sub = toEpList(show.availableEpisodesDetail?.sub);
  const dub = toEpList(show.availableEpisodesDetail?.dub);
  return {
    id: encodeAAId(show._id||''),
    name: show.englishName||show.name||'',
    poster: show.thumbnail||'',
    description: show.description||'',
    stats: { type: show.type||'TV', status: show.status||'Unknown', episodes:{sub:sub.length,dub:dub.length} },
    genres: Array.isArray(show.genres)?show.genres:[],
    episodes: {
      sub: sub.map(ep => ({ number:Number(ep), title:`Episode ${ep}`, episodeId:encodeAAEpId(show._id,ep), isFiller:false })),
      dub: dub.map(ep => ({ number:Number(ep), title:`Episode ${ep}`, episodeId:encodeAAEpId(show._id,ep), isFiller:false })),
    },
    provider: 'allanime'
  };
}

function mapAASources(sourceUrls) {
  const seen = new Set();
  const sources = (sourceUrls||[]).map(s => {
    const url = decodeAAUrl(s.sourceUrl||'');
    if (!url || !isPlayable(url) || seen.has(url)) return null;
    seen.add(url);
    const qm = String(s.sourceName||'').match(/(360|480|720|1080)/);
    return { url, quality: qm ? `${qm[1]}p` : 'auto', isM3U8: url.includes('.m3u8') };
  }).filter(Boolean);
  return {
    headers: { Referer: ALLANIME_REFERER, Origin: 'https://allanime.day', 'User-Agent': 'Mozilla/5.0' },
    sources, tracks: [], subtitles: [], provider: 'allanime'
  };
}

// ── Consumet helpers ────────────────────────────────────────────────────────
async function consumetGet(path) {
  const r = await fetch(`${CONSUMET_BASE}${path}`, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error(`Consumet ${r.status} for ${path}`);
  return r.json();
}

function sanitizeUrl(u) {
  if (typeof u !== 'string') return '';
  try { return new URL(u.trim().replace(/^['"]/,'').replace(/['"]$/,'')).toString(); } catch { return ''; }
}

function toConsumetSources(data, provider) {
  const referers = { animepahe: 'https://animepahe.ru/', animesaturn: 'https://www.animesaturn.cx/', allanime: 'https://allmanga.to/' };
  const sources = (data.sources||[]).map(s => ({ url: sanitizeUrl(s.url), quality:s.quality||'auto', isM3U8:!!s.isM3U8 })).filter(s=>s.url);
  const tracks  = ([...(data.tracks||[]),...(data.subtitles||[])]).map(t=>({lang:t.lang||t.language||'?',url:sanitizeUrl(t.url)})).filter(t=>t.url);
  return { headers: data.headers||{Referer:referers[provider]||'https://megacloud.blog/'}, sources, tracks, subtitles:tracks, provider };
}

// ── Decode helpers ──────────────────────────────────────────────────────────
function decodeAAEpParam(v) {
  if (!v.startsWith(`allanime${ID_SEP}`)) return null;
  const rest = v.slice(`allanime${ID_SEP}`.length);
  const idx = rest.indexOf(ID_SEP);
  if (idx <= 0) return null;
  return { showId: rest.slice(0,idx), episodeString: rest.slice(idx+ID_SEP.length) };
}
function decodeAAAnimeParam(v) {
  if (!v.startsWith(`allanime${ID_SEP}`)) return null;
  return v.slice(`allanime${ID_SEP}`.length);
}
function decodeProviderId(v) {
  if (!v.includes(ID_SEP)) return { provider: PROVIDER_PRIORITY[0], rawId: v };
  const [prov,...rest] = v.split(ID_SEP);
  return { provider: prov, rawId: rest.join(ID_SEP) };
}

// ── Routes ─────────────────────────────────────────────────────────────────
app.get('/', (req,res) => res.json({ status:'ok', version:'5.5.13', provider:'allanime+consumet' }));

app.get('/api/aniwatch', async (req, res) => {
  const { action, q, id, episodeId, category, server: serverQ, page } = req.query;

  try {
    // ── search ──
    if (action === 'search' || action === 'home' || action === 'random') {
      if (action === 'home' || action === 'random') {
        // Return a random anime via Jikan
        try {
          const r = await fetch('https://api.jikan.moe/v4/random/anime');
          const j = await r.json();
          if (j?.data) {
            const item = j.data;
            const anime = { id: String(item.mal_id), name: item.title_english||item.title||'', poster: item.images?.webp?.large_image_url||'', type: item.type||'TV', episodes:{sub:item.episodes||0,dub:0} };
            return ok(res, { randomAnime: anime, suggestedAnimes: [anime], provider:'jikan' }, 30);
          }
        } catch { /* fall through */ }
        return ok(res, { spotlightAnimes:[], trendingAnimes:[], latestEpisodeAnimes:[], top10Animes:{today:[],week:[],month:[]}, provider:'allanime' }, 30);
      }

      if (!q) return fail(res, 400, 'Missing q');
      try {
        const data = await aaGQL(AA_SEARCH_Q, { search:{allowAdult:false,allowUnknown:false,query:q}, limit:40, page:Number(page||1), translationType:'sub', countryOrigin:'ALL' });
        const edges = data?.shows?.edges||[];
        const mapped = mapAASearch(edges);
        if (mapped.animes.length) return ok(res, mapped, 120);
      } catch { /* fall through */ }
      // Consumet fallback
      for (const prov of PROVIDER_PRIORITY) {
        try {
          const data = await consumetGet(`/anime/${prov}/${encodeURIComponent(q)}?page=${page||1}`);
          if (data?.results?.length) {
            const animes = data.results.map(r => ({ id:`${prov}${ID_SEP}${r.id}`, name:r.title||'', poster:r.image||'', type:r.type||'TV', episodes:{sub:r.totalEpisodes||0,dub:0} }));
            return ok(res, { currentPage:1, totalPages:1, hasNextPage:false, animes, provider:prov }, 120);
          }
        } catch { /* next */ }
      }
      return fail(res, 502, 'Search failed on all providers');
    }

    // ── suggestions ──
    if (action === 'suggestions') {
      if (!q) return fail(res, 400, 'Missing q');
      try {
        const data = await aaGQL(AA_SEARCH_Q, { search:{allowAdult:false,allowUnknown:false,query:q}, limit:10, page:1, translationType:'sub', countryOrigin:'ALL' });
        const edges = data?.shows?.edges||[];
        const mapped = mapAASearch(edges);
        if (mapped.animes.length) return ok(res, mapped.animes.slice(0,10), 60);
      } catch { /* fall through */ }
      for (const prov of PROVIDER_PRIORITY) {
        try {
          const data = await consumetGet(`/anime/${prov}/${encodeURIComponent(q)}?page=1`);
          if (data?.results?.length) {
            return ok(res, data.results.slice(0,10).map(r => ({ id:`${prov}${ID_SEP}${r.id}`, name:r.title||'', poster:r.image||'' })), 60);
          }
        } catch { /* next */ }
      }
      return fail(res, 502, 'Suggestions failed');
    }

    // ── info ──
    if (action === 'info' || action === 'episodes') {
      if (!id) return fail(res, 400, 'Missing id');
      const showId = decodeAAAnimeParam(id);
      if (showId) {
        // AllAnime path
        try {
          const data = await aaGQL(AA_SHOW_Q, { showId });
          if (!data?.show?._id) return fail(res, 404, 'Anime not found');
          const mapped = mapAAInfo(data.show);
          if (action === 'episodes') return ok(res, { totalEpisodes: mapped.episodes.sub.length, episodes: mapped.episodes.sub, provider:'allanime' }, 300);
          return ok(res, mapped, 300);
        } catch(e) { return fail(res, 502, e.message); }
      }
      // Consumet path
      const { provider: prov, rawId } = decodeProviderId(id);
      let payload = null, usedProv = prov;
      for (const p of [prov, ...PROVIDER_PRIORITY]) {
        try { payload = await consumetGet(`/anime/${p}/info?id=${encodeURIComponent(rawId)}`); usedProv = p; break; } catch { /* next */ }
      }
      if (!payload) return fail(res, 502, 'Info fetch failed');
      const eps = (payload.episodes||[]).map((ep,i) => ({ number:Number(ep.number||i+1), title:ep.title||`Episode ${Number(ep.number||i+1)}`, episodeId:`${usedProv}${ID_SEP}${ep.id||ep.number||i+1}`, isFiller:false }));
      if (action === 'episodes') return ok(res, { totalEpisodes:eps.length, episodes:eps, provider:usedProv }, 300);
      return ok(res, { id:`${usedProv}${ID_SEP}${payload.id||rawId}`, name:payload.title||'', poster:payload.image||'', description:payload.description||'', stats:{type:payload.type||'TV',status:payload.status||'Unknown',episodes:{sub:eps.length,dub:0}}, genres:payload.genres||[], episodes:{sub:eps,dub:[]}, provider:usedProv }, 300);
    }

    // ── servers ──
    if (action === 'servers') {
      if (!episodeId) return fail(res, 400, 'Missing episodeId');
      const isAA = !!decodeAAEpParam(episodeId);
      return ok(res, { episodeId, episodeNo:0, sub:[{ serverId:1, serverName: isAA?'allanime':decodeProviderId(episodeId).provider }], dub:[], raw:[] }, 60);
    }

    // ── sources ──
    if (action === 'sources') {
      if (!episodeId) return fail(res, 400, 'Missing episodeId');
      const cat = category === 'dub' ? 'dub' : 'sub';
      const aaEp = decodeAAEpParam(episodeId);
      if (aaEp) {
        try {
          const data = await aaGQL(AA_EP_Q, { showId:aaEp.showId, translationType:cat, episodeString:aaEp.episodeString });
          const mapped = mapAASources(data?.episode?.sourceUrls);
          if (!mapped.sources.length) return fail(res, 404, 'No sources found');
          return ok(res, mapped, 0);
        } catch(e) { return fail(res, 502, e.message); }
      }
      // Consumet path
      const { provider: prov, rawId } = decodeProviderId(episodeId);
      const serverParam = serverQ ? `&server=${encodeURIComponent(serverQ)}` : '';
      let payload = null, usedProv = prov;
      for (const p of [prov, ...PROVIDER_PRIORITY]) {
        try { payload = await consumetGet(`/anime/${p}/watch/${encodeURIComponent(rawId)}?category=${cat}${serverParam}`); usedProv = p; break; } catch { /* next */ }
      }
      if (!payload) return fail(res, 502, 'Sources fetch failed');
      const result = toConsumetSources(payload, usedProv);
      if (!result.sources.length) return fail(res, 404, 'No sources found');
      return ok(res, result, 0);
    }

    return fail(res, 400, `Unknown action: ${action}`);
  } catch(e) {
    return fail(res, 500, e.message || 'Internal error');
  }
});

// ── Stream proxy ────────────────────────────────────────────────────────────
app.get('/api/stream', async (req, res) => {
  const target = String(req.query.url || '').trim();
  if (!target) return fail(res, 400, 'Missing url');
  let targetUrl;
  try { targetUrl = new URL(target); } catch { return fail(res, 400, 'Invalid URL'); }

  let customHeaders = {};
  const hb64 = req.query.h;
  if (hb64) {
    try { customHeaders = JSON.parse(Buffer.from(hb64,'base64').toString('utf-8')); } catch {}
  }

  const referer = customHeaders.Referer || customHeaders.referer || 'https://allmanga.to/';
  const reqHeaders = { 'User-Agent':'Mozilla/5.0', Accept:'*/*', 'Cache-Control':'no-cache', Referer:referer, ...customHeaders };

  try {
    const upstream = await fetch(targetUrl.toString(), { headers: reqHeaders, redirect:'follow', signal: AbortSignal.timeout(10000) });
    if (!upstream.ok && upstream.status !== 206) return fail(res, upstream.status, `Upstream ${upstream.status}`);

    const ct = upstream.headers.get('content-type') || 'application/octet-stream';
    const isM3u8 = ct.includes('mpegurl') || targetUrl.pathname.endsWith('.m3u8');
    res.setHeader('Content-Type', ct);
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    const cl = upstream.headers.get('content-length');
    if (cl) res.setHeader('Content-Length', cl);

    if (isM3u8) {
      const host = req.headers.host || `localhost:${PORT}`;
      const origin = `${host.includes('localhost')?'http':'https'}://${host}`;
      const body = await upstream.text();
      const base = targetUrl.pathname.slice(0, targetUrl.pathname.lastIndexOf('/')+1);
      const rewritten = body.split('\n').map(line => {
        const t = line.trim();
        if (!t || t.startsWith('#')) return line;
        const abs = (t.startsWith('http://') || t.startsWith('https://')) ? t : new URL(t, `${targetUrl.origin}${base}`).toString();
        return `${origin}/api/stream?url=${encodeURIComponent(abs)}${hb64 ? `&h=${hb64}` : ''}`;
      }).join('\n');
      return res.status(upstream.status).send(rewritten);
    }

    res.status(upstream.status);
    if (!upstream.body) return res.end();
    for await (const chunk of upstream.body) res.write(Buffer.from(chunk));
    return res.end();
  } catch(e) {
    return fail(res, 502, e.message || 'Proxy error');
  }
});

// ── Torrent stream ──────────────────────────────────────────────────────────
app.get('/api/torrent-stream', (req, res) => {
  const magnet = req.query.magnet;
  if (!magnet) return res.status(400).send('Missing magnet');
  try {
    let torrent = torrentClient.get(magnet);
    if (!torrent) torrent = torrentClient.add(magnet, { path: '/tmp/webtorrent' });
    const handle = () => {
      const file = torrent.files.find(f => f.name.endsWith('.mkv') || f.name.endsWith('.mp4'));
      if (!file) return res.status(404).send('No video file');
      const range = req.headers.range;
      if (!range) {
        res.writeHead(200, { 'Content-Length': file.length, 'Content-Type': 'video/mp4' });
        return file.createReadStream().pipe(res);
      }
      const [s,e] = range.replace(/bytes=/,'').split('-');
      const start = parseInt(s,10), end = e ? parseInt(e,10) : file.length-1;
      res.writeHead(206, { 'Content-Range':`bytes ${start}-${end}/${file.length}`, 'Accept-Ranges':'bytes', 'Content-Length':end-start+1, 'Content-Type':'video/mp4' });
      const stream = file.createReadStream({ start, end });
      stream.pipe(res);
      res.on('close', () => stream.destroy());
    };
    if (torrent.ready) handle(); else { torrent.on('ready', handle); torrent.on('error', () => { if (!res.headersSent) res.status(500).send('Torrent error'); }); }
  } catch { if (!res.headersSent) res.status(500).send('Server error'); }
});

// ── Auth page ───────────────────────────────────────────────────────────────
app.get('/api/auth/login', (req, res) => {
  const cliPort = req.query.port || 4000;
  res.send(`<!DOCTYPE html><html><head><title>NyAnime CLI Login</title>
  <script src="https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/10.7.1/firebase-auth-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/ui/6.1.0/firebase-ui-auth.js"></script>
  <link rel="stylesheet" href="https://www.gstatic.com/firebasejs/ui/6.1.0/firebase-ui-auth.css"/>
  <style>body{background:#1a1b26;color:#a9b1d6;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}.container{background:#24283b;padding:2rem;border-radius:12px;max-width:400px;width:100%;text-align:center}h1{color:#bb9af7}.success{display:none;color:#9ece6a;font-weight:bold;margin-top:1rem}</style>
  </head><body><div class="container"><h1>NyAnime CLI</h1><p>Sign in to sync watch history across devices.</p>
  <div id="firebaseui-auth-container"></div><div id="loader">Loading...</div><div id="success" class="success">Authenticated! You may close this window.</div></div>
  <script>
    firebase.initializeApp({apiKey:"AIzaSyAfwO_c-_BbkiI0NcipTvGIya_R1EYyyTI",authDomain:"nyanime-tech.firebaseapp.com",projectId:"nyanime-tech",storageBucket:"nyanime-tech.firebasestorage.app",messagingSenderId:"677407184955",appId:"1:677407184955:web:b3cc5095e838c9017e241e"});
    const auth = firebase.auth();
    function notifyCLI(user){
      document.getElementById('firebaseui-auth-container').style.display='none';
      document.getElementById('loader').style.display='none';
      document.getElementById('success').style.display='block';
      fetch('http://localhost:${cliPort}/callback',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:user.uid,username:user.displayName||user.email||'AnimeFan'})}).catch(console.error);
    }
    auth.onAuthStateChanged(u=>{if(u){notifyCLI(u);}else{document.getElementById('loader').style.display='none';var ui=new firebaseui.auth.AuthUI(auth);ui.start('#firebaseui-auth-container',{callbacks:{signInSuccessWithAuthResult:function(r){notifyCLI(r.user);return false;}},signInFlow:'popup',signInOptions:[firebase.auth.EmailAuthProvider.PROVIDER_ID,firebase.auth.GoogleAuthProvider.PROVIDER_ID]});}});
  </script></body></html>`);
});

app.listen(PORT, HOST, () => {
  console.log(`[ny-cli] backend running on http://${HOST}:${PORT}`);
});
