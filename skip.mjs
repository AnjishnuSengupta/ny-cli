import fs from 'node:fs';
import path from 'node:path';
import { stateDir, ensureDirs } from './paths.mjs';
import { loadConfig } from './config.mjs';

const ANISKIP_BASE = 'https://api.aniskip.com/v2/skip-times';
const TIMEOUT_MS = 3000;

/**
 * Fetches skip intervals for an anime episode from AniSkip v2 API.
 * Request timeout is strictly 3 seconds. Missing data and errors are silent.
 *
 * @param {number|string} malId MyAnimeList ID
 * @param {number|string} episodeNumber Episode number
 * @param {number} [episodeLength=0] Total episode duration in seconds (0 allowed)
 * @param {AbortSignal} [parentSignal]
 * @returns {Promise<Array<{ skipType: string, interval: { startTime: number, endTime: number }, episodeLength?: number }>|null>}
 */
export async function fetchSkipTimes(malId, episodeNumber, episodeLength = 0, parentSignal) {
  if (!malId || !episodeNumber) return null;

  const mId = parseInt(String(malId).replace(/^mal::/, ''), 10);
  const epNo = parseInt(String(episodeNumber), 10);
  if (isNaN(mId) || isNaN(epNo) || mId <= 0 || epNo <= 0) return null;

  const timeoutSignal = AbortSignal.timeout(TIMEOUT_MS);
  const effectiveSignal = parentSignal ? AbortSignal.any([parentSignal, timeoutSignal]) : timeoutSignal;

  const types = ['op', 'ed', 'mixed-op', 'mixed-ed', 'recap'];
  const typeParams = types.map(t => `types=${encodeURIComponent(t)}`).join('&');
  const url = `${ANISKIP_BASE}/${mId}/${epNo}?${typeParams}&episodeLength=${episodeLength || 0}`;

  try {
    const res = await fetch(url, { signal: effectiveSignal });
    if (!res.ok) return null;
    const body = await res.json();
    if (!body?.found || !Array.isArray(body?.results) || body.results.length === 0) {
      return null;
    }
    return body.results;
  } catch {
    // Missing data or timeout is silent
    return null;
  }
}

/**
 * Generates an FFMETADATA1 chapter string with interleaved episode and skip chapters.
 *
 * @param {Array<{ skipType: string, interval: { startTime: number, endTime: number }, episodeLength?: number }>} results
 * @param {number} [fallbackDuration=1440]
 * @returns {string} FFMETADATA1 formatted string
 */
export function formatFfmetadata(results, fallbackDuration = 1440) {
  if (!Array.isArray(results) || results.length === 0) return '';

  const totalDuration = results[0]?.episodeLength && results[0].episodeLength > 0
    ? results[0].episodeLength
    : fallbackDuration;

  const validIntervals = results
    .filter(r => r?.interval && typeof r.interval.startTime === 'number' && typeof r.interval.endTime === 'number')
    .sort((a, b) => a.interval.startTime - b.interval.startTime);

  if (validIntervals.length === 0) return '';

  const typeTitles = {
    'op': 'Opening',
    'ed': 'Ending',
    'mixed-op': 'Mixed Opening',
    'mixed-ed': 'Mixed Ending',
    'recap': 'Recap',
  };

  const chapters = [];
  let t = 0;

  for (const item of validIntervals) {
    const start = Math.max(0, item.interval.startTime);
    const end = Math.min(totalDuration, item.interval.endTime);

    if (start > t) {
      chapters.push({ start: t, end: start, title: 'Episode' });
    }

    const title = typeTitles[item.skipType] || (item.skipType ? item.skipType.toUpperCase() : 'Skip');
    chapters.push({ start, end, title });
    t = end;
  }

  if (t < totalDuration) {
    // Label remainder after Ending as Preview or Episode
    const lastSkip = validIntervals[validIntervals.length - 1];
    const isAfterEnding = lastSkip?.skipType === 'ed' || lastSkip?.skipType === 'mixed-ed';
    chapters.push({
      start: t,
      end: totalDuration,
      title: isAfterEnding ? 'Preview' : 'Episode',
    });
  }

  let out = ';FFMETADATA1\n';
  for (const ch of chapters) {
    const startMs = Math.round(ch.start * 1000);
    const endMs = Math.round(ch.end * 1000);
    out += `[CHAPTER]\nTIMEBASE=1/1000\nSTART=${startMs}\nEND=${endMs}\ntitle=${ch.title}\n\n`;
  }

  return out;
}

/**
 * Returns path to chapter file for a given MAL ID and episode number.
 */
export function getChapterFilePath(malId, episodeNumber) {
  const mId = String(malId).replace(/^mal::/, '');
  return path.join(stateDir, `chapters_${mId}_${episodeNumber}.ffmetadata`);
}

/**
 * Ensures the auto-skip Lua script exists in the state directory and returns its path.
 */
export function getAutoSkipScriptPath() {
  ensureDirs();
  const scriptPath = path.join(stateDir, 'aniskip.lua');
  const luaScript = `
-- NY-CLI AniSkip Auto-Skip Script
mp.observe_property("chapter-metadata/by-key/title", "string", function(name, title)
    if not title then return end
    local lower = string.lower(title)
    if lower:find("opening") or lower:find("ending") or lower:find("recap") then
        local next_ch = mp.get_property_number("chapter") + 1
        local total_ch = mp.get_property_number("chapters")
        if next_ch and total_ch and next_ch < total_ch then
            mp.osd_message("Auto-skipping " .. title .. "...")
            mp.set_property_number("chapter", next_ch)
        end
    end
end)
`.trim() + '\n';

  try {
    fs.writeFileSync(scriptPath, luaScript, 'utf8');
  } catch {}
  return scriptPath;
}

/**
 * Prepares mpv chapter and auto-skip arguments for playback.
 * Returns array of mpv command-line flags.
 *
 * @param {number|string} malId
 * @param {number|string} episodeNumber
 * @param {string} [skipMode] 'off' | 'chapters' | 'auto'
 * @param {object} [options]
 * @returns {Promise<string[]>}
 */
export async function getMpvSkipArgs(malId, episodeNumber, skipMode, options = {}) {
  const mode = skipMode || loadConfig().skipMode || 'off';
  if (mode === 'off' || !malId) {
    return [];
  }

  try {
    const results = await fetchSkipTimes(malId, episodeNumber, options.episodeLength || 0, options.signal);
    if (!results || results.length === 0) {
      return [];
    }

    const metadataContent = formatFfmetadata(results, options.episodeLength || 1440);
    if (!metadataContent) return [];

    ensureDirs();
    const chapterFilePath = getChapterFilePath(malId, episodeNumber);
    fs.writeFileSync(chapterFilePath, metadataContent, 'utf8');

    const args = [`--chapters-file=${chapterFilePath}`];
    if (mode === 'auto') {
      const scriptPath = getAutoSkipScriptPath();
      args.push(`--scripts=${scriptPath}`);
    }
    return args;
  } catch {
    // Errors are silent
    return [];
  }
}
