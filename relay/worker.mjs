/**
 * ny-cli API Relay — Cloudflare Worker
 * 
 * Narrowly scoped relay that proxies requests ONLY to AniList and Jikan.
 * Not a general open proxy. Deploy as a Cloudflare Worker.
 * 
 * Usage:
 *   GET /anilist  — relays POST body to https://graphql.anilist.co
 *   GET /jikan/*  — relays to https://api.jikan.moe/v4/*
 *   Everything else → 403
 * 
 * Deploy:
 *   npx wrangler deploy
 * 
 * Then set NY_RELAY_URL=https://your-worker.your-subdomain.workers.dev
 * in your environment before starting ny-cli.
 */

const ALLOWED_ORIGINS = [
  'https://graphql.anilist.co',
  'https://api.jikan.moe',
];

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Accept',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    let upstream;
    let upstreamOpts = {
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': UA,
      },
    };

    // ── AniList relay ──────────────────────────────────────────────────────
    if (path === '/anilist') {
      if (request.method !== 'POST') {
        return jsonResponse(405, { error: 'AniList relay requires POST' });
      }
      upstream = 'https://graphql.anilist.co';
      upstreamOpts.method = 'POST';
      upstreamOpts.body = await request.text();
    }
    // ── Jikan relay ────────────────────────────────────────────────────────
    else if (path.startsWith('/jikan/')) {
      const jikanPath = path.slice('/jikan'.length); // keeps the leading /
      const qs = url.search || '';
      upstream = `https://api.jikan.moe/v4${jikanPath}${qs}`;
      upstreamOpts.method = 'GET';
    }
    // ── Everything else → reject ───────────────────────────────────────────
    else {
      return jsonResponse(403, { error: 'This relay only serves AniList and Jikan requests.' });
    }

    try {
      const resp = await fetch(upstream, upstreamOpts);
      const body = await resp.text();
      return new Response(body, {
        status: resp.status,
        headers: {
          'Content-Type': resp.headers.get('Content-Type') || 'application/json',
          'Access-Control-Allow-Origin': '*',
          'X-Relayed-From': new URL(upstream).hostname,
        },
      });
    } catch (e) {
      return jsonResponse(502, { error: `Relay upstream error: ${e.message}` });
    }
  },
};

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
