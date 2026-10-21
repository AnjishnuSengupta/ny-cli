#!/usr/bin/env bun

// cli-terminal.tsx
import React, { useState, useEffect, useCallback, useRef } from "react";
import { render, Box, Text, useInput, useApp, useStdout } from "ink";
import TextInput from "ink-text-input";
import Picture, { TerminalInfoProvider } from "ink-picture";
import { spawn, spawnSync, execSync } from "node:child_process";
import fs4 from "node:fs";
import path3 from "node:path";
import os2 from "node:os";
import http from "node:http";
import { EventEmitter } from "node:events";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

// paths.mjs
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
var home = os.homedir();
var configDir = process.env.XDG_CONFIG_HOME ? path.join(process.env.XDG_CONFIG_HOME, "ny-cli") : path.join(home, ".config", "ny-cli");
var stateDir = process.env.XDG_STATE_HOME ? path.join(process.env.XDG_STATE_HOME, "ny-cli") : path.join(home, ".local", "state", "ny-cli");
var dataDir = process.env.XDG_DATA_HOME ? path.join(process.env.XDG_DATA_HOME, "ny-cli") : path.join(home, ".local", "share", "ny-cli");
var configFile = path.join(configDir, "config.json");
var settingsFile = path.join(configDir, "settings.json");
var authFile = path.join(configDir, "auth");
var pidFile = path.join(stateDir, "ny-cli.pid");
var logFile = path.join(stateDir, "backend.log");
var historyFile = path.join(dataDir, "history");
var anime4kDir = path.join(dataDir, "anime4k");
var sessionsDir = path.join(stateDir, "sessions");
function ensureDirs() {
  for (const dir of [configDir, stateDir, dataDir, anime4kDir, sessionsDir]) {
    try {
      fs.mkdirSync(dir, { recursive: true, mode: 448 });
      try {
        fs.chmodSync(dir, 448);
      } catch {
      }
    } catch {
    }
  }
}
function ensureSecureAuthFile() {
  const legacyAuthLocations = [
    path.join(home, ".ny-cli-auth"),
    path.join(home, ".ny-cli", "auth")
  ];
  for (const leg of legacyAuthLocations) {
    if (fs.existsSync(leg) && !fs.existsSync(authFile)) {
      try {
        fs.copyFileSync(leg, authFile);
        fs.unlinkSync(leg);
      } catch {
      }
    }
  }
  if (fs.existsSync(authFile)) {
    try {
      const stat = fs.statSync(authFile);
      if ((stat.mode & 63) !== 0) {
        fs.chmodSync(authFile, 384);
      }
    } catch {
    }
  }
}
var progressFile = path.join(dataDir, "progress");
ensureDirs();
ensureSecureAuthFile();

// config.mjs
import fs2 from "node:fs";
var VALID_DNS_MODES = ["system", "cloudflare-udp", "cloudflare-doh"];
var VALID_PLAYERS = ["auto", "mpv", "vlc"];
var VALID_SKIP_MODES = ["off", "chapters", "auto"];
var DEFAULT_CONFIG = {
  relayUrl: "",
  proxyUrl: "",
  dns: "cloudflare-doh",
  player: "auto",
  skipMode: "off",
  adultFilter: true,
  providers: {
    senshi: true,
    hianime: true,
    anipub: true,
    owais: false,
    allanime: false,
    anidb: false
  }
};
var cachedConfig = null;
function redactUrl(str) {
  if (typeof str !== "string") return "";
  const trimmed = str.trim();
  if (!trimmed) return "";
  try {
    const u = new URL(trimmed);
    if (u.username || u.password) {
      u.username = "***";
      u.password = "***";
    }
    return u.toString();
  } catch {
    return trimmed.replace(/:\/\/([^:@/]+):([^@/]+)@/g, "://***:***@");
  }
}
function sanitizeUrl(str) {
  if (typeof str !== "string") return "";
  const trimmed = str.trim();
  if (!trimmed) return "";
  try {
    const u = new URL(trimmed);
    if (u.protocol === "http:" || u.protocol === "https:") {
      return trimmed;
    }
    console.warn(`[config] invalid protocol for URL: ${redactUrl(trimmed)}`);
    return "";
  } catch {
    console.warn(`[config] invalid URL format: ${redactUrl(trimmed)}`);
    return "";
  }
}
function loadConfig(options = { reload: false }) {
  if (cachedConfig && !options.reload) {
    return cachedConfig;
  }
  ensureDirs();
  let fileContent = {};
  if (fs2.existsSync(configFile)) {
    try {
      const raw = fs2.readFileSync(configFile, "utf8");
      fileContent = JSON.parse(raw);
      if (typeof fileContent !== "object" || fileContent === null || Array.isArray(fileContent)) {
        console.warn(`[config] warning: ${configFile} must be a JSON object, using defaults`);
        fileContent = {};
      }
    } catch (err) {
      console.warn(`[config] error reading ${configFile}: ${err.message}, using defaults`);
      fileContent = {};
    }
  }
  const result = {
    relayUrl: DEFAULT_CONFIG.relayUrl,
    proxyUrl: DEFAULT_CONFIG.proxyUrl,
    dns: DEFAULT_CONFIG.dns,
    player: DEFAULT_CONFIG.player,
    skipMode: DEFAULT_CONFIG.skipMode,
    providers: { ...DEFAULT_CONFIG.providers }
  };
  if (fileContent.relayUrl !== void 0) {
    if (typeof fileContent.relayUrl === "string") {
      result.relayUrl = sanitizeUrl(fileContent.relayUrl);
    } else {
      console.warn(`[config] invalid relayUrl in config (expected string): ${fileContent.relayUrl}`);
    }
  }
  if (process.env.NY_RELAY_URL !== void 0) {
    result.relayUrl = sanitizeUrl(process.env.NY_RELAY_URL);
  }
  if (fileContent.proxyUrl !== void 0) {
    if (typeof fileContent.proxyUrl === "string") {
      result.proxyUrl = sanitizeUrl(fileContent.proxyUrl);
    } else {
      console.warn(`[config] invalid proxyUrl in config (expected string): ${fileContent.proxyUrl}`);
    }
  }
  const envProxy = process.env.NY_PROXY_URL || process.env.NY_PROXY || process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.https_proxy || process.env.http_proxy;
  if (envProxy) {
    result.proxyUrl = sanitizeUrl(envProxy);
  }
  if (fileContent.dns !== void 0) {
    if (typeof fileContent.dns === "string" && VALID_DNS_MODES.includes(fileContent.dns.toLowerCase())) {
      result.dns = fileContent.dns.toLowerCase();
    } else {
      console.warn(`[config] invalid dns mode '${fileContent.dns}', valid options: ${VALID_DNS_MODES.join(", ")}`);
    }
  }
  if (process.env.NY_DNS) {
    const envDns = process.env.NY_DNS.trim().toLowerCase();
    if (VALID_DNS_MODES.includes(envDns)) {
      result.dns = envDns;
    } else {
      console.warn(`[config] invalid NY_DNS env '${process.env.NY_DNS}', valid options: ${VALID_DNS_MODES.join(", ")}`);
    }
  }
  if (fileContent.player !== void 0) {
    if (typeof fileContent.player === "string" && VALID_PLAYERS.includes(fileContent.player.toLowerCase())) {
      result.player = fileContent.player.toLowerCase();
    } else {
      console.warn(`[config] invalid player '${fileContent.player}', valid options: ${VALID_PLAYERS.join(", ")}`);
    }
  }
  if (fileContent.skipMode !== void 0) {
    if (typeof fileContent.skipMode === "string" && VALID_SKIP_MODES.includes(fileContent.skipMode.toLowerCase())) {
      result.skipMode = fileContent.skipMode.toLowerCase();
    } else {
      console.warn(`[config] invalid skipMode '${fileContent.skipMode}', valid options: ${VALID_SKIP_MODES.join(", ")}`);
    }
  }
  if (fileContent.providers !== void 0) {
    if (typeof fileContent.providers === "object" && fileContent.providers !== null && !Array.isArray(fileContent.providers)) {
      for (const [key, val] of Object.entries(fileContent.providers)) {
        if (typeof val === "boolean") {
          result.providers[key] = val;
        } else {
          console.warn(`[config] invalid providers.${key} (expected boolean): ${val}`);
        }
      }
    } else {
      console.warn(`[config] invalid providers in config (expected object)`);
    }
  }
  result.adultFilter = DEFAULT_CONFIG.adultFilter;
  if (fileContent.adultFilter !== void 0) {
    if (typeof fileContent.adultFilter === "boolean") {
      result.adultFilter = fileContent.adultFilter;
    } else {
      console.warn(`[config] invalid adultFilter (expected boolean): ${fileContent.adultFilter}`);
    }
  }
  if (process.env.NY_ADULT_FILTER !== void 0) {
    result.adultFilter = process.env.NY_ADULT_FILTER !== "0" && process.env.NY_ADULT_FILTER.toLowerCase() !== "false";
  }
  cachedConfig = result;
  return result;
}

// skip.mjs
import fs3 from "node:fs";
import path2 from "node:path";
var ANISKIP_BASE = "https://api.aniskip.com/v2/skip-times";
var TIMEOUT_MS = 3e3;
async function fetchSkipTimes(malId, episodeNumber, episodeLength = 0, parentSignal) {
  if (!malId || !episodeNumber) return null;
  const mId = parseInt(String(malId).replace(/^mal::/, ""), 10);
  const epNo = parseInt(String(episodeNumber), 10);
  if (isNaN(mId) || isNaN(epNo) || mId <= 0 || epNo <= 0) return null;
  const timeoutSignal = AbortSignal.timeout(TIMEOUT_MS);
  const effectiveSignal = parentSignal ? AbortSignal.any([parentSignal, timeoutSignal]) : timeoutSignal;
  const types = ["op", "ed", "mixed-op", "mixed-ed", "recap"];
  const typeParams = types.map((t) => `types=${encodeURIComponent(t)}`).join("&");
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
    return null;
  }
}
function formatFfmetadata(results, fallbackDuration = 1440) {
  if (!Array.isArray(results) || results.length === 0) return "";
  const totalDuration = results[0]?.episodeLength && results[0].episodeLength > 0 ? results[0].episodeLength : fallbackDuration;
  const validIntervals = results.filter((r) => r?.interval && typeof r.interval.startTime === "number" && typeof r.interval.endTime === "number").sort((a, b) => a.interval.startTime - b.interval.startTime);
  if (validIntervals.length === 0) return "";
  const typeTitles = {
    "op": "Opening",
    "ed": "Ending",
    "mixed-op": "Mixed Opening",
    "mixed-ed": "Mixed Ending",
    "recap": "Recap"
  };
  const chapters = [];
  let t = 0;
  for (const item of validIntervals) {
    const start = Math.max(0, item.interval.startTime);
    const end = Math.min(totalDuration, item.interval.endTime);
    if (start > t) {
      chapters.push({ start: t, end: start, title: "Episode" });
    }
    const title = typeTitles[item.skipType] || (item.skipType ? item.skipType.toUpperCase() : "Skip");
    chapters.push({ start, end, title });
    t = end;
  }
  if (t < totalDuration) {
    const lastSkip = validIntervals[validIntervals.length - 1];
    const isAfterEnding = lastSkip?.skipType === "ed" || lastSkip?.skipType === "mixed-ed";
    chapters.push({
      start: t,
      end: totalDuration,
      title: isAfterEnding ? "Preview" : "Episode"
    });
  }
  let out = ";FFMETADATA1\n";
  for (const ch of chapters) {
    const startMs = Math.round(ch.start * 1e3);
    const endMs = Math.round(ch.end * 1e3);
    out += `[CHAPTER]
TIMEBASE=1/1000
START=${startMs}
END=${endMs}
title=${ch.title}

`;
  }
  return out;
}
function getChapterFilePath(malId, episodeNumber) {
  const mId = String(malId).replace(/^mal::/, "");
  return path2.join(stateDir, `chapters_${mId}_${episodeNumber}.ffmetadata`);
}
function getAutoSkipScriptPath() {
  ensureDirs();
  const scriptPath = path2.join(stateDir, "aniskip.lua");
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
`.trim() + "\n";
  try {
    fs3.writeFileSync(scriptPath, luaScript, "utf8");
  } catch {
  }
  return scriptPath;
}
async function getMpvSkipArgs(malId, episodeNumber, skipMode, options = {}) {
  const mode = skipMode || loadConfig().skipMode || "off";
  if (mode === "off" || !malId) {
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
    fs3.writeFileSync(chapterFilePath, metadataContent, "utf8");
    const args = [`--chapters-file=${chapterFilePath}`];
    if (mode === "auto") {
      const scriptPath = getAutoSkipScriptPath();
      args.push(`--scripts=${scriptPath}`);
    }
    return args;
  } catch {
    return [];
  }
}

// firebase-config.ts
var getFirebaseConfig = () => {
  return {
    apiKey: Buffer.from("QUl6YVN5QWZ3T19jLV9CYmtpSTBOY2lwVHZHSXlhX1IxRVl5eVRJ", "base64").toString("utf8"),
    authDomain: Buffer.from("bnlhbmltZS10ZWNoLmZpcmViYXNlYXBwLmNvbQ==", "base64").toString("utf8"),
    projectId: Buffer.from("bnlhbmltZS10ZWNo", "base64").toString("utf8"),
    storageBucket: Buffer.from("bnlhbmltZS10ZWNoLmZpcmViYXNlc3RvcmFnZS5hcHA=", "base64").toString("utf8"),
    messagingSenderId: Buffer.from("Njc3NDA3MTg0OTU1", "base64").toString("utf8"),
    appId: Buffer.from("MTo2Nzc0MDcxODQ5NTU6d2ViOmIzY2M1MDk1ZTgzOGM5MDE3ZTI0MWU=", "base64").toString("utf8"),
    measurementId: Buffer.from("Ry1FR0ZGRldUOERL", "base64").toString("utf8")
  };
};

// cli-terminal.tsx
var quitBus = new EventEmitter();
var defaultPort = process.env.NY_PORT || "43201";
var API_BASE = process.env.NYCLI_API_BASE || `http://127.0.0.1:${defaultPort}`;
var VERSION = "unknown";
try {
  if (true) {
    VERSION = "7.0.0";
  } else {
    const pkgPath = path3.join(path3.dirname(fileURLToPath(import.meta.url)), "package.json");
    if (fs4.existsSync(pkgPath)) {
      VERSION = JSON.parse(fs4.readFileSync(pkgPath, "utf8")).version;
    }
  }
} catch {
}
var fbConfig = getFirebaseConfig();
var FIREBASE_PROJECT_ID = fbConfig.projectId;
var FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`;
var FIREBASE_API_KEY = fbConfig.apiKey;
var NYANIME_BASE = "https://www.nyanime.qzz.io";
process.stdout.write("\x1B[2J\x1B[0f");
var theme = {
  purple: "#8B5CF6",
  blue: "#0EA5E9",
  pink: "#D946EF",
  cyan: "#06B6D4",
  yellow: "#F59E0B",
  dimGray: "#6B7280",
  lightGray: "#9CA3AF",
  white: "#F9FAFB",
  success: "#22C55E",
  warning: "#F59E0B",
  error: "#EF4444",
  green: "#22C55E",
  red: "#EF4444"
};
var GRADIENT = [theme.purple, theme.blue, theme.pink];
ensureSecureAuthFile();
var defaultSettings = {
  anime4k: false,
  anime4kMode: "A",
  player: "auto",
  skipMode: "off"
};
function loadSettings() {
  try {
    const config = loadConfig();
    const player = config.player && ["auto", "mpv", "vlc"].includes(config.player) ? config.player : "auto";
    const skipMode = config.skipMode && ["off", "chapters", "auto"].includes(config.skipMode) ? config.skipMode : "off";
    if (fs4.existsSync(settingsFile)) {
      return { ...defaultSettings, player, skipMode, ...JSON.parse(fs4.readFileSync(settingsFile, "utf8")) };
    }
    return { ...defaultSettings, player, skipMode };
  } catch {
  }
  return defaultSettings;
}
function saveSettings(settings) {
  try {
    fs4.writeFileSync(settingsFile, JSON.stringify(settings, null, 2), { mode: 384 });
    try {
      fs4.chmodSync(settingsFile, 384);
    } catch {
    }
  } catch {
  }
}
function isAnime4kInstalled() {
  try {
    const shaderPath = path3.join(anime4kDir, "Anime4K_Clamp_Highlights.glsl");
    return fs4.existsSync(shaderPath);
  } catch {
    return false;
  }
}
function isLoggedIn() {
  try {
    return fs4.existsSync(authFile) && fs4.statSync(authFile).size > 0;
  } catch {
    return false;
  }
}
function getUsername() {
  try {
    if (!isLoggedIn()) return "";
    const content = fs4.readFileSync(authFile, "utf8");
    return content.split("\n")[0] || "";
  } catch {
    return "";
  }
}
function getToken() {
  try {
    if (!isLoggedIn()) return "";
    const content = fs4.readFileSync(authFile, "utf8");
    return content.split("\n")[1] || "";
  } catch {
    return "";
  }
}
function getIdToken() {
  try {
    if (!isLoggedIn()) return "";
    const content = fs4.readFileSync(authFile, "utf8");
    return content.split("\n")[2] || "";
  } catch {
    return "";
  }
}
function getRefreshToken() {
  try {
    if (!isLoggedIn()) return "";
    const content = fs4.readFileSync(authFile, "utf8");
    return content.split("\n")[3] || "";
  } catch {
    return "";
  }
}
function saveAuth(username, token, idToken, refreshToken) {
  try {
    const existingId = getIdToken();
    const existingRefresh = getRefreshToken();
    const finalIdToken = idToken || existingId;
    const finalRefreshToken = refreshToken || existingRefresh;
    fs4.writeFileSync(authFile, `${username}
${token}
${finalIdToken}
${finalRefreshToken}`, { mode: 384 });
  } catch {
  }
}
function logout() {
  try {
    fs4.unlinkSync(authFile);
  } catch {
  }
}
var WATCH_PROGRESS_FILE = path3.join(dataDir, "progress");
function getHistory() {
  try {
    if (!fs4.existsSync(historyFile)) return [];
    const content = fs4.readFileSync(historyFile, "utf8");
    return content.split("\n").filter(Boolean).map((line) => {
      const parts = line.split("|");
      const [rawId, title, ep, ts, cat, watchTime, duration, totalEps] = parts;
      const id = rawId && /^\d+$/.test(rawId.trim()) ? `anilist::${rawId.trim()}` : rawId;
      return {
        id,
        title,
        episode: parseInt(ep) || 1,
        timestamp: parseInt(ts) || Date.now(),
        category: cat === "dub" ? "dub" : "sub",
        watchTime: parseInt(watchTime) || 0,
        duration: parseInt(duration) || 0,
        totalEpisodes: parseInt(totalEps) || 0
      };
    }).slice(0, 20);
  } catch {
    return [];
  }
}
function saveToHistory(entry) {
  try {
    const history = getHistory().filter((h) => h.id !== entry.id);
    const newHistory = [entry, ...history].slice(0, 50);
    const content = newHistory.map(
      (h) => `${h.id}|${h.title}|${h.episode}|${h.timestamp}|${h.category}|${h.watchTime || 0}|${h.duration || 0}|${h.totalEpisodes || 0}`
    ).join("\n");
    fs4.writeFileSync(historyFile, content, { mode: 384 });
    try {
      fs4.chmodSync(historyFile, 384);
    } catch {
    }
    syncToCloud(entry).catch(() => {
    });
  } catch {
  }
}
function getWatchProgress(animeId, episode) {
  try {
    if (!fs4.existsSync(WATCH_PROGRESS_FILE)) return null;
    const progress = JSON.parse(fs4.readFileSync(WATCH_PROGRESS_FILE, "utf8"));
    return progress[`${animeId}:${episode}`] || null;
  } catch {
    return null;
  }
}
function getWatchPercentage(watchTime, duration) {
  if (!duration || duration <= 0) return 0;
  return Math.min(100, watchTime / duration * 100);
}
function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}
var MY_LIST_FILE = path3.join(dataDir, "my-list.json");
function getMyList() {
  try {
    if (!fs4.existsSync(MY_LIST_FILE)) return [];
    return JSON.parse(fs4.readFileSync(MY_LIST_FILE, "utf8"));
  } catch {
    return [];
  }
}
function addToMyList(item) {
  try {
    const list = getMyList().filter((i) => i.id !== item.id);
    list.unshift(item);
    fs4.writeFileSync(MY_LIST_FILE, JSON.stringify(list), { mode: 384 });
    try {
      fs4.chmodSync(MY_LIST_FILE, 384);
    } catch {
    }
  } catch {
  }
}
function removeFromMyList(id) {
  try {
    const list = getMyList().filter((i) => i.id !== id);
    fs4.writeFileSync(MY_LIST_FILE, JSON.stringify(list), { mode: 384 });
    try {
      fs4.chmodSync(MY_LIST_FILE, 384);
    } catch {
    }
  } catch {
  }
}
function isInMyList(id) {
  if (!id) return false;
  return getMyList().some((i) => i.id === id);
}
function renderScore(score) {
  if (score === null || score === void 0 || isNaN(score)) {
    return { glyphs: "\u{1F311}\u{1F311}\u{1F311}\u{1F311}\u{1F311}", bar: "[          ]", text: "N/A" };
  }
  const s = Math.max(0, Math.min(100, Math.round(score)));
  let glyphs = "";
  for (let i = 0; i < 5; i++) {
    const rem = Math.max(0, Math.min(20, s - i * 20));
    if (rem < 2.5) glyphs += "\u{1F311}";
    else if (rem < 7.5) glyphs += "\u{1F312}";
    else if (rem < 12.5) glyphs += "\u{1F313}";
    else if (rem < 17.5) glyphs += "\u{1F314}";
    else glyphs += "\u{1F315}";
  }
  const filled = Math.round(s / 100 * 10);
  const bar = `[${"\u2588".repeat(filled)}${"\u2591".repeat(10 - filled)}]`;
  const text = `${s}/100`;
  return { glyphs, bar, text };
}
function formatTimeUntilAiring(seconds) {
  if (seconds <= 0) return "airing now";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor(seconds % 86400 / 3600);
  const mins = Math.floor(seconds % 3600 / 60);
  if (days > 0) return `in ${days}d ${hours}h`;
  if (hours > 0) return `in ${hours}h ${mins}m`;
  return `in ${mins}m`;
}
function wrapText(str, maxLen) {
  if (!str) return [];
  const words = str.split(/\s+/);
  const lines = [];
  let cur = "";
  for (const w of words) {
    if (!cur) {
      cur = w;
    } else if (cur.length + 1 + w.length <= maxLen) {
      cur += " " + w;
    } else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}
async function isOnline() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3e3);
    const response = await fetch("https://www.google.com/generate_204", {
      method: "HEAD",
      signal: controller.signal
    });
    clearTimeout(timeout);
    return response.ok;
  } catch {
    return false;
  }
}
async function verifyFirebaseUser(firebaseUid) {
  try {
    const response = await fetch(`${FIRESTORE_BASE}/users/${firebaseUid}?key=${FIREBASE_API_KEY}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" }
    });
    if (!response.ok) return { valid: false };
    const data = await response.json();
    if (data.fields) {
      const username = data.fields.username?.stringValue || data.fields.displayName?.stringValue || data.fields.email?.stringValue?.split("@")[0] || "User";
      const photoUrl = data.fields.photoURL?.stringValue || data.fields.photoUrl?.stringValue || data.fields.avatarUrl?.stringValue || data.fields.profilePicture?.stringValue;
      return { valid: true, username, photoUrl };
    }
    return { valid: false };
  } catch {
    return { valid: false };
  }
}
async function fetchCloudHistory() {
  const token = getToken();
  if (!token || !await isOnline()) return [];
  try {
    const response = await fetch(`${NYANIME_BASE}/api/cli/history`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-Firebase-UID": token
      }
    });
    if (!response.ok) return [];
    const data = await response.json();
    if (!data.success || !data.history) return [];
    return data.history.map((item) => ({
      id: item.animeSlug || item.id,
      title: item.animeTitle || item.title,
      episode: item.episodeNum || item.episode || 1,
      timestamp: item.timestamp || Date.now(),
      category: item.category === "dub" ? "dub" : "sub",
      watchTime: item.watchTime || 0,
      duration: item.duration || 0,
      totalEpisodes: item.totalEpisodes || 0
    }));
  } catch {
    return [];
  }
}
async function syncToCloud(entry) {
  const token = getToken();
  if (!token || !isLoggedIn()) return false;
  try {
    const response = await fetch(`${NYANIME_BASE}/api/cli/history`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Firebase-UID": token
      },
      body: JSON.stringify({
        animeSlug: entry.id,
        animeTitle: entry.title,
        episodeNum: entry.episode,
        category: entry.category,
        watchTime: entry.watchTime || 0,
        duration: entry.duration || 0,
        totalEpisodes: entry.totalEpisodes || 0
      })
    });
    return response.ok;
  } catch {
    return false;
  }
}
async function mergeCloudHistory() {
  const token = getToken();
  if (!token) return { added: 0, message: "Not logged in" };
  if (!await isOnline()) {
    return { added: 0, message: "Offline - using local history" };
  }
  try {
    const cloudHistory = await fetchCloudHistory();
    if (cloudHistory.length === 0) {
      return { added: 0, message: "Cloud sync complete" };
    }
    const localHistory = getHistory();
    const localIds = new Set(localHistory.map((h) => h.id));
    const newEntries = cloudHistory.filter((h) => !localIds.has(h.id));
    if (newEntries.length > 0) {
      const merged = [...localHistory];
      for (const entry of newEntries) {
        merged.push(entry);
      }
      merged.sort((a, b) => b.timestamp - a.timestamp);
      const content = merged.slice(0, 50).map(
        (h) => `${h.id}|${h.title}|${h.episode}|${h.timestamp}|${h.category}|${h.watchTime || 0}|${h.duration || 0}|${h.totalEpisodes || 0}`
      ).join("\n");
      fs4.writeFileSync(historyFile, content, { mode: 384 });
      try {
        fs4.chmodSync(historyFile, 384);
      } catch {
      }
    }
    return { added: newEntries.length, message: `Synced ${newEntries.length} items from cloud` };
  } catch (error) {
    return { added: 0, message: "Cloud sync failed" };
  }
}
function blendHex(a, b, t) {
  const parse = (c) => [
    parseInt(c.slice(1, 3), 16),
    parseInt(c.slice(3, 5), 16),
    parseInt(c.slice(5, 7), 16)
  ];
  const [ar, ag, ab] = parse(a);
  const [br, bg, bb] = parse(b);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const blue = Math.round(ab + (bb - ab) * t);
  return `#${[r, g, blue].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}
function gradientColor(index, total) {
  if (total <= 1) return GRADIENT[0];
  const t = index / (total - 1);
  const scaled = t * (GRADIENT.length - 1);
  const idx = Math.min(Math.floor(scaled), GRADIENT.length - 2);
  const local = scaled - idx;
  return blendHex(GRADIENT[idx], GRADIENT[idx + 1], local);
}
var BANNER = [
  "\u2588\u2588\u2588\u2557   \u2588\u2588\u2557\u2588\u2588\u2557   \u2588\u2588\u2557       \u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2557     \u2588\u2588\u2557",
  "\u2588\u2588\u2588\u2588\u2557  \u2588\u2588\u2551\u255A\u2588\u2588\u2557 \u2588\u2588\u2554\u255D      \u2588\u2588\u2554\u2550\u2550\u2550\u2550\u255D\u2588\u2588\u2551     \u2588\u2588\u2551",
  "\u2588\u2588\u2554\u2588\u2588\u2557 \u2588\u2588\u2551 \u255A\u2588\u2588\u2588\u2588\u2554\u255D \u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2551     \u2588\u2588\u2551     \u2588\u2588\u2551",
  "\u2588\u2588\u2551\u255A\u2588\u2588\u2557\u2588\u2588\u2551  \u255A\u2588\u2588\u2554\u255D  \u255A\u2550\u2550\u2550\u2550\u255D\u2588\u2588\u2551     \u2588\u2588\u2551     \u2588\u2588\u2551",
  "\u2588\u2588\u2551 \u255A\u2588\u2588\u2588\u2588\u2551   \u2588\u2588\u2551         \u255A\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2551",
  "\u255A\u2550\u255D  \u255A\u2550\u2550\u2550\u255D   \u255A\u2550\u255D          \u255A\u2550\u2550\u2550\u2550\u2550\u255D\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u255D\u255A\u2550\u255D"
];
function Banner({ phase }) {
  return /* @__PURE__ */ React.createElement(Box, { flexDirection: "column", alignItems: "center", marginBottom: 1 }, BANNER.map((line, i) => /* @__PURE__ */ React.createElement(Text, { key: i, color: gradientColor((i * 8 + phase) % 45, 45), bold: true }, line)), /* @__PURE__ */ React.createElement(Text, { color: theme.dimGray, dimColor: true }, "\u27E8 Your Gateway to Anime Streaming \u27E9"), /* @__PURE__ */ React.createElement(Text, { color: theme.dimGray, dimColor: true }, "v", VERSION, " \u2022 nyanime.qzz.io"));
}
var SPINNER_FRAMES = ["\u280B", "\u2819", "\u2839", "\u2838", "\u283C", "\u2834", "\u2826", "\u2827", "\u2807", "\u280F"];
function Spinner({ color = theme.purple, text = "" }) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => {
      setFrame((f) => (f + 1) % SPINNER_FRAMES.length);
    }, 80);
    return () => clearInterval(timer);
  }, []);
  return /* @__PURE__ */ React.createElement(Text, null, /* @__PURE__ */ React.createElement(Text, { color, bold: true }, SPINNER_FRAMES[frame]), text && /* @__PURE__ */ React.createElement(Text, { color: theme.lightGray }, " ", text));
}
var EXIT_FRAMES = ["\u25DC ", " \u25DD", " \u25DE", "\u25DF ", "\u25DC "];
function ExitAnimation({ onDone }) {
  const [frame, setFrame] = useState(0);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  useInput(() => {
    onDoneRef.current();
  });
  useEffect(() => {
    const timer = setInterval(() => {
      setFrame((f) => {
        if (f + 1 >= EXIT_FRAMES.length) {
          clearInterval(timer);
          setTimeout(() => onDoneRef.current(), 100);
        }
        return Math.min(f + 1, EXIT_FRAMES.length - 1);
      });
    }, 120);
    return () => clearInterval(timer);
  }, []);
  return /* @__PURE__ */ React.createElement(Text, { color: theme.purple }, EXIT_FRAMES[frame], " Goodbye!");
}
function ShimmerText({ text, speed = 100 }) {
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setOffset((o) => (o + 1) % text.length), speed);
    return () => clearInterval(timer);
  }, [text.length, speed]);
  return /* @__PURE__ */ React.createElement(Text, null, text.split("").map((char, i) => /* @__PURE__ */ React.createElement(Text, { key: i, color: gradientColor((i + offset) % text.length, text.length) }, char)));
}
function BouncingDots({ color = theme.purple }) {
  const [phase, setPhase] = useState(0);
  const dots = ["\u2801", "\u2802", "\u2804", "\u2840", "\u2880", "\u2820", "\u2810", "\u2808"];
  useEffect(() => {
    const timer = setInterval(() => setPhase((p) => (p + 1) % dots.length), 100);
    return () => clearInterval(timer);
  }, []);
  return /* @__PURE__ */ React.createElement(Text, { color, bold: true }, dots[phase], " ", dots[(phase + 2) % dots.length], " ", dots[(phase + 4) % dots.length]);
}
function WaveText({ text, colors = GRADIENT, speed = 100 }) {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setPhase((p) => (p + 1) % 100), speed);
    return () => clearInterval(timer);
  }, [speed]);
  const chars = text.split("");
  return /* @__PURE__ */ React.createElement(Text, null, chars.map((char, i) => {
    const colorIdx = (i + phase) % colors.length;
    return /* @__PURE__ */ React.createElement(Text, { key: i, color: colors[colorIdx], bold: true }, char);
  }));
}
function ScrollingWelcome({ text, onComplete }) {
  const termWidth = process.stdout.columns || 80;
  const [position, setPosition] = useState(0);
  const [done, setDone] = useState(false);
  const centerPos = Math.floor((termWidth - text.length) / 2);
  const maxPos = centerPos + 30;
  useEffect(() => {
    const timer = setInterval(() => {
      setPosition((p) => {
        const newPos = p + 1;
        if (newPos > maxPos) {
          clearInterval(timer);
          setDone(true);
          return maxPos;
        }
        return newPos;
      });
    }, 60);
    return () => clearInterval(timer);
  }, [maxPos]);
  useInput(() => {
    setDone(true);
    if (onComplete) onComplete();
  });
  useEffect(() => {
    if (done && onComplete) {
      const timeout = setTimeout(onComplete, 50);
      return () => clearTimeout(timeout);
    }
  }, [done, onComplete]);
  if (done) return null;
  const padding = Math.max(0, position);
  const isFading = position > centerPos;
  return /* @__PURE__ */ React.createElement(Box, null, /* @__PURE__ */ React.createElement(Text, null, " ".repeat(padding)), /* @__PURE__ */ React.createElement(Text, { dimColor: isFading }, text.split("").map((char, i) => {
    const colorIdx = (i + Math.floor(position / 3)) % GRADIENT.length;
    return /* @__PURE__ */ React.createElement(Text, { key: i, color: GRADIENT[colorIdx], bold: true }, char);
  })));
}
var imageUrlCache = /* @__PURE__ */ new Map();
async function getAnimeImageUrl(title) {
  const cacheKey = title.toLowerCase().trim();
  if (imageUrlCache.has(cacheKey)) {
    return imageUrlCache.get(cacheKey) || null;
  }
  try {
    const searchQuery = encodeURIComponent(title.split(" ").slice(0, 3).join(" "));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4e3);
    const response = await fetch(
      `https://api.jikan.moe/v4/anime?q=${searchQuery}&order_by=members&sort=desc&limit=1&sfw=true`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);
    if (response.ok) {
      const data = await response.json();
      const anime = data?.data?.[0];
      const imageUrl = anime?.images?.jpg?.large_image_url || anime?.images?.jpg?.image_url;
      if (imageUrl) {
        imageUrlCache.set(cacheKey, imageUrl);
        return imageUrl;
      }
    }
  } catch {
  }
  return null;
}
function AnimeArtwork({ title, imageUrl, width = 25, height = 12 }) {
  const [loading, setLoading] = useState(!imageUrl);
  const [error, setError] = useState(false);
  const [imgPath, setImgPath] = useState(null);
  const prevImgRef = React.useRef(null);
  useEffect(() => {
    let active = true;
    async function loadArtwork(url) {
      try {
        setLoading(true);
        const tmpDir = os2.tmpdir();
        const tmpFile = path3.join(tmpDir, `ny-cli-art-${Date.now()}.jpg`);
        const res = await fetch(url);
        if (!res.ok) throw new Error("Fetch failed");
        const buffer = await res.arrayBuffer();
        fs4.writeFileSync(tmpFile, Buffer.from(buffer));
        if (active) {
          setImgPath(tmpFile);
          setError(false);
        }
        if (active) setLoading(false);
      } catch (err) {
        if (active) {
          setError(true);
          setLoading(false);
        }
      }
    }
    if (imageUrl) {
      prevImgRef.current = imageUrl;
      loadArtwork(imageUrl);
      return () => {
        active = false;
      };
    }
    if (!title) {
      setImgPath(null);
      setLoading(false);
      return;
    }
    if (!prevImgRef.current) {
      setLoading(true);
    }
    const timer = setTimeout(() => {
      getAnimeImageUrl(title).then((url) => {
        if (url && active) {
          prevImgRef.current = url;
          loadArtwork(url);
        } else if (active) {
          setLoading(false);
          setError(true);
        }
      }).catch(() => {
        if (active) {
          setLoading(false);
          setError(true);
        }
      });
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [title, imageUrl]);
  if (!title && !imageUrl && !imgPath) {
    return /* @__PURE__ */ React.createElement(Box, { width, height, borderStyle: "round", borderColor: theme.dimGray, justifyContent: "center", alignItems: "center" }, /* @__PURE__ */ React.createElement(Text, { color: theme.dimGray }, "No Art"));
  }
  if (loading && !imgPath) {
    return /* @__PURE__ */ React.createElement(Box, { width, height, borderStyle: "round", borderColor: theme.purple, justifyContent: "center", alignItems: "center", flexDirection: "column" }, /* @__PURE__ */ React.createElement(BouncingDots, { color: theme.purple }), /* @__PURE__ */ React.createElement(Text, { color: theme.dimGray, dimColor: true }, "Loading..."));
  }
  if (!imgPath && !loading || error) {
    return /* @__PURE__ */ React.createElement(Box, { width, height, borderStyle: "round", borderColor: theme.dimGray, justifyContent: "center", alignItems: "center" }, /* @__PURE__ */ React.createElement(Text, { color: theme.dimGray }, "[!] No art"));
  }
  return /* @__PURE__ */ React.createElement(Box, { width, height, borderStyle: "round", borderColor: theme.purple }, /* @__PURE__ */ React.createElement(Box, { width: Math.max(1, width - 2), height: Math.max(1, height - 2), overflow: "hidden" }, /* @__PURE__ */ React.createElement(Picture, { src: imgPath, width: Math.max(1, width - 2), height: Math.max(1, height - 2) })));
}
function SelectList({
  items,
  onSelect,
  onBack,
  title,
  color = theme.purple,
  showBorder = true,
  showArtwork = false,
  showNumbers = true,
  enableSearch = false,
  onAction,
  onPageNext,
  onPagePrev,
  onSortToggle,
  customKeyHint
}) {
  const { stdout } = useStdout();
  const [termSize, setTermSize] = useState({ cols: stdout.columns || 80, rows: stdout.rows || 24 });
  useEffect(() => {
    const onResize = () => setTermSize({ cols: stdout.columns || 80, rows: stdout.rows || 24 });
    stdout.on("resize", onResize);
    return () => {
      stdout.off("resize", onResize);
    };
  }, [stdout]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [rippleIndex, setRippleIndex] = useState(-1);
  const [ripplePhase, setRipplePhase] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const filteredItems = enableSearch && searchQuery ? items.filter((item) => {
    const num = item.number?.toString() || "";
    const itemLabel = typeof item.label === "string" ? item.label : String(item.label ?? "");
    const label = itemLabel.toLowerCase();
    const query = searchQuery.toLowerCase();
    return num.startsWith(query) || label.includes(query);
  }) : items;
  const maxVisible = Math.min(10, filteredItems.length);
  const startIdx = Math.max(0, Math.min(selectedIndex - Math.floor(maxVisible / 2), filteredItems.length - maxVisible));
  const visibleItems = filteredItems.slice(startIdx, startIdx + maxVisible);
  const selectedItem = filteredItems[selectedIndex];
  useEffect(() => {
    setSelectedIndex(0);
  }, [searchQuery]);
  useEffect(() => {
    if (rippleIndex >= 0) {
      const timer = setInterval(() => {
        setRipplePhase((p) => {
          if (p >= 5) {
            clearInterval(timer);
            setRippleIndex(-1);
            return 0;
          }
          return p + 1;
        });
      }, 60);
      return () => clearInterval(timer);
    }
  }, [rippleIndex]);
  useInput((input, key) => {
    if (enableSearch && input === "/" && !isSearching) {
      setIsSearching(true);
      return;
    }
    if (isSearching) {
      if (key.escape) {
        setIsSearching(false);
        setSearchQuery("");
      } else if (key.return) {
        setIsSearching(false);
      } else if (key.backspace || key.delete) {
        setSearchQuery((q) => q.slice(0, -1));
      } else if (input && input.length === 1 && !key.ctrl && !key.meta) {
        setSearchQuery((q) => q + input);
      }
      return;
    }
    if (key.upArrow || input === "k") {
      setSelectedIndex((i) => Math.max(0, i - 1));
    } else if (key.downArrow || input === "j") {
      setSelectedIndex((i) => Math.min(filteredItems.length - 1, i + 1));
    } else if (key.return) {
      if (filteredItems.length > 0) {
        setRippleIndex(selectedIndex);
        setRipplePhase(0);
        setTimeout(() => {
          onSelect(filteredItems[selectedIndex], selectedIndex);
        }, 300);
      }
    } else if (input === "q") {
      quitBus.emit("quit");
    } else if (key.escape || input === "b" || key.leftArrow) {
      if (searchQuery) {
        setSearchQuery("");
      } else if (onBack) {
        onBack();
      }
    } else if (onPageNext && input === "n" && !isSearching) {
      onPageNext();
    } else if (onPagePrev && input === "p" && !isSearching) {
      onPagePrev();
    } else if (onSortToggle && input === "s" && !isSearching) {
      onSortToggle();
    } else if (onAction && (input === "d" || input === "a")) {
      if (filteredItems.length > 0) {
        onAction(input, filteredItems[selectedIndex]);
      }
    } else if (enableSearch && /^[0-9]$/.test(input)) {
      setSearchQuery((q) => q + input);
    } else if (showNumbers && /^[1-9]$/.test(input) && !enableSearch) {
      const num = parseInt(input, 10) - 1 + startIdx;
      if (num < filteredItems.length) {
        setSelectedIndex(num);
        setRippleIndex(num);
        setRipplePhase(0);
        setTimeout(() => {
          onSelect(filteredItems[num], num);
        }, 300);
      }
    }
  });
  const rippleChars = ["\u25CB", "\u25CE", "\u25CF", "\u25C9", "\u25CE", "\u25CB"];
  const getRippleChar = (phase) => rippleChars[Math.min(phase, rippleChars.length - 1)];
  const termWidth = process.stdout.columns || 80;
  const maxLabelLen = Math.max(15, termWidth - 25);
  const content = /* @__PURE__ */ React.createElement(Box, { flexDirection: "column" }, title && /* @__PURE__ */ React.createElement(Text, { color, bold: true }, title), title && /* @__PURE__ */ React.createElement(Text, { color: theme.dimGray, dimColor: true }, customKeyHint || `\u2191\u2193: navigate \u2502 Enter: select \u2502 ${onPageNext || onPagePrev ? "n/p: page \u2502 " : ""}${onSortToggle ? "s: sort \u2502 " : ""}b: back${enableSearch ? " \u2502 Type number to jump" : ""}${onAction ? " \u2502 d: dl \u2502 a: dl all" : ""} \u2502 q: quit`), enableSearch && /* @__PURE__ */ React.createElement(Box, { marginTop: 1 }, /* @__PURE__ */ React.createElement(Text, { color: theme.cyan }, "[S] "), /* @__PURE__ */ React.createElement(Text, { color: searchQuery ? theme.white : theme.dimGray }, searchQuery || "Type episode number..."), searchQuery && /* @__PURE__ */ React.createElement(Text, { color: theme.dimGray }, " (", filteredItems.length, " matches)")), /* @__PURE__ */ React.createElement(Box, { marginTop: title ? 1 : 0, flexDirection: "column" }, visibleItems.map((item, idx) => {
    const actualIdx = startIdx + idx;
    const isSelected = actualIdx === selectedIndex;
    const isRippling = actualIdx === rippleIndex;
    const rippleColor = isRippling ? blendHex(theme.purple, theme.pink, ripplePhase / 5) : color;
    const indicator = isRippling ? getRippleChar(ripplePhase) : isSelected ? "\u25B8" : " ";
    const displayNum = idx + 1;
    const icon = item.icon ? `${item.icon} ` : "";
    const badgeStr = item.badge ? ` (${item.badge})` : "";
    const itemLabel = typeof item.label === "string" ? item.label : String(item.label ?? "");
    const fullText = `${icon}${itemLabel}${badgeStr}`;
    const labelText = fullText.length > maxLabelLen ? fullText.slice(0, maxLabelLen - 3) + "..." : fullText;
    const numPrefix = showNumbers ? `${String(displayNum).padStart(2, " ")}) ` : "";
    return /* @__PURE__ */ React.createElement(Box, { key: actualIdx }, /* @__PURE__ */ React.createElement(Text, { color: isRippling ? rippleColor : isSelected ? color : theme.dimGray }, indicator), showNumbers && /* @__PURE__ */ React.createElement(Text, { color: theme.dimGray }, numPrefix), !showNumbers && /* @__PURE__ */ React.createElement(Text, null, " "), /* @__PURE__ */ React.createElement(Text, { color: isSelected ? theme.white : theme.lightGray, bold: isSelected }, labelText));
  })), items.length > maxVisible && /* @__PURE__ */ React.createElement(Box, { marginTop: 1 }, /* @__PURE__ */ React.createElement(Text, { color: theme.dimGray, dimColor: true }, "\u2500\u2500\u2500\u2500 ", selectedIndex + 1, "/", items.length, " \u2500\u2500\u2500\u2500")));
  if (showArtwork) {
    const isNarrow = termSize.cols < 70;
    const artworkWidth = isNarrow ? Math.min(26, Math.max(16, termSize.cols - 6)) : 30;
    const artworkHeight = isNarrow ? 8 : 15;
    const titleText = typeof selectedItem?.label === "string" ? selectedItem.label : String(selectedItem?.label ?? "");
    return /* @__PURE__ */ React.createElement(Box, { flexDirection: isNarrow ? "column" : "row" }, /* @__PURE__ */ React.createElement(Box, { flexDirection: "column", marginRight: isNarrow ? 0 : 2, marginBottom: isNarrow ? 1 : 0, width: artworkWidth }, /* @__PURE__ */ React.createElement(
      AnimeArtwork,
      {
        title: titleText,
        imageUrl: selectedItem?.imageUrl,
        width: artworkWidth,
        height: artworkHeight
      }
    ), selectedItem && /* @__PURE__ */ React.createElement(Box, { marginTop: 1 }, /* @__PURE__ */ React.createElement(Text, { color: theme.cyan, wrap: "truncate-end" }, titleText.slice(0, Math.max(10, artworkWidth - 2))))), showBorder ? /* @__PURE__ */ React.createElement(Box, { flexDirection: "column", borderStyle: "round", borderColor: color, paddingX: 1, paddingY: 1, flexGrow: 1 }, content) : /* @__PURE__ */ React.createElement(Box, { flexDirection: "column", flexGrow: 1 }, content));
  }
  if (showBorder) {
    return /* @__PURE__ */ React.createElement(Box, { flexDirection: "column", borderStyle: "round", borderColor: color, paddingX: 1, paddingY: 1 }, content);
  }
  return content;
}
function InputBox({ label, onSubmit, onCancel, placeholder = "", color = theme.purple }) {
  const [value, setValue] = useState("");
  useInput((input, key) => {
    if (key.escape && onCancel) {
      onCancel();
    }
  });
  return /* @__PURE__ */ React.createElement(Box, { flexDirection: "column" }, label && /* @__PURE__ */ React.createElement(Text, { color: theme.pink, bold: true }, label), /* @__PURE__ */ React.createElement(Box, { marginTop: 1, borderStyle: "round", borderColor: color, paddingX: 1 }, /* @__PURE__ */ React.createElement(Text, { color }, "\u276F "), /* @__PURE__ */ React.createElement(
    TextInput,
    {
      value,
      onChange: setValue,
      onSubmit: (v) => v.trim() && onSubmit(v.trim()),
      placeholder
    }
  )), /* @__PURE__ */ React.createElement(Text, { color: theme.dimGray, dimColor: true }, "Enter: confirm \u2502 Escape: cancel"));
}
function StatusBar({ message, type = "info", loading = false }) {
  const [pulsePhase, setPulsePhase] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setPulsePhase((p) => (p + 1) % 20), 150);
    return () => clearInterval(timer);
  }, []);
  const colors = {
    info: theme.blue,
    success: theme.success,
    warning: theme.warning,
    error: theme.error
  };
  const icons = {
    info: "[i]",
    success: "[+]",
    warning: "[!]",
    error: "[x]"
  };
  const baseBorderColor = type === "success" ? theme.success : type === "error" ? theme.error : type === "warning" ? theme.warning : theme.dimGray;
  const brightness = Math.sin(pulsePhase * 0.3) * 0.2 + 0.8;
  const borderColor = blendHex(baseBorderColor, theme.dimGray, 1 - brightness);
  return /* @__PURE__ */ React.createElement(Box, { borderStyle: "single", borderColor, paddingX: 1 }, loading ? /* @__PURE__ */ React.createElement(Spinner, { color: colors[type], text: message }) : /* @__PURE__ */ React.createElement(Text, null, /* @__PURE__ */ React.createElement(Text, { color: colors[type], bold: true }, icons[type]), /* @__PURE__ */ React.createElement(Text, { color: theme.lightGray }, " ", message)));
}
async function getJson(path4) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15e3);
  try {
    const res = await fetch(`${API_BASE}${path4}`, { signal: controller.signal });
    const text = await res.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      const snippet = text.slice(0, 100).replace(/\s+/g, " ").trim();
      throw new Error(`Non-JSON response (HTTP ${res.status}): ${snippet || "(empty response)"}`);
    }
    if (!res.ok || !body?.success) {
      throw new Error(body?.error || `HTTP ${res.status}`);
    }
    return body.data;
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error(`Request timed out after 15s: ${path4}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
function getPlayerCommand() {
  const candidates = ["mpv", "vlc", "iina"];
  for (const cmd of candidates) {
    try {
      const result = spawnSync("which", [cmd], { encoding: "utf8" });
      if (result.status === 0 && result.stdout.trim()) {
        return cmd;
      }
    } catch {
    }
  }
  return null;
}
function resolvePlayerCommand(settings) {
  if (settings.player && settings.player !== "auto") return settings.player;
  return getPlayerCommand() || "mpv";
}
function buildPlayerArgs(player, url, headers, title, subtitle, options) {
  if (player === "vlc") {
    const args2 = [url];
    if (headers?.Referer) {
      args2.push(`--http-referrer=${headers.Referer}`);
    }
    if (headers?.["User-Agent"]) {
      args2.push(`--http-user-agent=${headers["User-Agent"]}`);
    }
    if (title) {
      args2.push(`--meta-title=${title}`);
    }
    if (subtitle) {
      args2.push(`--sub-file=${subtitle}`);
    }
    if (options?.audioType === "sub") {
      args2.push("--sub-language=en,eng", "--audio-language=ja,jpn");
    } else if (options?.audioType === "dub") {
      args2.push("--audio-language=en,eng");
    }
    args2.push("--play-and-exit");
    return args2;
  }
  const args = [url];
  if (headers) {
    Object.entries(headers).forEach(([k, v]) => {
      args.push(`--http-header-fields-append=${k}: ${v}`);
    });
  }
  if (title) {
    args.push(`--title=${title}`);
    args.push(`--force-media-title=${title}`);
  }
  if (subtitle) {
    args.push(`--sub-file=${subtitle}`);
  }
  if (options?.audioType === "sub") {
    args.push("--alang=jpn,ja,Japanese");
    args.push("--slang=eng,en,English");
  } else if (options?.audioType === "dub") {
    args.push("--alang=eng,en,English");
  }
  if (options?.skipArgs && options.skipArgs.length > 0) {
    args.push(...options.skipArgs);
  }
  return args;
}
function SettingsScreen({ settings, onUpdate, onBack }) {
  const { stdout } = useStdout();
  const [termSize, setTermSize] = useState({ cols: stdout.columns || 80, rows: stdout.rows || 24 });
  useEffect(() => {
    const onResize = () => setTermSize({ cols: stdout.columns || 80, rows: stdout.rows || 24 });
    stdout.on("resize", onResize);
    return () => {
      stdout.off("resize", onResize);
    };
  }, [stdout]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState("");
  const anime4kInstalled = isAnime4kInstalled();
  const modes = ["A", "B", "C", "A+A", "B+B", "C+A"];
  const players = ["auto", "mpv", "vlc"];
  const skipModes = ["off", "chapters", "auto"];
  const menuItems = [
    { key: "player", label: "Video Player", type: "select" },
    { key: "skipMode", label: "AniSkip Mode", type: "select" },
    { key: "anime4k", label: "Anime4K Upscaling", type: "toggle" },
    { key: "anime4kMode", label: "Anime4K Mode", type: "select" },
    { key: "download", label: "Download Anime4K Shaders", type: "action" },
    { key: "back", label: "\u2190 Back", type: "action" }
  ];
  const downloadAnime4k = async () => {
    setDownloading(true);
    setDownloadStatus("Downloading Anime4K shaders...");
    try {
      const targetDir = anime4kDir;
      const version = "v4.0.1";
      const url = `https://github.com/bloc97/Anime4K/releases/download/${version}/Anime4K_v4.0.zip`;
      const zipPath = path3.join(targetDir, "Anime4K.zip");
      setDownloadStatus("Downloading shaders...");
      execSync(`curl -sL "${url}" -o "${zipPath}"`, { stdio: "pipe" });
      setDownloadStatus("Extracting shaders...");
      execSync(`cd "${targetDir}" && unzip -o Anime4K.zip && mv Anime4K_v4.0/* . 2>/dev/null || true`, { stdio: "pipe" });
      execSync(`rm -f "${zipPath}" && rm -rf "${targetDir}/Anime4K_v4.0"`, { stdio: "pipe" });
      setDownloadStatus("\u2713 Anime4K shaders installed successfully!");
      setTimeout(() => setDownloadStatus(""), 3e3);
    } catch (err) {
      setDownloadStatus(`\u2717 Download failed: ${err.message}`);
    } finally {
      setDownloading(false);
    }
  };
  useInput((input, key) => {
    if (key.escape || input === "b" && selectedIndex !== 0) {
      onBack();
      return;
    }
    if (input === "q") {
      quitBus.emit("quit");
    }
    if (key.upArrow || input === "k") {
      setSelectedIndex((i) => Math.max(0, i - 1));
    } else if (key.downArrow || input === "j") {
      setSelectedIndex((i) => Math.min(menuItems.length - 1, i + 1));
    } else if (key.return) {
      const item = menuItems[selectedIndex];
      if (item.key === "player") {
        const currentIdx = players.indexOf(settings.player || "auto");
        const nextIdx = (currentIdx + 1) % players.length;
        onUpdate({ ...settings, player: players[nextIdx] });
      } else if (item.key === "skipMode") {
        const currentIdx = skipModes.indexOf(settings.skipMode || "off");
        const nextIdx = (currentIdx + 1) % skipModes.length;
        onUpdate({ ...settings, skipMode: skipModes[nextIdx] });
      } else if (item.key === "anime4k") {
        if (anime4kInstalled) {
          onUpdate({ ...settings, anime4k: !settings.anime4k });
        }
      } else if (item.key === "anime4kMode") {
        const currentIdx = modes.indexOf(settings.anime4kMode);
        const nextIdx = (currentIdx + 1) % modes.length;
        onUpdate({ ...settings, anime4kMode: modes[nextIdx] });
      } else if (item.key === "download") {
        if (!downloading) {
          downloadAnime4k();
        }
      } else if (item.key === "back") {
        onBack();
      }
    } else if (key.leftArrow && menuItems[selectedIndex].key === "player") {
      const currentIdx = players.indexOf(settings.player || "auto");
      const prevIdx = currentIdx > 0 ? currentIdx - 1 : players.length - 1;
      onUpdate({ ...settings, player: players[prevIdx] });
    } else if (key.rightArrow && menuItems[selectedIndex].key === "player") {
      const currentIdx = players.indexOf(settings.player || "auto");
      const nextIdx = (currentIdx + 1) % players.length;
      onUpdate({ ...settings, player: players[nextIdx] });
    } else if (key.leftArrow && menuItems[selectedIndex].key === "skipMode") {
      const currentIdx = skipModes.indexOf(settings.skipMode || "off");
      const prevIdx = currentIdx > 0 ? currentIdx - 1 : skipModes.length - 1;
      onUpdate({ ...settings, skipMode: skipModes[prevIdx] });
    } else if (key.rightArrow && menuItems[selectedIndex].key === "skipMode") {
      const currentIdx = skipModes.indexOf(settings.skipMode || "off");
      const nextIdx = (currentIdx + 1) % skipModes.length;
      onUpdate({ ...settings, skipMode: skipModes[nextIdx] });
    } else if (key.leftArrow && menuItems[selectedIndex].key === "anime4kMode") {
      const currentIdx = modes.indexOf(settings.anime4kMode);
      const prevIdx = currentIdx > 0 ? currentIdx - 1 : modes.length - 1;
      onUpdate({ ...settings, anime4kMode: modes[prevIdx] });
    } else if (key.rightArrow && menuItems[selectedIndex].key === "anime4kMode") {
      const currentIdx = modes.indexOf(settings.anime4kMode);
      const nextIdx = (currentIdx + 1) % modes.length;
      onUpdate({ ...settings, anime4kMode: modes[nextIdx] });
    }
  });
  return /* @__PURE__ */ React.createElement(Box, { flexDirection: "column", width: Math.min(60, termSize.cols - 4) }, /* @__PURE__ */ React.createElement(Box, { borderStyle: "round", borderColor: theme.cyan, paddingX: 2, paddingY: 1, flexDirection: "column" }, /* @__PURE__ */ React.createElement(Text, { color: theme.cyan, bold: true }, "[\u2699] Settings"), /* @__PURE__ */ React.createElement(Text, { color: theme.dimGray }, "\u2500".repeat(50)), /* @__PURE__ */ React.createElement(Text, null, " "), /* @__PURE__ */ React.createElement(Box, null, /* @__PURE__ */ React.createElement(Text, { color: selectedIndex === 0 ? theme.cyan : theme.lightGray }, selectedIndex === 0 ? "\u25B8 " : "  ", "Video Player:", " "), /* @__PURE__ */ React.createElement(Text, { color: selectedIndex === 0 ? theme.cyan : theme.lightGray }, "\u25C0 ", (settings.player || "auto").toUpperCase(), " \u25B6")), /* @__PURE__ */ React.createElement(Box, null, /* @__PURE__ */ React.createElement(Text, { color: selectedIndex === 1 ? theme.cyan : theme.lightGray }, selectedIndex === 1 ? "\u25B8 " : "  ", "AniSkip Mode:", " "), /* @__PURE__ */ React.createElement(Text, { color: selectedIndex === 1 ? theme.cyan : theme.lightGray }, "\u25C0 ", (settings.skipMode || "off").toUpperCase(), " \u25B6")), /* @__PURE__ */ React.createElement(Box, null, /* @__PURE__ */ React.createElement(Text, { color: selectedIndex === 2 ? theme.cyan : theme.lightGray }, selectedIndex === 2 ? "\u25B8 " : "  ", "Anime4K Upscaling:", " "), anime4kInstalled ? /* @__PURE__ */ React.createElement(Text, { color: settings.anime4k ? theme.green : theme.red }, settings.anime4k ? "[ON]" : "[OFF]") : /* @__PURE__ */ React.createElement(Text, { color: theme.dimGray }, "[Not Installed]")), /* @__PURE__ */ React.createElement(Box, null, /* @__PURE__ */ React.createElement(Text, { color: selectedIndex === 3 ? theme.cyan : theme.lightGray }, selectedIndex === 3 ? "\u25B8 " : "  ", "Anime4K Mode:", " "), /* @__PURE__ */ React.createElement(Text, { color: selectedIndex === 3 ? theme.cyan : theme.lightGray }, "\u25C0 ", settings.anime4kMode, " \u25B6")), /* @__PURE__ */ React.createElement(Text, null, " "), /* @__PURE__ */ React.createElement(Box, null, /* @__PURE__ */ React.createElement(Text, { color: selectedIndex === 4 ? theme.cyan : theme.lightGray }, selectedIndex === 4 ? "\u25B8 " : "  ", anime4kInstalled ? "\u21BB Re-download" : "\u2193 Download", " Anime4K Shaders")), /* @__PURE__ */ React.createElement(Box, null, /* @__PURE__ */ React.createElement(Text, { color: selectedIndex === 5 ? theme.cyan : theme.lightGray }, selectedIndex === 5 ? "\u25B8 " : "  ", "\u2190 Back")), downloadStatus && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(Text, null, " "), /* @__PURE__ */ React.createElement(Text, { color: downloadStatus.startsWith("\u2713") ? theme.green : downloadStatus.startsWith("\u2717") ? theme.red : theme.cyan }, downloadStatus))), /* @__PURE__ */ React.createElement(Box, { marginTop: 1 }, /* @__PURE__ */ React.createElement(Text, { color: theme.dimGray }, anime4kInstalled ? "Anime4K shaders enhance video quality for older anime" : "Download shaders first to enable upscaling")), /* @__PURE__ */ React.createElement(Box, { marginTop: 1 }, /* @__PURE__ */ React.createElement(Text, { color: theme.dimGray }, "Mode A: Best for 1080p | Mode B: Soft edges | Mode C: Denoise")));
}
function AnimeDetailsView({
  animeInfo,
  history,
  onWatch,
  onDownload,
  onPlayTrailer,
  onToggleMyList,
  isInList,
  onBack,
  termSize
}) {
  const isNarrow = termSize.cols < 70;
  const [synopsisScroll, setSynopsisScroll] = useState(0);
  const [focusArea, setFocusArea] = useState("actions");
  const [selectedActionIndex, setSelectedActionIndex] = useState(0);
  const histEntry = history.find((h) => h.id === animeInfo?.id);
  const watchLabel = histEntry?.episode ? `\u25B6 Continue from Episode ${histEntry.episode}` : "\u25B6 Watch";
  const actionItems = [
    { value: "watch", label: watchLabel, icon: "[\u25B6]" },
    { value: "mylist", label: isInList ? "\u2605 Remove from My List" : "\u2606 Add to My List", icon: isInList ? "[\u2605]" : "[\u2606]" },
    { value: "download", label: "Download Episodes", icon: "[\u2B07]" }
  ];
  if (animeInfo?.trailer?.id || animeInfo?.trailer?.url) {
    actionItems.push({ value: "trailer", label: "Play Trailer", icon: "[\u{1F3AC}]" });
  }
  actionItems.push({ value: "back", label: "Back", icon: "[\u21A9]" });
  const scoreData = renderScore(animeInfo?.averageScore);
  const formatStr = animeInfo?.format || "TV";
  const isAiring = animeInfo?.status === "RELEASING" || Boolean(animeInfo?.nextAiringEpisode);
  const statusStr = isAiring ? "Airing" : animeInfo?.status === "FINISHED" ? "Finished" : animeInfo?.status || "Unknown";
  const seasonYearStr = `${animeInfo?.season ? animeInfo.season.charAt(0) + animeInfo.season.slice(1).toLowerCase() : ""} ${animeInfo?.year || ""}`.trim();
  const studiosStr = animeInfo?.studios?.length ? animeInfo.studios.slice(0, 2).join(", ") : "";
  const releasedCount = animeInfo?.episodes?.sub?.length || (animeInfo?.nextAiringEpisode ? animeInfo.nextAiringEpisode.episode - 1 : 0);
  const totalCount = animeInfo?.stats?.episodes?.sub || animeInfo?.totalEpisodes || null;
  const epFactsStr = isAiring ? `${releasedCount} released of ${totalCount || "?"}${animeInfo?.nextAiringEpisode ? ` (Ep ${animeInfo.nextAiringEpisode.episode} ${formatTimeUntilAiring(animeInfo.nextAiringEpisode.timeUntilAiring)})` : ""}` : `${releasedCount || totalCount || "?"} Episodes`;
  const factsParts = [
    formatStr,
    statusStr,
    seasonYearStr,
    studiosStr ? `Studio: ${studiosStr}` : null,
    epFactsStr
  ].filter(Boolean);
  const synopsisWidth = isNarrow ? Math.max(20, termSize.cols - 6) : Math.max(30, termSize.cols - 38);
  const rawSynopsis = animeInfo?.synopsis || animeInfo?.description || "No synopsis available.";
  const synopsisLines = wrapText(rawSynopsis, synopsisWidth);
  const maxVisibleSynopsis = isNarrow ? 3 : 5;
  const visibleSynopsisLines = synopsisLines.slice(synopsisScroll, synopsisScroll + maxVisibleSynopsis);
  const handleActionSelect = (item) => {
    if (item.value === "watch") onWatch();
    else if (item.value === "download") onDownload();
    else if (item.value === "trailer") onPlayTrailer();
    else if (item.value === "mylist") onToggleMyList();
    else if (item.value === "back") onBack();
  };
  useInput((input, key) => {
    if (key.escape || input === "b") {
      onBack();
      return;
    }
    if (input === "q") {
      quitBus.emit("quit");
      return;
    }
    if (key.tab) {
      setFocusArea((f) => f === "actions" ? "synopsis" : "actions");
      return;
    }
    if (input && /^[1-9]$/.test(input)) {
      const idx = parseInt(input, 10) - 1;
      if (idx >= 0 && idx < actionItems.length) {
        handleActionSelect(actionItems[idx]);
        return;
      }
    }
    if (focusArea === "synopsis") {
      if (key.upArrow || input === "k") {
        setSynopsisScroll((s) => Math.max(0, s - 1));
      } else if (key.downArrow || input === "j") {
        setSynopsisScroll((s) => Math.min(Math.max(0, synopsisLines.length - maxVisibleSynopsis), s + 1));
      }
    } else {
      if (key.upArrow || input === "k") {
        setSelectedActionIndex((i) => Math.max(0, i - 1));
      } else if (key.downArrow || input === "j") {
        setSelectedActionIndex((i) => Math.min(actionItems.length - 1, i + 1));
      } else if (key.return) {
        if (actionItems[selectedActionIndex]) {
          handleActionSelect(actionItems[selectedActionIndex]);
        }
      }
    }
    if (input === "[" || key.pageUp) {
      setSynopsisScroll((s) => Math.max(0, s - 2));
    } else if (input === "]" || key.pageDown) {
      setSynopsisScroll((s) => Math.min(Math.max(0, synopsisLines.length - maxVisibleSynopsis), s + 2));
    }
  });
  const artworkWidth = isNarrow ? Math.min(26, Math.max(16, termSize.cols - 6)) : 28;
  const artworkHeight = isNarrow ? 8 : 13;
  return /* @__PURE__ */ React.createElement(Box, { flexDirection: "column", width: Math.min(120, termSize.cols - 2) }, /* @__PURE__ */ React.createElement(Box, { flexDirection: isNarrow ? "column" : "row" }, /* @__PURE__ */ React.createElement(Box, { flexDirection: "column", marginRight: isNarrow ? 0 : 2, marginBottom: isNarrow ? 1 : 0, width: artworkWidth, alignItems: "center" }, /* @__PURE__ */ React.createElement(
    AnimeArtwork,
    {
      title: animeInfo?.name || "",
      imageUrl: animeInfo?.poster,
      width: artworkWidth,
      height: artworkHeight
    }
  )), /* @__PURE__ */ React.createElement(Box, { flexDirection: "column", flexGrow: 1 }, /* @__PURE__ */ React.createElement(Text, { bold: true, color: theme.pink }, animeInfo?.titles?.english || animeInfo?.name || "Untitled"), animeInfo?.titles?.romaji && animeInfo.titles.romaji !== animeInfo?.titles?.english && /* @__PURE__ */ React.createElement(Text, { color: theme.cyan, dimColor: true }, animeInfo.titles.romaji), animeInfo?.titles?.native && /* @__PURE__ */ React.createElement(Text, { color: theme.dimGray }, animeInfo.titles.native), /* @__PURE__ */ React.createElement(Box, { marginTop: 1 }, /* @__PURE__ */ React.createElement(Text, { color: theme.yellow, bold: true }, factsParts.join(" \u2022 "))), /* @__PURE__ */ React.createElement(Box, { marginTop: 1 }, /* @__PURE__ */ React.createElement(Text, { color: theme.cyan }, "Score: "), /* @__PURE__ */ React.createElement(Text, { color: theme.yellow }, scoreData.glyphs, " "), /* @__PURE__ */ React.createElement(Text, { color: theme.dimGray }, scoreData.bar, " "), /* @__PURE__ */ React.createElement(Text, { color: theme.white, bold: true }, scoreData.text)), /* @__PURE__ */ React.createElement(Box, { marginTop: 1 }, /* @__PURE__ */ React.createElement(Text, { color: theme.cyan }, "Genres: "), /* @__PURE__ */ React.createElement(Text, { color: theme.lightGray }, animeInfo?.genres?.length ? animeInfo.genres.join(" \u2022 ") : "N/A")), /* @__PURE__ */ React.createElement(
    Box,
    {
      flexDirection: "column",
      marginTop: 1,
      borderStyle: "round",
      borderColor: focusArea === "synopsis" ? theme.yellow : theme.dimGray,
      paddingX: 1
    },
    /* @__PURE__ */ React.createElement(Box, { justifyContent: "space-between" }, /* @__PURE__ */ React.createElement(Text, { bold: true, color: theme.purple }, "Synopsis"), /* @__PURE__ */ React.createElement(Text, { color: theme.dimGray, dimColor: true }, focusArea === "synopsis" ? "\u2191\u2193 to scroll \u2502 Tab to actions" : "Tab or [/] to scroll")),
    visibleSynopsisLines.map((line, idx) => /* @__PURE__ */ React.createElement(Text, { key: idx, color: theme.white }, line))
  ), /* @__PURE__ */ React.createElement(
    Box,
    {
      marginTop: 1,
      flexDirection: "column",
      borderStyle: "round",
      borderColor: focusArea === "actions" ? theme.cyan : theme.dimGray,
      paddingX: 1
    },
    /* @__PURE__ */ React.createElement(Box, { justifyContent: "space-between" }, /* @__PURE__ */ React.createElement(Text, { bold: true, color: theme.cyan }, "Actions"), /* @__PURE__ */ React.createElement(Text, { color: theme.dimGray, dimColor: true }, focusArea === "actions" ? "\u2191\u2193 to select \u2502 Enter to confirm \u2502 Tab for synopsis" : "Tab to focus actions")),
    actionItems.map((item, idx) => {
      const isSelected = focusArea === "actions" && idx === selectedActionIndex;
      return /* @__PURE__ */ React.createElement(Box, { key: item.value }, /* @__PURE__ */ React.createElement(Text, { color: isSelected ? theme.yellow : theme.dimGray }, isSelected ? "\u25B8 " : "  "), /* @__PURE__ */ React.createElement(Text, { color: theme.dimGray }, idx + 1, ". "), /* @__PURE__ */ React.createElement(Text, { color: isSelected ? theme.white : theme.lightGray, bold: isSelected }, item.icon, " ", item.label));
    })
  ))));
}
var rawArgs = process.argv.slice(2);
var initialQuery = rawArgs.join(" ").trim();
function App() {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [termSize, setTermSize] = useState({ cols: stdout.columns || 80, rows: stdout.rows || 24 });
  useEffect(() => {
    const onResize = () => setTermSize({ cols: stdout.columns || 80, rows: stdout.rows || 24 });
    stdout.on("resize", onResize);
    return () => {
      stdout.off("resize", onResize);
    };
  }, [stdout]);
  const [screen, setScreen] = useState(initialQuery ? "search" : "main-menu");
  const [animes, setAnimes] = useState([]);
  const [selectedAnime, setSelectedAnime] = useState(null);
  const [animeInfo, setAnimeInfo] = useState(null);
  const [audioType, setAudioType] = useState("sub");
  const [episodes, setEpisodes] = useState([]);
  const [autoAdvanceData, setAutoAdvanceData] = useState(null);
  const [appSettings, setAppSettings] = useState(loadSettings());
  const [history, setHistory] = useState(getHistory());
  const [downloadQueue, setDownloadQueue] = useState([]);
  const [status, setStatus] = useState({
    message: "Welcome to NY-CLI!",
    type: "info",
    loading: false
  });
  const [bannerPhase, setBannerPhase] = useState(0);
  const [loggedIn, setLoggedIn] = useState(isLoggedIn());
  const [username, setUsername] = useState(getUsername());
  const [pendingUsername, setPendingUsername] = useState("");
  const [syncMessage, setSyncMessage] = useState("");
  const [autoPlayEpisode, setAutoPlayEpisode] = useState(null);
  const [showWelcome, setShowWelcome] = useState(!initialQuery);
  const [isExiting, setIsExiting] = useState(false);
  const [userPhotoUrl, setUserPhotoUrl] = useState(null);
  const [isDownloadMode, setIsDownloadMode] = useState(false);
  const [browseCategory, setBrowseCategory] = useState("trending");
  const [browseCategoryTitle, setBrowseCategoryTitle] = useState("Trending Now");
  const [browseGenre, setBrowseGenre] = useState("Action");
  const [browseSeason, setBrowseSeason] = useState("SPRING");
  const [browseYear, setBrowseYear] = useState(2026);
  const [browseSort, setBrowseSort] = useState("popularity");
  const [browsePage, setBrowsePage] = useState(1);
  const [browseHasNext, setBrowseHasNext] = useState(false);
  const [browseSource, setBrowseSource] = useState("");
  const [browseAnimes, setBrowseAnimes] = useState([]);
  const [genresList, setGenresList] = useState([]);
  const [browseReturnScreen, setBrowseReturnScreen] = useState("main-menu");
  const [playingEpisode, setPlayingEpisode] = useState(null);
  const [playingPaused, setPlayingPaused] = useState(false);
  const [playingProviders, setPlayingProviders] = useState([]);
  const [playingProviderIndex, setPlayingProviderIndex] = useState(0);
  const [playingAttempts, setPlayingAttempts] = useState([]);
  const togglePause = () => {
    if (os2.platform() === "win32") return;
    const cmd = resolvePlayerCommand(appSettings);
    if (cmd === "vlc") {
      setStatus({ message: "Pause via hotkey is mpv-only (VLC uses its own controls)", type: "info", loading: false });
      return;
    }
    if (playingPaused) {
      spawnSync("killall", ["-CONT", cmd]);
      setPlayingPaused(false);
    } else {
      spawnSync("killall", ["-STOP", cmd]);
      setPlayingPaused(true);
    }
  };
  const tryNextCandidate = (currentIndex, providerList, resolveAttempts, reason, playContext) => {
    const nextIndex = currentIndex + 1;
    if (nextIndex < providerList.length) {
      const nextProvider = providerList[nextIndex];
      setPlayingProviderIndex(nextIndex);
      setStatus({
        message: `${providerList[currentIndex]?.name || "Candidate"} failed (${reason}). Trying ${nextProvider.name}...`,
        type: "warning",
        loading: true
      });
      playProvider(nextProvider, nextIndex, providerList, resolveAttempts, playContext);
    } else {
      const attemptSummary = resolveAttempts?.length ? resolveAttempts.map((a) => `${a.provider}: ${a.error || (a.success ? "ok" : "failed")}`).join("; ") : reason;
      setStatus({
        message: `All candidates failed. Attempts: ${attemptSummary}`,
        type: "error",
        loading: false
      });
    }
  };
  const playProvider = async (provider, providerIndex = 0, providerList = playingProviders, resolveAttempts = playingAttempts, playContext) => {
    const cmd = resolvePlayerCommand(appSettings);
    if (provider.type === "torrent") {
      setStatus({ message: `Starting ${provider.name}...`, type: "success", loading: false });
      const wtCmd = os2.platform() === "win32" ? "npx.cmd" : "npx";
      const playerFlag = cmd === "vlc" ? "--vlc" : "--mpv";
      const proc = spawn(wtCmd, ["-y", "webtorrent-cli", provider.magnet, playerFlag], { stdio: "ignore", detached: true });
      proc.on("error", (err) => {
        setStatus({ message: `Failed to launch webtorrent: ${err.message}`, type: "error", loading: false });
      });
      proc.unref();
    } else if (provider.type === "embed") {
      setStatus({ message: `Opening ${provider.name} in browser...`, type: "info", loading: false });
      try {
        const platform = process.platform;
        let bCmd = "xdg-open";
        let bArgs = [provider.url];
        if (platform === "darwin") {
          bCmd = "open";
        } else if (platform === "win32") {
          bCmd = "cmd";
          bArgs = ["/c", "start", "", provider.url];
        }
        const bChild = spawn(bCmd, bArgs, { stdio: "ignore", detached: true });
        bChild.on("error", (err) => {
          setStatus({ message: `Failed to open browser: ${err.message}`, type: "error", loading: false });
        });
        bChild.unref();
      } catch (err) {
        setStatus({ message: `Failed to open browser: ${err.message}`, type: "error", loading: false });
      }
    } else {
      setStatus({ message: `Starting ${provider.name} in ${cmd.toUpperCase()}...`, type: "success", loading: false });
      const epNo = playContext?.epNo ?? playingEpisode?.number ?? 1;
      const malId = playContext?.malId ?? (animeInfo?.malId || void 0);
      const animeTitle = playContext?.animeTitle || selectedAnime?.label || animeInfo?.name || animeInfo?.titles?.english || "Anime";
      const streamMode = playContext?.mode || (audioType === "dub" ? "dub" : "sub");
      const playerTitle = `${animeTitle}, Episode ${epNo}`;
      let skipArgs = [];
      if (cmd === "mpv" && appSettings.skipMode && appSettings.skipMode !== "off" && malId) {
        try {
          skipArgs = await getMpvSkipArgs(malId, epNo, appSettings.skipMode);
        } catch {
        }
      }
      const args = buildPlayerArgs(cmd, provider.url, provider.headers, playerTitle, provider.subtitle, {
        audioType: streamMode,
        skipArgs
      });
      const proc = spawn(cmd, args, { stdio: "ignore" });
      let fiveSecPassed = false;
      const timer = setTimeout(() => {
        fiveSecPassed = true;
      }, 5e3);
      proc.on("error", (err) => {
        clearTimeout(timer);
        tryNextCandidate(providerIndex, providerList, resolveAttempts, `Launch error: ${err.message}`, playContext);
      });
      proc.on("exit", (code) => {
        clearTimeout(timer);
        if (!fiveSecPassed && code !== 0 && code !== null) {
          tryNextCandidate(providerIndex, providerList, resolveAttempts, `Player exited with code ${code}`, playContext);
        }
      });
      proc.unref();
    }
  };
  useEffect(() => {
    const onQuitRequested = () => setIsExiting(true);
    quitBus.on("quit", onQuitRequested);
    return () => {
      quitBus.off("quit", onQuitRequested);
    };
  }, []);
  useEffect(() => {
    if (isExiting) return;
    const timer = setInterval(() => {
      setBannerPhase((p) => (p + 1) % 50);
    }, 120);
    return () => clearInterval(timer);
  }, [isExiting]);
  useEffect(() => {
    if (initialQuery) {
      handleSearch(initialQuery);
    }
  }, []);
  useEffect(() => {
    if (screen === "profile" && loggedIn && !userPhotoUrl) {
      const token = getToken();
      if (token) {
        verifyFirebaseUser(token).then((result) => {
          if (result.photoUrl) {
            setUserPhotoUrl(result.photoUrl);
          }
        }).catch(() => {
        });
      }
    }
  }, [screen, loggedIn, userPhotoUrl]);
  const loggedInMenuItems = [
    { value: "profile", label: "Profile", icon: "[P]" },
    { value: "continue", label: "Continue Watching", icon: "[>]" },
    { value: "search", label: "Search", icon: "[S]" },
    { value: "browse", label: "Browse", icon: "[B]" },
    { value: "downloads", label: downloadQueue.length > 0 ? `Downloads (${downloadQueue.length})` : "Downloads", icon: "[\u{1F4E5}]" },
    { value: "random", label: "Random Anime", icon: "[\u{1F3B2}]" },
    { value: "settings", label: "Settings", icon: "[\u2699]" },
    { value: "help", label: "Help", icon: "[?]" },
    { value: "exit", label: "Exit", icon: "[X]" }
  ];
  const loggedOutMenuItems = [
    { value: "search", label: "Search", icon: "[S]" },
    { value: "browse", label: "Browse", icon: "[B]" },
    { value: "downloads", label: downloadQueue.length > 0 ? `Downloads (${downloadQueue.length})` : "Downloads", icon: "[\u{1F4E5}]" },
    { value: "random", label: "Random Anime", icon: "[\u{1F3B2}]" },
    { value: "settings", label: "Settings", icon: "[\u2699]" },
    { value: "login", label: "Login", icon: "[L]" },
    { value: "help", label: "Help", icon: "[?]" },
    { value: "exit", label: "Exit", icon: "[X]" }
  ];
  const handleMenuSelect = useCallback((item) => {
    const action = item.value;
    if (action === "exit") {
      setIsExiting(true);
    } else if (action === "search") {
      setScreen("search");
      setStatus({ message: "Enter anime name to search", type: "info", loading: false });
    } else if (action === "browse") {
      setScreen("browse-category");
      setStatus({ message: "Browse anime categories", type: "info", loading: false });
    } else if (action === "downloads") {
      setScreen("downloading");
      setStatus({ message: "Downloads Queue", type: "info", loading: false });
    } else if (action === "random") {
      handleRandomAnime();
    } else if (action === "continue") {
      handleContinue();
    } else if (action === "login") {
      handleStartLogin();
    } else if (action === "profile") {
      setScreen("login-token");
    } else if (screen === "login-token" || screen === "login-waiting") {
      setScreen("main-menu");
    } else if (action === "settings") {
      setScreen("settings");
    } else if (action === "help") {
      setScreen("help");
    }
  }, [downloadQueue.length, screen]);
  const handleSearch = useCallback(async (query) => {
    setStatus({ message: `Searching "${query}"...`, type: "info", loading: true });
    try {
      const data = await getJson(`/api/aniwatch?action=search&q=${encodeURIComponent(query)}&page=1`);
      const results = (data?.animes || []).slice(0, 20);
      if (!results.length) {
        setStatus({ message: "No anime found. Try different keywords.", type: "warning", loading: false });
        return;
      }
      setAnimes(results);
      setScreen("anime-select");
      setStatus({ message: `Found ${results.length} anime`, type: "success", loading: false });
    } catch (err) {
      setStatus({ message: `Search failed: ${err.message}`, type: "error", loading: false });
    }
  }, []);
  const handleRandomAnime = useCallback(async () => {
    setStatus({ message: "Finding random anime...", type: "info", loading: true });
    try {
      const data = await getJson("/api/aniwatch?action=random");
      const randomAnime = data?.randomAnime;
      if (!randomAnime) {
        setStatus({ message: "Could not find random anime", type: "warning", loading: false });
        return;
      }
      setStatus({ message: `Playing ${randomAnime.name}...`, type: "info", loading: true });
      const info = await getJson(`/api/aniwatch?action=info&id=${encodeURIComponent(randomAnime.id)}`);
      const eps = info?.episodes?.sub || info?.episodes?.dub || [];
      if (eps.length === 0) {
        setStatus({ message: "No episodes found", type: "warning", loading: false });
        return;
      }
      setSelectedAnime({
        id: randomAnime.id,
        value: randomAnime.id,
        label: randomAnime.name,
        poster: randomAnime.poster
      });
      setAnimeInfo(info);
      setAudioType(info?.episodes?.sub?.length ? "sub" : "dub");
      setEpisodes(eps);
      const firstEp = eps[0];
      setAutoPlayEpisode({ episodeId: firstEp.episodeId, number: 1 });
      setScreen("episode-select");
      setStatus({ message: `Starting ${randomAnime.name} Episode 1...`, type: "success", loading: true });
    } catch (err) {
      setStatus({ message: `Failed: ${err.message}`, type: "error", loading: false });
    }
  }, []);
  const handleContinue = useCallback(() => {
    const hist = getHistory();
    setHistory(hist);
    if (hist.length === 0) {
      setStatus({ message: "No watch history yet", type: "info", loading: false });
      return;
    }
    setScreen("continue");
    setStatus({ message: `${hist.length} anime in history`, type: "success", loading: false });
  }, []);
  const handleStartLogin = useCallback(() => {
    setStatus({ message: "Opening browser for login...", type: "info", loading: true });
    setScreen("login-waiting");
    const loginState = crypto.randomBytes(16).toString("hex");
    let server = null;
    let timeoutId = null;
    const cleanupServer = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      if (server) {
        try {
          server.close();
        } catch {
        }
        server = null;
      }
    };
    server = http.createServer((req, res) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "OPTIONS, POST");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }
      if (req.method === "POST" && req.url === "/callback") {
        setStatus({ message: "Received callback connection...", type: "info", loading: true });
        let body = "";
        req.on("data", (chunk) => body += chunk.toString());
        req.on("end", () => {
          try {
            const data = JSON.parse(body);
            if (data.token && data.username && data.state === loginState) {
              setStatus({ message: "Callback verified, logging in...", type: "info", loading: true });
              setPendingUsername(data.username);
              handleLoginToken(data.token, data.username, data.idToken, data.refreshToken);
              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ success: true }));
              cleanupServer();
              return;
            } else {
              res.writeHead(400, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ error: "invalid_token_or_state" }));
            }
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "invalid_json" }));
          }
        });
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    const openBrowserWithPort = (port) => {
      const authUrl = `${API_BASE}/api/auth/login?port=${port}&state=${loginState}`;
      try {
        const platform = process.platform;
        let cmd = "xdg-open";
        let args = [authUrl];
        if (platform === "darwin") {
          cmd = "open";
        } else if (platform === "win32") {
          cmd = "cmd";
          args = ["/c", "start", "", authUrl];
        }
        const child = spawn(cmd, args, { stdio: "ignore", detached: true });
        child.on("error", (err) => {
          setStatus({ message: "Failed to open browser: " + err.message, type: "error", loading: false });
        });
        child.unref();
      } catch (err) {
        setStatus({ message: "Failed to open browser: " + (err?.message || String(err)), type: "error", loading: false });
      }
    };
    server.on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        try {
          const fallbackServer = http.createServer(server.listeners("request")[0]);
          server.close();
          server = fallbackServer;
          fallbackServer.on("error", (fallbackErr) => {
            setStatus({ message: "Login server error: " + fallbackErr.message, type: "error", loading: false });
            cleanupServer();
          });
          fallbackServer.listen(0, "127.0.0.1", () => {
            const addr = fallbackServer.address();
            const chosenPort = typeof addr === "object" && addr ? addr.port : 4e3;
            openBrowserWithPort(chosenPort);
          });
        } catch (fallbackErr) {
          setStatus({ message: "Login server error: " + fallbackErr.message, type: "error", loading: false });
          cleanupServer();
        }
      } else {
        setStatus({ message: "Login server error: " + err.message, type: "error", loading: false });
        cleanupServer();
      }
    });
    server.listen(4e3, "127.0.0.1", () => {
      openBrowserWithPort(4e3);
    });
    timeoutId = setTimeout(() => {
      cleanupServer();
      if (!isLoggedIn()) {
        setStatus({ message: "Login timed out", type: "error", loading: false });
        setScreen("main-menu");
      }
    }, 5 * 60 * 1e3);
  }, []);
  const handleLoginToken = useCallback(async (firebaseUid, providedUsername, idToken, refreshToken) => {
    if (!firebaseUid.trim()) {
      setStatus({ message: "User ID cannot be empty", type: "error", loading: false });
      return;
    }
    setStatus({ message: "Verifying account...", type: "info", loading: true });
    try {
      const result = await verifyFirebaseUser(firebaseUid.trim());
      if (result.valid) {
        const finalUsername = result.username || providedUsername || pendingUsername;
        saveAuth(finalUsername, firebaseUid.trim(), idToken, refreshToken);
        setLoggedIn(true);
        setUsername(finalUsername);
        setStatus({ message: `Welcome, ${finalUsername}!`, type: "success", loading: false });
        if (result.photoUrl) {
          setUserPhotoUrl(result.photoUrl);
        }
        setSyncMessage("Syncing with cloud...");
        mergeCloudHistory().then(({ message }) => {
          setSyncMessage(message);
          setHistory(getHistory());
          setTimeout(() => setSyncMessage(""), 3e3);
        });
        setScreen("main-menu");
      } else {
        const fallbackUser = providedUsername || pendingUsername;
        saveAuth(fallbackUser, firebaseUid.trim());
        setLoggedIn(true);
        setUsername(fallbackUser);
        setScreen("main-menu");
        setStatus({ message: `Logged in as ${fallbackUser} (unverified)`, type: "warning", loading: false });
      }
    } catch (err) {
      const fallbackUser = providedUsername || pendingUsername;
      saveAuth(fallbackUser, firebaseUid.trim());
      setLoggedIn(true);
      setUsername(fallbackUser);
      setScreen("main-menu");
      setStatus({ message: "Logged in (offline mode)", type: "warning", loading: false });
    }
  }, [pendingUsername]);
  const handleLogout = useCallback(() => {
    logout();
    setLoggedIn(false);
    setUsername("");
    setPendingUsername("");
    setUserPhotoUrl(null);
    setScreen("main-menu");
    setStatus({ message: "Logged out. See you soon!", type: "info", loading: false });
  }, []);
  const goBack = useCallback(() => {
    if (screen === "episode-select") {
      if (isDownloadMode) {
        setIsDownloadMode(false);
        setScreen("anime-details");
        setStatus({ message: selectedAnime?.label || animeInfo?.name || "Anime Details", type: "info", loading: false });
      } else {
        setScreen("audio-select");
        setStatus({ message: "Select audio type", type: "info", loading: false });
      }
    } else if (screen === "audio-select") {
      setScreen("anime-details");
      setStatus({ message: selectedAnime?.label || animeInfo?.name || "Anime Details", type: "info", loading: false });
    } else if (screen === "anime-details") {
      if (browseReturnScreen === "browse-results") {
        setScreen("browse-results");
        setStatus({ message: `Browse: ${browseCategory === "genre" ? browseGenre : browseCategoryTitle} (Page ${browsePage})`, type: "info", loading: false });
      } else if (browseReturnScreen === "browse-category") {
        setScreen("browse-category");
        setStatus({ message: "Browse anime categories", type: "info", loading: false });
      } else {
        setScreen("anime-select");
        setStatus({ message: `Found ${animes.length} anime`, type: "success", loading: false });
      }
    } else if (screen === "browse-results") {
      if (browseCategory === "genre") {
        setScreen("browse-genre");
        setStatus({ message: "Select a genre", type: "info", loading: false });
      } else if (browseCategory === "season") {
        setScreen("browse-season");
        setStatus({ message: "Select season and year", type: "info", loading: false });
      } else {
        setScreen("browse-category");
        setStatus({ message: "Browse anime categories", type: "info", loading: false });
      }
    } else if (screen === "browse-genre" || screen === "browse-season") {
      setScreen("browse-category");
      setStatus({ message: "Browse anime categories", type: "info", loading: false });
    } else if (screen === "browse-category") {
      setScreen("main-menu");
      setStatus({ message: "Welcome to NY-CLI!", type: "info", loading: false });
    } else if (screen === "login-token") {
      setScreen("login");
      setPendingUsername("");
      setStatus({ message: "Enter your NyAnime username", type: "info", loading: false });
    } else if (["anime-select", "continue", "search", "profile", "login", "settings", "help", "downloading"].includes(screen)) {
      setScreen("main-menu");
      setStatus({ message: "Welcome to NY-CLI!", type: "info", loading: false });
    }
  }, [screen, browseReturnScreen, browseCategory, browseGenre, browseCategoryTitle, browsePage, animes.length, selectedAnime, animeInfo]);
  const handleEpisodeAction = useCallback((action, item) => {
    if (action === "d" || action === "a") {
      const itemsToDownload = action === "a" ? episodes.map((e, idx) => ({
        ...e,
        label: `Episode ${e.number || idx + 1}`,
        value: `ep-${e.number || idx + 1}`,
        episodeId: e.episodeId || e.id,
        number: e.number || idx + 1
      })) : [item];
      const anilistId = animeInfo?.anilistId || (String(animeInfo?.id || "").startsWith("anilist::") ? String(animeInfo.id).replace("anilist::", "") : "");
      const malId = animeInfo?.malId;
      const titles = animeInfo?.titles || {
        english: animeInfo?.name || selectedAnime?.label,
        romaji: animeInfo?.jname || selectedAnime?.label,
        native: ""
      };
      const year = animeInfo?.year;
      const newTasks = itemsToDownload.map((ep) => ({
        id: ep.episodeId || ep.id,
        anilistId,
        malId,
        titles,
        year,
        animeTitle: selectedAnime?.label || animeInfo?.name || "Anime",
        episodeNumber: ep.number || ep.epNo || 1,
        status: "pending",
        progress: 0,
        message: "Waiting..."
      }));
      setDownloadQueue((prev) => [...prev, ...newTasks]);
      setScreen("downloading");
    }
  }, [episodes, selectedAnime, animeInfo]);
  const handleAnimeSelect = useCallback(async (item) => {
    setStatus({ message: `Loading "${item.label}"...`, type: "info", loading: true });
    setBrowseReturnScreen(screen);
    try {
      const data = await getJson(`/api/aniwatch?action=info&id=${encodeURIComponent(item.id)}`);
      const eps = data?.episodes?.sub?.length ? data.episodes.sub : data?.episodes?.dub || [];
      const totalCount = eps.length || data?.totalEpisodes || data?.stats?.episodes?.sub || 0;
      if (totalCount === 0 && (!data?.status || data.status === "FINISHED") && !data?.name) {
        setStatus({ message: "No episodes found", type: "warning", loading: false });
        return;
      }
      setSelectedAnime(item);
      setAnimeInfo(data);
      setScreen("anime-details");
      setStatus({ message: `${item.label} Details`, type: "info", loading: false });
    } catch (err) {
      setStatus({ message: `Failed to load: ${err.message}`, type: "error", loading: false });
    }
  }, [screen]);
  const handleWatchFromDetails = useCallback(() => {
    setIsDownloadMode(false);
    const histEntry = history.find((h) => h.id === animeInfo?.id);
    if (histEntry) {
      const type = histEntry.category || "sub";
      setAudioType(type);
      const eps = animeInfo?.episodes?.[type] || animeInfo?.episodes?.sub || [];
      setEpisodes(eps);
      let targetEpisode = histEntry.episode || 1;
      const progress = getWatchProgress(animeInfo.id, targetEpisode);
      const watchPercentage = progress ? getWatchPercentage(progress.watchTime, progress.duration) : 0;
      if (watchPercentage >= 90 && targetEpisode < eps.length) {
        const nextEp = eps.find((e) => e.number === targetEpisode + 1);
        const currEp = eps.find((e) => e.number === targetEpisode);
        if (nextEp && currEp) {
          setAutoAdvanceData({
            currentEpisode: currEp,
            nextEpisode: nextEp,
            percentage: watchPercentage
          });
          setScreen("auto-advance");
          setStatus({ message: `Episode ${targetEpisode} is almost complete.`, type: "info", loading: false });
          return;
        }
      }
      setScreen("episode-select");
      setStatus({ message: `Continue Episode ${targetEpisode}`, type: "success", loading: false });
    } else {
      setScreen("audio-select");
      setStatus({ message: "Select audio type", type: "info", loading: false });
    }
  }, [animeInfo, history]);
  const handleDownloadFromDetails = useCallback(() => {
    const hasDub = Boolean(animeInfo?.episodes?.dub?.length);
    if (hasDub) {
      setIsDownloadMode(true);
      setScreen("audio-select");
      setStatus({ message: "Select audio type to download", type: "info", loading: false });
    } else {
      const type = "sub";
      setAudioType(type);
      let eps = animeInfo?.episodes?.[type]?.length ? animeInfo.episodes[type] : animeInfo?.episodes?.sub?.length ? animeInfo.episodes.sub : animeInfo?.episodes?.dub?.length ? animeInfo.episodes.dub : [];
      if (!eps || !eps.length) {
        const count = animeInfo?.totalEpisodes || animeInfo?.stats?.episodes?.sub || 1;
        eps = Array.from({ length: Math.max(1, count) }, (_, idx) => ({
          id: `ep::fallback::${animeInfo?.id || "unknown"}::${idx + 1}`,
          number: idx + 1,
          title: count === 1 ? animeInfo?.name || "Full Feature" : `Episode ${idx + 1}`,
          isFiller: false
        }));
      }
      setEpisodes(eps);
      setIsDownloadMode(true);
      setScreen("episode-select");
      setStatus({ message: "Select episode to download (Enter / [d] for single, [a] for all)", type: "info", loading: false });
    }
  }, [animeInfo]);
  const handlePlayTrailer = useCallback(() => {
    const trailer = animeInfo?.trailer;
    let trailerUrl = trailer?.url;
    if (!trailerUrl && trailer?.id) {
      if (!trailer.site || trailer.site.toLowerCase() === "youtube") {
        trailerUrl = `https://www.youtube.com/watch?v=${trailer.id}`;
      } else {
        trailerUrl = trailer.id;
      }
    }
    if (!trailerUrl) {
      setStatus({ message: "No trailer available", type: "warning", loading: false });
      return;
    }
    const cmd = resolvePlayerCommand(appSettings);
    const title = `NY-CLI Trailer: ${animeInfo?.titles?.english || animeInfo?.name || selectedAnime?.label || "Trailer"}`;
    const args = cmd === "mpv" ? [`--title=${title}`, trailerUrl] : [trailerUrl];
    setStatus({ message: `Opening trailer in ${cmd.toUpperCase()}...`, type: "info", loading: false });
    try {
      const proc = spawn(cmd, args, { stdio: "ignore", detached: true });
      proc.on("error", (err) => {
        setStatus({ message: `Failed to launch player: ${err.message}`, type: "error", loading: false });
      });
      proc.unref();
      setStatus({ message: `Playing trailer in ${cmd.toUpperCase()}`, type: "success", loading: false });
    } catch (err) {
      setStatus({ message: `Failed to launch player: ${err.message}`, type: "error", loading: false });
    }
  }, [animeInfo, selectedAnime, appSettings]);
  const handleToggleMyList = useCallback(() => {
    if (!animeInfo?.id) return;
    if (isInMyList(animeInfo.id)) {
      removeFromMyList(animeInfo.id);
      setStatus({ message: `Removed "${animeInfo.titles?.english || animeInfo.name || selectedAnime?.label}" from My List`, type: "info", loading: false });
    } else {
      addToMyList({
        id: animeInfo.id,
        name: animeInfo.titles?.english || animeInfo.name || selectedAnime?.label || "Anime",
        poster: animeInfo.poster || selectedAnime?.imageUrl,
        format: animeInfo.format,
        year: animeInfo.year,
        addedAt: Date.now()
      });
      setStatus({ message: `Added "${animeInfo.titles?.english || animeInfo.name || selectedAnime?.label}" to My List`, type: "success", loading: false });
    }
  }, [animeInfo, selectedAnime]);
  const fetchBrowseResults = useCallback(async (cat, opts = {}) => {
    const p = opts.page ?? 1;
    const g = opts.genre ?? browseGenre;
    const s = opts.season ?? browseSeason;
    const y = opts.year ?? browseYear;
    const srt = opts.sort ?? browseSort;
    setStatus({ message: `Fetching ${cat === "genre" ? g : cat === "season" ? `${s} ${y}` : cat} (page ${p})...`, type: "info", loading: true });
    try {
      let url = `/api/aniwatch?action=browse&category=${encodeURIComponent(cat)}&page=${p}`;
      if (cat === "genre") {
        url += `&genre=${encodeURIComponent(g)}&sort=${encodeURIComponent(srt)}`;
      } else if (cat === "season") {
        url += `&season=${encodeURIComponent(s)}&year=${encodeURIComponent(y)}`;
      }
      const data = await getJson(url);
      const items = data?.animes || [];
      if (!items.length) {
        setStatus({ message: `No anime found for ${cat} (page ${p})`, type: "warning", loading: false });
        return;
      }
      setBrowseAnimes(items);
      setBrowseCategory(cat);
      setBrowsePage(data?.currentPage || p);
      setBrowseHasNext(!!data?.hasNextPage);
      setBrowseSource(data?.provider || "unknown");
      setScreen("browse-results");
      setStatus({
        message: `${cat === "genre" ? `${g} (${srt})` : cat === "season" ? `${s} ${y}` : cat} \u2022 Page ${p} [Source: ${data?.provider || "unknown"}]`,
        type: "success",
        loading: false
      });
    } catch (err) {
      setStatus({ message: `Browse failed: ${err.message}`, type: "error", loading: false });
    }
  }, [browseGenre, browseSeason, browseYear, browseSort]);
  const handleBrowsePageNext = useCallback(async () => {
    const nextPage = browsePage + 1;
    await fetchBrowseResults(browseCategory, { page: nextPage, genre: browseGenre, season: browseSeason, year: browseYear, sort: browseSort });
  }, [browsePage, browseCategory, browseGenre, browseSeason, browseYear, browseSort, fetchBrowseResults]);
  const handleBrowsePagePrev = useCallback(async () => {
    if (browsePage <= 1) return;
    const prevPage = browsePage - 1;
    await fetchBrowseResults(browseCategory, { page: prevPage, genre: browseGenre, season: browseSeason, year: browseYear, sort: browseSort });
  }, [browsePage, browseCategory, browseGenre, browseSeason, browseYear, browseSort, fetchBrowseResults]);
  const handleBrowseSortToggle = useCallback(async () => {
    if (browseCategory !== "genre") return;
    const sorts = ["popularity", "score", "trending", "title"];
    const currentIdx = sorts.indexOf(browseSort);
    const nextSort = sorts[(currentIdx + 1) % sorts.length];
    setBrowseSort(nextSort);
    await fetchBrowseResults("genre", { page: 1, genre: browseGenre, sort: nextSort });
  }, [browseCategory, browseSort, browseGenre, fetchBrowseResults]);
  const handleSurpriseMe = useCallback(async () => {
    setStatus({ message: "Finding surprise anime...", type: "info", loading: true });
    try {
      const randomPage = Math.floor(Math.random() * 3) + 1;
      const cat = Math.random() > 0.5 ? "top-rated" : "trending";
      const data = await getJson(`/api/aniwatch?action=browse&category=${cat}&page=${randomPage}`);
      const items = data?.animes || [];
      if (items.length > 0) {
        const pick = items[Math.floor(Math.random() * items.length)];
        setStatus({ message: `Surprise: "${pick.name}"!`, type: "success", loading: false });
        setBrowseReturnScreen("browse-category");
        handleAnimeSelect({
          id: pick.id,
          label: pick.name,
          imageUrl: pick.poster
        });
      } else {
        setStatus({ message: "Could not find surprise anime", type: "warning", loading: false });
      }
    } catch (err) {
      setStatus({ message: `Surprise failed: ${err.message}`, type: "error", loading: false });
    }
  }, [handleAnimeSelect]);
  const handleBrowseCategorySelect = useCallback(async (item) => {
    const cat = item.value || "trending";
    setBrowseCategory(cat);
    setBrowseCategoryTitle(item.label);
    if (cat === "surprise") {
      handleSurpriseMe();
    } else if (cat === "genre") {
      setStatus({ message: "Loading genres...", type: "info", loading: true });
      try {
        const data = await getJson("/api/aniwatch?action=genres");
        const list = data?.genres || [];
        setGenresList(list);
        setBrowseSource(data?.provider || "unknown");
        setScreen("browse-genre");
        setStatus({ message: `Select a genre (${data?.provider || "unknown"})`, type: "info", loading: false });
      } catch (err) {
        setStatus({ message: `Failed to load genres: ${err.message}`, type: "error", loading: false });
      }
    } else if (cat === "season") {
      setScreen("browse-season");
      setStatus({ message: "Select season and year", type: "info", loading: false });
    } else {
      setBrowsePage(1);
      await fetchBrowseResults(cat, { page: 1 });
    }
  }, [fetchBrowseResults, handleSurpriseMe]);
  const handleBrowseGenreSelect = useCallback(async (item) => {
    const selectedGenre = item.value || item.label;
    setBrowseGenre(selectedGenre);
    setBrowseSort("popularity");
    setBrowsePage(1);
    await fetchBrowseResults("genre", { genre: selectedGenre, sort: "popularity", page: 1 });
  }, [fetchBrowseResults]);
  const handleBrowseSeasonSelect = useCallback(async (item) => {
    const [s, yStr] = (item.value || "SPRING-2026").split("-");
    const y = parseInt(yStr, 10) || 2026;
    setBrowseSeason(s);
    setBrowseYear(y);
    setBrowsePage(1);
    await fetchBrowseResults("season", { season: s, year: y, page: 1 });
  }, [fetchBrowseResults]);
  const handleAudioSelect = useCallback((item) => {
    const type = item.value;
    setAudioType(type);
    let eps = animeInfo?.episodes?.[type]?.length ? animeInfo.episodes[type] : animeInfo?.episodes?.sub?.length ? animeInfo.episodes.sub : animeInfo?.episodes?.dub?.length ? animeInfo.episodes.dub : [];
    if (!eps || !eps.length) {
      const count = animeInfo?.totalEpisodes || animeInfo?.stats?.episodes?.sub || 1;
      eps = Array.from({ length: Math.max(1, count) }, (_, idx) => ({
        id: `ep::fallback::${animeInfo?.id || "unknown"}::${idx + 1}`,
        number: idx + 1,
        title: count === 1 ? animeInfo?.name || "Full Feature" : `Episode ${idx + 1}`,
        isFiller: false
      }));
    }
    setEpisodes(eps);
    setScreen("episode-select");
    setStatus({ message: `${eps.length} episode${eps.length === 1 ? "" : "s"} (${type === "sub" ? "subbed" : "dubbed"})`, type: "success", loading: false });
  }, [animeInfo]);
  const handleHistorySelect = useCallback(async (item) => {
    setStatus({ message: `Loading "${item.label}"...`, type: "info", loading: true });
    try {
      const data = await getJson(`/api/aniwatch?action=info&id=${encodeURIComponent(item.id)}`);
      setSelectedAnime(item);
      setAnimeInfo(data);
      const histEntry = history.find((h) => h.id === item.id);
      const type = histEntry?.category || "sub";
      setAudioType(type);
      const eps = data?.episodes?.[type] || [];
      setEpisodes(eps);
      let targetEpisode = histEntry?.episode || 1;
      const progress = getWatchProgress(item.id, targetEpisode);
      const watchPercentage = progress ? getWatchPercentage(progress.watchTime, progress.duration) : 0;
      if (watchPercentage >= 90 && targetEpisode < eps.length) {
        const nextEp = eps.find((e) => e.number === targetEpisode + 1);
        const currEp = eps.find((e) => e.number === targetEpisode);
        if (nextEp && currEp) {
          setAutoAdvanceData({
            currentEpisode: currEp,
            nextEpisode: nextEp,
            percentage: watchPercentage
          });
          setScreen("auto-advance");
          setStatus({ message: `Episode ${targetEpisode} is almost complete.`, type: "info", loading: false });
          return;
        }
      }
      setScreen("episode-select");
      if (watchPercentage > 0 && watchPercentage < 97) {
        setStatus({ message: `Continue Episode ${targetEpisode} from ${formatTime(progress?.watchTime || 0)}`, type: "success", loading: false });
      } else {
        setStatus({ message: `${eps.length} episodes available`, type: "success", loading: false });
      }
    } catch (err) {
      setStatus({ message: `Failed: ${err.message}`, type: "error", loading: false });
    }
  }, [history]);
  const handleEpisodeSelect = useCallback(async (item, startPosition) => {
    setStatus({ message: `Getting stream for Episode ${item.number}...`, type: "info", loading: true });
    try {
      const animeTitle = selectedAnime?.label || animeInfo?.name || "";
      const animeJName = animeInfo?.jname || "";
      const totalEps = episodes.length || 0;
      const epNo = item.number || 1;
      const mode = audioType === "dub" ? "dub" : "sub";
      const epIdParts = String(item.episodeId || item.id || "").split("::");
      const malId = epIdParts[0] === "ep" && epIdParts[1] === "jikan" ? Number(epIdParts[2]) : epIdParts[0] === "ep" && !isNaN(Number(epIdParts[1])) ? Number(epIdParts[1]) : animeInfo?.malId || void 0;
      const anilistId = animeInfo?.anilistId || (String(animeInfo?.id || "").startsWith("anilist::") ? String(animeInfo.id).replace("anilist::", "") : "");
      const englishTitle = animeInfo?.titles?.english || "";
      const romajiTitle = animeInfo?.titles?.romaji || animeJName || "";
      const nativeTitle = animeInfo?.titles?.native || "";
      const year = animeInfo?.year || "";
      const safeTitle = (animeTitle || "Anime").replace(/[^a-zA-Z0-9_\-]/g, "_");
      const localFile = path3.join(os2.homedir(), "Downloads", "ny-cli", safeTitle, `${safeTitle}_Ep${epNo}.mp4`);
      const providers = [];
      if (fs4.existsSync(localFile)) {
        providers.push({
          name: "Local File (Downloaded)",
          type: "direct",
          url: localFile
        });
      }
      setStatus({ message: `Resolving stream for Episode ${epNo}...`, type: "info", loading: true });
      const queryParams = new URLSearchParams({
        title: animeTitle,
        epNo: String(epNo),
        mode
      });
      if (malId) queryParams.set("malId", String(malId));
      if (anilistId) queryParams.set("anilistId", String(anilistId));
      if (englishTitle) queryParams.set("englishTitle", englishTitle);
      if (romajiTitle) queryParams.set("romajiTitle", romajiTitle);
      if (nativeTitle) queryParams.set("nativeTitle", nativeTitle);
      if (year) queryParams.set("year", String(year));
      let streamRes = null;
      try {
        streamRes = await getJson(`/api/resolve-stream?${queryParams.toString()}`);
      } catch (err) {
        streamRes = { candidates: [], attempts: err.attempts || [] };
      }
      const candidates = streamRes?.candidates || (streamRes?.url ? [streamRes] : []);
      const attempts = streamRes?.attempts || [];
      for (const c of candidates) {
        if (c.url) {
          providers.push({
            name: `${c.provider || "Provider"} (${c.quality || c.type?.toUpperCase() || "Stream"})`,
            type: c.type || "direct",
            url: c.url,
            subtitle: c.subtitleTracks?.[0]?.src || c.subtitle,
            headers: c.referer ? { Referer: c.referer, Origin: new URL(c.referer).origin } : c.headers,
            candidate: c
          });
        }
      }
      if (providers.length === 0) {
        setStatus({ message: "No direct stream found, trying torrent (slower)...", type: "info", loading: true });
        let torrentData = null;
        try {
          const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Torrent search stall timeout")), 8e3));
          torrentData = await Promise.race([
            getJson(`/api/torrent?title=${encodeURIComponent(animeTitle)}&ep=${epNo}`),
            timeoutPromise
          ]);
        } catch {
          torrentData = null;
        }
        if (torrentData?.magnet) {
          providers.push({ name: "Nyaa (Torrent)", type: "torrent", magnet: torrentData.magnet });
        }
      }
      if (providers.length === 0) {
        const attemptSummary = attempts.length ? attempts.map((a) => `${a.provider}: ${a.error || (a.success ? "ok" : "failed")}`).join("; ") : "no candidates available";
        setStatus({ message: `No playable source found (${attemptSummary})`, type: "error", loading: false });
        return;
      }
      setPlayingProviders(providers);
      setPlayingProviderIndex(0);
      setPlayingAttempts(attempts);
      setPlayingEpisode(item);
      setPlayingPaused(false);
      setScreen("playing");
      playProvider(providers[0], 0, providers, attempts, { malId, epNo, animeTitle, mode });
      const epAnimeTitle = selectedAnime?.label || animeInfo?.name || animeInfo?.title || "";
      const animeId = selectedAnime?.id || "";
      const episodeNum = item.number || 1;
      if (animeId && epAnimeTitle) {
        saveToHistory({ id: animeId, title: epAnimeTitle, episode: episodeNum, timestamp: Date.now(), category: audioType, totalEpisodes: totalEps });
      }
    } catch (err) {
      setStatus({ message: `Stream error: ${err.message}`, type: "error", loading: false });
    }
  }, [selectedAnime, animeInfo, audioType, episodes.length]);
  useEffect(() => {
    if (autoPlayEpisode && screen === "episode-select") {
      const timer = setTimeout(() => {
        handleEpisodeSelect({
          id: selectedAnime?.id,
          label: `Episode ${autoPlayEpisode.number}`,
          value: `ep-${autoPlayEpisode.number}`,
          episodeId: autoPlayEpisode.episodeId,
          number: autoPlayEpisode.number
        }, 0);
        setAutoPlayEpisode(null);
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [autoPlayEpisode, screen, selectedAnime, handleEpisodeSelect]);
  useEffect(() => {
    if (downloadQueue.some((t) => t.status === "downloading")) return;
    const nextTaskIndex = downloadQueue.findIndex((t) => t.status === "pending");
    if (nextTaskIndex === -1) return;
    const task = downloadQueue[nextTaskIndex];
    setDownloadQueue((prev) => prev.map(
      (t, idx) => idx === nextTaskIndex ? { ...t, status: "downloading", message: "Resolving stream..." } : t
    ));
    const startDownload = async () => {
      try {
        const epIdParts = String(task.id || "").split("::");
        const malId = task.malId || (epIdParts[0] === "ep" && epIdParts[1] === "jikan" ? Number(epIdParts[2]) : epIdParts[0] === "ep" && !isNaN(Number(epIdParts[1])) ? Number(epIdParts[1]) : void 0);
        const safeTitle = (task.animeTitle || "Anime").replace(/[^a-zA-Z0-9_\-]/g, "_");
        const outDir = path3.join(os2.homedir(), "Downloads", "ny-cli", safeTitle);
        let isTorrent = false;
        let magnetLink = "";
        let streamUrl = "";
        let streamHeaders = {};
        const qParams = new URLSearchParams({
          title: task.animeTitle,
          epNo: String(task.episodeNumber),
          mode: audioType
        });
        if (malId) qParams.set("malId", String(malId));
        if (task.anilistId) qParams.set("anilistId", String(task.anilistId));
        if (task.titles?.english) qParams.set("englishTitle", task.titles.english);
        if (task.titles?.romaji) qParams.set("romajiTitle", task.titles.romaji);
        if (task.titles?.native) qParams.set("nativeTitle", task.titles.native);
        if (task.year) qParams.set("year", String(task.year));
        let backendStreamRes = null;
        try {
          backendStreamRes = await getJson(`/api/resolve-stream?${qParams.toString()}`);
        } catch {
          backendStreamRes = null;
        }
        const candidates = backendStreamRes?.candidates || (backendStreamRes?.url ? [backendStreamRes] : []);
        const backendStream = candidates.find((c) => c.type === "hls" || c.type === "mp4") || candidates[0];
        if (backendStream?.url) {
          streamUrl = backendStream.url;
          if (backendStream.referer) {
            streamHeaders = { Referer: backendStream.referer, Origin: new URL(backendStream.referer).origin };
          } else if (backendStream.headers) {
            streamHeaders = backendStream.headers;
          }
        } else {
          setDownloadQueue((prev) => prev.map(
            (t, idx) => idx === nextTaskIndex ? { ...t, message: "No direct stream \u2014 searching torrent..." } : t
          ));
          const torrentData = await getJson(
            `/api/torrent?title=${encodeURIComponent(task.animeTitle)}&ep=${task.episodeNumber}`
          ).catch(() => null);
          if (torrentData?.magnet) {
            magnetLink = torrentData.magnet;
            isTorrent = true;
          }
        }
        if (isTorrent && magnetLink) {
          if (!fs4.existsSync(outDir)) fs4.mkdirSync(outDir, { recursive: true });
          setDownloadQueue((prev) => prev.map(
            (t, idx) => idx === nextTaskIndex ? { ...t, message: "Downloading Torrent..." } : t
          ));
          const wtCmd = os2.platform() === "win32" ? "npx.cmd" : "npx";
          const args = ["-y", "webtorrent-cli", "download", magnetLink, "-o", outDir];
          const wtProcess = spawn(wtCmd, args);
          wtProcess.stdout.on("data", (data) => {
            const output = data.toString();
            const progressMatch = output.match(/(\d+(?:\.\d+)?)%/);
            if (progressMatch) {
              const progress = Math.min(100, Math.floor(parseFloat(progressMatch[1])));
              let msg = "Downloading Torrent...";
              const speedMatch = output.match(/([0-9.]+ [KMG]B\/s)/);
              if (speedMatch) msg = `Speed: ${speedMatch[1]}`;
              setDownloadQueue((prev) => prev.map(
                (t, idx) => idx === nextTaskIndex ? { ...t, progress, message: msg } : t
              ));
            }
          });
          wtProcess.on("close", (code) => {
            setDownloadQueue((prev) => prev.map(
              (t, idx) => idx === nextTaskIndex ? {
                ...t,
                status: code === 0 ? "completed" : "error",
                message: code === 0 ? "Completed" : "WebTorrent Error",
                progress: code === 0 ? 100 : t.progress
              } : t
            ));
          });
          wtProcess.on("error", (err) => {
            setDownloadQueue((prev) => prev.map(
              (t, idx) => idx === nextTaskIndex ? {
                ...t,
                status: "error",
                message: `Failed to launch webtorrent: ${err.message}`
              } : t
            ));
          });
          let lastProgress = -1;
          const stallTimer = setInterval(() => {
            setDownloadQueue((prev) => {
              const current = prev[nextTaskIndex];
              if (current?.status === "completed" || current?.status === "error") {
                clearInterval(stallTimer);
                return prev;
              }
              if (current?.progress === lastProgress) {
                clearInterval(stallTimer);
                try {
                  wtProcess.kill();
                } catch {
                }
                return prev.map(
                  (t, idx) => idx === nextTaskIndex ? {
                    ...t,
                    status: "error",
                    message: "No seeders found \u2014 try again later or use a direct source"
                  } : t
                );
              }
              lastProgress = current?.progress ?? -1;
              return prev;
            });
          }, 45e3);
          return;
        }
        if (!streamUrl) {
          throw new Error("No stream or torrent found");
        }
        if (!fs4.existsSync(outDir)) fs4.mkdirSync(outDir, { recursive: true });
        const filename = path3.join(outDir, `${safeTitle}_Ep${task.episodeNumber}.mp4`);
        const hasFfmpeg = (() => {
          try {
            const res = spawnSync("ffmpeg", ["-version"], { stdio: "pipe" });
            return res.status === 0;
          } catch {
            return false;
          }
        })();
        const hasYtDlp = (() => {
          try {
            const res = spawnSync("yt-dlp", ["--version"], { stdio: "pipe" });
            return res.status === 0;
          } catch {
            return false;
          }
        })();
        if (!hasFfmpeg && !hasYtDlp) {
          throw new Error("Neither ffmpeg nor yt-dlp is installed. Please install ffmpeg or yt-dlp to download streams.");
        }
        if (hasFfmpeg) {
          setDownloadQueue((prev) => prev.map(
            (t, idx) => idx === nextTaskIndex ? { ...t, message: "Downloading via FFmpeg..." } : t
          ));
          const ffmpegArgs = ["-y"];
          ffmpegArgs.push(
            "-allowed_extensions",
            "ALL",
            "-allowed_segment_extensions",
            "ALL",
            "-extension_picky",
            "0"
          );
          let customHeaders = "";
          if (streamHeaders?.Referer) {
            customHeaders += `Referer: ${streamHeaders.Referer}\r
`;
          }
          if (streamHeaders?.["User-Agent"] || streamHeaders?.["user-agent"]) {
            customHeaders += `User-Agent: ${streamHeaders["User-Agent"] || streamHeaders["user-agent"]}\r
`;
          } else {
            customHeaders += "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36\r\n";
          }
          ffmpegArgs.push("-headers", customHeaders);
          ffmpegArgs.push(
            "-i",
            streamUrl,
            "-c",
            "copy",
            "-bsf:a",
            "aac_adtstoasc",
            "-progress",
            "pipe:1",
            "-nostats",
            filename
          );
          const ffmpegProc = spawn("ffmpeg", ffmpegArgs);
          let durationUs = 0;
          ffmpegProc.stderr.on("data", (data) => {
            const output = data.toString();
            if (!durationUs) {
              const durMatch = output.match(/Duration: (\d{2}):(\d{2}):(\d{2})\.(\d{2})/);
              if (durMatch) {
                const h = parseInt(durMatch[1]);
                const m = parseInt(durMatch[2]);
                const s = parseInt(durMatch[3]);
                durationUs = (h * 3600 + m * 60 + s) * 1e6;
              }
            }
          });
          ffmpegProc.stdout.on("data", (data) => {
            const output = data.toString();
            const timeMatch = output.match(/out_time_us=(\d+)/);
            const speedMatch = output.match(/speed=\s*([0-9.]+x)/);
            const speed = speedMatch ? speedMatch[1] : "";
            if (timeMatch) {
              const timeUs = parseInt(timeMatch[1]);
              if (durationUs > 0) {
                const progress = Math.min(100, Math.max(0, Math.floor(timeUs / durationUs * 100)));
                setDownloadQueue((prev) => prev.map(
                  (t, idx) => idx === nextTaskIndex ? {
                    ...t,
                    progress,
                    message: speed ? `Downloading (${speed})...` : "Downloading..."
                  } : t
                ));
              } else {
                const timeSec = Math.floor(timeUs / 1e6);
                const min = Math.floor(timeSec / 60);
                const sec = timeSec % 60;
                setDownloadQueue((prev) => prev.map(
                  (t, idx) => idx === nextTaskIndex ? {
                    ...t,
                    message: `Downloaded ${min}m${sec}s${speed ? ` (${speed})` : ""}...`
                  } : t
                ));
              }
            }
          });
          ffmpegProc.on("close", (code) => {
            setDownloadQueue((prev) => prev.map(
              (t, idx) => idx === nextTaskIndex ? {
                ...t,
                status: code === 0 ? "completed" : "error",
                message: code === 0 ? "Completed" : `FFmpeg error (exit ${code})`,
                progress: code === 0 ? 100 : t.progress
              } : t
            ));
          });
          ffmpegProc.on("error", (err) => {
            setDownloadQueue((prev) => prev.map(
              (t, idx) => idx === nextTaskIndex ? {
                ...t,
                status: "error",
                message: `Failed to launch ffmpeg: ${err.message}`
              } : t
            ));
          });
        } else {
          setDownloadQueue((prev) => prev.map(
            (t, idx) => idx === nextTaskIndex ? { ...t, message: "Downloading via yt-dlp..." } : t
          ));
          const ytdlpArgs = [
            "--no-playlist",
            "--downloader-args",
            "ffmpeg_i:-extension_picky 0 -allowed_extensions ALL -allowed_segment_extensions ALL",
            streamUrl,
            "-o",
            filename
          ];
          if (streamHeaders?.Referer) {
            ytdlpArgs.push("--referer", streamHeaders.Referer);
          }
          ytdlpArgs.push(
            "--add-header",
            "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
          );
          const ytdlpProc = spawn("yt-dlp", ytdlpArgs);
          ytdlpProc.stdout.on("data", (data) => {
            const output = data.toString();
            const pctMatch = output.match(/(\d+(?:\.\d+)?)%/);
            const speedMatch = output.match(/at\s+([0-9.]+[KMG]i?B\/s)/);
            if (pctMatch) {
              const progress = Math.min(100, Math.floor(parseFloat(pctMatch[1])));
              const speed = speedMatch ? speedMatch[1] : "";
              setDownloadQueue((prev) => prev.map(
                (t, idx) => idx === nextTaskIndex ? {
                  ...t,
                  progress,
                  message: speed ? `Downloading (${speed})...` : "Downloading..."
                } : t
              ));
            }
          });
          ytdlpProc.on("close", (code) => {
            setDownloadQueue((prev) => prev.map(
              (t, idx) => idx === nextTaskIndex ? {
                ...t,
                status: code === 0 ? "completed" : "error",
                message: code === 0 ? "Completed" : `yt-dlp error (exit ${code})`,
                progress: code === 0 ? 100 : t.progress
              } : t
            ));
          });
          ytdlpProc.on("error", (err) => {
            setDownloadQueue((prev) => prev.map(
              (t, idx) => idx === nextTaskIndex ? {
                ...t,
                status: "error",
                message: `Failed to launch yt-dlp: ${err.message}`
              } : t
            ));
          });
        }
      } catch (err) {
        setDownloadQueue((prev) => prev.map(
          (t, idx) => idx === nextTaskIndex ? {
            ...t,
            status: "error",
            message: err.message
          } : t
        ));
      }
    };
    startDownload();
  }, [downloadQueue, audioType]);
  const getAnimeItemTitle = (a) => {
    if (typeof a.name === "string" && a.name.trim()) return a.name;
    if (typeof a.title === "string" && a.title.trim()) return a.title;
    if (a.title && typeof a.title === "object") {
      return a.title.english || a.title.romaji || a.title.userPreferred || a.title.native || "";
    }
    if (typeof a.jname === "string" && a.jname.trim()) return a.jname;
    return "Untitled";
  };
  const animeItems = animes.map((a) => {
    const title = getAnimeItemTitle(a);
    const subCount = a.episodes?.sub ?? (typeof a.episodes === "number" ? a.episodes : 0);
    const dubCount = a.episodes?.dub ?? 0;
    return {
      id: a.id,
      label: title,
      badge: a.episodes ? `sub ${subCount} / dub ${dubCount}` : void 0,
      imageUrl: a.poster || a.artwork || void 0
    };
  });
  const browseAnimeItems = browseAnimes.map((a) => {
    const title = getAnimeItemTitle(a);
    const subCount = a.episodes?.sub ?? (typeof a.episodes === "number" ? a.episodes : 0);
    return {
      id: a.id,
      label: title,
      badge: a.averageScore ? `\u2605 ${a.averageScore}%` : a.format || (a.episodes ? `sub ${subCount}` : void 0),
      imageUrl: a.poster || a.artwork || void 0
    };
  });
  const browseCategoryItems = [
    { value: "trending", label: "Trending Now", icon: "[\u{1F525}]" },
    { value: "popular-season", label: "Popular This Season", icon: "[\u{1F338}]" },
    { value: "top-rated", label: "Top Rated", icon: "[\u2B50]" },
    { value: "airing", label: "Currently Airing", icon: "[\u{1F4FA}]" },
    { value: "upcoming", label: "Upcoming", icon: "[\u{1F4C5}]" },
    { value: "movies", label: "Movies", icon: "[\u{1F3AC}]" },
    { value: "genre", label: "By Genre", icon: "[\u{1F3F7}\uFE0F]" },
    { value: "season", label: "By Season and Year", icon: "[\u{1F342}]" },
    { value: "surprise", label: "Surprise Me", icon: "[\u{1F3B2}]" }
  ];
  const seasonOptions = [
    { value: "SPRING-2026", label: "Spring 2026 (Current)", icon: "[\u{1F338}]" },
    { value: "WINTER-2026", label: "Winter 2026", icon: "[\u2744\uFE0F]" },
    { value: "FALL-2025", label: "Fall 2025", icon: "[\u{1F342}]" },
    { value: "SUMMER-2025", label: "Summer 2025", icon: "[\u2600\uFE0F]" },
    { value: "SPRING-2025", label: "Spring 2025", icon: "[\u{1F338}]" },
    { value: "WINTER-2025", label: "Winter 2025", icon: "[\u2744\uFE0F]" },
    { value: "FALL-2024", label: "Fall 2024", icon: "[\u{1F342}]" },
    { value: "SUMMER-2024", label: "Summer 2024", icon: "[\u2600\uFE0F]" },
    { value: "SPRING-2024", label: "Spring 2024", icon: "[\u{1F338}]" },
    { value: "WINTER-2024", label: "Winter 2024", icon: "[\u2744\uFE0F]" }
  ];
  const epCount = episodes.length || animeInfo?.episodes?.sub?.length || animeInfo?.episodes?.dub?.length || animeInfo?.totalEpisodes || animeInfo?.stats?.episodes?.sub || (animeInfo ? 1 : 0);
  const audioOptions = [
    {
      value: "sub",
      label: "Japanese (Subbed)",
      badge: `${epCount} episodes`
    },
    {
      value: "dub",
      label: "English (Dubbed)",
      badge: `${epCount} episodes`
    }
  ];
  const episodeItems = episodes.map((e, idx) => ({
    id: e.id || e.episodeId,
    episodeId: e.episodeId || e.id,
    // Use original index + 1 as episode number if number is missing/0
    number: e.number || idx + 1,
    title: e.title
  })).filter((ep, idx, arr) => arr.findIndex((e) => e.number === ep.number) === idx).sort((a, b) => a.number - b.number).map((e) => ({
    id: e.id,
    episodeId: e.episodeId,
    number: e.number,
    label: `Episode ${e.number}${e.title && !e.title.includes("Episode") ? `: ${e.title}` : ""}`
  }));
  const historyItems = history.filter((h) => {
    if (!h || !h.id || !h.title) return false;
    if (String(h.id).includes("undefined") || String(h.title).includes("undefined")) return false;
    if (typeof h.title === "string" && h.title.trim() === "") return false;
    if (typeof h.id === "string" && h.id.trim() === "") return false;
    return true;
  }).map((h) => {
    const progress = getWatchProgress(h.id, h.episode);
    const percentage = progress ? Math.round(getWatchPercentage(progress.watchTime, progress.duration)) : 0;
    const almostDone = percentage >= 97;
    const progressStr = percentage > 0 ? almostDone ? " - Almost done!" : ` \u2022 ${percentage}%` : "";
    const titleStr = typeof h.title === "string" ? h.title : h.title?.english || h.title?.romaji || String(h.title || "Untitled");
    return {
      id: String(h.id),
      value: String(h.id),
      label: titleStr,
      badge: `Ep ${h.episode} \u2022 ${String(h.category || "").toUpperCase()}${progressStr}`,
      icon: almostDone ? "[*]" : void 0
    };
  });
  const profileMenuItems = [
    { value: "sync", label: "Sync History", icon: "[~]" },
    { value: "logout", label: "Logout", icon: "[X]" },
    { value: "back", label: "Back to Menu", icon: "[<]" }
  ];
  const handleProfileAction = useCallback(async (item) => {
    if (item.value === "logout") {
      handleLogout();
    } else if (item.value === "sync") {
      setStatus({ message: "Syncing with cloud...", type: "info", loading: true });
      const result = await mergeCloudHistory();
      setHistory(getHistory());
      setStatus({ message: result.message, type: result.added > 0 ? "success" : "info", loading: false });
    } else {
      goBack();
    }
  }, [handleLogout, goBack]);
  if (isExiting) {
    return /* @__PURE__ */ React.createElement(Box, { flexDirection: "column", padding: 1, alignItems: "center" }, /* @__PURE__ */ React.createElement(Banner, { phase: bannerPhase }), /* @__PURE__ */ React.createElement(Box, { marginTop: 2, justifyContent: "center" }, /* @__PURE__ */ React.createElement(ExitAnimation, { onDone: () => process.exit(0) })));
  }
  return /* @__PURE__ */ React.createElement(Box, { flexDirection: "column", padding: 1, alignItems: "center" }, /* @__PURE__ */ React.createElement(Banner, { phase: bannerPhase }), showWelcome && screen === "main-menu" && /* @__PURE__ */ React.createElement(Box, { marginBottom: 1, justifyContent: "center", width: "100%" }, /* @__PURE__ */ React.createElement(
    ScrollingWelcome,
    {
      text: "~ Youkoso! Welcome to NyAnime CLI! ~",
      onComplete: () => setShowWelcome(false)
    }
  )), screen === "playing" && /* @__PURE__ */ React.createElement(Box, { flexDirection: "column", alignItems: "center", marginTop: 1 }, /* @__PURE__ */ React.createElement(Box, { borderStyle: "round", borderColor: theme.cyan, padding: 1, flexDirection: "column", alignItems: "center" }, /* @__PURE__ */ React.createElement(Text, { color: theme.yellow, bold: true }, "Now Playing"), /* @__PURE__ */ React.createElement(Text, { color: theme.white }, selectedAnime?.label), /* @__PURE__ */ React.createElement(Text, { color: theme.white }, "Episode ", playingEpisode?.number), /* @__PURE__ */ React.createElement(Text, { color: theme.dimGray }, "Provider: ", playingProviders[playingProviderIndex]?.name)), /* @__PURE__ */ React.createElement(Box, { marginTop: 1 }, /* @__PURE__ */ React.createElement(
    SelectList,
    {
      items: [
        { label: playingPaused ? "\u25B6 Resume Player" : "\u23F8 Pause Player", value: "pause" },
        { label: "\u23ED Next Episode", value: "next" },
        { label: "\u23EE Previous Episode", value: "prev" },
        { label: "\u2B07 Download Episode", value: "download" },
        { label: "\u2699 Switch Provider", value: "provider" },
        { label: "\u21A9 Back to Episodes", value: "back" }
      ],
      onSelect: (i) => {
        if (i.value === "pause") {
          togglePause();
        } else if (i.value === "back") {
          spawnSync("killall", ["-9", "mpv", "webtorrent-cli"]);
          setScreen("episode-select");
        } else if (i.value === "next") {
          spawnSync("killall", ["-9", "mpv", "webtorrent-cli"]);
          const nextEp = episodes.find((e) => e.number === (playingEpisode?.number || 0) + 1);
          if (nextEp) handleEpisodeSelect(nextEp);
        } else if (i.value === "prev") {
          spawnSync("killall", ["-9", "mpv", "webtorrent-cli"]);
          const prevEp = episodes.find((e) => e.number === (playingEpisode?.number || 0) - 1);
          if (prevEp) handleEpisodeSelect(prevEp);
        } else if (i.value === "download") {
          if (playingEpisode) handleEpisodeAction("d", playingEpisode);
          setStatus({ message: "Added to download queue!", type: "success" });
        } else if (i.value === "provider") {
          spawnSync("killall", ["-9", "mpv", "webtorrent-cli"]);
          const nextIndex = (playingProviderIndex + 1) % playingProviders.length;
          setPlayingProviderIndex(nextIndex);
          playProvider(playingProviders[nextIndex]);
        }
      },
      color: theme.pink
    }
  ))), screen === "main-menu" && !showWelcome && /* @__PURE__ */ React.createElement(Box, { flexDirection: "column", width: Math.min(55, termSize.cols - 4), alignItems: "center" }, loggedIn ? /* @__PURE__ */ React.createElement(Box, { marginBottom: 1, borderStyle: "round", borderColor: theme.purple, paddingX: 2, paddingY: 0, width: Math.min(55, termSize.cols - 4) }, /* @__PURE__ */ React.createElement(Text, { color: theme.cyan }, "Okaeri, "), /* @__PURE__ */ React.createElement(ShimmerText, { text: username, speed: 150 }), /* @__PURE__ */ React.createElement(Text, { color: theme.cyan }, "!")) : /* @__PURE__ */ React.createElement(Box, { marginBottom: 1, borderStyle: "round", borderColor: theme.purple, paddingX: 2, paddingY: 0, width: Math.min(55, termSize.cols - 4) }, /* @__PURE__ */ React.createElement(WaveText, { text: "Irasshaimase! Sign in for all features", colors: [theme.purple, theme.blue, theme.pink, theme.cyan], speed: 150 })), /* @__PURE__ */ React.createElement(
    SelectList,
    {
      items: loggedIn ? loggedInMenuItems : loggedOutMenuItems,
      onSelect: handleMenuSelect,
      color: theme.cyan,
      showBorder: true
    }
  )), screen === "browse-category" && /* @__PURE__ */ React.createElement(
    SelectList,
    {
      items: browseCategoryItems,
      onSelect: handleBrowseCategorySelect,
      onBack: goBack,
      title: "[B] Browse Anime",
      color: theme.purple
    }
  ), screen === "browse-genre" && /* @__PURE__ */ React.createElement(
    SelectList,
    {
      items: genresList.map((g) => ({ value: g, label: g, icon: "[\u{1F3F7}\uFE0F]" })),
      onSelect: handleBrowseGenreSelect,
      onBack: goBack,
      title: `[\u{1F3F7}\uFE0F] Browse by Genre [Source: ${browseSource}]`,
      color: theme.pink
    }
  ), screen === "browse-season" && /* @__PURE__ */ React.createElement(
    SelectList,
    {
      items: seasonOptions,
      onSelect: handleBrowseSeasonSelect,
      onBack: goBack,
      title: "[\u{1F342}] Select Season & Year",
      color: theme.yellow
    }
  ), screen === "browse-results" && /* @__PURE__ */ React.createElement(
    SelectList,
    {
      items: browseAnimeItems,
      onSelect: handleAnimeSelect,
      onBack: goBack,
      onPageNext: handleBrowsePageNext,
      onPagePrev: handleBrowsePagePrev,
      onSortToggle: browseCategory === "genre" ? handleBrowseSortToggle : void 0,
      title: `[Browse: ${browseCategory === "genre" ? `${browseGenre} (${browseSort})` : browseCategory === "season" ? `${browseSeason} ${browseYear}` : browseCategoryTitle}] (Page ${browsePage}) [Source: ${browseSource}]`,
      color: theme.purple,
      showArtwork: true
    }
  ), screen === "search" && /* @__PURE__ */ React.createElement(
    InputBox,
    {
      label: "[S] Search Anime",
      onSubmit: handleSearch,
      onCancel: goBack,
      placeholder: "Type anime name...",
      color: theme.purple
    }
  ), screen === "anime-select" && /* @__PURE__ */ React.createElement(
    SelectList,
    {
      items: animeItems,
      onSelect: handleAnimeSelect,
      onBack: goBack,
      title: "[>] Select Anime",
      color: theme.purple,
      showArtwork: true
    }
  ), screen === "continue" && /* @__PURE__ */ React.createElement(
    SelectList,
    {
      items: historyItems,
      onSelect: handleHistorySelect,
      onBack: goBack,
      title: "[>] Continue Watching",
      color: theme.success,
      showArtwork: true
    }
  ), screen === "anime-details" && animeInfo && /* @__PURE__ */ React.createElement(
    AnimeDetailsView,
    {
      animeInfo,
      history,
      onWatch: handleWatchFromDetails,
      onDownload: handleDownloadFromDetails,
      onPlayTrailer: handlePlayTrailer,
      onToggleMyList: handleToggleMyList,
      isInList: isInMyList(animeInfo?.id),
      onBack: goBack,
      termSize
    }
  ), screen === "audio-select" && /* @__PURE__ */ React.createElement(Box, { flexDirection: "column" }, /* @__PURE__ */ React.createElement(Text, { color: theme.pink, bold: true }, "\u{1F4FA} ", selectedAnime?.label || "Anime"), /* @__PURE__ */ React.createElement(Box, { marginTop: 1 }, /* @__PURE__ */ React.createElement(
    SelectList,
    {
      items: audioOptions,
      onSelect: handleAudioSelect,
      onBack: goBack,
      title: "\u{1F50A} Select Audio Type",
      color: theme.cyan
    }
  ))), screen === "episode-select" && /* @__PURE__ */ React.createElement(Box, { flexDirection: "column" }, /* @__PURE__ */ React.createElement(Text, { color: theme.pink, bold: true }, isDownloadMode ? "\u{1F4E5}" : "\u{1F4FA}", " ", selectedAnime?.label || "Anime", " ", /* @__PURE__ */ React.createElement(Text, { color: theme.cyan }, "(", audioType.toUpperCase(), ")")), /* @__PURE__ */ React.createElement(Box, { marginTop: 1 }, /* @__PURE__ */ React.createElement(
    SelectList,
    {
      items: episodeItems,
      onSelect: (item) => isDownloadMode ? handleEpisodeAction("d", item) : handleEpisodeSelect(item),
      onAction: handleEpisodeAction,
      onBack: goBack,
      title: isDownloadMode ? `\u{1F4E5} Select Episode to Download (${episodeItems.length} total)` : `\u{1F4CB} Select Episode (${episodeItems.length} total)`,
      color: isDownloadMode ? theme.cyan : theme.blue,
      showNumbers: false,
      enableSearch: episodeItems.length > 20
    }
  ))), screen === "downloading" && /* @__PURE__ */ React.createElement(Box, { flexDirection: "column", paddingX: 2, paddingY: 1, borderStyle: "round", borderColor: theme.cyan, width: Math.min(70, termSize.cols - 4) }, /* @__PURE__ */ React.createElement(Text, { color: theme.pink, bold: true }, "\u{1F4E5} Downloads"), /* @__PURE__ */ React.createElement(Text, { color: theme.dimGray }, "\u2500".repeat(60)), downloadQueue.length === 0 ? /* @__PURE__ */ React.createElement(Text, { color: theme.lightGray }, "Queue is empty.") : downloadQueue.map((t, idx) => {
    const pBar = "\u2588".repeat(Math.floor(t.progress / 5)) + "\u2591".repeat(20 - Math.floor(t.progress / 5));
    let statusColor = theme.lightGray;
    let icon = "\u23F3";
    if (t.status === "downloading") {
      statusColor = theme.cyan;
      icon = "\u2B07\uFE0F ";
    } else if (t.status === "completed") {
      statusColor = theme.green;
      icon = "\u2705";
    } else if (t.status === "error") {
      statusColor = theme.red;
      icon = "\u274C";
    }
    return /* @__PURE__ */ React.createElement(Box, { key: idx, flexDirection: "column", marginBottom: 1 }, /* @__PURE__ */ React.createElement(Text, { color: statusColor, bold: true }, icon, " ", t.animeTitle, " - Ep ", t.episodeNumber, " ", /* @__PURE__ */ React.createElement(Text, { dimColor: true }, "(", t.progress, "%)")), /* @__PURE__ */ React.createElement(Text, { color: theme.purple }, pBar, " ", /* @__PURE__ */ React.createElement(Text, { dimColor: true }, t.message)));
  }), /* @__PURE__ */ React.createElement(Text, { color: theme.dimGray }, "\u2500".repeat(60)), /* @__PURE__ */ React.createElement(Text, { color: theme.dimGray }, "Press 'b' to go back | 'c' to clear finished"), /* @__PURE__ */ React.createElement(ScreenBackHandler, { onBack: goBack, onClear: () => setDownloadQueue((prev) => prev.filter((t) => t.status === "downloading" || t.status === "pending")) })), screen === "auto-advance" && autoAdvanceData && /* @__PURE__ */ React.createElement(Box, { flexDirection: "column" }, /* @__PURE__ */ React.createElement(Text, { color: theme.pink, bold: true }, "\u{1F4FA} ", selectedAnime?.label || "Anime", " ", /* @__PURE__ */ React.createElement(Text, { color: theme.cyan }, "(", audioType.toUpperCase(), ")")), /* @__PURE__ */ React.createElement(Box, { marginTop: 1 }, /* @__PURE__ */ React.createElement(
    SelectList,
    {
      items: [
        { label: `Resume Episode ${autoAdvanceData.currentEpisode.number} (${autoAdvanceData.percentage}%)`, value: "resume", episodeId: autoAdvanceData.currentEpisode.episodeId, number: autoAdvanceData.currentEpisode.number },
        { label: `Start Next Episode ${autoAdvanceData.nextEpisode.number}`, value: "next", episodeId: autoAdvanceData.nextEpisode.episodeId, number: autoAdvanceData.nextEpisode.number }
      ],
      onSelect: (item) => handleEpisodeSelect(item),
      onBack: goBack,
      title: `\u23ED\uFE0F Continue Watching?`,
      color: theme.cyan,
      showNumbers: true,
      enableSearch: false
    }
  ))), screen === "login-waiting" && /* @__PURE__ */ React.createElement(Box, { flexDirection: "column", width: Math.min(55, termSize.cols - 4) }, /* @__PURE__ */ React.createElement(Box, { borderStyle: "round", borderColor: theme.purple, paddingX: 2, paddingY: 1, flexDirection: "column" }, /* @__PURE__ */ React.createElement(Text, { color: theme.purple, bold: true }, "[L] Login to NyAnime"), /* @__PURE__ */ React.createElement(Text, { color: theme.dimGray }, "\u2500".repeat(45)), /* @__PURE__ */ React.createElement(Text, { color: theme.lightGray }, "1. Check your browser"), /* @__PURE__ */ React.createElement(Text, { color: theme.lightGray }, "2. Sign in or Authorize ny-cli"), /* @__PURE__ */ React.createElement(Text, { color: theme.lightGray }, "3. Return to terminal when done"), /* @__PURE__ */ React.createElement(Text, { color: theme.dimGray }, "\u2500".repeat(45)), /* @__PURE__ */ React.createElement(Text, { color: theme.cyan }, "Waiting for authorization..."))), screen === "profile" && /* @__PURE__ */ React.createElement(Box, { flexDirection: termSize.cols < 70 ? "column" : "row", gap: 2 }, userPhotoUrl ? /* @__PURE__ */ React.createElement(Box, { width: 18, height: 14 }, /* @__PURE__ */ React.createElement(AnimeArtwork, { title: "", imageUrl: userPhotoUrl, width: 18, height: 14 })) : /* @__PURE__ */ React.createElement(Box, { borderStyle: "round", borderColor: theme.purple, width: 16, height: 12, justifyContent: "center", alignItems: "center" }, /* @__PURE__ */ React.createElement(Text, { color: theme.dimGray }, "[No Photo]")), /* @__PURE__ */ React.createElement(Box, { flexDirection: "column", width: Math.min(50, termSize.cols - 4) }, /* @__PURE__ */ React.createElement(Box, { borderStyle: "round", borderColor: theme.purple, paddingX: 2, paddingY: 1, flexDirection: "column" }, /* @__PURE__ */ React.createElement(Text, { color: theme.purple, bold: true }, "[P] ", username), /* @__PURE__ */ React.createElement(Text, { color: theme.dimGray }, "\u2500".repeat(35)), /* @__PURE__ */ React.createElement(Text, { color: theme.lightGray }, "UID: ", /* @__PURE__ */ React.createElement(Text, { color: theme.cyan }, getToken().substring(0, 12), "...")), syncMessage ? /* @__PURE__ */ React.createElement(Text, { color: theme.cyan }, syncMessage) : null), /* @__PURE__ */ React.createElement(Box, { marginTop: 1 }, /* @__PURE__ */ React.createElement(
    SelectList,
    {
      items: profileMenuItems,
      onSelect: handleProfileAction,
      color: theme.purple,
      showBorder: true
    }
  )))), screen === "settings" && /* @__PURE__ */ React.createElement(
    SettingsScreen,
    {
      settings: appSettings,
      onUpdate: (newSettings) => {
        setAppSettings(newSettings);
        saveSettings(newSettings);
      },
      onBack: goBack
    }
  ), screen === "help" && /* @__PURE__ */ React.createElement(Box, { flexDirection: "column", width: Math.min(55, termSize.cols - 4) }, /* @__PURE__ */ React.createElement(Box, { borderStyle: "round", borderColor: theme.blue, paddingX: 2, paddingY: 1, flexDirection: "column" }, /* @__PURE__ */ React.createElement(Text, { color: theme.blue, bold: true }, "[?] NY-CLI Help"), /* @__PURE__ */ React.createElement(Text, { color: theme.dimGray }, "\u2500".repeat(45)), /* @__PURE__ */ React.createElement(Text, null, " "), /* @__PURE__ */ React.createElement(Text, { color: theme.cyan }, "USAGE:"), /* @__PURE__ */ React.createElement(Text, { color: theme.lightGray }, "  ny-cli              Interactive mode"), /* @__PURE__ */ React.createElement(Text, { color: theme.lightGray }, '  ny-cli "one piece"  Quick search'), /* @__PURE__ */ React.createElement(Text, null, " "), /* @__PURE__ */ React.createElement(Text, { color: theme.cyan }, "NAVIGATION:"), /* @__PURE__ */ React.createElement(Text, { color: theme.lightGray }, "  Up/Down or j/k  Navigate"), /* @__PURE__ */ React.createElement(Text, { color: theme.lightGray }, "  Enter           Select"), /* @__PURE__ */ React.createElement(Text, { color: theme.lightGray }, "  b or Left       Go back"), /* @__PURE__ */ React.createElement(Text, { color: theme.lightGray }, "  1-9             Quick select"), /* @__PURE__ */ React.createElement(Text, { color: theme.lightGray }, "  q               Quit"), /* @__PURE__ */ React.createElement(Text, null, " "), /* @__PURE__ */ React.createElement(Text, { color: theme.cyan }, "CLOUD SYNC:"), /* @__PURE__ */ React.createElement(Text, { color: theme.lightGray }, "  Login with your nyanime.qzz.io account"), /* @__PURE__ */ React.createElement(Text, { color: theme.lightGray }, "  to sync watch history across devices"), /* @__PURE__ */ React.createElement(Text, null, " "), /* @__PURE__ */ React.createElement(Text, { color: theme.cyan }, "PLAYER (mpv):"), /* @__PURE__ */ React.createElement(Text, { color: theme.lightGray }, "  Space  Play/Pause  |  f  Fullscreen"), /* @__PURE__ */ React.createElement(Text, { color: theme.lightGray }, "  Left/Right   Seek  |  q  Quit")), /* @__PURE__ */ React.createElement(Box, { marginTop: 1 }, /* @__PURE__ */ React.createElement(Text, { color: theme.dimGray }, "Press b or Left to go back")), /* @__PURE__ */ React.createElement(ScreenBackHandler, { onBack: goBack })), /* @__PURE__ */ React.createElement(Box, { marginTop: 1 }, /* @__PURE__ */ React.createElement(StatusBar, { ...status })));
}
function ScreenBackHandler({ onBack, onClear }) {
  useInput((input, key) => {
    if (input === "c" && onClear) {
      onClear();
      return;
    }
    if (key.escape || input === "b" || key.leftArrow || input === "q") {
      if (input === "q") {
        quitBus.emit("quit");
        return;
      }
      onBack();
    }
  });
  return null;
}
var isMain = process.argv[1] && (path3.resolve(process.argv[1]) === fileURLToPath(import.meta.url) || process.argv[1].endsWith("cli-terminal-fallback.mjs") || process.argv[1].endsWith("cli-terminal.tsx"));
if (isMain) {
  process.stdout.write("\x1Bc");
  const instance = render(
    /* @__PURE__ */ React.createElement(TerminalInfoProvider, null, /* @__PURE__ */ React.createElement(App, null))
  );
  process.on("exit", () => {
    instance.clear();
  });
  process.on("SIGINT", () => {
    quitBus.emit("quit");
    setTimeout(() => {
      instance.clear();
      process.exit(0);
    }, 1500).unref();
  });
  process.on("SIGTERM", () => {
    quitBus.emit("quit");
    setTimeout(() => {
      instance.clear();
      process.exit(0);
    }, 1500).unref();
  });
}
export {
  quitBus
};
