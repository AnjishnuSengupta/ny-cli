import { fetch as undiciFetch, Agent, ProxyAgent, buildConnector } from 'undici';
import { dnsLookup, resolveHost } from './dns.mjs';
import { loadConfig } from './config.mjs';

const CONNECT_TIMEOUT = 10000;

let sharedAgent = null;
let directAgent = null;
let safeAgent = null;
let currentLookup = null;

export function isPrivateOrLoopback(ipOrHost) {
  if (!ipOrHost) return true;
  let host = String(ipOrHost).toLowerCase().trim();
  if (host.startsWith('::ffff:')) host = host.slice(7);
  if (host === '::1' || host === '::' || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return true;
  if (host.startsWith('fe80:') || host.startsWith('fc') || host.startsWith('fd')) return true;

  const parts = host.split('.').map(Number);
  if (parts.length === 4 && parts.every((p) => !isNaN(p) && p >= 0 && p <= 255)) {
    const [a, b, c] = parts;
    if (a === 0) return true; // 0.0.0.0/8
    if (a === 127) return true; // 127.0.0.0/8
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 169 && b === 254) return true; // 169.254.0.0/16
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10
    if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15
    if (a === 192 && b === 0 && c === 2) return true; // 192.0.2.0/24
    if (a === 198 && b === 51 && c === 100) return true; // 198.51.100.0/24
    if (a === 203 && b === 0 && c === 113) return true; // 203.0.113.0/24
    if (a >= 224) return true; // Multicast & Reserved (224.0.0.0/4 and 240.0.0.0/4)
    return false;
  }
  return false;
}

export function safeDnsLookup(hostname, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  } else if (typeof options === 'number') {
    options = { family: options };
  } else if (!options) {
    options = {};
  }

  if (isPrivateOrLoopback(hostname)) {
    return callback(new Error(`Forbidden: private or loopback host (${hostname})`));
  }

  resolveHost(hostname, { ...options, all: true })
    .then(result => {
      const records = result.records || [];
      if (!records.length) {
        return callback(new Error(`No DNS records found for ${hostname}`));
      }
      for (const rec of records) {
        if (isPrivateOrLoopback(rec.address)) {
          return callback(new Error(`Forbidden: resolved to private/loopback IP (${rec.address})`));
        }
      }
      if (options.all) {
        callback(null, records);
      } else {
        const primary = records[0];
        callback(null, primary.address, primary.family);
      }
    })
    .catch(err => {
      callback(err);
    });
}

function sanitizeProxyUrl(proxyUrl) {
  try {
    const parsed = new URL(proxyUrl);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return 'configured proxy';
  }
}

function getEffectiveProxyUrl() {
  const cfg = loadConfig();
  return cfg.proxyUrl || null;
}

function getDirectAgent() {
  if (!directAgent) {
    directAgent = new Agent({
      connect: {
        timeout: 2000,
      },
    });
  }
  return directAgent;
}

function createAgent(options = {}) {
  const proxyUrl = options.proxyUrl || getEffectiveProxyUrl();

  if (proxyUrl) {
    console.log(`[net] routing through proxy: ${sanitizeProxyUrl(proxyUrl)}`);
    return new ProxyAgent({
      uri: proxyUrl,
      connect: {
        timeout: CONNECT_TIMEOUT,
      },
    });
  }

  const lookup = options.lookup !== undefined ? options.lookup : (currentLookup || dnsLookup);
  const connectOpts = {
    timeout: CONNECT_TIMEOUT,
  };

  if (lookup) {
    connectOpts.lookup = lookup;
  }

  return new Agent({
    connect: connectOpts,
  });
}

export function setDnsLookup(lookupFn) {
  currentLookup = lookupFn;
  sharedAgent = createAgent({ lookup: currentLookup });
}

export function getSharedAgent(options = {}) {
  if (sharedAgent && !options.recreate) {
    return sharedAgent;
  }
  sharedAgent = createAgent(options);
  return sharedAgent;
}

export function setSharedAgent(agent) {
  sharedAgent = agent;
}

export function getSafeAgent(options = {}) {
  const proxyUrl = options.proxyUrl || getEffectiveProxyUrl();
  if (proxyUrl) {
    return new ProxyAgent({
      uri: proxyUrl,
      connect: {
        timeout: CONNECT_TIMEOUT,
      },
    });
  }

  if (safeAgent && !options.recreate) {
    return safeAgent;
  }

  const baseConnector = buildConnector({
    timeout: CONNECT_TIMEOUT,
    lookup: safeDnsLookup,
  });

  const safeConnector = (opts, callback) => {
    if (isPrivateOrLoopback(opts.hostname)) {
      return callback(new Error(`Forbidden: private or loopback host (${opts.hostname})`));
    }
    baseConnector(opts, callback);
  };

  safeAgent = new Agent({
    connect: safeConnector,
  });

  return safeAgent;
}

/**
 * Universal HTTP fetch wrapper.
 * Uses undici fetch with a single shared agent and connection timeout.
 * When options.skipDns is true, uses a direct agent without custom DNS.
 */
export async function httpFetch(url, options = {}) {
  let agent;
  if (options.skipDns) {
    agent = getDirectAgent();
  } else {
    agent = options.dispatcher || getSharedAgent();
  }
  const { dispatcher, skipDns, ...fetchOptions } = options;
  return undiciFetch(url, {
    ...fetchOptions,
    dispatcher: agent,
  });
}

/**
 * Safe HTTP fetch with manual redirect following, connection-time IP validation,
 * and hop-by-hop safety checks.
 */
export async function safeHttpFetch(url, options = {}) {
  const maxRedirects = options.maxRedirects ?? 5;
  const { onRedirect, ...fetchOptions } = options;
  let currentUrl = new URL(url);
  let hops = 0;

  while (true) {
    if (currentUrl.protocol !== 'http:' && currentUrl.protocol !== 'https:') {
      throw new Error(`Forbidden: protocol ${currentUrl.protocol} not allowed`);
    }

    if (isPrivateOrLoopback(currentUrl.hostname)) {
      throw new Error(`Forbidden: private or loopback host (${currentUrl.hostname})`);
    }

    // Resolve hostname using custom DoH/configured resolver and validate records before connecting
    const dnsRes = await resolveHost(currentUrl.hostname, { all: true });
    for (const rec of (dnsRes.records || [])) {
      if (isPrivateOrLoopback(rec.address)) {
        throw new Error(`Forbidden: resolved to private/loopback IP (${rec.address})`);
      }
    }

    if (hops > 0 && typeof onRedirect === 'function') {
      await onRedirect(currentUrl);
    }

    const agent = options.dispatcher || getSafeAgent();
    let res;
    try {
      res = await undiciFetch(currentUrl.toString(), {
        ...fetchOptions,
        dispatcher: agent,
        redirect: 'manual',
      });
    } catch (err) {
      if (err.cause?.message?.startsWith('Forbidden:')) {
        throw new Error(err.cause.message);
      }
      throw err;
    }

    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const location = res.headers.get('location');
      if (!location) {
        return res;
      }
      hops++;
      if (hops > maxRedirects) {
        throw new Error(`Too many redirects (max ${maxRedirects})`);
      }
      currentUrl = new URL(location, currentUrl);
      continue;
    }

    return res;
  }
}

export default httpFetch;
