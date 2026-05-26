#!/usr/bin/env bun
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});

// cli-terminal.tsx
import React, { useState, useEffect, useCallback } from "react";
import { render, Box, Text, useInput, useApp } from "ink";
import TextInput from "ink-text-input";
import Picture, { TerminalInfoProvider } from "ink-picture";
import { spawn, spawnSync, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

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
var API_BASE = process.env.NYCLI_API_BASE || "http://127.0.0.1:3000";
var VERSION = "5.5.5";
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
var CONFIG_DIR = process.env.XDG_CONFIG_HOME ? path.join(process.env.XDG_CONFIG_HOME, "ny-cli") : path.join(os.homedir(), ".config", "ny-cli");
var DATA_DIR = process.env.XDG_DATA_HOME ? path.join(process.env.XDG_DATA_HOME, "ny-cli") : path.join(os.homedir(), ".local", "share", "ny-cli");
var AUTH_FILE = path.join(CONFIG_DIR, "auth");
var HISTORY_FILE = path.join(DATA_DIR, "history");
var SETTINGS_FILE = path.join(CONFIG_DIR, "settings.json");
var ANIME4K_DIR = path.join(DATA_DIR, "anime4k");
try {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(ANIME4K_DIR, { recursive: true });
} catch {
}
var defaultSettings = {
  anime4k: false,
  anime4kMode: "A"
};
function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      return { ...defaultSettings, ...JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8")) };
    }
  } catch {
  }
  return defaultSettings;
}
function saveSettings(settings) {
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
  } catch {
  }
}
function isAnime4kInstalled() {
  try {
    const shaderPath = path.join(ANIME4K_DIR, "Anime4K_Clamp_Highlights.glsl");
    return fs.existsSync(shaderPath);
  } catch {
    return false;
  }
}
function getAnime4kShaders(mode) {
  const shaders = {
    "A": [
      "Anime4K_Clamp_Highlights.glsl",
      "Anime4K_Restore_CNN_VL.glsl",
      "Anime4K_Upscale_CNN_x2_VL.glsl",
      "Anime4K_AutoDownscalePre_x2.glsl",
      "Anime4K_AutoDownscalePre_x4.glsl",
      "Anime4K_Upscale_CNN_x2_M.glsl"
    ],
    "B": [
      "Anime4K_Clamp_Highlights.glsl",
      "Anime4K_Restore_CNN_Soft_VL.glsl",
      "Anime4K_Upscale_CNN_x2_VL.glsl",
      "Anime4K_AutoDownscalePre_x2.glsl",
      "Anime4K_AutoDownscalePre_x4.glsl",
      "Anime4K_Upscale_CNN_x2_M.glsl"
    ],
    "C": [
      "Anime4K_Clamp_Highlights.glsl",
      "Anime4K_Upscale_Denoise_CNN_x2_VL.glsl",
      "Anime4K_AutoDownscalePre_x2.glsl",
      "Anime4K_AutoDownscalePre_x4.glsl",
      "Anime4K_Upscale_CNN_x2_M.glsl"
    ],
    "A+A": [
      "Anime4K_Clamp_Highlights.glsl",
      "Anime4K_Restore_CNN_VL.glsl",
      "Anime4K_Upscale_CNN_x2_VL.glsl",
      "Anime4K_Restore_CNN_M.glsl",
      "Anime4K_AutoDownscalePre_x2.glsl",
      "Anime4K_AutoDownscalePre_x4.glsl",
      "Anime4K_Upscale_CNN_x2_M.glsl"
    ],
    "B+B": [
      "Anime4K_Clamp_Highlights.glsl",
      "Anime4K_Restore_CNN_Soft_VL.glsl",
      "Anime4K_Upscale_CNN_x2_VL.glsl",
      "Anime4K_AutoDownscalePre_x2.glsl",
      "Anime4K_AutoDownscalePre_x4.glsl",
      "Anime4K_Restore_CNN_Soft_M.glsl",
      "Anime4K_Upscale_CNN_x2_M.glsl"
    ],
    "C+A": [
      "Anime4K_Clamp_Highlights.glsl",
      "Anime4K_Upscale_Denoise_CNN_x2_VL.glsl",
      "Anime4K_AutoDownscalePre_x2.glsl",
      "Anime4K_AutoDownscalePre_x4.glsl",
      "Anime4K_Restore_CNN_M.glsl",
      "Anime4K_Upscale_CNN_x2_M.glsl"
    ]
  };
  const modeShaders = shaders[mode] || shaders["A"];
  return modeShaders.map((s) => path.join(ANIME4K_DIR, s)).join(":");
}
function isLoggedIn() {
  try {
    return fs.existsSync(AUTH_FILE) && fs.statSync(AUTH_FILE).size > 0;
  } catch {
    return false;
  }
}
function getUsername() {
  try {
    if (!isLoggedIn()) return "";
    const content = fs.readFileSync(AUTH_FILE, "utf8");
    return content.split("\n")[0] || "";
  } catch {
    return "";
  }
}
function getToken() {
  try {
    if (!isLoggedIn()) return "";
    const content = fs.readFileSync(AUTH_FILE, "utf8");
    return content.split("\n")[1] || "";
  } catch {
    return "";
  }
}
function saveAuth(username, token) {
  try {
    fs.writeFileSync(AUTH_FILE, `${username}
${token}`, { mode: 384 });
  } catch {
  }
}
function logout() {
  try {
    fs.unlinkSync(AUTH_FILE);
  } catch {
  }
}
var WATCH_PROGRESS_FILE = path.join(DATA_DIR, "progress");
function getHistory() {
  try {
    if (!fs.existsSync(HISTORY_FILE)) return [];
    const content = fs.readFileSync(HISTORY_FILE, "utf8");
    return content.split("\n").filter(Boolean).map((line) => {
      const parts = line.split("|");
      const [id, title, ep, ts, cat, watchTime, duration, totalEps] = parts;
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
    fs.writeFileSync(HISTORY_FILE, content);
    syncToCloud(entry).catch(() => {
    });
  } catch {
  }
}
function saveWatchProgress(animeId, episode, watchTime, duration) {
  try {
    const key = `${animeId}:${episode}`;
    let progress = {};
    if (fs.existsSync(WATCH_PROGRESS_FILE)) {
      try {
        progress = JSON.parse(fs.readFileSync(WATCH_PROGRESS_FILE, "utf8"));
      } catch {
      }
    }
    progress[key] = { watchTime, duration };
    fs.writeFileSync(WATCH_PROGRESS_FILE, JSON.stringify(progress));
  } catch {
  }
}
function getWatchProgress(animeId, episode) {
  try {
    if (!fs.existsSync(WATCH_PROGRESS_FILE)) return null;
    const progress = JSON.parse(fs.readFileSync(WATCH_PROGRESS_FILE, "utf8"));
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
      fs.writeFileSync(HISTORY_FILE, content);
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
  return /* @__PURE__ */ React.createElement(Box, { flexDirection: "column", alignItems: "center", marginBottom: 1 }, BANNER.map((line, i) => /* @__PURE__ */ React.createElement(Text, { key: i, color: gradientColor((i * 8 + phase) % 45, 45), bold: true }, line)), /* @__PURE__ */ React.createElement(Text, { color: theme.dimGray, dimColor: true }, "\u27E8 Your Gateway to Anime Streaming \u27E9"), /* @__PURE__ */ React.createElement(Text, { color: theme.dimGray, dimColor: true }, "v", VERSION, " \u2022 nyanime.tech"));
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
  useEffect(() => {
    if (done && onComplete) {
      const timeout = setTimeout(onComplete, 100);
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
function GoodbyeMessage({ onComplete }) {
  const messages = [
    "~ Sayounara! ~",
    "\u{1F338} Mata ne! \u{1F338}",
    "\u{1F44B} Jaa ne! \u{1F44B}"
  ];
  const message = messages[Math.floor(Math.random() * messages.length)];
  return /* @__PURE__ */ React.createElement(ScrollingWelcome, { text: message, onComplete });
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
        const tmpDir = os.tmpdir();
        const tmpFile = path.join(tmpDir, `ny-cli-art-${Date.now()}.jpg`);
        const res = await fetch(url);
        if (!res.ok) throw new Error("Fetch failed");
        const buffer = await res.arrayBuffer();
        fs.writeFileSync(tmpFile, Buffer.from(buffer));
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
  return /* @__PURE__ */ React.createElement(Box, { width, height, borderStyle: "round", borderColor: theme.purple }, /* @__PURE__ */ React.createElement(Box, { width: Math.max(1, width - 2), height: Math.max(1, height - 2), overflow: "hidden" }, /* @__PURE__ */ React.createElement(Picture, { src: imgPath, width: "100%", height: "100%" })));
}
function SelectList({ items, onSelect, onBack, title, color = theme.purple, showBorder = true, showArtwork = false, showNumbers = true, enableSearch = false }) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [rippleIndex, setRippleIndex] = useState(-1);
  const [ripplePhase, setRipplePhase] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const filteredItems = enableSearch && searchQuery ? items.filter((item) => {
    const num = item.number?.toString() || "";
    const label = item.label.toLowerCase();
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
      process.exit(0);
    } else if (key.escape || input === "b" || key.leftArrow) {
      if (searchQuery) {
        setSearchQuery("");
      } else if (onBack) {
        onBack();
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
  const maxLabelLen = Math.max(30, termWidth - 25);
  const content = /* @__PURE__ */ React.createElement(Box, { flexDirection: "column" }, title && /* @__PURE__ */ React.createElement(Text, { color, bold: true }, title), title && /* @__PURE__ */ React.createElement(Text, { color: theme.dimGray, dimColor: true }, "\u2191\u2193: navigate \u2502 Enter: select \u2502 b: back", enableSearch ? " \u2502 Type number to jump" : "", " \u2502 q: quit"), enableSearch && /* @__PURE__ */ React.createElement(Box, { marginTop: 1 }, /* @__PURE__ */ React.createElement(Text, { color: theme.cyan }, "[S] "), /* @__PURE__ */ React.createElement(Text, { color: searchQuery ? theme.white : theme.dimGray }, searchQuery || "Type episode number..."), searchQuery && /* @__PURE__ */ React.createElement(Text, { color: theme.dimGray }, " (", filteredItems.length, " matches)")), /* @__PURE__ */ React.createElement(Box, { marginTop: title ? 1 : 0, flexDirection: "column" }, visibleItems.map((item, idx) => {
    const actualIdx = startIdx + idx;
    const isSelected = actualIdx === selectedIndex;
    const isRippling = actualIdx === rippleIndex;
    const rippleColor = isRippling ? blendHex(theme.purple, theme.pink, ripplePhase / 5) : color;
    const indicator = isRippling ? getRippleChar(ripplePhase) : isSelected ? "\u25B8" : " ";
    const displayNum = idx + 1;
    const icon = item.icon ? `${item.icon} ` : "";
    const badgeStr = item.badge ? ` (${item.badge})` : "";
    const fullText = `${icon}${item.label}${badgeStr}`;
    const labelText = fullText.length > maxLabelLen ? fullText.slice(0, maxLabelLen - 3) + "..." : fullText;
    const numPrefix = showNumbers ? `${String(displayNum).padStart(2, " ")}) ` : "";
    return /* @__PURE__ */ React.createElement(Box, { key: actualIdx }, /* @__PURE__ */ React.createElement(Text, { color: isRippling ? rippleColor : isSelected ? color : theme.dimGray }, indicator), showNumbers && /* @__PURE__ */ React.createElement(Text, { color: theme.dimGray }, numPrefix), !showNumbers && /* @__PURE__ */ React.createElement(Text, null, " "), /* @__PURE__ */ React.createElement(Text, { color: isSelected ? theme.white : theme.lightGray, bold: isSelected }, labelText));
  })), items.length > maxVisible && /* @__PURE__ */ React.createElement(Box, { marginTop: 1 }, /* @__PURE__ */ React.createElement(Text, { color: theme.dimGray, dimColor: true }, "\u2500\u2500\u2500\u2500 ", selectedIndex + 1, "/", items.length, " \u2500\u2500\u2500\u2500")));
  if (showArtwork) {
    const artworkWidth = 30;
    const artworkHeight = 15;
    return /* @__PURE__ */ React.createElement(Box, { flexDirection: "row" }, /* @__PURE__ */ React.createElement(Box, { flexDirection: "column", marginRight: 2, width: artworkWidth }, /* @__PURE__ */ React.createElement(
      AnimeArtwork,
      {
        title: selectedItem?.label || "",
        imageUrl: selectedItem?.imageUrl,
        width: artworkWidth,
        height: artworkHeight
      }
    ), selectedItem && /* @__PURE__ */ React.createElement(Box, { marginTop: 1 }, /* @__PURE__ */ React.createElement(Text, { color: theme.cyan, wrap: "truncate-end" }, selectedItem.label.slice(0, artworkWidth - 2)))), showBorder ? /* @__PURE__ */ React.createElement(Box, { flexDirection: "column", borderStyle: "round", borderColor: color, paddingX: 1, paddingY: 1, flexGrow: 1 }, content) : /* @__PURE__ */ React.createElement(Box, { flexDirection: "column", flexGrow: 1 }, content));
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
async function getJson(path2) {
  const res = await fetch(`${API_BASE}${path2}`);
  const text = await res.text();
  const body = JSON.parse(text);
  if (!res.ok || !body?.success) {
    throw new Error(body?.error || `HTTP ${res.status}`);
  }
  return body.data;
}
function pickPlayableSource(sources) {
  const list = Array.isArray(sources) ? sources : [];
  if (!list.length) return null;
  const score = (url) => {
    const v = String(url || "").toLowerCase();
    if (!v.startsWith("http")) return -1;
    if (v.includes(".m3u8")) return 100;
    if (v.includes("/media") || v.includes("/videos/")) return 90;
    if (v.includes(".mp4") || v.includes(".webm")) return 80;
    return 20;
  };
  const ranked = [...list].map((item) => ({ item, s: score(item?.url) })).filter((entry) => entry.s > 0).sort((a, b) => b.s - a.s);
  return ranked.length ? ranked[0].item : list.find((s) => String(s?.url).startsWith("http")) || null;
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
function SettingsScreen({ settings, onUpdate, onBack }) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState("");
  const anime4kInstalled = isAnime4kInstalled();
  const modes = ["A", "B", "C", "A+A", "B+B", "C+A"];
  const menuItems = [
    { key: "anime4k", label: "Anime4K Upscaling", type: "toggle" },
    { key: "anime4kMode", label: "Anime4K Mode", type: "select" },
    { key: "download", label: "Download Anime4K Shaders", type: "action" },
    { key: "back", label: "\u2190 Back", type: "action" }
  ];
  const downloadAnime4k = async () => {
    setDownloading(true);
    setDownloadStatus("Downloading Anime4K shaders...");
    try {
      const targetDir = ANIME4K_DIR;
      const version = "v4.0.1";
      const url = `https://github.com/bloc97/Anime4K/releases/download/${version}/Anime4K_v4.0.zip`;
      const zipPath = path.join(targetDir, "Anime4K.zip");
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
      process.exit(0);
    }
    if (key.upArrow || input === "k") {
      setSelectedIndex((i) => Math.max(0, i - 1));
    } else if (key.downArrow || input === "j") {
      setSelectedIndex((i) => Math.min(menuItems.length - 1, i + 1));
    } else if (key.return) {
      const item = menuItems[selectedIndex];
      if (item.key === "anime4k") {
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
  return /* @__PURE__ */ React.createElement(Box, { flexDirection: "column", width: 60 }, /* @__PURE__ */ React.createElement(Box, { borderStyle: "round", borderColor: theme.cyan, paddingX: 2, paddingY: 1, flexDirection: "column" }, /* @__PURE__ */ React.createElement(Text, { color: theme.cyan, bold: true }, "[\u2699] Settings"), /* @__PURE__ */ React.createElement(Text, { color: theme.dimGray }, "\u2500".repeat(50)), /* @__PURE__ */ React.createElement(Text, null, " "), /* @__PURE__ */ React.createElement(Box, null, /* @__PURE__ */ React.createElement(Text, { color: selectedIndex === 0 ? theme.cyan : theme.lightGray }, selectedIndex === 0 ? "\u25B8 " : "  ", "Anime4K Upscaling:", " "), anime4kInstalled ? /* @__PURE__ */ React.createElement(Text, { color: settings.anime4k ? theme.green : theme.red }, settings.anime4k ? "[ON]" : "[OFF]") : /* @__PURE__ */ React.createElement(Text, { color: theme.dimGray }, "[Not Installed]")), /* @__PURE__ */ React.createElement(Box, null, /* @__PURE__ */ React.createElement(Text, { color: selectedIndex === 1 ? theme.cyan : theme.lightGray }, selectedIndex === 1 ? "\u25B8 " : "  ", "Anime4K Mode:", " "), /* @__PURE__ */ React.createElement(Text, { color: selectedIndex === 1 ? theme.cyan : theme.lightGray }, "\u25C0 ", settings.anime4kMode, " \u25B6")), /* @__PURE__ */ React.createElement(Text, null, " "), /* @__PURE__ */ React.createElement(Box, null, /* @__PURE__ */ React.createElement(Text, { color: selectedIndex === 2 ? theme.cyan : theme.lightGray }, selectedIndex === 2 ? "\u25B8 " : "  ", anime4kInstalled ? "\u21BB Re-download" : "\u2193 Download", " Anime4K Shaders")), /* @__PURE__ */ React.createElement(Box, null, /* @__PURE__ */ React.createElement(Text, { color: selectedIndex === 3 ? theme.cyan : theme.lightGray }, selectedIndex === 3 ? "\u25B8 " : "  ", "\u2190 Back")), downloadStatus && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(Text, null, " "), /* @__PURE__ */ React.createElement(Text, { color: downloadStatus.startsWith("\u2713") ? theme.green : downloadStatus.startsWith("\u2717") ? theme.red : theme.cyan }, downloadStatus))), /* @__PURE__ */ React.createElement(Box, { marginTop: 1 }, /* @__PURE__ */ React.createElement(Text, { color: theme.dimGray }, anime4kInstalled ? "Anime4K shaders enhance video quality for older anime" : "Download shaders first to enable upscaling")), /* @__PURE__ */ React.createElement(Box, { marginTop: 1 }, /* @__PURE__ */ React.createElement(Text, { color: theme.dimGray }, "Mode A: Best for 1080p | Mode B: Soft edges | Mode C: Denoise")));
}
var initialQuery = process.argv.slice(2).join(" ").trim();
function App() {
  const { exit } = useApp();
  const [screen, setScreen] = useState(initialQuery ? "search" : "main-menu");
  const [animes, setAnimes] = useState([]);
  const [selectedAnime, setSelectedAnime] = useState(null);
  const [animeInfo, setAnimeInfo] = useState(null);
  const [audioType, setAudioType] = useState("sub");
  const [episodes, setEpisodes] = useState([]);
  const [appSettings, setAppSettings] = useState(loadSettings());
  const [history, setHistory] = useState(getHistory());
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
  useEffect(() => {
    const timer = setInterval(() => {
      setBannerPhase((p) => (p + 1) % 50);
    }, 120);
    return () => clearInterval(timer);
  }, []);
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
    { value: "random", label: "Random Anime", icon: "[\u{1F3B2}]" },
    { value: "settings", label: "Settings", icon: "[\u2699]" },
    { value: "help", label: "Help", icon: "[?]" },
    { value: "exit", label: "Exit", icon: "[X]" }
  ];
  const loggedOutMenuItems = [
    { value: "search", label: "Search", icon: "[S]" },
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
      setTimeout(() => {
        process.exit(0);
      }, 2e3);
    } else if (action === "search") {
      setScreen("search");
      setStatus({ message: "Enter anime name to search", type: "info", loading: false });
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
  }, []);
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
    const server = __require("http").createServer((req, res) => {
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
            if (data.token && data.username) {
              setStatus({ message: "Callback verified, logging in...", type: "info", loading: true });
              setPendingUsername(data.username);
              handleLoginToken(data.token, data.username);
              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ success: true }));
            } else {
              res.writeHead(400);
              res.end();
            }
          } catch (e) {
            res.writeHead(400);
            res.end();
          } finally {
            server.close();
          }
        });
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    server.listen(4e3, () => {
      import("open").then((open) => {
        open.default(`${API_BASE}/api/auth/login?port=4000`).catch(() => {
        });
      }).catch((err) => {
        setStatus({ message: "Failed to open browser: " + err.message, type: "error", loading: false });
      });
    });
    setTimeout(() => {
      server.close();
      if (!isLoggedIn()) {
        setStatus({ message: "Login timed out", type: "error", loading: false });
        setScreen("main-menu");
      }
    }, 5 * 60 * 1e3);
  }, []);
  const handleLoginToken = useCallback(async (firebaseUid, providedUsername) => {
    if (!firebaseUid.trim()) {
      setStatus({ message: "User ID cannot be empty", type: "error", loading: false });
      return;
    }
    setStatus({ message: "Verifying account...", type: "info", loading: true });
    try {
      const result = await verifyFirebaseUser(firebaseUid.trim());
      if (result.valid) {
        const finalUsername = result.username || providedUsername || pendingUsername;
        saveAuth(finalUsername, firebaseUid.trim());
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
      setScreen("audio-select");
      setStatus({ message: "Select audio type", type: "info", loading: false });
    } else if (screen === "audio-select") {
      setScreen("anime-select");
      setStatus({ message: `Found ${animes.length} anime`, type: "success", loading: false });
    } else if (screen === "login-token") {
      setScreen("login");
      setPendingUsername("");
      setStatus({ message: "Enter your NyAnime username", type: "info", loading: false });
    } else if (["anime-select", "continue", "search", "profile", "login", "settings", "help"].includes(screen)) {
      setScreen("main-menu");
      setStatus({ message: "Welcome to NY-CLI!", type: "info", loading: false });
    }
  }, [screen, animes.length]);
  const handleAnimeSelect = useCallback(async (item) => {
    setStatus({ message: `Loading "${item.label}"...`, type: "info", loading: true });
    try {
      const data = await getJson(`/api/aniwatch?action=info&id=${encodeURIComponent(item.id)}`);
      const subCount = data?.episodes?.sub?.length || 0;
      const dubCount = data?.episodes?.dub?.length || 0;
      if (subCount === 0 && dubCount === 0) {
        setStatus({ message: "No episodes found", type: "warning", loading: false });
        return;
      }
      setSelectedAnime(item);
      setAnimeInfo(data);
      setScreen("audio-select");
      setStatus({ message: `Sub: ${subCount} eps \u2502 Dub: ${dubCount} eps`, type: "success", loading: false });
    } catch (err) {
      setStatus({ message: `Failed to load: ${err.message}`, type: "error", loading: false });
    }
  }, []);
  const handleAudioSelect = useCallback((item) => {
    const type = item.value;
    setAudioType(type);
    const eps = animeInfo?.episodes?.[type] || [];
    if (!eps.length) {
      setStatus({ message: `No ${type === "sub" ? "subbed" : "dubbed"} episodes`, type: "warning", loading: false });
      return;
    }
    setEpisodes(eps);
    setScreen("episode-select");
    setStatus({ message: `${eps.length} ${type === "sub" ? "subbed" : "dubbed"} episodes`, type: "success", loading: false });
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
      if (watchPercentage >= 97 && targetEpisode < eps.length) {
        targetEpisode += 1;
        const nextEp = eps.find((e) => e.number === targetEpisode);
        if (nextEp) {
          setStatus({ message: `Episode ${targetEpisode - 1} completed! Loading Episode ${targetEpisode}...`, type: "success", loading: true });
          setAutoPlayEpisode({ episodeId: nextEp.episodeId, number: targetEpisode });
          setScreen("episode-select");
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
      const sourcesData = await getJson(
        `/api/aniwatch?action=sources&episodeId=${encodeURIComponent(item.episodeId)}&category=${audioType}&audio=${audioType}&title=${encodeURIComponent(animeTitle)}&title_ro=${encodeURIComponent(animeJName)}&episodeNo=${item.number || 1}&totalEpisodes=${totalEps}`
      );
      const source = pickPlayableSource(sourcesData?.sources);
      if (!source?.url) {
        setStatus({ message: "No playable source found", type: "error", loading: false });
        return;
      }
      const prevProgress = !startPosition ? getWatchProgress(selectedAnime?.id || "", item.number || 1) : null;
      const resumeTime = startPosition || prevProgress?.watchTime || 0;
      const streamHeaders = sourcesData?.headers || {};
      const directUrl = source.url;
      const proxyHeaders = Buffer.from(JSON.stringify(streamHeaders)).toString("base64");
      const proxyUrl = `${API_BASE}/api/stream?url=${encodeURIComponent(directUrl)}&h=${encodeURIComponent(proxyHeaders)}`;
      const player = getPlayerCommand();
      if (!player) {
        setStatus({ message: "No player found. Install mpv or vlc.", type: "warning", loading: false });
        return;
      }
      const epAnimeTitle = selectedAnime?.label || animeInfo?.name || animeInfo?.title || "";
      const title = `${epAnimeTitle || "Anime"} - Episode ${item.number} (${audioType.toUpperCase()})`;
      const animeId = selectedAnime?.id || "";
      const episodeNum = item.number || 1;
      const sourceReferer = source.headers?.Referer || streamHeaders.Referer || streamHeaders.referer || "https://allanime.day";
      const sourceOrigin = source.headers?.Origin || streamHeaders.Origin || streamHeaders.origin || new URL(sourceReferer).origin;
      const ipcPath = `/tmp/nycli-mpv-${process.pid}.sock`;
      let args = [];
      if (player === "mpv") {
        args = [
          "--ytdl=no",
          `--force-media-title=${title}`,
          `--input-ipc-server=${ipcPath}`
        ];
        args.push(`--http-header-fields=Referer: ${sourceReferer},Origin: ${sourceOrigin}`);
        args.push(`--referrer=${sourceReferer}`);
        const settings = loadSettings();
        if (settings.anime4k && isAnime4kInstalled()) {
          const shaderPath = getAnime4kShaders(settings.anime4kMode);
          args.push(`--glsl-shaders=${shaderPath}`);
          args.push("--profile=gpu-hq");
        }
        if (resumeTime > 5) {
          args.push(`--start=${Math.floor(resumeTime)}`);
          setStatus({ message: `Resuming from ${formatTime(resumeTime)}...`, type: "success", loading: false });
        } else {
          setStatus({ message: `Opening ${player}...`, type: "success", loading: false });
        }
        args.push(directUrl);
      } else if (player === "vlc") {
        args = ["--meta-title", title, "--play-and-exit"];
        args.push(`--http-referrer=${sourceReferer}`);
        if (resumeTime > 5) {
          args.push(`--start-time=${Math.floor(resumeTime)}`);
        }
        args.push(directUrl);
        setStatus({ message: `Opening ${player}...`, type: "success", loading: false });
      } else {
        args = [proxyUrl];
        setStatus({ message: `Opening ${player}...`, type: "success", loading: false });
      }
      const child = spawn(player, args, { stdio: "ignore", detached: false });
      if (player === "mpv") {
        let lastPosition = 0;
        let duration = 0;
        const trackProgress = async () => {
          try {
            await new Promise((r) => setTimeout(r, 2e3));
            const net = __require("node:net");
            const client = new net.Socket();
            client.connect(ipcPath, () => {
              const poll = setInterval(() => {
                try {
                  client.write('{"command": ["get_property", "time-pos"]}\n');
                  client.write('{"command": ["get_property", "duration"]}\n');
                } catch {
                  clearInterval(poll);
                }
              }, 5e3);
              client.on("close", () => {
                clearInterval(poll);
                if (lastPosition > 0 && animeId && epAnimeTitle) {
                  saveWatchProgress(animeId, episodeNum, lastPosition, duration);
                  saveToHistory({
                    id: animeId,
                    title: epAnimeTitle,
                    episode: episodeNum,
                    timestamp: Date.now(),
                    category: audioType,
                    watchTime: lastPosition,
                    duration,
                    totalEpisodes: totalEps
                  });
                  setHistory(getHistory());
                }
              });
            });
            client.on("data", (data) => {
              const lines = data.toString().split("\n").filter(Boolean);
              for (const line of lines) {
                try {
                  const json = JSON.parse(line);
                  if (json.data !== void 0 && json.data !== null) {
                    if (typeof json.data === "number") {
                      if (json.data > 60 && json.data < 7200) {
                        if (duration === 0 || Math.abs(json.data - duration) < 10) {
                          duration = json.data;
                        }
                      }
                      if (duration > 0 && json.data < duration) {
                        lastPosition = json.data;
                      } else if (duration === 0) {
                        lastPosition = json.data;
                      }
                    }
                  }
                } catch {
                }
              }
            });
            client.on("error", () => {
            });
          } catch {
          }
        };
        trackProgress();
      }
      child.on("exit", () => {
        try {
          __require("fs").unlinkSync(ipcPath);
        } catch {
        }
      });
      setStatus({ message: "Player launched! Select another episode or press b to go back.", type: "info", loading: false });
      if (animeId && animeTitle) {
        saveToHistory({
          id: animeId,
          title: animeTitle,
          episode: episodeNum,
          timestamp: Date.now(),
          category: audioType,
          totalEpisodes: totalEps
        });
        setHistory(getHistory());
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
  const animeItems = animes.map((a) => ({
    id: a.id,
    label: a.name || a.title || "Untitled",
    badge: a.episodes ? `sub ${a.episodes.sub || 0} / dub ${a.episodes.dub || 0}` : void 0,
    imageUrl: a.poster || void 0
  }));
  const audioOptions = [
    {
      value: "sub",
      label: "Japanese (Subbed)",
      badge: `${animeInfo?.episodes?.sub?.length || 0} episodes`
    },
    {
      value: "dub",
      label: "English (Dubbed)",
      badge: `${animeInfo?.episodes?.dub?.length || 0} episodes`
    }
  ].filter((opt) => {
    const count = opt.value === "sub" ? animeInfo?.episodes?.sub?.length : animeInfo?.episodes?.dub?.length;
    return count > 0;
  });
  const episodeItems = episodes.map((e, idx) => ({
    episodeId: e.episodeId,
    // Use original index + 1 as episode number if number is missing/0
    number: e.number || idx + 1,
    title: e.title
  })).filter((ep, idx, arr) => arr.findIndex((e) => e.number === ep.number) === idx).sort((a, b) => a.number - b.number).map((e) => ({
    episodeId: e.episodeId,
    number: e.number,
    label: `Episode ${e.number}${e.title && !e.title.includes("Episode") ? `: ${e.title}` : ""}`
  }));
  const historyItems = history.filter((h) => {
    if (!h || !h.id || !h.title) return false;
    if (String(h.id).includes("undefined") || String(h.title).includes("undefined")) return false;
    if (h.title.trim() === "" || h.id.trim() === "") return false;
    return true;
  }).map((h) => {
    const progress = getWatchProgress(h.id, h.episode);
    const percentage = progress ? Math.round(getWatchPercentage(progress.watchTime, progress.duration)) : 0;
    const almostDone = percentage >= 97;
    const progressStr = percentage > 0 ? almostDone ? " - Almost done!" : ` \u2022 ${percentage}%` : "";
    return {
      id: h.id,
      label: h.title,
      badge: `Ep ${h.episode} \u2022 ${h.category.toUpperCase()}${progressStr}`,
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
    return /* @__PURE__ */ React.createElement(Box, { flexDirection: "column", padding: 1, alignItems: "center" }, /* @__PURE__ */ React.createElement(Banner, { phase: bannerPhase }), /* @__PURE__ */ React.createElement(Box, { marginTop: 2, justifyContent: "center" }, /* @__PURE__ */ React.createElement(GoodbyeMessage, { onComplete: () => process.exit(0) })));
  }
  return /* @__PURE__ */ React.createElement(Box, { flexDirection: "column", padding: 1, alignItems: "center" }, /* @__PURE__ */ React.createElement(Banner, { phase: bannerPhase }), showWelcome && screen === "main-menu" && /* @__PURE__ */ React.createElement(Box, { marginBottom: 1, justifyContent: "center", width: "100%" }, /* @__PURE__ */ React.createElement(
    ScrollingWelcome,
    {
      text: "~ Youkoso! Welcome to NyAnime CLI! ~",
      onComplete: () => setShowWelcome(false)
    }
  )), screen === "main-menu" && !showWelcome && /* @__PURE__ */ React.createElement(Box, { flexDirection: "column", width: 55, alignItems: "center" }, loggedIn ? /* @__PURE__ */ React.createElement(Box, { marginBottom: 1, borderStyle: "round", borderColor: theme.purple, paddingX: 2, paddingY: 0, width: 55 }, /* @__PURE__ */ React.createElement(Text, { color: theme.cyan }, "Okaeri, "), /* @__PURE__ */ React.createElement(ShimmerText, { text: username, speed: 150 }), /* @__PURE__ */ React.createElement(Text, { color: theme.cyan }, "!")) : /* @__PURE__ */ React.createElement(Box, { marginBottom: 1, borderStyle: "round", borderColor: theme.purple, paddingX: 2, paddingY: 0, width: 55 }, /* @__PURE__ */ React.createElement(WaveText, { text: "Irasshaimase! Sign in for all features", colors: [theme.purple, theme.blue, theme.pink, theme.cyan], speed: 150 })), /* @__PURE__ */ React.createElement(
    SelectList,
    {
      items: loggedIn ? loggedInMenuItems : loggedOutMenuItems,
      onSelect: handleMenuSelect,
      color: theme.cyan,
      showBorder: true
    }
  )), screen === "search" && /* @__PURE__ */ React.createElement(
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
  ), screen === "audio-select" && /* @__PURE__ */ React.createElement(Box, { flexDirection: "column" }, /* @__PURE__ */ React.createElement(Text, { color: theme.pink, bold: true }, "\u{1F4FA} ", selectedAnime?.label || "Anime"), /* @__PURE__ */ React.createElement(Box, { marginTop: 1 }, /* @__PURE__ */ React.createElement(
    SelectList,
    {
      items: audioOptions,
      onSelect: handleAudioSelect,
      onBack: goBack,
      title: "\u{1F50A} Select Audio Type",
      color: theme.cyan
    }
  ))), screen === "episode-select" && /* @__PURE__ */ React.createElement(Box, { flexDirection: "column" }, /* @__PURE__ */ React.createElement(Text, { color: theme.pink, bold: true }, "\u{1F4FA} ", selectedAnime?.label || "Anime", " ", /* @__PURE__ */ React.createElement(Text, { color: theme.cyan }, "(", audioType.toUpperCase(), ")")), /* @__PURE__ */ React.createElement(Box, { marginTop: 1 }, /* @__PURE__ */ React.createElement(
    SelectList,
    {
      items: episodeItems,
      onSelect: handleEpisodeSelect,
      onBack: goBack,
      title: `\u{1F4CB} Select Episode (${episodeItems.length} total)`,
      color: theme.blue,
      showNumbers: false,
      enableSearch: episodeItems.length > 20
    }
  ))), screen === "login-waiting" && /* @__PURE__ */ React.createElement(Box, { flexDirection: "column", width: 55 }, /* @__PURE__ */ React.createElement(Box, { borderStyle: "round", borderColor: theme.purple, paddingX: 2, paddingY: 1, flexDirection: "column" }, /* @__PURE__ */ React.createElement(Text, { color: theme.purple, bold: true }, "[L] Login to NyAnime"), /* @__PURE__ */ React.createElement(Text, { color: theme.dimGray }, "\u2500".repeat(45)), /* @__PURE__ */ React.createElement(Text, { color: theme.lightGray }, "1. Check your browser"), /* @__PURE__ */ React.createElement(Text, { color: theme.lightGray }, "2. Sign in or Authorize ny-cli"), /* @__PURE__ */ React.createElement(Text, { color: theme.lightGray }, "3. Return to terminal when done"), /* @__PURE__ */ React.createElement(Text, { color: theme.dimGray }, "\u2500".repeat(45)), /* @__PURE__ */ React.createElement(Text, { color: theme.cyan }, "Waiting for authorization..."))), screen === "profile" && /* @__PURE__ */ React.createElement(Box, { flexDirection: "row", gap: 2 }, userPhotoUrl ? /* @__PURE__ */ React.createElement(Box, { width: 18, height: 14 }, /* @__PURE__ */ React.createElement(AnimeArtwork, { title: "", imageUrl: userPhotoUrl, width: 18, height: 14 })) : /* @__PURE__ */ React.createElement(Box, { borderStyle: "round", borderColor: theme.purple, width: 16, height: 12, justifyContent: "center", alignItems: "center" }, /* @__PURE__ */ React.createElement(Text, { color: theme.dimGray }, "[No Photo]")), /* @__PURE__ */ React.createElement(Box, { flexDirection: "column", width: 50 }, /* @__PURE__ */ React.createElement(Box, { borderStyle: "round", borderColor: theme.purple, paddingX: 2, paddingY: 1, flexDirection: "column" }, /* @__PURE__ */ React.createElement(Text, { color: theme.purple, bold: true }, "[P] ", username), /* @__PURE__ */ React.createElement(Text, { color: theme.dimGray }, "\u2500".repeat(35)), /* @__PURE__ */ React.createElement(Text, { color: theme.lightGray }, "UID: ", /* @__PURE__ */ React.createElement(Text, { color: theme.cyan }, getToken().substring(0, 12), "...")), syncMessage ? /* @__PURE__ */ React.createElement(Text, { color: theme.cyan }, syncMessage) : null), /* @__PURE__ */ React.createElement(Box, { marginTop: 1 }, /* @__PURE__ */ React.createElement(
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
  ), screen === "help" && /* @__PURE__ */ React.createElement(Box, { flexDirection: "column", width: 55 }, /* @__PURE__ */ React.createElement(Box, { borderStyle: "round", borderColor: theme.blue, paddingX: 2, paddingY: 1, flexDirection: "column" }, /* @__PURE__ */ React.createElement(Text, { color: theme.blue, bold: true }, "[?] NY-CLI Help"), /* @__PURE__ */ React.createElement(Text, { color: theme.dimGray }, "\u2500".repeat(45)), /* @__PURE__ */ React.createElement(Text, null, " "), /* @__PURE__ */ React.createElement(Text, { color: theme.cyan }, "USAGE:"), /* @__PURE__ */ React.createElement(Text, { color: theme.lightGray }, "  ny-cli              Interactive mode"), /* @__PURE__ */ React.createElement(Text, { color: theme.lightGray }, '  ny-cli "one piece"  Quick search'), /* @__PURE__ */ React.createElement(Text, null, " "), /* @__PURE__ */ React.createElement(Text, { color: theme.cyan }, "NAVIGATION:"), /* @__PURE__ */ React.createElement(Text, { color: theme.lightGray }, "  Up/Down or j/k  Navigate"), /* @__PURE__ */ React.createElement(Text, { color: theme.lightGray }, "  Enter           Select"), /* @__PURE__ */ React.createElement(Text, { color: theme.lightGray }, "  b or Left       Go back"), /* @__PURE__ */ React.createElement(Text, { color: theme.lightGray }, "  1-9             Quick select"), /* @__PURE__ */ React.createElement(Text, { color: theme.lightGray }, "  q               Quit"), /* @__PURE__ */ React.createElement(Text, null, " "), /* @__PURE__ */ React.createElement(Text, { color: theme.cyan }, "CLOUD SYNC:"), /* @__PURE__ */ React.createElement(Text, { color: theme.lightGray }, "  Login with your nyanime.qzz.io account"), /* @__PURE__ */ React.createElement(Text, { color: theme.lightGray }, "  to sync watch history across devices"), /* @__PURE__ */ React.createElement(Text, null, " "), /* @__PURE__ */ React.createElement(Text, { color: theme.cyan }, "PLAYER (mpv):"), /* @__PURE__ */ React.createElement(Text, { color: theme.lightGray }, "  Space  Play/Pause  |  f  Fullscreen"), /* @__PURE__ */ React.createElement(Text, { color: theme.lightGray }, "  Left/Right   Seek  |  q  Quit")), /* @__PURE__ */ React.createElement(Box, { marginTop: 1 }, /* @__PURE__ */ React.createElement(Text, { color: theme.dimGray }, "Press b or Left to go back")), /* @__PURE__ */ React.createElement(HelpBackHandler, { onBack: goBack })), /* @__PURE__ */ React.createElement(Box, { marginTop: 1 }, /* @__PURE__ */ React.createElement(StatusBar, { ...status })));
}
function HelpBackHandler({ onBack }) {
  useInput((input, key) => {
    if (key.escape || input === "b" || key.leftArrow || input === "q") {
      if (input === "q") process.exit(0);
      onBack();
    }
  });
  return null;
}
process.stdout.write("\x1Bc");
var instance = render(
  /* @__PURE__ */ React.createElement(TerminalInfoProvider, null, /* @__PURE__ */ React.createElement(App, null))
);
process.on("exit", () => {
  instance.clear();
});
process.on("SIGINT", () => {
  instance.clear();
  process.exit(0);
});
process.on("SIGTERM", () => {
  instance.clear();
  process.exit(0);
});
