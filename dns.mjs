import dns from 'node:dns';
import { isIP } from 'node:net';
import { httpFetch } from './net.mjs';

const CACHE_TTL_MS = 5 * 60 * 1000;      // 5 minutes in memory
const RESOLVER_TIMEOUT_MS = 1500;        // 1500 ms short timeout

// Cache map: hostname -> { records: [{ address, family }], expiresAt: number, mode: string }
const dnsCache = new Map();

let currentDnsMode = null;

export const LAYER_FAILURE_TTL_MS = 60 * 1000;      // 60 seconds failure memory
const layerFailures = new Map();

export function isLayerFailed(layerKey) {
  const item = layerFailures.get(layerKey);
  if (!item) return false;
  if (Date.now() > item.expiresAt) {
    layerFailures.delete(layerKey);
    return false;
  }
  return true;
}

export function recordLayerFailure(layerKey, error = null) {
  layerFailures.set(layerKey, {
    expiresAt: Date.now() + LAYER_FAILURE_TTL_MS,
    error: error?.message || 'failed',
    time: Date.now(),
  });
}

export function recordLayerSuccess(layerKey) {
  layerFailures.delete(layerKey);
}

export function getLayerFailures() {
  const now = Date.now();
  const active = {};
  for (const [k, v] of layerFailures.entries()) {
    if (v.expiresAt > now) {
      active[k] = { ...v, remainingMs: v.expiresAt - now };
    } else {
      layerFailures.delete(k);
    }
  }
  return active;
}

export function clearLayerFailures() {
  layerFailures.clear();
}

export function clearDnsCache() {
  dnsCache.clear();
  clearLayerFailures();
}

import { loadConfig } from './config.mjs';

export function isProxyConfigured() {
  const cfg = loadConfig();
  return Boolean(cfg.proxyUrl && cfg.proxyUrl.trim());
}

export function getDnsMode() {
  if (currentDnsMode) return currentDnsMode;
  const cfg = loadConfig();
  return cfg.dns || 'cloudflare-doh';
}

export function setDnsMode(mode) {
  if (mode && ['system', 'cloudflare-udp', 'cloudflare-doh'].includes(mode.trim().toLowerCase())) {
    currentDnsMode = mode.trim().toLowerCase();
  } else {
    currentDnsMode = 'cloudflare-doh';
  }
}

/**
 * Perform DoH query to 1.1.1.1 (Cloudflare) or 8.8.8.8 (Google)
 */
export async function resolveDoH(hostname, family = 0, server = '1.1.1.1') {
  const recordType = family === 6 ? 'AAAA' : 'A';
  const url = server === '8.8.8.8'
    ? `https://${server}/resolve?name=${encodeURIComponent(hostname)}&type=${recordType}`
    : `https://${server}/dns-query?name=${encodeURIComponent(hostname)}&type=${recordType}`;

  const res = await httpFetch(url, {
    headers: { Accept: 'application/dns-json' },
    signal: AbortSignal.timeout(RESOLVER_TIMEOUT_MS),
    skipDns: true,
  });

  if (!res.ok) {
    throw new Error(`DoH server ${server} returned HTTP ${res.status}`);
  }

  const data = await res.json();
  if (data.Status !== 0 && data.Status !== undefined) {
    throw new Error(`DoH server ${server} response status ${data.Status}`);
  }

  const answers = Array.isArray(data.Answer) ? data.Answer : [];
  const records = [];

  for (const ans of answers) {
    if (ans.type === 1 && isIP(ans.data) === 4) {
      records.push({ address: ans.data, family: 4 });
    } else if (ans.type === 28 && isIP(ans.data) === 6) {
      records.push({ address: ans.data, family: 6 });
    }
  }

  if (!records.length) {
    throw new Error(`DoH server ${server} returned no matching records for ${hostname}`);
  }

  return records;
}

/**
 * Perform UDP DNS resolution using dns.Resolver with timeout
 */
export async function resolveUdp(hostname, family = 0, servers = ['1.1.1.1', '1.0.0.1']) {
  const resolver = new dns.Resolver();
  resolver.setServers(servers);

  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { resolver.cancel(); } catch {}
      reject(new Error(`UDP DNS query to ${servers[0]} timed out after ${RESOLVER_TIMEOUT_MS}ms`));
    }, RESOLVER_TIMEOUT_MS);

    const done = (err, records) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err) return reject(err);
      resolve(records);
    };

    if (family === 6) {
      resolver.resolve6(hostname, (err, addrs) => {
        if (err) return done(err);
        done(null, (addrs || []).map(addr => ({ address: addr, family: 6 })));
      });
    } else {
      resolver.resolve4(hostname, (err, addrs) => {
        if (!err && addrs?.length) {
          return done(null, addrs.map(addr => ({ address: addr, family: 4 })));
        }
        if (family === 0) {
          resolver.resolve6(hostname, (err6, addrs6) => {
            if (err6) return done(err);
            done(null, (addrs6 || []).map(addr => ({ address: addr, family: 6 })));
          });
        } else {
          done(err);
        }
      });
    }
  });
}

/**
 * Perform system lookup using node:dns
 */
async function resolveSystem(hostname, options = {}) {
  return new Promise((resolve, reject) => {
    dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
      if (err) return reject(err);
      const records = Array.isArray(addresses)
        ? addresses
        : [{ address: addresses, family: options.family || 4 }];
      resolve(records);
    });
  });
}

/**
 * Core resolver according to mode and fallback rules
 */
export async function resolveWithMode(hostname, family = 0, mode = getDnsMode()) {
  let records;

  if (mode === 'system') {
    records = await resolveSystem(hostname, { family });
    return { records, mode: 'system' };
  }

  if (mode === 'cloudflare-udp') {
    if (!isLayerFailed('udp:cloudflare')) {
      try {
        records = await resolveUdp(hostname, family, ['1.1.1.1', '1.0.0.1']);
        recordLayerSuccess('udp:cloudflare');
        return { records, mode: 'cloudflare-udp' };
      } catch (err) {
        recordLayerFailure('udp:cloudflare', err);
      }
    }
    // Fallback to system
    records = await resolveSystem(hostname, { family });
    return { records, mode: 'system' };
  }

  // mode === 'cloudflare-doh': fallback order: DoH 1.1.1.1 -> DoH 8.8.8.8 -> UDP -> system
  if (!isLayerFailed('doh:1.1.1.1')) {
    try {
      records = await resolveDoH(hostname, family, '1.1.1.1');
      recordLayerSuccess('doh:1.1.1.1');
      return { records, mode: 'cloudflare-doh:1.1.1.1' };
    } catch (err1) {
      recordLayerFailure('doh:1.1.1.1', err1);
    }
  }

  if (!isLayerFailed('doh:8.8.8.8')) {
    try {
      records = await resolveDoH(hostname, family, '8.8.8.8');
      recordLayerSuccess('doh:8.8.8.8');
      return { records, mode: 'cloudflare-doh:8.8.8.8' };
    } catch (err2) {
      recordLayerFailure('doh:8.8.8.8', err2);
    }
  }

  if (!isLayerFailed('udp:cloudflare')) {
    try {
      records = await resolveUdp(hostname, family, ['1.1.1.1', '1.0.0.1']);
      recordLayerSuccess('udp:cloudflare');
      return { records, mode: 'cloudflare-udp' };
    } catch (err3) {
      recordLayerFailure('udp:cloudflare', err3);
    }
  }

  records = await resolveSystem(hostname, { family });
  return { records, mode: 'system' };
}

/**
 * High-level resolveHost returning diagnostic details and caching
 */
export async function resolveHost(hostname, options = {}) {
  const wantAll = Boolean(options.all);
  const wantFamily = Number(options.family) || 0;
  const mode = options.mode || getDnsMode();

  // 1. Literal IP addresses
  const ipFamily = isIP(hostname);
  if (ipFamily) {
    const records = [{ address: hostname, family: ipFamily }];
    return {
      records,
      address: hostname,
      family: ipFamily,
      mode: 'literal-ip',
      timeMs: 0,
      fromCache: false,
    };
  }

  // 2. localhost
  if (hostname === 'localhost') {
    const fam = wantFamily === 6 ? 6 : 4;
    const addr = fam === 6 ? '::1' : '127.0.0.1';
    const records = [{ address: addr, family: fam }];
    return {
      records,
      address: addr,
      family: fam,
      mode: 'localhost',
      timeMs: 0,
      fromCache: false,
    };
  }

  // 3. Check proxy
  if (isProxyConfigured()) {
    const t0 = performance.now();
    const records = await resolveSystem(hostname, { family: wantFamily });
    const timeMs = Math.round(performance.now() - t0);
    return {
      records,
      address: records[0]?.address,
      family: records[0]?.family,
      mode: 'proxy-system',
      timeMs,
      fromCache: false,
    };
  }

  // 4. Cache check
  const cached = dnsCache.get(hostname);
  if (cached && Date.now() < cached.expiresAt) {
    const matching = wantFamily
      ? cached.records.filter(r => r.family === wantFamily)
      : cached.records;
    const resultRecords = matching.length ? matching : cached.records;
    return {
      records: resultRecords,
      address: resultRecords[0]?.address,
      family: resultRecords[0]?.family,
      mode: cached.mode,
      timeMs: 0,
      fromCache: true,
    };
  }

  // 5. Fresh resolve
  const t0 = performance.now();
  const { records, mode: usedMode } = await resolveWithMode(hostname, wantFamily, mode);
  const timeMs = Math.round(performance.now() - t0);

  dnsCache.set(hostname, {
    records,
    expiresAt: Date.now() + CACHE_TTL_MS,
    mode: usedMode,
  });

  const matching = wantFamily
    ? records.filter(r => r.family === wantFamily)
    : records;
  const resultRecords = matching.length ? matching : records;

  return {
    records: resultRecords,
    address: resultRecords[0]?.address,
    family: resultRecords[0]?.family,
    mode: usedMode,
    timeMs,
    fromCache: false,
  };
}

/**
 * Standard Node.js dns.lookup replacement
 * Supports options.all (returns [{ address, family }]) or single address (address, family)
 */
export function dnsLookup(hostname, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  } else if (typeof options === 'number') {
    options = { family: options };
  } else if (!options) {
    options = {};
  }

  resolveHost(hostname, options)
    .then(result => {
      if (options.all) {
        callback(null, result.records);
      } else {
        callback(null, result.address, result.family);
      }
    })
    .catch(err => {
      callback(err);
    });
}

export default dnsLookup;
