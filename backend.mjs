#!/usr/bin/env node
/**
 * ny-cli backend
 * Search & Metadata: AniList GraphQL (primary) with Jikan API v4 fallback (and optional CF relay).
 * Streaming Providers: Senshi, HiAnime, AniPub, Owais, Allanime.
 * Network & DNS: Undici HTTP client with DoH (Cloudflare/Google) and proxy support.
 */
import { httpFetch, safeHttpFetch, isPrivateOrLoopback } from './net.mjs';
import { resolveHost } from './dns.mjs';
import { loadConfig } from './config.mjs';
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve as resolveProviders, resolveStream } from './providers/index.mjs';
import { SWRCache } from './swr-cache.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const startedAt = new Date().toISOString();
let pkgVersion = 'unknown';
try {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
  pkgVersion = pkg.version;
} catch {}

const config = loadConfig();
const app    = express();
const PORT   = Number(process.env.PORT || 43201);
const HOST   = config.host || process.env.HOST || '127.0.0.1';
export function getRelayUrl() {
  return process.env.NY_RELAY_URL || loadConfig().relayUrl || '';
}

// ── SWR Cache instances ─────────────────────────────────────────────────────
const swrCache = {
  search: new SWRCache({ freshTTL: 10 * 60_000, staleTTL: 6 * 3600_000, maxEntries: 500 }),
  home:   new SWRCache({ freshTTL: 10 * 60_000, staleTTL: 6 * 3600_000 }),
  info:   new SWRCache({ freshTTL:  6 * 3600_000, staleTTL: 24 * 3600_000, maxEntries: 500 }),
  browse: new SWRCache({ freshTTL: 10 * 60_000, staleTTL: 24 * 3600_000, maxEntries: 500 }),
  genres: new SWRCache({ freshTTL: 24 * 3600_000, staleTTL: 48 * 3600_000, maxEntries: 50 }),
};

// ── Retry helper (ported from nyanime) ──────────────────────────────────────
const TRANSIENT_CODES = new Set([
  'ENETUNREACH', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT',
  'EHOSTUNREACH', 'EAI_AGAIN', 'EPIPE', 'ERR_SOCKET_CONNECTION_TIMEOUT',
  'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_SOCKET', 'ENOTFOUND',
]);

async function withRetry(fn, { retries = 2, delay = 800, label = '' } = {}) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const code = err?.cause?.code || err.code;
      const isTransient = TRANSIENT_CODES.has(code) ||
        /timeout|ENETUNREACH|ECONNR|socket/i.test(err.message);
      if (i < retries) {
        const backoff = isTransient ? delay * (i + 1) : delay;
        if (label) console.log(`[retry] ${label} attempt ${i+1} failed (${code || err.message?.substring(0,40)}), retrying in ${backoff}ms...`);
        await new Promise(r => setTimeout(r, backoff));
      }
    }
  }
  throw lastErr;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const ok   = (res, data, ttl = 60) => {
  res.setHeader('Cache-Control', `public,s-maxage=${ttl}`);
  return res.json({ success: true, data });
};
const fail = (res, code, err) => res.status(code).json({ success: false, error: err });

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function fetchJson(url, opts = {}) {
  let r;
  try {
    r = await httpFetch(url, { signal: AbortSignal.timeout(8000), ...opts });
  } catch (netErr) {
    // Network-level failure: DNS, connection refused, timeout, etc.
    const msg = netErr?.cause?.code || netErr.message || 'unknown network error';
    const err = new Error(`Network error (${msg}): could not reach ${url}`);
    err.isNetworkError = true;
    throw err;
  }
  if (!r.ok) {
    // HTTP-level failure: we reached the host but it returned an error status
    let bodySnippet = '';
    try {
      const text = await r.text();
      bodySnippet = text.slice(0, 512);
    } catch {}
    const err = new Error(`HTTP ${r.status} from ${url}${bodySnippet ? ': ' + bodySnippet : ''}`);
    err.httpStatus = r.status;
    err.responseBody = bodySnippet;

    const retryAfter = r.headers.get('retry-after');
    if (retryAfter) {
      const sec = parseInt(retryAfter, 10);
      if (!isNaN(sec)) {
        err.retryAfter = sec;
      } else {
        const parsedDate = Date.parse(retryAfter);
        if (!isNaN(parsedDate)) {
          err.retryAfter = Math.max(1, Math.ceil((parsedDate - Date.now()) / 1000));
        }
      }
    }
    throw err;
  }
  return r.json();
}

app.use(express.json({ limit: '256kb' }));

// ── Security Helpers: Address validation & safe hosts ─────────────────────────
async function validateSafeHost(hostname) {
  if (isPrivateOrLoopback(hostname)) {
    throw new Error('Forbidden: private or loopback host');
  }
  try {
    const result = await resolveHost(hostname, { all: true });
    for (const record of (result.records || [])) {
      if (isPrivateOrLoopback(record.address)) {
        throw new Error(`Forbidden: resolved to private/loopback IP (${record.address})`);
      }
    }
  } catch (err) {
    if (err.message.startsWith('Forbidden:')) throw err;
    throw new Error(`DNS resolution failed for ${hostname}: ${err.message}`);
  }
}

const ALLOWED_IMAGE_HOSTS = new Set([
  's4.anilist.co',
  'media.kitsu.io',
  'media.kitsu.app',
  'cdn.myanimelist.net',
  'myanimelist.cdn-dena.com',
  'img.flawlessfiles.com',
  'cdn.anipixcdn.co',
  'image.tmdb.org',
]);

function isAllowedImageHost(hostname) {
  if (!hostname) return false;
  const h = hostname.toLowerCase();
  if (ALLOWED_IMAGE_HOSTS.has(h)) return true;
  if (h.endsWith('.anilist.co') || h.endsWith('.myanimelist.net') || h.endsWith('.kitsu.io') || h.endsWith('.kitsu.app') || h.endsWith('.cdn-dena.com') || h.endsWith('.anipixcdn.co') || h.endsWith('.tmdb.org')) {
    return true;
  }
  return false;
}

// ── Stream Security: Session-allowed hosts & signed headers ───────────────────
const STREAM_SECRET = crypto.randomBytes(32).toString('hex');
const allowedStreamHosts = new Map(); // host -> expiration timestamp

function allowStreamHost(hostname) {
  if (!hostname) return;
  cleanAllowedStreamHosts();
  allowedStreamHosts.set(hostname.toLowerCase(), Date.now() + 2 * 60 * 60 * 1000);
}

function cleanAllowedStreamHosts() {
  const now = Date.now();
  for (const [host, exp] of allowedStreamHosts.entries()) {
    if (exp < now) allowedStreamHosts.delete(host);
  }
}

function signStreamHeaders(hdrs) {
  if (!hdrs || Object.keys(hdrs).length === 0) return '';
  const payload = JSON.stringify(hdrs);
  const sig = crypto.createHmac('sha256', STREAM_SECRET).update(payload).digest('hex');
  return `${Buffer.from(payload).toString('base64url')}.${sig}`;
}

function verifyStreamHeaders(token) {
  if (!token || typeof token !== 'string') return {};
  const dot = token.indexOf('.');
  if (dot === -1) return null;
  const b64 = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  try {
    const payload = Buffer.from(b64, 'base64url').toString('utf8');
    const expectedSig = crypto.createHmac('sha256', STREAM_SECRET).update(payload).digest('hex');
    if (sig.length === expectedSig.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) {
      return JSON.parse(payload);
    }
  } catch {
    return null;
  }
  return null;
}

// ── Adult Filter Setting ───────────────────────────────────────────────────────
export function isAdultFilterEnabled() {
  if (process.env.NY_ADULT_FILTER !== undefined) {
    return process.env.NY_ADULT_FILTER !== '0' && process.env.NY_ADULT_FILTER.toLowerCase() !== 'false';
  }
  const cfg = loadConfig();
  return cfg.adultFilter !== false;
}

// ── Rate Limited Queue for upstream API pacing & 429 backoff ──────────────────
export class RateLimitedQueue {
  constructor({ name, minIntervalMs = 400, maxPerMinute = Infinity }) {
    this.name = name;
    this.minIntervalMs = minIntervalMs;
    this.maxPerMinute = maxPerMinute;
    this.queue = [];
    this.history = [];
    this.processing = false;
    this.pausedUntil = 0;
    this.reqCount = 0;
    this.lastDispatched = 0;
  }

  enqueue(fn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject, attempts: 0 });
      this._process();
    });
  }

  async _process() {
    if (this.processing) return;
    this.processing = true;

    while (this.queue.length > 0) {
      const now = Date.now();
      if (this.pausedUntil > now) {
        const pauseWait = this.pausedUntil - now;
        console.log(`[${this.name}] Rate limit pause active: waiting ${pauseWait}ms`);
        await new Promise(r => setTimeout(r, pauseWait));
      }

      // 60s window limit
      if (this.maxPerMinute < Infinity) {
        const oneMinAgo = Date.now() - 60000;
        this.history = this.history.filter(ts => ts > oneMinAgo);
        if (this.history.length >= this.maxPerMinute) {
          const oldest = this.history[0];
          const waitTime = 60000 - (Date.now() - oldest) + 25;
          if (waitTime > 0) {
            console.log(`[${this.name}] 60s window limit reached (${this.history.length}/${this.maxPerMinute}), waiting ${waitTime}ms`);
            await new Promise(r => setTimeout(r, waitTime));
          }
        }
      }

      // Spacing between consecutive requests
      const elapsed = Date.now() - this.lastDispatched;
      if (this.lastDispatched > 0 && elapsed < this.minIntervalMs) {
        const spacingWait = this.minIntervalMs - elapsed;
        await new Promise(r => setTimeout(r, spacingWait));
      }

      const item = this.queue.shift();
      if (!item) break;

      const dispatchTime = Date.now();
      const actualSpacing = this.lastDispatched === 0 ? 0 : dispatchTime - this.lastDispatched;
      this.lastDispatched = dispatchTime;
      this.history.push(dispatchTime);
      this.reqCount++;

      console.log(`[${this.name}] dispatching request #${this.reqCount} (spacing: ${actualSpacing}ms, queued: ${this.queue.length})`);

      try {
        const res = await item.fn();
        item.resolve(res);
      } catch (err) {
        const status = err?.httpStatus || err?.status;
        if (status === 429 && item.attempts < 2) {
          item.attempts++;
          const retrySec = Number(err.retryAfter) || 2;
          console.warn(`[${this.name}] HTTP 429 received! Backing off for ${retrySec}s (Retry-After)`);
          this.pausedUntil = Date.now() + (retrySec * 1000);
          this.queue.unshift(item);
        } else {
          item.reject(err);
        }
      }
    }

    this.processing = false;
  }

  get queueLength() {
    return this.queue.length;
  }
}

export const anilistQueue = new RateLimitedQueue({
  name: 'AniList',
  minIntervalMs: 670, // stay under 90 req/minute
  maxPerMinute: 90,
});

export const jikanQueue = new RateLimitedQueue({
  name: 'Jikan',
  minIntervalMs: 350, // 3 req/sec max
  maxPerMinute: 60,
});

export const kitsuQueue = new RateLimitedQueue({
  name: 'Kitsu',
  minIntervalMs: 250,
  maxPerMinute: 120,
});

export const anikotoQueue = new RateLimitedQueue({
  name: 'AniKoto',
  minIntervalMs: 200,
  maxPerMinute: 60,
});

// ── AniList ───────────────────────────────────────────────────────────────────
const ANILIST = 'https://graphql.anilist.co';

async function anilistGQL(query, variables) {
  return anilistQueue.enqueue(async () => {
    const body = JSON.stringify({ query, variables });
    const hdrs = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': UA,
    };

    try {
      const result = await withRetry(
        () => fetchJson(ANILIST, { method: 'POST', headers: hdrs, body }),
        { retries: 2, delay: 800, label: 'anilistGQL' }
      );
      result._source = 'direct';
      return result;
    } catch (directErr) {
      const relayUrl = getRelayUrl();
      if (!relayUrl) throw directErr;
      console.log('[anilistGQL] Direct request failed after retries, trying relay:', directErr.message);
      try {
        const result = await fetchJson(`${relayUrl}/anilist`, { method: 'POST', headers: hdrs, body });
        result._source = 'relay';
        return result;
      } catch (relayErr) {
        console.error('[anilistGQL] Relay also failed:', relayErr.message);
        throw directErr; // throw original error for better diagnostics
      }
    }
  });
}

const AL_SEARCH_Q = `query($q:String,$page:Int,$isAdult:Boolean){Page(page:$page,perPage:20){
  pageInfo{hasNextPage currentPage}
  media(search:$q,type:ANIME,isAdult:$isAdult,sort:[SEARCH_MATCH,POPULARITY_DESC]){
    id idMal title{english romaji} status episodes
    nextAiringEpisode{episode airingAt}
    coverImage{large extraLarge} genres format
  }
}}`;

const AL_HOME_Q = `query($isAdult:Boolean){Page(page:1,perPage:10){
  media(type:ANIME,isAdult:$isAdult,sort:TRENDING_DESC,status:RELEASING){
    id idMal title{english romaji} episodes nextAiringEpisode{episode airingAt}
    coverImage{large} format status genres
  }
}}`;

export function cleanSynopsis(text) {
  if (!text) return '';
  return text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<p>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&mdash;/g, '—')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const AL_INFO_Q = `query($id:Int){Media(id:$id,type:ANIME){
  id idMal title{english romaji native} status episodes format
  description coverImage{large extraLarge} bannerImage
  genres tags{name} averageScore meanScore popularity
  season seasonYear
  startDate{year month day} endDate{year month day}
  nextAiringEpisode{episode airingAt timeUntilAiring}
  studios{nodes{name isAnimationStudio}}
  trailer{id site}
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

async function jikanFetch(endpoint) {
  return jikanQueue.enqueue(async () => {
    const hdrs = { 'User-Agent': UA };
    try {
      const result = await withRetry(
        () => fetchJson(`${JIKAN}${endpoint}`, { headers: hdrs, signal: AbortSignal.timeout(3500) }),
        { retries: 1, delay: 500, label: `jikanFetch ${endpoint}` }
      );
      result._source = 'direct';
      return result;
    } catch (directErr) {
      const relayUrl = getRelayUrl();
      if (!relayUrl) throw directErr;
      console.log('[jikanFetch] Direct request failed after retries, trying relay:', directErr.message);
      try {
        const result = await fetchJson(`${relayUrl}/jikan${endpoint}`, { headers: hdrs });
        result._source = 'relay';
        return result;
      } catch (relayErr) {
        console.error('[jikanFetch] Relay also failed:', relayErr.message);
        throw directErr;
      }
    }
  });
}

// ── Jikan Fallback Functions ──────────────────────────────────────────────────

function mapJikanAnime(d) {
  const name = d.title_english || d.title || '';
  const epCount = d.episodes || 0;
  return {
    id: d.mal_id ? `mal::${d.mal_id}` : `jikan::${d.mal_id}`,
    malId: d.mal_id || null,
    name,
    jname: d.title_japanese || d.title || name,
    poster: d.images?.jpg?.large_image_url || d.images?.jpg?.image_url || '',
    type: d.type || 'TV',
    episodes: { sub: epCount, dub: 0 },
    status: d.status || 'Unknown',
    genres: (d.genres || []).map(g => g.name),
  };
}

async function jikanSearch(q, page = 1) {
  const sfw = isAdultFilterEnabled() ? '&sfw=true' : '';
  const data = await jikanFetch(`/anime?q=${encodeURIComponent(q)}&page=${page}&limit=20&order_by=popularity&sort=asc${sfw}`);
  const animes = (data?.data || []).map(mapJikanAnime);
  const pagination = data?.pagination || {};
  return {
    currentPage: page,
    totalPages: pagination.last_visible_page || page,
    hasNextPage: !!pagination.has_next_page,
    animes,
    provider: 'jikan',
  };
}

async function jikanTrending() {
  const sfw = isAdultFilterEnabled() ? '&sfw=true' : '';
  const data = await jikanFetch(`/top/anime?filter=airing&limit=10${sfw}`);
  const trending = (data?.data || []).map(mapJikanAnime);
  return {
    spotlightAnimes: trending.slice(0, 5),
    trendingAnimes: trending,
    latestEpisodeAnimes: [],
    provider: 'jikan',
  };
}

async function jikanInfo(malId) {
  const data = await jikanFetch(`/anime/${malId}/full`);
  const d = data?.data;
  if (!d) return null;

  const titleEnglish = d.title_english || '';
  const titleRomaji  = d.title || '';
  const titleNative  = d.title_japanese || '';
  const name         = titleEnglish || titleRomaji || titleNative;
  const jname        = titleRomaji || name;

  const epCount  = d.episodes || 0;
  const isAiring = d.status === 'Currently Airing' || d.airing === true;
  const episodes = await getEpisodesForMal(malId, epCount, { isAiring, status: d.status });

  const studios = (d.studios || []).map(s => s.name);
  const trailer = d.trailer?.youtube_id ? {
    id: d.trailer.youtube_id,
    site: 'youtube',
  } : null;

  const synopsis = cleanSynopsis(d.synopsis);
  const scoreNum = typeof d.score === 'number' ? Math.round(d.score * 10) : null;

  return {
    id: `mal::${d.mal_id}`,
    anilistId: null,
    malId: d.mal_id,
    name,
    jname,
    titles: {
      english: titleEnglish,
      romaji: titleRomaji,
      native: titleNative,
    },
    format: d.type ? d.type.toUpperCase() : 'TV',
    status: isAiring ? 'RELEASING' : (d.status === 'Finished Airing' ? 'FINISHED' : (d.status || 'UNKNOWN')),
    season: d.season ? d.season.toUpperCase() : null,
    year: d.year || d.aired?.prop?.from?.year || null,
    studios,
    averageScore: scoreNum,
    meanScore: scoreNum,
    popularity: d.popularity || null,
    startDate: d.aired?.prop?.from ? {
      year: d.aired.prop.from.year || null,
      month: d.aired.prop.from.month || null,
      day: d.aired.prop.from.day || null,
    } : null,
    nextAiringEpisode: null,
    trailer,
    poster: d.images?.jpg?.large_image_url || d.images?.jpg?.image_url || '',
    banner: '',
    description: synopsis,
    synopsis,
    stats: {
      type: d.type || 'TV',
      status: d.status || 'Unknown',
      episodes: { sub: epCount, dub: 0 },
      score: d.score ? `${Number(d.score).toFixed(1)}/10` : '',
    },
    genres: (d.genres || []).map(g => g.name),
    episodes: { sub: episodes, dub: [] },
    provider: 'jikan',
  };
}

// ── Kitsu ─────────────────────────────────────────────────────────────────────
const KITSU = 'https://kitsu.io/api/edge';

async function kitsuFetch(endpoint) {
  return kitsuQueue.enqueue(async () => {
    const hdrs = {
      Accept: 'application/vnd.api+json',
      'Content-Type': 'application/vnd.api+json',
      'User-Agent': `ny-cli/${pkgVersion}`,
    };
    return fetchJson(`${KITSU}${endpoint}`, {
      headers: hdrs,
      signal: AbortSignal.timeout(5000),
    });
  });
}

function mapKitsuAnime(d) {
  const attr = d.attributes || {};
  const enTitle = attr.titles?.en || attr.titles?.en_jp || attr.canonicalTitle || '';
  const romTitle = attr.titles?.en_jp || attr.canonicalTitle || enTitle;
  const natTitle = attr.titles?.ja_jp || '';
  const name = enTitle || romTitle || natTitle;
  const jname = romTitle || name;
  const artwork = attr.posterImage?.medium || attr.posterImage?.original || attr.posterImage?.large || '';
  const banner = attr.coverImage?.original || attr.coverImage?.large || '';
  const score = attr.averageRating ? Math.round(Number(attr.averageRating)) : null;
  const status = attr.status === 'finished' ? 'COMPLETED' : (attr.status === 'current' ? 'ONGOING' : 'UNKNOWN');
  const epCount = attr.episodeCount || 0;

  return {
    id: `kitsu::${d.id}`,
    kitsuId: d.id,
    name,
    jname,
    poster: artwork,
    artwork,
    banner,
    type: attr.showType ? attr.showType.toUpperCase() : 'TV',
    format: attr.showType ? attr.showType.toUpperCase() : 'TV',
    episodes: { sub: epCount, dub: 0 },
    totalEpisodes: epCount,
    status,
    genres: [],
    averageScore: score,
    description: attr.synopsis || attr.description || '',
    year: attr.startDate ? Number(attr.startDate.slice(0, 4)) : null,
    season: null,
    title: {
      english: enTitle,
      romaji: romTitle,
      native: natTitle,
      userPreferred: enTitle || romTitle,
    },
  };
}

function mapKitsuBrowseAnime(d) {
  const attr = d.attributes || {};
  const name = attr.titles?.en || attr.titles?.en_jp || attr.canonicalTitle || '';
  const jname = attr.titles?.ja_jp || attr.titles?.en_jp || name;
  const epCount = attr.episodeCount || 0;
  const scoreNum = attr.averageRating ? Math.round(Number(attr.averageRating)) : null;
  const poster = attr.posterImage?.medium || attr.posterImage?.original || attr.posterImage?.large || '';
  return {
    id: `kitsu::${d.id}`,
    anilistId: null,
    malId: null,
    kitsuId: d.id,
    name,
    jname,
    titles: {
      english: attr.titles?.en || '',
      romaji: attr.titles?.en_jp || attr.canonicalTitle || '',
      native: attr.titles?.ja_jp || '',
    },
    format: attr.showType ? attr.showType.toUpperCase() : 'TV',
    type: attr.showType ? attr.showType.toUpperCase() : 'TV',
    status: attr.status === 'finished' ? 'FINISHED' : (attr.status === 'current' ? 'RELEASING' : 'UNKNOWN'),
    season: null,
    year: attr.startDate ? Number(attr.startDate.slice(0, 4)) : null,
    poster,
    artwork: poster,
    episodes: { sub: epCount, dub: 0 },
    totalEpisodes: epCount,
    genres: [],
    averageScore: scoreNum,
    popularity: attr.popularityRank || null,
    stats: {
      type: attr.showType ? attr.showType.toUpperCase() : 'TV',
      status: attr.status === 'finished' ? 'Completed' : (attr.status === 'current' ? 'Releasing' : 'Unknown'),
      episodes: { sub: epCount, dub: 0 },
      score: attr.averageRating ? `${(Number(attr.averageRating) / 10).toFixed(1)}/10` : '',
    },
  };
}

async function kitsuSearch(q, page = 1) {
  const limit = 20;
  const offset = (page - 1) * limit;
  const data = await kitsuFetch(`/anime?filter[text]=${encodeURIComponent(q)}&page[limit]=${limit}&page[offset]=${offset}`);
  let animes = (data?.data || []).map(mapKitsuAnime);
  if (isAdultFilterEnabled()) {
    animes = animes.filter(a => a.ageRating !== 'R18');
  }
  const total = data?.meta?.count || animes.length;
  const totalPages = Math.ceil(total / limit) || 1;
  return {
    currentPage: page,
    totalPages,
    hasNextPage: offset + limit < total,
    animes,
    provider: 'kitsu',
  };
}

async function kitsuTrending() {
  const data = await kitsuFetch('/trending/anime?limit=10');
  const trending = (data?.data || []).map(mapKitsuAnime);
  return {
    spotlightAnimes: trending.slice(0, 5),
    trendingAnimes: trending,
    latestEpisodeAnimes: [],
    trending,
    provider: 'kitsu',
  };
}

export async function kitsuInfo(kitsuId) {
  const data = await kitsuFetch(`/anime/${kitsuId}`);
  const d = data?.data;
  if (!d) return null;
  const attr = d.attributes || {};

  const titleEnglish = attr.titles?.en || '';
  const titleRomaji  = attr.titles?.en_jp || attr.canonicalTitle || '';
  const titleNative  = attr.titles?.ja_jp || '';
  const name         = titleEnglish || titleRomaji || titleNative;
  const jname        = titleRomaji || name;

  const isAiring = attr.status === 'current';
  let episodes = [];
  let totalEps = attr.episodeCount || 0;

  try {
    // Kitsu maximum page size is 20
    const epsData = await kitsuFetch(`/anime/${kitsuId}/episodes?page[limit]=20`);
    episodes = (epsData?.data || []).map(ep => ({
      id: `ep::kitsu::${kitsuId}::${ep.attributes?.number || 1}`,
      number: ep.attributes?.number || 1,
      title: ep.attributes?.canonicalTitle || ep.attributes?.titles?.en_us || ep.attributes?.titles?.en_jp || `Episode ${ep.attributes?.number || 1}`,
      description: ep.attributes?.synopsis || '',
      isFiller: false,
    }));
    if (epsData?.meta?.count && epsData.meta.count > totalEps) {
      totalEps = epsData.meta.count;
    }
  } catch (err) {
    console.error(`[kitsuInfo] Error fetching episodes for ${kitsuId}:`, err.message);
  }

  if (totalEps === 0 && episodes.length > 0) {
    totalEps = episodes.length;
  }
  if (totalEps === 0 && isAiring) {
    totalEps = 24;
  } else if (totalEps === 0) {
    totalEps = 1;
  }

  // Cross-reference with AniKoto for accurate canonical episode counts on ongoing / long-running anime
  if (name && (isAiring || totalEps > 1000)) {
    try {
      const akData = await anikotoFetch(`/search?keyword=${encodeURIComponent(name)}`);
      const topMatch = (akData?.results?.data || []).find(a => 
        (a.title?.toLowerCase() === name.toLowerCase() || a.japaneseTitle?.toLowerCase() === jname.toLowerCase()) && a.sub
      );
      if (topMatch && topMatch.sub && Number(topMatch.sub) > 0) {
        totalEps = Number(topMatch.sub);
      }
    } catch {}
  }

  // Populate remaining episodes up to totalEps so ongoing anime (like One Piece) have full playable episode list
  if (episodes.length < totalEps) {
    const existing = new Set(episodes.map(e => e.number));
    for (let i = 1; i <= totalEps; i++) {
      if (!existing.has(i)) {
        episodes.push({
          id: `ep::kitsu::${kitsuId}::${i}`,
          number: i,
          title: `Episode ${i}`,
          isFiller: false,
        });
      }
    }
    episodes.sort((a, b) => a.number - b.number);
  }

  const synopsis = cleanSynopsis(attr.synopsis || attr.description || '');
  const scoreNum = attr.averageRating ? Math.round(Number(attr.averageRating)) : null;

  return {
    id: `kitsu::${d.id}`,
    anilistId: null,
    malId: null,
    kitsuId: d.id,
    name,
    jname,
    titles: {
      english: titleEnglish,
      romaji: titleRomaji,
      native: titleNative,
    },
    format: attr.showType ? attr.showType.toUpperCase() : 'TV',
    status: isAiring ? 'RELEASING' : (attr.status === 'finished' ? 'FINISHED' : 'UNKNOWN'),
    season: null,
    year: attr.startDate ? Number(attr.startDate.slice(0, 4)) : null,
    studios: [],
    averageScore: scoreNum,
    meanScore: scoreNum,
    popularity: attr.popularityRank || null,
    startDate: attr.startDate ? {
      year: Number(attr.startDate.slice(0, 4)) || null,
      month: Number(attr.startDate.slice(5, 7)) || null,
      day: Number(attr.startDate.slice(8, 10)) || null,
    } : null,
    nextAiringEpisode: null,
    trailer: attr.youtubeVideoId ? { id: attr.youtubeVideoId, site: 'youtube' } : null,
    poster: attr.posterImage?.large || attr.posterImage?.original || attr.posterImage?.medium || '',
    banner: attr.coverImage?.large || attr.coverImage?.original || '',
    description: synopsis,
    synopsis,
    stats: {
      type: attr.showType ? attr.showType.toUpperCase() : 'TV',
      status: attr.status === 'finished' ? 'Completed' : (attr.status === 'current' ? 'Releasing' : 'Unknown'),
      episodes: { sub: totalEps, dub: 0 },
      score: attr.averageRating ? `${(Number(attr.averageRating) / 10).toFixed(1)}/10` : '',
    },
    genres: [],
    episodes: { sub: episodes, dub: [] },
    totalEpisodes: totalEps,
    provider: 'kitsu',
  };
}

export async function kitsuBrowse(category, { page = 1, genre = '', season = '', year = null, sort = '' } = {}) {
  const limit = 20;
  const offset = (page - 1) * limit;
  let endpoint = '';

  const { season: curSeason, year: curYear } = getCurrentSeasonAndYear();

  switch (category) {
    case 'trending':
      if (page === 1) {
        endpoint = `/trending/anime?limit=${limit}`;
      } else {
        endpoint = `/anime?sort=popularityRank&page[limit]=${limit}&page[offset]=${offset}`;
      }
      break;
    case 'popular-season': {
      endpoint = `/anime?filter[season]=${curSeason.toLowerCase()}&filter[seasonYear]=${curYear}&sort=-user_count&page[limit]=${limit}&page[offset]=${offset}`;
      break;
    }
    case 'airing':
      endpoint = `/anime?filter[status]=current&sort=-startDate&page[limit]=${limit}&page[offset]=${offset}`;
      break;
    case 'season': {
      const s = (season || curSeason).toLowerCase();
      const y = year || curYear;
      endpoint = `/anime?filter[season]=${s}&filter[seasonYear]=${y}&sort=-user_count&page[limit]=${limit}&page[offset]=${offset}`;
      break;
    }
    case 'top-rated':
      endpoint = `/anime?sort=-average_rating&page[limit]=${limit}&page[offset]=${offset}`;
      break;
    case 'upcoming':
      endpoint = `/anime?filter[status]=upcoming&sort=-user_count&page[limit]=${limit}&page[offset]=${offset}`;
      break;
    case 'movies':
      endpoint = `/anime?filter[subtype]=movie&sort=-user_count&page[limit]=${limit}&page[offset]=${offset}`;
      break;
    case 'genre':
      endpoint = `/anime?filter[categories]=${encodeURIComponent(genre)}&sort=-user_count&page[limit]=${limit}&page[offset]=${offset}`;
      break;
    default:
      endpoint = `/anime?sort=-user_count&page[limit]=${limit}&page[offset]=${offset}`;
      break;
  }

  let data = await kitsuFetch(endpoint);
  let animes = (data?.data || []).map(mapKitsuBrowseAnime);

  // If popular-season is empty (e.g. index hasn't caught up to current season), fallback to top rated current airing
  if (category === 'popular-season' && animes.length === 0) {
    data = await kitsuFetch(`/anime?filter[status]=current&sort=-average_rating&page[limit]=${limit}&page[offset]=${offset}`);
    animes = (data?.data || []).map(mapKitsuBrowseAnime);
  }

  if (isAdultFilterEnabled()) {
    animes = animes.filter(a => a.ageRating !== 'R18');
  }
  const total = data?.meta?.count || animes.length;
  return {
    category,
    currentPage: page,
    hasNextPage: offset + limit < total,
    perPage: limit,
    animes,
    provider: 'kitsu',
  };
}

export async function kitsuGenres() {
  const data = await kitsuFetch('/categories?page[limit]=30&sort=-total_media_count');
  const genres = (data?.data || [])
    .map(c => c.attributes?.title)
    .filter(Boolean)
    .filter(g => !isAdultFilterEnabled() || g.toLowerCase() !== 'hentai');
  return {
    genres,
    provider: 'kitsu',
  };
}

// ── AniKoto API ───────────────────────────────────────────────────────────────
const ANIKOTO = 'https://ani-koto-api-three.vercel.app/api';

async function anikotoFetch(endpoint) {
  return anikotoQueue.enqueue(async () => {
    const hdrs = { 'User-Agent': UA, 'Accept': 'application/json' };
    const res = await withRetry(
      () => fetchJson(`${ANIKOTO}${endpoint}`, { headers: hdrs, signal: AbortSignal.timeout(6000) }),
      { retries: 1, delay: 500, label: `anikotoFetch ${endpoint}` }
    );
    return res;
  });
}

function mapAniKotoAnime(d) {
  const title = d.title || d.name || '';
  const jtitle = d.japaneseTitle || title;
  const subCount = Number(d.sub) || 0;
  const dubCount = Number(d.dub) || 0;
  const slug = d.slug ? (d.slug.includes('/') ? d.slug.split('/')[0] : d.slug) : '';
  const score = d.rating ? Math.round(Number(d.rating) * 10) : null;

  return {
    id: `anikoto::${slug}`,
    slug,
    animeId: d.animeId || null,
    malId: d.mal_id ? Number(d.mal_id) : null,
    name: title,
    jname: jtitle,
    poster: d.poster || '',
    type: d.type ? d.type.toUpperCase() : 'TV',
    format: d.type ? d.type.toUpperCase() : 'TV',
    episodes: { sub: subCount, dub: dubCount },
    totalEpisodes: subCount,
    status: 'Unknown',
    genres: Array.isArray(d.genres) ? d.genres : [],
    averageScore: score,
    title: {
      english: title,
      romaji: jtitle,
      native: '',
      userPreferred: title,
    },
  };
}

export async function anikotoSearch(q, page = 1) {
  const data = await anikotoFetch(`/search?keyword=${encodeURIComponent(q)}&page=${page}`);
  const items = data?.results?.data || [];
  const animes = items.map(mapAniKotoAnime);
  const totalPages = data?.results?.totalPages || 1;
  return {
    currentPage: page,
    totalPages,
    hasNextPage: page < totalPages,
    animes,
    provider: 'anikoto',
  };
}

export async function anikotoInfo(slug) {
  const cleanSlug = slug.includes('/') ? slug.split('/')[0] : slug;
  const [infoData, epData] = await Promise.all([
    anikotoFetch(`/info?id=${encodeURIComponent(cleanSlug)}`).catch(() => null),
    anikotoFetch(`/episodes/${encodeURIComponent(cleanSlug)}`).catch(() => null),
  ]);

  const res = infoData?.results || {};
  const epRes = epData?.results || {};
  const name = res.title || res.name || '';
  const jname = res.japaneseTitle || name;
  const totalEpisodes = epRes.totalEpisodes || (typeof res.episodes === 'object' ? res.episodes.sub : Number(res.episodes)) || 0;

  const rawEpisodes = epRes.episodes || [];
  const episodes = rawEpisodes.map(e => ({
    id: `ep::anikoto::${cleanSlug}::${e.episode_no || 1}`,
    number: e.episode_no || 1,
    title: e.title ? e.title : `Episode ${e.episode_no || 1}`,
    isFiller: false,
  }));

  if (episodes.length === 0 && totalEpisodes > 0) {
    for (let i = 1; i <= totalEpisodes; i++) {
      episodes.push({
        id: `ep::anikoto::${cleanSlug}::${i}`,
        number: i,
        title: `Episode ${i}`,
        isFiller: false,
      });
    }
  }

  const scoreNum = res.malScore ? Math.round(Number(res.malScore) * 10) : null;
  const yearMatch = (res.premiered || res.aired || '').match(/\b(19\d\d|20\d\d)\b/);
  const year = yearMatch ? Number(yearMatch[1]) : null;

  return {
    id: `anikoto::${cleanSlug}`,
    anilistId: null,
    malId: rawEpisodes[0]?.mal_id ? Number(rawEpisodes[0].mal_id) : null,
    slug: cleanSlug,
    name,
    jname,
    titles: {
      english: name,
      romaji: jname,
      native: '',
    },
    format: res.type ? res.type.toUpperCase() : 'TV',
    status: /currently/i.test(res.status || '') ? 'RELEASING' : 'FINISHED',
    season: null,
    year,
    studios: res.studios ? [res.studios] : [],
    averageScore: scoreNum,
    meanScore: scoreNum,
    popularity: null,
    trailer: null,
    poster: res.poster || '',
    banner: res.backgroundImage || '',
    description: res.synopsis || '',
    synopsis: res.synopsis || '',
    stats: {
      type: res.type ? res.type.toUpperCase() : 'TV',
      status: res.status || 'Unknown',
      episodes: { sub: totalEpisodes, dub: typeof res.episodes === 'object' ? res.episodes.dub || 0 : 0 },
      score: res.malScore ? `${res.malScore}/10` : '',
    },
    genres: typeof res.genres === 'string' ? res.genres.split(',').map(s => s.trim()) : (res.genres || []),
    episodes: { sub: episodes, dub: [] },
    totalEpisodes,
    provider: 'anikoto',
  };
}

export async function anikotoBrowse(category, { page = 1 } = {}) {
  let endpoint = '';
  switch (category) {
    case 'trending':
      endpoint = `/`;
      break;
    case 'airing':
      endpoint = `/status/currently-airing?page=${page}`;
      break;
    case 'popular-season':
    case 'top-rated':
      endpoint = `/most-popular?page=${page}`;
      break;
    default:
      endpoint = `/most-popular?page=${page}`;
      break;
  }

  const data = await anikotoFetch(endpoint);
  let rawList = [];
  if (category === 'trending') {
    rawList = data?.results?.trending || [];
  } else {
    rawList = data?.results?.data || [];
  }

  const animes = rawList.map(mapAniKotoAnime);
  return {
    category,
    currentPage: page,
    hasNextPage: true,
    perPage: 20,
    animes,
    provider: 'anikoto',
  };
}

// ── Browse & Categories ───────────────────────────────────────────────────────

export const JIKAN_GENRE_MAP = {
  'action': 1, 'adventure': 2, 'racing': 3, 'comedy': 4, 'avant garde': 5,
  'mythology': 6, 'mystery': 7, 'drama': 8, 'ecchi': 9, 'fantasy': 10,
  'strategy game': 11, 'hentai': 12, 'historical': 13, 'horror': 14,
  'kids': 15, 'martial arts': 17, 'mecha': 18, 'music': 19, 'parody': 20,
  'samurai': 21, 'romance': 22, 'school': 23, 'sci-fi': 24, 'shoujo': 25,
  'girls love': 26, 'shounen': 27, 'boys love': 28, 'space': 29, 'sports': 30,
  'super power': 31, 'vampire': 32, 'harem': 35, 'slice of life': 36,
  'supernatural': 37, 'military': 38, 'police': 39, 'psychological': 40,
  'suspense': 41, 'thriller': 41, 'seinen': 42, 'josei': 43, 'award winning': 46,
  'gourmet': 47, 'work life': 48, 'erotica': 49,
};

export function getCurrentSeasonAndYear() {
  const d = new Date();
  const month = d.getMonth(); // 0-11
  const year = d.getFullYear();
  let season = 'FALL';
  if (month >= 0 && month <= 2) season = 'WINTER';
  else if (month >= 3 && month <= 5) season = 'SPRING';
  else if (month >= 6 && month <= 8) season = 'SUMMER';
  else season = 'FALL';
  return { season, year };
}

export function getBrowseTtlSeconds(category) {
  switch (category) {
    case 'trending':
      return 600; // 10 minutes
    case 'popular-season':
    case 'season':
    case 'airing':
      return 3600; // 1 hour
    case 'top-rated':
    case 'upcoming':
    case 'movies':
    case 'genre':
    default:
      return 21600; // 6 hours
  }
}

const AL_GENRES_Q = `query { GenreCollection }`;

const AL_BROWSE_Q = `query(
  $page: Int,
  $perPage: Int,
  $isAdult: Boolean,
  $sort: [MediaSort],
  $status: MediaStatus,
  $format: MediaFormat,
  $season: MediaSeason,
  $seasonYear: Int,
  $genre: String
) {
  Page(page: $page, perPage: $perPage) {
    pageInfo {
      currentPage
      hasNextPage
      perPage
    }
    media(
      type: ANIME,
      isAdult: $isAdult,
      sort: $sort,
      status: $status,
      format: $format,
      season: $season,
      seasonYear: $seasonYear,
      genre: $genre
    ) {
      id
      idMal
      title { english romaji native }
      format
      status
      episodes
      season
      seasonYear
      coverImage { large extraLarge }
      genres
      averageScore
      popularity
    }
  }
}`;

function mapBrowseAnime(m) {
  const name = m.title?.english || m.title?.romaji || m.title?.native || '';
  const jname = m.title?.romaji || name;
  const epCount = m.episodes || 0;
  return {
    id: `anilist::${m.id}`,
    anilistId: m.id,
    malId: m.idMal || null,
    name,
    jname,
    titles: {
      english: m.title?.english || '',
      romaji: m.title?.romaji || '',
      native: m.title?.native || '',
    },
    format: m.format || 'TV',
    status: m.status || 'UNKNOWN',
    season: m.season || null,
    year: m.seasonYear || null,
    poster: m.coverImage?.extraLarge || m.coverImage?.large || '',
    genres: m.genres || [],
    averageScore: m.averageScore ?? null,
    popularity: m.popularity ?? null,
    stats: {
      type: m.format || 'TV',
      status: m.status || 'Unknown',
      episodes: { sub: epCount, dub: 0 },
      score: m.averageScore ? `${(m.averageScore / 10).toFixed(1)}/10` : '',
    },
  };
}

function mapJikanBrowseAnime(d) {
  const name = d.title_english || d.title || d.title_japanese || '';
  const jname = d.title_japanese || d.title || name;
  const epCount = d.episodes || 0;
  const scoreNum = typeof d.score === 'number' ? Math.round(d.score * 10) : null;
  return {
    id: `mal::${d.mal_id}`,
    anilistId: null,
    malId: d.mal_id,
    name,
    jname,
    titles: {
      english: d.title_english || '',
      romaji: d.title || '',
      native: d.title_japanese || '',
    },
    format: d.type ? d.type.toUpperCase() : 'TV',
    status: d.status || 'UNKNOWN',
    season: d.season ? d.season.toUpperCase() : null,
    year: d.year || d.aired?.prop?.from?.year || null,
    poster: d.images?.jpg?.large_image_url || d.images?.jpg?.image_url || '',
    genres: (d.genres || []).map(g => g.name),
    averageScore: scoreNum,
    popularity: d.popularity || null,
    stats: {
      type: d.type || 'TV',
      status: d.status || 'Unknown',
      episodes: { sub: epCount, dub: 0 },
      score: d.score ? `${Number(d.score).toFixed(1)}/10` : '',
    },
  };
}

export async function jikanBrowse(category, { page = 1, genre = '', season = '', year = '', sort = '' } = {}) {
  const sfw = isAdultFilterEnabled() ? '&sfw=true' : '';
  const { season: curSeason, year: curYear } = getCurrentSeasonAndYear();
  let endpoint = '';

  switch (category) {
    case 'trending':
      endpoint = `/top/anime?filter=airing&page=${page}&limit=20${sfw}`;
      break;
    case 'popular-season':
      endpoint = `/seasons/now?page=${page}&limit=20${sfw}`;
      break;
    case 'top-rated':
      endpoint = `/top/anime?page=${page}&limit=20${sfw}`;
      break;
    case 'airing':
      endpoint = `/top/anime?filter=airing&page=${page}&limit=20${sfw}`;
      break;
    case 'upcoming':
      endpoint = `/top/anime?filter=upcoming&page=${page}&limit=20${sfw}`;
      break;
    case 'movies':
      endpoint = `/top/anime?type=movie&page=${page}&limit=20${sfw}`;
      break;
    case 'genre': {
      const gId = JIKAN_GENRE_MAP[genre.toLowerCase()];
      const jikanSort = sort === 'score' ? 'score' : 'popularity';
      if (gId) {
        endpoint = `/anime?genres=${gId}&page=${page}&limit=20&order_by=${jikanSort}&sort=desc${sfw}`;
      } else {
        endpoint = `/anime?q=${encodeURIComponent(genre)}&page=${page}&limit=20&order_by=${jikanSort}&sort=desc${sfw}`;
      }
      break;
    }
    case 'season': {
      const s = (season || curSeason).toLowerCase();
      const y = year || curYear;
      endpoint = `/seasons/${y}/${s}?page=${page}&limit=20${sfw}`;
      break;
    }
    default:
      endpoint = `/top/anime?page=${page}&limit=20${sfw}`;
      break;
  }

  const data = await jikanFetch(endpoint);
  const animes = (data?.data || []).map(mapJikanBrowseAnime);
  const pagination = data?.pagination || {};
  return {
    category,
    currentPage: page,
    hasNextPage: !!pagination.has_next_page,
    perPage: 20,
    animes,
    provider: 'jikan',
  };
}

export async function jikanGenres() {
  const data = await jikanFetch('/genres/anime');
  const genres = (data?.data || [])
    .map(g => g.name)
    .filter(g => !isAdultFilterEnabled() || g.toLowerCase() !== 'hentai');
  return {
    genres,
    provider: 'jikan',
  };
}

// ── Episode Cache: per-item TTL (10m for airing, 6h for finished) + size cap ────
export class EpisodeCache {
  constructor(maxEntries = 500) {
    this.maxEntries = maxEntries;
    this._store = new Map(); // key -> { data, expiresAt, lastAccess, isAiring }
    this._seq = 0;
  }

  get(key) {
    const k = String(key);
    const entry = this._store.get(k);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this._store.delete(k);
      return null;
    }
    entry.lastAccess = ++this._seq;
    return entry.data;
  }

  set(key, data, isAiring = false) {
    const k = String(key);
    if (this._store.size >= this.maxEntries && !this._store.has(k)) {
      let oldestKey = null;
      let oldestAccess = Infinity;
      for (const [ek, ev] of this._store) {
        if (ev.lastAccess < oldestAccess) {
          oldestAccess = ev.lastAccess;
          oldestKey = ek;
        }
      }
      if (oldestKey) this._store.delete(oldestKey);
    }
    const ttl = isAiring ? 10 * 60_000 : 6 * 3600_000;
    this._store.set(k, {
      data,
      expiresAt: Date.now() + ttl,
      lastAccess: ++this._seq,
      isAiring,
    });
  }

  clear() {
    this._store.clear();
  }

  get size() {
    return this._store.size;
  }
}

export const epCache = new EpisodeCache(500);

async function getEpisodesForMal(malId, totalEps = 0, options = {}) {
  if (!malId) return [];
  const key = `${malId}`;
  const cached = epCache.get(key);
  if (cached) return cached;

  const isAiring = Boolean(options.isAiring || /releasing|airing/i.test(options.status || ''));

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
    epCache.set(key, mapped, isAiring);
    return mapped;
  } catch {
    if (totalEps > 0) {
      const synthetic = Array.from({ length: totalEps }, (_, i) => ({
        number: i + 1, title: `Episode ${i + 1}`, isFiller: false, episodeId: `ep::${malId}::${i + 1}`,
      }));
      epCache.set(key, synthetic, isAiring);
      return synthetic;
    }
    return [];
  }
}


// ── Decode episodeId → malId + epNo ──────────────────────────────────────────
// Format: "ep::malId::epNo"  or  "anilist::anilistId" (info only)
function parseEpId(epId) {
  if (!epId) return null;
  const parts = String(epId).split('::');
  if (parts[0] === 'ep' && parts.length === 3) return { malId: Number(parts[1]), epNo: Number(parts[2]) };
  if (parts[0] === 'ep' && parts[1] === 'kitsu' && parts.length === 4) return { kitsuId: parts[2], epNo: Number(parts[3]) };
  if (parts[0] === 'ep' && parts[1] === 'anikoto' && parts.length === 4) return { anikotoSlug: parts[2], epNo: Number(parts[3]) };
  return null;
}

function parseAnimeId(id) {
  if (!id) return null;
  const s = String(id).trim();
  const parts = s.split('::');
  // Standard format: "anilist::12345"
  if (parts[0] === 'anilist' && parts[1]) return { anilistId: Number(parts[1]) };
  // Jikan fallback format: "mal::12345"
  if (parts[0] === 'mal' && parts[1]) return { malId: Number(parts[1]) };
  // AniKoto fallback format: "anikoto::slug"
  if (parts[0] === 'anikoto' && parts[1]) return { anikotoSlug: parts[1] };
  // Kitsu fallback format: "kitsu::12345"
  if (parts[0] === 'kitsu' && parts[1]) return { kitsuId: parts[1] };
  // Backward compat: bare numeric ID — treat as AniList ID
  // (older history entries stored raw AniList IDs before the anilist:: prefix was added)
  if (/^\d+$/.test(s)) return { anilistId: Number(s) };
  return null;
}

// ── Routes ────────────────────────────────────────────────────────────────────
app.get('/', (req, res) => res.json({
  status: 'ok',
  version: pkgVersion,
  pid: process.pid,
  startedAt,
  providers: ['anilist', 'jikan', 'anikoto', 'kitsu', 'senshi', 'hianime', 'anipub', 'owais', 'anidb'],
  relay: getRelayUrl() || null,
}));

app.get('/api/aniwatch', async (req, res) => {
  const { action, q, id, episodeId, category, page, malId: qMalId, episodeNo: qEpNo, genre, season, year, sort } = req.query;
  const cat = category === 'dub' ? 'dub' : 'sub';
  const pageNum = Number(page) || 1;

  try {
    // ── search ──────────────────────────────────────────────────────────────
    if (action === 'search' || action === 'suggestions') {
      if (!q) return fail(res, 400, 'Missing q');

      const cacheKey = `search:${q}:${pageNum}:${isAdultFilterEnabled() ? 'sfw' : 'all'}`;

      const doSearch = async () => {
        let searchResult;
        const isAdult = isAdultFilterEnabled() ? false : undefined;
        try {
          const data = await anilistGQL(AL_SEARCH_Q, { q, page: pageNum, isAdult });
          const media = data?.data?.Page?.media || [];
          const animes = media.map(mapALAnime);
          const source = data._source === 'relay' ? 'anilist (relay)' : 'anilist';
          searchResult = {
            currentPage: pageNum,
            totalPages: data?.data?.Page?.pageInfo?.hasNextPage ? pageNum + 1 : pageNum,
            hasNextPage: !!data?.data?.Page?.pageInfo?.hasNextPage,
            animes,
            provider: source,
          };
          swrCache.search.set(cacheKey, searchResult);
          return searchResult;
        } catch (alErr) {
          console.error('[search] AniList failed, falling back to Jikan:', alErr.message);
          try {
            searchResult = await jikanSearch(q, pageNum);
            swrCache.search.set(cacheKey, searchResult);
            return searchResult;
          } catch (jkErr) {
            console.error('[search] Jikan fallback also failed, falling back to AniKoto:', jkErr.message);
            try {
              searchResult = await anikotoSearch(q, pageNum);
              swrCache.search.set(cacheKey, searchResult);
              return searchResult;
            } catch (akErr) {
              console.error('[search] AniKoto fallback also failed, falling back to Kitsu:', akErr.message);
              try {
                searchResult = await kitsuSearch(q, pageNum);
                swrCache.search.set(cacheKey, searchResult);
                return searchResult;
              } catch (ktErr) {
                console.error('[search] Kitsu fallback also failed:', ktErr.message);
                const staleData = swrCache.search.getStaleOrNull(cacheKey);
                if (staleData) {
                  console.log(`[search] serving stale cache for "${q}"`);
                  return { ...staleData, provider: (staleData.provider || '') + ' (stale cache)' };
                }
                throw alErr;
              }
            }
          }
        }
      };

      // Check cache first
      const cached = swrCache.search.get(cacheKey);
      if (cached) {
        if (!cached.stale) {
          console.log(`[search] cache hit (fresh) for "${q}"`);
          const result = cached.data;
          if (action === 'suggestions') return ok(res, result.animes.slice(0, 8), 120);
          return ok(res, result, 120);
        }
        // Stale: trigger background revalidation and serve immediately
        console.log(`[search] cache hit (stale, background revalidating) for "${q}"`);
        swrCache.search.revalidate(cacheKey, doSearch);
        const result = cached.data;
        if (action === 'suggestions') return ok(res, result.animes.slice(0, 8), 30);
        return ok(res, result, 30);
      }

      const searchResult = await doSearch();
      if (action === 'suggestions') return ok(res, searchResult.animes.slice(0, 8), 120);
      return ok(res, searchResult, 120);
    }

    // ── genres ───────────────────────────────────────────────────────────────
    if (action === 'genres') {
      const cacheKey = `genres:${isAdultFilterEnabled() ? 'sfw' : 'all'}`;

      const doGenres = async () => {
        try {
          const data = await anilistGQL(AL_GENRES_Q, {});
          let genres = data?.data?.GenreCollection || [];
          if (isAdultFilterEnabled()) {
            genres = genres.filter(g => g.toLowerCase() !== 'hentai');
          }
          const source = data._source === 'relay' ? 'anilist (relay)' : 'anilist';
          const resObj = { genres, provider: source };
          swrCache.genres.set(cacheKey, resObj);
          return resObj;
        } catch (alErr) {
          console.error('[genres] AniList failed, falling back to Jikan:', alErr.message);
          try {
            const jikanRes = await jikanGenres();
            swrCache.genres.set(cacheKey, jikanRes);
            return jikanRes;
          } catch (jkErr) {
            console.error('[genres] Jikan fallback also failed, falling back to Kitsu:', jkErr.message);
            try {
              const ktRes = await kitsuGenres();
              swrCache.genres.set(cacheKey, ktRes);
              return ktRes;
            } catch (ktErr) {
              console.error('[genres] Kitsu fallback also failed:', ktErr.message);
              const staleData = swrCache.genres.getStaleOrNull(cacheKey);
              if (staleData) {
                console.log('[genres] serving stale cache');
                return { ...staleData, provider: (staleData.provider || '') + ' (stale cache)' };
              }
              return null;
            }
          }
        }
      };

      const cached = swrCache.genres.get(cacheKey);
      if (cached) {
        if (!cached.stale) {
          console.log('[genres] cache hit (fresh)');
          return ok(res, cached.data, 86400);
        }
        console.log('[genres] cache hit (stale, background revalidating)');
        swrCache.genres.revalidate(cacheKey, doGenres);
        return ok(res, { ...cached.data, provider: (cached.data.provider || '') + ' (stale cache)' }, 60);
      }

      const genresResult = await doGenres();
      if (!genresResult) {
        return fail(res, 502, 'Failed to fetch genres from both AniList and Jikan');
      }
      return ok(res, genresResult, 86400);
    }

    // ── browse ───────────────────────────────────────────────────────────────
    if (action === 'browse') {
      const browseCat = category || 'trending';
      const ttl = getBrowseTtlSeconds(browseCat);
      const isAdultKey = isAdultFilterEnabled() ? 'sfw' : 'all';
      const cacheKey = `browse:${browseCat}:${genre || ''}:${season || ''}:${year || ''}:${sort || ''}:${pageNum}:${isAdultKey}`;

      const doBrowse = async () => {
        try {
          const { season: curSeason, year: curYear } = getCurrentSeasonAndYear();
          const vars = {
            page: pageNum,
            perPage: 20,
            isAdult: isAdultFilterEnabled() ? false : undefined,
          };

          switch (browseCat) {
            case 'trending':
              vars.sort = ['TRENDING_DESC'];
              break;
            case 'popular-season':
              vars.season = curSeason;
              vars.seasonYear = curYear;
              vars.sort = ['POPULARITY_DESC'];
              break;
            case 'top-rated':
              vars.sort = ['SCORE_DESC'];
              break;
            case 'airing':
              vars.status = 'RELEASING';
              vars.sort = ['POPULARITY_DESC'];
              break;
            case 'upcoming':
              vars.status = 'NOT_YET_RELEASED';
              vars.sort = ['POPULARITY_DESC'];
              break;
            case 'movies':
              vars.format = 'MOVIE';
              vars.sort = ['POPULARITY_DESC'];
              break;
            case 'genre': {
              vars.genre = genre || 'Action';
              let s = 'POPULARITY_DESC';
              if (sort === 'score') s = 'SCORE_DESC';
              else if (sort === 'trending') s = 'TRENDING_DESC';
              else if (sort === 'title') s = 'TITLE_ROMAJI';
              vars.sort = [s];
              break;
            }
            case 'season':
              vars.season = (season || curSeason).toUpperCase();
              vars.seasonYear = Number(year || curYear);
              vars.sort = ['POPULARITY_DESC'];
              break;
            default:
              vars.sort = ['TRENDING_DESC'];
              break;
          }

          const data = await anilistGQL(AL_BROWSE_Q, vars);
          const pInfo = data?.data?.Page?.pageInfo || {};
          const media = data?.data?.Page?.media || [];
          const source = data._source === 'relay' ? 'anilist (relay)' : 'anilist';
          const browseResult = {
            category: browseCat,
            currentPage: pInfo.currentPage || pageNum,
            hasNextPage: !!pInfo.hasNextPage,
            perPage: pInfo.perPage || 20,
            animes: media.map(mapBrowseAnime),
            provider: source,
          };
          swrCache.browse.set(cacheKey, browseResult);
          return browseResult;
        } catch (alErr) {
          console.error(`[browse] AniList failed for category ${browseCat}, falling back to Jikan:`, alErr.message);
          try {
            const jikanRes = await jikanBrowse(browseCat, { page: pageNum, genre, season, year, sort });
            swrCache.browse.set(cacheKey, jikanRes);
            return jikanRes;
          } catch (jkErr) {
            console.error(`[browse] Jikan fallback also failed, falling back to AniKoto:`, jkErr.message);
            try {
              const akRes = await anikotoBrowse(browseCat, { page: pageNum });
              swrCache.browse.set(cacheKey, akRes);
              return akRes;
            } catch (akErr) {
              console.error(`[browse] AniKoto fallback also failed, falling back to Kitsu:`, akErr.message);
              try {
                const ktRes = await kitsuBrowse(browseCat, { page: pageNum, genre, season, year, sort });
                swrCache.browse.set(cacheKey, ktRes);
                return ktRes;
              } catch (ktErr) {
                console.error(`[browse] Kitsu fallback also failed:`, ktErr.message);
                const staleData = swrCache.browse.getStaleOrNull(cacheKey);
                if (staleData) {
                  console.log(`[browse] serving stale cache for ${cacheKey}`);
                  return { ...staleData, provider: (staleData.provider || '') + ' (stale cache)' };
                }
                return null;
              }
            }
          }
        }
      };

      const cached = swrCache.browse.get(cacheKey);
      if (cached) {
        if (!cached.stale) {
          console.log(`[browse] cache hit (fresh) for ${cacheKey}`);
          return ok(res, cached.data, ttl);
        }
        console.log(`[browse] cache hit (stale, background revalidating) for ${cacheKey}`);
        swrCache.browse.revalidate(cacheKey, doBrowse);
        return ok(res, { ...cached.data, provider: (cached.data.provider || '') + ' (stale cache)' }, 60);
      }

      const browseResult = await doBrowse();
      if (!browseResult) {
        return fail(res, 502, `Failed to fetch browse data for category ${browseCat} from both AniList and Jikan`);
      }
      return ok(res, browseResult, ttl);
    }

    // ── home / random ────────────────────────────────────────────────────────
    if (action === 'home' || action === 'random') {
      const isAdult = !isAdultFilterEnabled() ? undefined : false;
      const cacheKey = `home:${isAdult === false ? 'sfw' : 'all'}`;

      const doHome = async () => {
        try {
          const isAdultVar = isAdult === false ? false : undefined;
          const vars = isAdultVar !== undefined ? { isAdult: isAdultVar } : {};
          const data = await anilistGQL(AL_HOME_Q, vars);
          const trending = (data?.data?.Page?.media || []).map(mapALAnime);
          const source = data._source === 'relay' ? 'anilist (relay)' : 'anilist';
          const homeResult = { spotlightAnimes: trending.slice(0, 5), trendingAnimes: trending, latestEpisodeAnimes: [], provider: source };
          swrCache.home.set(cacheKey, homeResult);
          return homeResult;
        } catch (alErr) {
          console.error('[home] AniList failed, falling back to Jikan:', alErr.message);
          try {
            const jikanHome = await jikanTrending();
            swrCache.home.set(cacheKey, jikanHome);
            return jikanHome;
          } catch (jkErr) {
            console.error('[home] Jikan fallback also failed, falling back to AniKoto:', jkErr.message);
            try {
              const akBrowse = await anikotoBrowse('trending');
              const trending = akBrowse.animes || [];
              const homeResult = { spotlightAnimes: trending.slice(0, 5), trendingAnimes: trending, latestEpisodeAnimes: [], provider: 'anikoto' };
              swrCache.home.set(cacheKey, homeResult);
              return homeResult;
            } catch (akErr) {
              console.error('[home] AniKoto fallback also failed, falling back to Kitsu:', akErr.message);
              try {
                const ktHome = await kitsuTrending();
                const homeResult = { spotlightAnimes: ktHome.trending.slice(0, 5), trendingAnimes: ktHome.trending, latestEpisodeAnimes: [], provider: 'kitsu' };
                swrCache.home.set(cacheKey, homeResult);
                return homeResult;
              } catch (ktErr) {
                console.error('[home] Kitsu fallback also failed:', ktErr.message);
                const staleData = swrCache.home.getStaleOrNull(cacheKey);
                if (staleData) {
                  console.log('[home] serving stale cache');
                  staleData.provider = (staleData.provider || '') + ' (stale cache)';
                  return staleData;
                }
                return { spotlightAnimes: [], trendingAnimes: [], latestEpisodeAnimes: [], provider: 'none' };
              }
            }
          }
        }
      };

      // Check cache first
      const cached = swrCache.home.get(cacheKey);
      if (cached) {
        if (!cached.stale) {
          console.log('[home] cache hit (fresh)');
          return ok(res, cached.data, 300);
        }
        console.log('[home] cache hit (stale, background revalidating)');
        swrCache.home.revalidate(cacheKey, doHome);
        return ok(res, cached.data, 60);
      }

      const homeResult = await doHome();
      return ok(res, homeResult, 300);
    }

    // ── info ─────────────────────────────────────────────────────────────────
    if (action === 'info' || action === 'episodes') {
      if (!id) return fail(res, 400, 'Missing id');
      const parsed = parseAnimeId(id);
      if (!parsed) return fail(res, 400, 'Invalid id format — expected anilist::ID, mal::ID, or kitsu::ID');

      const cacheKey = `info:${id}`;

      // If the ID came from AniKoto fallback search, it will be anikoto::slug
      if (parsed.anikotoSlug) {
        const doAniKoto = async () => {
          try {
            const info = await anikotoInfo(parsed.anikotoSlug);
            if (info) swrCache.info.set(cacheKey, info);
            return info;
          } catch (akErr) {
            console.error('[info] AniKoto info failed:', akErr.message);
            return swrCache.info.getStaleOrNull(cacheKey);
          }
        };

        const cached = swrCache.info.get(cacheKey);
        if (cached) {
          if (!cached.stale) {
            console.log(`[info] cache hit (fresh) for ${id}`);
            if (action === 'episodes') {
              return ok(res, { totalEpisodes: cached.data.episodes?.sub?.length || 0, episodes: cached.data.episodes, provider: 'anikoto' }, 21600);
            }
            return ok(res, cached.data, 21600);
          }
          console.log(`[info] cache hit (stale, background revalidating) for ${id}`);
          swrCache.info.revalidate(cacheKey, doAniKoto);
          if (action === 'episodes') {
            return ok(res, { totalEpisodes: cached.data.episodes?.sub?.length || 0, episodes: cached.data.episodes, provider: 'anikoto' }, 60);
          }
          return ok(res, cached.data, 60);
        }

        const info = await doAniKoto();
        if (!info) {
          const staleData = swrCache.info.getStaleOrNull(cacheKey);
          if (staleData) {
            console.log(`[info] serving stale cache for ${id}`);
            if (action === 'episodes') {
              return ok(res, { totalEpisodes: staleData.episodes?.sub?.length || 0, episodes: staleData.episodes, provider: 'anikoto (stale cache)' }, 60);
            }
            return ok(res, { ...staleData, provider: (staleData.provider || '') + ' (stale cache)' }, 60);
          }
          return fail(res, 404, 'Anime not found on AniKoto');
        }
        if (action === 'episodes') {
          return ok(res, { totalEpisodes: info.episodes?.sub?.length || 0, episodes: info.episodes, provider: 'anikoto' }, 21600);
        }
        return ok(res, info, 21600);
      }

      // If the ID came from Kitsu fallback search, it will be kitsu::12345
      if (parsed.kitsuId) {
        const doKitsu = async () => {
          try {
            const info = await kitsuInfo(parsed.kitsuId);
            if (info) swrCache.info.set(cacheKey, info);
            return info;
          } catch (ktErr) {
            console.error('[info] Kitsu info failed:', ktErr.message);
            return swrCache.info.getStaleOrNull(cacheKey);
          }
        };

        const cached = swrCache.info.get(cacheKey);
        if (cached) {
          if (!cached.stale) {
            console.log(`[info] cache hit (fresh) for ${id}`);
            if (action === 'episodes') {
              return ok(res, { totalEpisodes: cached.data.episodes?.sub?.length || 0, episodes: cached.data.episodes, provider: 'kitsu' }, 21600);
            }
            return ok(res, cached.data, 21600);
          }
          console.log(`[info] cache hit (stale, background revalidating) for ${id}`);
          swrCache.info.revalidate(cacheKey, doKitsu);
          if (action === 'episodes') {
            return ok(res, { totalEpisodes: cached.data.episodes?.sub?.length || 0, episodes: cached.data.episodes, provider: 'kitsu' }, 60);
          }
          return ok(res, cached.data, 60);
        }

        const info = await doKitsu();
        if (!info) {
          const staleData = swrCache.info.getStaleOrNull(cacheKey);
          if (staleData) {
            console.log(`[info] serving stale cache for ${id}`);
            if (action === 'episodes') {
              return ok(res, { totalEpisodes: staleData.episodes?.sub?.length || 0, episodes: staleData.episodes, provider: 'kitsu (stale cache)' }, 60);
            }
            return ok(res, { ...staleData, provider: (staleData.provider || '') + ' (stale cache)' }, 60);
          }
          return fail(res, 404, 'Anime not found on Kitsu');
        }
        if (action === 'episodes') {
          return ok(res, { totalEpisodes: info.episodes?.sub?.length || 0, episodes: info.episodes, provider: 'kitsu' }, 21600);
        }
        return ok(res, info, 21600);
      }

      // If the ID came from Jikan fallback search, it will be mal::12345 instead of anilist::12345
      // In that case we skip AniList and go straight to Jikan info
      if (parsed.malId) {
        const doJikan = async () => {
          try {
            const info = await jikanInfo(parsed.malId);
            if (info) swrCache.info.set(cacheKey, info);
            return info;
          } catch (jkErr) {
            console.error('[info] Jikan info failed:', jkErr.message);
            return swrCache.info.getStaleOrNull(cacheKey);
          }
        };

        const cached = swrCache.info.get(cacheKey);
        if (cached) {
          if (!cached.stale) {
            console.log(`[info] cache hit (fresh) for ${id}`);
            if (action === 'episodes') {
              return ok(res, { totalEpisodes: cached.data.episodes?.sub?.length || 0, episodes: cached.data.episodes, provider: 'jikan' }, 21600);
            }
            return ok(res, cached.data, 21600);
          }
          console.log(`[info] cache hit (stale, background revalidating) for ${id}`);
          swrCache.info.revalidate(cacheKey, doJikan);
          if (action === 'episodes') {
            return ok(res, { totalEpisodes: cached.data.episodes?.sub?.length || 0, episodes: cached.data.episodes, provider: 'jikan' }, 60);
          }
          return ok(res, cached.data, 60);
        }

        const info = await doJikan();
        if (!info) {
          const staleData = swrCache.info.getStaleOrNull(cacheKey);
          if (staleData) {
            console.log(`[info] serving stale cache for ${id}`);
            if (action === 'episodes') {
              return ok(res, { totalEpisodes: staleData.episodes?.sub?.length || 0, episodes: staleData.episodes, provider: 'jikan (stale cache)' }, 60);
            }
            return ok(res, { ...staleData, provider: (staleData.provider || '') + ' (stale cache)' }, 60);
          }
          return fail(res, 404, 'Anime not found on Jikan');
        }
        if (action === 'episodes') {
          return ok(res, { totalEpisodes: info.episodes?.sub?.length || 0, episodes: info.episodes, provider: 'jikan' }, 21600);
        }
        return ok(res, info, 21600);
      }

      // AniList path (primary) with Jikan fallback
      const doAniList = async () => {
        try {
          const data = await anilistGQL(AL_INFO_Q, { id: parsed.anilistId });
          const m = data?.data?.Media;
          if (!m) return null;

          const epCount = m.episodes || (m.nextAiringEpisode ? m.nextAiringEpisode.episode - 1 : 0) || 0;
          const malId   = m.idMal;
          const isAiring = m.status === 'RELEASING' || Boolean(m.nextAiringEpisode);

          const episodes = await getEpisodesForMal(malId, epCount, { isAiring, status: m.status });

          const titleEnglish = m.title?.english || '';
          const titleRomaji  = m.title?.romaji || '';
          const titleNative  = m.title?.native || '';
          const name         = titleEnglish || titleRomaji || titleNative;
          const jname        = titleRomaji || name;

          const studios = (m.studios?.nodes || []).map(s => s.name);
          const trailer = (m.trailer?.id && m.trailer?.site) ? {
            id: m.trailer.id,
            site: m.trailer.site.toLowerCase(),
          } : null;

          const synopsis = cleanSynopsis(m.description);

          const infoResult = {
            id: `anilist::${m.id}`,
            anilistId: m.id,
            malId,
            name,
            jname,
            titles: {
              english: titleEnglish,
              romaji: titleRomaji,
              native: titleNative,
            },
            format: m.format || 'TV',
            status: m.status || 'UNKNOWN',
            season: m.season || null,
            year: m.seasonYear || m.startDate?.year || null,
            studios,
            averageScore: m.averageScore ?? null,
            meanScore: m.meanScore ?? null,
            popularity: m.popularity ?? null,
            startDate: m.startDate || null,
            nextAiringEpisode: m.nextAiringEpisode ? {
              episode: m.nextAiringEpisode.episode,
              airingAt: m.nextAiringEpisode.airingAt,
              timeUntilAiring: m.nextAiringEpisode.timeUntilAiring,
            } : null,
            trailer,
            poster: m.coverImage?.extraLarge || m.coverImage?.large || '',
            banner: m.bannerImage || '',
            description: synopsis,
            synopsis,
            stats: {
              type: m.format || 'TV',
              status: m.status || 'Unknown',
              episodes: { sub: epCount, dub: 0 },
              score: m.averageScore ? `${(m.averageScore / 10).toFixed(1)}/10` : '',
            },
            genres: m.genres || [],
            episodes: { sub: episodes, dub: [] },
            provider: data._source === 'relay' ? 'anilist+jikan (relay)' : 'anilist+jikan',
          };
          swrCache.info.set(cacheKey, infoResult);
          return infoResult;
        } catch (alErr) {
          console.error('[info] AniList failed, falling back to Jikan:', alErr.message);
          return swrCache.info.getStaleOrNull(cacheKey);
        }
      };

      const cached = swrCache.info.get(cacheKey);
      if (cached) {
        if (!cached.stale) {
          console.log(`[info] cache hit (fresh) for ${id}`);
          if (action === 'episodes') {
            return ok(res, { totalEpisodes: cached.data.episodes?.sub?.length || 0, episodes: cached.data.episodes, provider: cached.data.provider }, 21600);
          }
          return ok(res, cached.data, 21600);
        }
        console.log(`[info] cache hit (stale, background revalidating) for ${id}`);
        swrCache.info.revalidate(cacheKey, doAniList);
        if (action === 'episodes') {
          return ok(res, { totalEpisodes: cached.data.episodes?.sub?.length || 0, episodes: cached.data.episodes, provider: cached.data.provider }, 60);
        }
        return ok(res, cached.data, 60);
      }

      const infoResult = await doAniList();
      if (!infoResult) {
        const staleData = swrCache.info.getStaleOrNull(cacheKey);
        if (staleData) {
          console.log(`[info] serving stale cache for ${id}`);
          if (action === 'episodes') {
            return ok(res, { totalEpisodes: staleData.episodes?.sub?.length || 0, episodes: staleData.episodes, provider: (staleData.provider || '') + ' (stale cache)' }, 60);
          }
          return ok(res, { ...staleData, provider: (staleData.provider || '') + ' (stale cache)' }, 60);
        }
        return fail(res, 502, `AniList unreachable and no MAL ID available for Jikan fallback. Try searching again.`);
      }

      if (action === 'episodes') {
        return ok(res, {
          totalEpisodes: infoResult.episodes?.sub?.length || 0,
          episodes: infoResult.episodes,
          provider: infoResult.provider,
        }, 21600);
      }
      return ok(res, infoResult, 21600);
    }

    // ── sources (deprecated — use /api/resolve-stream instead) ────────────
    if (action === 'sources') {
      return fail(res, 410, 'action=sources is deprecated. Use /api/resolve-stream instead.');
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
    let response = await httpFetch(feedUrl, { signal: AbortSignal.timeout(5000) });
    let text = await response.text();
    
    // If no items found, try fallback query
    if (!text.includes('<item>')) {
      feedUrl = `https://nyaa.si/?page=rss&q=${fallbackQuery}&c=1_2&f=0`;
      response = await httpFetch(feedUrl, { signal: AbortSignal.timeout(5000) });
      text = await response.text();
    }
    
    if (!text.includes('<item>')) {
      feedUrl = `https://nyaa.si/?page=rss&q=${ultimateFallback}&c=1_2&f=0`;
      response = await httpFetch(feedUrl, { signal: AbortSignal.timeout(5000) });
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
      return ok(res, { magnet: bestMagnet, score: maxScore }, 3600);
    }
    
    return fail(res, 404, 'No torrent found');
  } catch (e) {
    console.error('[/api/torrent]', e.message);
    return fail(res, 500, e.message);
  }
});

// ── Image proxy ──────────────────────────────────────────────────────────────
app.get('/api/image', async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const imageUrl = req.query.url;
  if (!imageUrl) return res.status(400).send('Missing url parameter');

  let targetUrl;
  try {
    targetUrl = new URL(imageUrl);
  } catch {
    return res.status(400).send('Invalid image URL');
  }

  if (targetUrl.protocol !== 'http:' && targetUrl.protocol !== 'https:') {
    return res.status(400).send('Only HTTP and HTTPS protocols are allowed');
  }

  if (!isAllowedImageHost(targetUrl.hostname)) {
    return res.status(403).send('Image host not permitted');
  }

  try {
    await validateSafeHost(targetUrl.hostname);
  } catch (err) {
    return res.status(403).send(err.message);
  }

  try {
    const response = await safeHttpFetch(targetUrl.toString(), {
      headers: {
        'User-Agent': UA,
        'Referer': 'https://anilist.co/',
      },
      onRedirect: (nextUrl) => {
        if (!isAllowedImageHost(nextUrl.hostname)) {
          throw new Error('Forbidden: redirected to unpermitted image host');
        }
      },
    });

    if (!response.ok) {
      return res.status(response.status).send('Failed to fetch image');
    }

    const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10 MB limit
    const cl = response.headers.get('content-length');
    if (cl && Number(cl) > MAX_IMAGE_SIZE) {
      return res.status(413).send('Image response exceeds maximum allowed size (10MB)');
    }

    const contentType = response.headers.get('content-type');
    if (contentType) res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');

    let totalBytes = 0;
    const chunks = [];
    for await (const chunk of response.body) {
      totalBytes += chunk.length;
      if (totalBytes > MAX_IMAGE_SIZE) {
        return res.status(413).send('Image response exceeds maximum allowed size (10MB)');
      }
      chunks.push(Buffer.from(chunk));
    }

    res.send(Buffer.concat(chunks));
  } catch (error) {
    if (error.message?.startsWith('Forbidden:')) {
      return res.status(403).send(error.message);
    }
    console.error('Image proxy error:', error);
    res.status(500).send('Error fetching image');
  }
});

// ── Provider Orchestration ────────────────────────────────────────────────────
app.get('/api/resolve-stream', async (req, res) => {
  const { title, epNo, mode, malId, anilistId, year } = req.query;

  if (!title || !epNo) {
    return fail(res, 400, 'Missing title or epNo');
  }

  const audioKind = mode === 'dub' ? 'dub' : 'sub';

  const context = {
    malId: malId ? Number(malId) : null,
    anilistId: anilistId ? Number(anilistId) : null,
    titles: {
      english: String(req.query.englishTitle || title),
      romaji: String(req.query.romajiTitle || title),
      native: String(req.query.nativeTitle || ''),
    },
    year: year ? Number(year) : null,
    episodeNumber: Number(epNo) || 1,
    audioKind,
  };

  try {
    const { candidates = [], attempts = [] } = await resolveProviders(context);

    // Attach signed stream header token and allow host for each candidate
    for (const c of candidates) {
      if (c.url) {
        try {
          allowStreamHost(new URL(c.url).hostname);
        } catch {}
      }
      if (c.headers || c.referer) {
        const hdrs = { ...(c.headers || {}) };
        if (c.referer && !hdrs.Referer && !hdrs.referer) {
          hdrs.Referer = c.referer;
        }
        c.sig = signStreamHeaders(hdrs);
      }
    }

    const detectedKinds = new Set();
    for (const c of candidates) {
      if (c.audioKind) detectedKinds.add(c.audioKind);
    }
    const audioKinds = detectedKinds.size > 0
      ? Array.from(detectedKinds)
      : (audioKind ? [audioKind] : ['sub']);

    return ok(res, {
      candidates,
      attempts,
      audioKinds,
      ...(candidates[0] || {}),
    }, 0);
  } catch (e) {
    console.error('[/api/resolve-stream]', e.message);
    return ok(res, {
      candidates: [],
      attempts: e.attempts || [],
      audioKinds: [audioKind || 'sub'],
      error: e.message,
    }, 0);
  }
});


export function rewriteHlsPlaylist(body, targetUrl, origin, sigParam = '') {
  const base = targetUrl.pathname.slice(0, targetUrl.pathname.lastIndexOf('/') + 1);
  const playlistBase = `${targetUrl.origin}${base}`;

  function resolveAndProxy(uriStr) {
    const raw = uriStr.trim();
    if (!raw) return raw;
    let abs;
    try {
      abs = (raw.startsWith('http://') || raw.startsWith('https://'))
        ? raw
        : new URL(raw, playlistBase).toString();
      allowStreamHost(new URL(abs).hostname);
    } catch {
      return raw;
    }
    return `${origin}/api/stream?url=${encodeURIComponent(abs)}${sigParam}`;
  }

  const lines = body.split('\n');
  const rewritten = lines.map(line => {
    let l = line.trim();
    if (!l) return line;

    // Check if line is an HLS tag (starts with #)
    if (l.startsWith('#')) {
      // Rewrite any URI="..." or URI='...' in HLS tag attributes (keys, init maps, audio/subs)
      if (/URI=["'][^"']+["']/i.test(l)) {
        l = l.replace(/URI=(["'])([^"']+)\1/gi, (match, quote, val) => {
          const proxied = resolveAndProxy(val);
          return `URI=${quote}${proxied}${quote}`;
        });
      }
      return l;
    }

    // Segment or rendition URL line (not a comment/tag)
    return resolveAndProxy(l);
  }).join('\n');

  return rewritten;
}

// ── Stream proxy ──────────────────────────────────────────────────────────────
app.get('/api/stream', async (req, res) => {
  const target = String(req.query.url || '').trim();
  if (!target) return fail(res, 400, 'Missing url');
  let targetUrl;
  try { targetUrl = new URL(target); } catch { return fail(res, 400, 'Invalid URL'); }

  if (targetUrl.protocol !== 'http:' && targetUrl.protocol !== 'https:') {
    return fail(res, 400, 'Only HTTP and HTTPS stream URLs allowed');
  }

  cleanAllowedStreamHosts();
  const hostLower = targetUrl.hostname.toLowerCase();
  if (!allowedStreamHosts.has(hostLower)) {
    return fail(res, 403, `Stream host not permitted: ${hostLower}`);
  }

  try {
    await validateSafeHost(targetUrl.hostname);
  } catch (err) {
    return fail(res, 403, `Stream address check failed: ${err.message}`);
  }

  // Caller cannot supply arbitrary headers; only accept verified signed header token
  let verifiedHdrs = {};
  if (req.query.sig) {
    const verified = verifyStreamHeaders(String(req.query.sig));
    if (verified === null) {
      return fail(res, 403, 'Invalid or forged stream header signature');
    }
    verifiedHdrs = verified;
  }

  const reqHdrs = {
    'User-Agent': UA,
    Accept: '*/*',
    ...verifiedHdrs,
  };

  // Forward Range request header upstream if present
  if (req.headers.range) {
    reqHdrs.Range = req.headers.range;
  }

  // AbortController for connecting/receiving headers (12s timeout) and client disconnect cancellation
  const abortController = new AbortController();
  const connectTimer = setTimeout(() => {
    abortController.abort(new Error('Connection and headers timeout (12s)'));
  }, 12000);

  const onClientClose = () => {
    abortController.abort(new Error('Client disconnected'));
  };
  req.on('close', onClientClose);

  try {
    const up = await safeHttpFetch(targetUrl.toString(), {
      headers: reqHdrs,
      signal: abortController.signal,
      onRedirect: (nextUrl) => {
        allowStreamHost(nextUrl.hostname);
      },
    });
    // Headers received: clear connection timeout!
    clearTimeout(connectTimer);

    if (!up.ok && up.status !== 206) return fail(res, up.status, `Upstream ${up.status}`);

    const ct = up.headers.get('content-type') || 'application/octet-stream';
    res.setHeader('Content-Type', ct);
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    const acceptRanges = up.headers.get('accept-ranges');
    if (acceptRanges) res.setHeader('Accept-Ranges', acceptRanges);

    const contentRange = up.headers.get('content-range');
    if (contentRange) res.setHeader('Content-Range', contentRange);

    const cl = up.headers.get('content-length');
    if (cl) res.setHeader('Content-Length', cl);

    if (ct.includes('mpegurl') || targetUrl.pathname.endsWith('.m3u8') || targetUrl.pathname.endsWith('.m3u')) {
      const host = req.headers.host || `127.0.0.1:${PORT}`;
      const origin = `http://${host}`;
      const body = await up.text();
      const sigParam = req.query.sig ? `&sig=${encodeURIComponent(req.query.sig)}` : '';
      const rewritten = rewriteHlsPlaylist(body, targetUrl, origin, sigParam);
      res.removeHeader('content-length');
      return res.status(up.status).send(rewritten);
    }

    res.status(up.status);
    if (!up.body) return res.end();
    for await (const chunk of up.body) {
      if (res.writableEnded || res.destroyed) break;
      const ok = res.write(Buffer.from(chunk));
      if (!ok) {
        await new Promise(r => res.once('drain', r));
      }
    }
    return res.end();
  } catch (e) {
    if (!res.headersSent) {
      if (e.message?.startsWith('Forbidden:')) {
        return fail(res, 403, `Stream address check failed: ${e.message}`);
      }
      return fail(res, 502, e.message || 'Proxy error');
    }
    res.end();
  } finally {
    clearTimeout(connectTimer);
    req.off('close', onClientClose);
  }
});


// ── Torrent stream ────────────────────────────────────────────────────────────

// ── Auth page ─────────────────────────────────────────────────────────────────
app.get('/api/auth/login', (req, res) => {
  const rawPort = req.query.port;
  const portNum = Number(rawPort);
  if (!rawPort || !Number.isInteger(portNum) || portNum < 1024 || portNum > 65535) {
    res.status(400);
    return res.send(`<!DOCTYPE html><html><head><title>Invalid Port - NyAnime CLI</title>
<style>body{background:#1a1b26;color:#f7768e;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}.box{background:#24283b;padding:2rem;border-radius:12px;max-width:400px;width:100%;text-align:center}h1{color:#f7768e;margin-bottom:1rem}p{color:#a9b1d6}</style></head>
<body><div class="box"><h1>Invalid Port</h1><p>The port parameter must be an integer between 1024 and 65535.</p></div></body></html>`);
  }

  const rawState = req.query.state;
  const state = (typeof rawState === 'string' && /^[a-zA-Z0-9_-]{8,64}$/.test(rawState))
    ? rawState
    : crypto.randomBytes(16).toString('hex');

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
        fetch('http://localhost:' + portNum + '/callback',{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({
            token:u.uid,
            idToken:idToken,
            refreshToken:u.refreshToken,
            username:u.displayName||u.email||'AnimeFan',
            state:'${state}'
          })
        }).catch(console.error);
      });
    }
    auth.onAuthStateChanged(u=>{if(u){notify(u);}else{document.getElementById('loader').style.display='none';new firebaseui.auth.AuthUI(auth).start('#ui',{callbacks:{signInSuccessWithAuthResult:function(r){notify(r.user);return false;}},signInFlow:'popup',signInOptions:[firebase.auth.EmailAuthProvider.PROVIDER_ID,firebase.auth.GoogleAuthProvider.PROVIDER_ID]});}});
  </script></body></html>`);
});

export {
  app,
  PORT,
  HOST,
  allowStreamHost,
  swrCache,
};


function isMain() {
  if (!process.argv[1]) return false;
  try {
    return fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
  }
}

if (isMain()) {
  app.listen(PORT, HOST, () => {
    console.log(`\x1b[36m[ny-cli] backend v${pkgVersion} on http://${HOST}:${PORT}\x1b[0m`);
    console.log(`[ny-cli] providers: AniList (search/info, primary) + Jikan (fallback search/info + episodes) + Senshi/HiAnime/AniPub/Owais (streaming)`);
    const rUrl = getRelayUrl();
    if (rUrl) console.log(`[ny-cli] relay fallback: ${rUrl}`);
  });
}
