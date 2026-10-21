import fs from 'node:fs';
import { configFile, ensureDirs, ensureSecureFiles } from './paths.mjs';

const VALID_DNS_MODES = ['system', 'cloudflare-udp', 'cloudflare-doh'];
const VALID_PLAYERS = ['auto', 'mpv', 'vlc'];
const VALID_SKIP_MODES = ['off', 'chapters', 'auto'];

export const DEFAULT_CONFIG = {
  relayUrl: '',
  proxyUrl: '',
  dns: 'cloudflare-doh',
  player: 'auto',
  skipMode: 'off',
  adultFilter: true,
  providers: {
    senshi: true,
    hianime: true,
    anipub: true,
    owais: false,
    allanime: false,
    anidb: false,
  },
};

let cachedConfig = null;

export function redactUrl(str) {
  if (typeof str !== 'string') return '';
  const trimmed = str.trim();
  if (!trimmed) return '';
  try {
    const u = new URL(trimmed);
    if (u.username || u.password) {
      u.username = '***';
      u.password = '***';
    }
    return u.toString();
  } catch {
    return trimmed.replace(/:\/\/([^:@/]+):([^@/]+)@/g, '://***:***@');
  }
}

function sanitizeUrl(str) {
  if (typeof str !== 'string') return '';
  const trimmed = str.trim();
  if (!trimmed) return '';
  try {
    const u = new URL(trimmed);
    if (u.protocol === 'http:' || u.protocol === 'https:') {
      return trimmed;
    }
    console.warn(`[config] invalid protocol for URL: ${redactUrl(trimmed)}`);
    return '';
  } catch {
    console.warn(`[config] invalid URL format: ${redactUrl(trimmed)}`);
    return '';
  }
}

export function loadConfig(options = { reload: false }) {
  if (cachedConfig && !options.reload) {
    return cachedConfig;
  }

  ensureDirs();

  let fileContent = {};
  if (fs.existsSync(configFile)) {
    try {
      const raw = fs.readFileSync(configFile, 'utf8');
      fileContent = JSON.parse(raw);
      if (typeof fileContent !== 'object' || fileContent === null || Array.isArray(fileContent)) {
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
    providers: { ...DEFAULT_CONFIG.providers },
  };

  // 1. relayUrl
  if (fileContent.relayUrl !== undefined) {
    if (typeof fileContent.relayUrl === 'string') {
      result.relayUrl = sanitizeUrl(fileContent.relayUrl);
    } else {
      console.warn(`[config] invalid relayUrl in config (expected string): ${fileContent.relayUrl}`);
    }
  }
  if (process.env.NY_RELAY_URL !== undefined) {
    result.relayUrl = sanitizeUrl(process.env.NY_RELAY_URL);
  }

  // 2. proxyUrl
  if (fileContent.proxyUrl !== undefined) {
    if (typeof fileContent.proxyUrl === 'string') {
      result.proxyUrl = sanitizeUrl(fileContent.proxyUrl);
    } else {
      console.warn(`[config] invalid proxyUrl in config (expected string): ${fileContent.proxyUrl}`);
    }
  }
  const envProxy = (
    process.env.NY_PROXY_URL ||
    process.env.NY_PROXY ||
    process.env.HTTPS_PROXY ||
    process.env.HTTP_PROXY ||
    process.env.https_proxy ||
    process.env.http_proxy
  );
  if (envProxy) {
    result.proxyUrl = sanitizeUrl(envProxy);
  }

  // 3. dns
  if (fileContent.dns !== undefined) {
    if (typeof fileContent.dns === 'string' && VALID_DNS_MODES.includes(fileContent.dns.toLowerCase())) {
      result.dns = fileContent.dns.toLowerCase();
    } else {
      console.warn(`[config] invalid dns mode '${fileContent.dns}', valid options: ${VALID_DNS_MODES.join(', ')}`);
    }
  }
  if (process.env.NY_DNS) {
    const envDns = process.env.NY_DNS.trim().toLowerCase();
    if (VALID_DNS_MODES.includes(envDns)) {
      result.dns = envDns;
    } else {
      console.warn(`[config] invalid NY_DNS env '${process.env.NY_DNS}', valid options: ${VALID_DNS_MODES.join(', ')}`);
    }
  }

  // 4. player
  if (fileContent.player !== undefined) {
    if (typeof fileContent.player === 'string' && VALID_PLAYERS.includes(fileContent.player.toLowerCase())) {
      result.player = fileContent.player.toLowerCase();
    } else {
      console.warn(`[config] invalid player '${fileContent.player}', valid options: ${VALID_PLAYERS.join(', ')}`);
    }
  }

  // 5. skipMode
  if (fileContent.skipMode !== undefined) {
    if (typeof fileContent.skipMode === 'string' && VALID_SKIP_MODES.includes(fileContent.skipMode.toLowerCase())) {
      result.skipMode = fileContent.skipMode.toLowerCase();
    } else {
      console.warn(`[config] invalid skipMode '${fileContent.skipMode}', valid options: ${VALID_SKIP_MODES.join(', ')}`);
    }
  }

  // 6. providers
  if (fileContent.providers !== undefined) {
    if (typeof fileContent.providers === 'object' && fileContent.providers !== null && !Array.isArray(fileContent.providers)) {
      for (const [key, val] of Object.entries(fileContent.providers)) {
        if (typeof val === 'boolean') {
          result.providers[key] = val;
        } else {
          console.warn(`[config] invalid providers.${key} (expected boolean): ${val}`);
        }
      }
    } else {
      console.warn(`[config] invalid providers in config (expected object)`);
    }
  }

  // 7. adultFilter
  result.adultFilter = DEFAULT_CONFIG.adultFilter;
  if (fileContent.adultFilter !== undefined) {
    if (typeof fileContent.adultFilter === 'boolean') {
      result.adultFilter = fileContent.adultFilter;
    } else {
      console.warn(`[config] invalid adultFilter (expected boolean): ${fileContent.adultFilter}`);
    }
  }
  if (process.env.NY_ADULT_FILTER !== undefined) {
    result.adultFilter = process.env.NY_ADULT_FILTER !== '0' && process.env.NY_ADULT_FILTER.toLowerCase() !== 'false';
  }

  cachedConfig = result;
  return result;
}

export function saveConfig(updates = {}) {
  const current = loadConfig({ reload: true });
  const merged = {
    ...current,
    ...updates,
    adultFilter: updates.adultFilter !== undefined ? updates.adultFilter : current.adultFilter,
    providers: {
      ...current.providers,
      ...(updates.providers || {}),
    },
  };

  ensureDirs();
  fs.writeFileSync(configFile, JSON.stringify(merged, null, 2), { encoding: 'utf8', mode: 0o600 });
  try { fs.chmodSync(configFile, 0o600); } catch {}
  ensureSecureFiles();
  cachedConfig = merged;
  return merged;
}

export function getConfig() {
  return cachedConfig || loadConfig();
}

export default loadConfig;
