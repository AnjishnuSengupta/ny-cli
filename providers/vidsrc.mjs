/**
 * VidSrc Provider for ny-cli
 *
 * Resolves streams / embeds from VidSrc sources.
 * Maps anime titles to IMDb / TMDB series or movie IDs via Cinemeta,
 * and generates VidSrc embed player links (Tier 2 embed provider).
 */

import { httpFetch } from '../net.mjs';
import { findBestMatch } from './match.mjs';

export const name = 'vidsrc';
export const tier = 2; // Tier 2 embed provider

const CINEMETA_SERIES_BASE = 'https://v3-cinemeta.strem.io/catalog/series/top/search=';
const CINEMETA_MOVIE_BASE = 'https://v3-cinemeta.strem.io/catalog/movie/top/search=';
const VIDSRC_EMBED_TV = 'https://vidsrc.to/embed/tv';
const VIDSRC_EMBED_MOVIE = 'https://vidsrc.to/embed/movie';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/**
 * Searches Cinemeta for IMDb metadata matching the given title across series and movie catalogs.
 */
export async function searchImdbId(title, signal) {
  const timeoutSignal = AbortSignal.timeout(6000);
  const effectiveSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

  const encoded = encodeURIComponent(title);
  const urls = [
    `${CINEMETA_SERIES_BASE}${encoded}.json`,
    `${CINEMETA_MOVIE_BASE}${encoded}.json`,
  ];

  const results = await Promise.allSettled(
    urls.map(async (url) => {
      const res = await httpFetch(url, {
        headers: { 'User-Agent': UA, 'Accept': 'application/json' },
        signal: effectiveSignal,
      });
      if (!res.ok) return [];
      const data = await res.json().catch(() => ({}));
      return Array.isArray(data?.metas) ? data.metas : [];
    })
  );

  const combined = [];
  for (const r of results) {
    if (r.status === 'fulfilled' && Array.isArray(r.value)) {
      combined.push(...r.value);
    }
  }

  // Deduplicate and filter entries with IMDb IDs
  const seen = new Set();
  const metas = [];
  for (const m of combined) {
    const id = m.imdb_id || m.id;
    if (id && !seen.has(id)) {
      seen.add(id);
      metas.push(m);
    }
  }

  return metas;
}

/**
 * Resolves VidSrc streaming candidates for the given context.
 */
export async function resolve(context) {
  const { titles = {}, signal } = context;
  const episodeNumber = context.episodeNumber ?? context.epNo ?? 1;
  const inputSeason = context.season ?? 1;
  const audioKind = context.audioKind || context.mode || 'sub';
  const title = titles.english || titles.romaji || titles.native || context.englishTitle || context.romajiTitle || context.title;
  if (!title) {
    throw new Error('Title is required for VidSrc resolution');
  }

  // 1. Search for title to resolve IMDb ID
  const searchResults = await searchImdbId(title, signal);
  if (!searchResults.length) {
    throw new Error(`No Cinemeta/IMDb match found for title: ${title}`);
  }

  const matchResult = findBestMatch(searchResults, context, {
    extractors: {
      getTitle: (m) => m.name || '',
      getYear: (m) => parseInt(m.releaseInfo, 10) || null,
    },
  });

  if (!matchResult.match) {
    throw new Error(matchResult.reason || `No confident match found on VidSrc for ${title}`);
  }

  const match = matchResult.match;
  const imdbId = match.imdb_id || match.id;
  const isMovie = match.type === 'movie' || context.format === 'MOVIE' || context.isMovie;
  const season = inputSeason || 1;

  // 2. Generate embed URL for movie or TV episode
  const embedUrl = isMovie
    ? `${VIDSRC_EMBED_MOVIE}/${imdbId}`
    : `${VIDSRC_EMBED_TV}/${imdbId}/${season}/${episodeNumber}`;

  return [
    {
      url: embedUrl,
      embedUrl,
      quality: `VidSrc (${isMovie ? 'Movie Embed' : 'TV Embed'})`,
      type: 'embed',
      referer: 'https://vidsrc.to/',
      subtitleTracks: [],
      audioKind,
      provider: name,
      tier,
      metadata: {
        imdbId,
        title: match.name,
        type: match.type || (isMovie ? 'movie' : 'series'),
        season: isMovie ? null : season,
        episode: isMovie ? null : episodeNumber,
      },
    },
  ];
}
