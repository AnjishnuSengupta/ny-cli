import dns from 'node:dns';
import { Agent, setGlobalDispatcher, ProxyAgent } from 'undici';

// ── Proxy support ────────────────────────────────────────────────────────────
// Precedence: NY_PROXY > HTTPS_PROXY > HTTP_PROXY > no proxy (DNS override only)
const proxyUrl = process.env.NY_PROXY || process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.https_proxy || process.env.http_proxy;

if (proxyUrl) {
  console.log(`[ny-cli] Routing requests through proxy: ${proxyUrl}`);
  try {
    setGlobalDispatcher(new ProxyAgent(proxyUrl));
  } catch (e) {
    console.error(`[ny-cli] Failed to configure proxy (${proxyUrl}):`, e.message);
    console.log('[ny-cli] Falling back to Cloudflare DNS override');
    setupDnsOverride();
  }
} else {
  setupDnsOverride();
}

// ── Cloudflare DNS override (default when no proxy is set) ───────────────────
function setupDnsOverride() {
  const resolver = new dns.Resolver();
  resolver.setServers(['1.1.1.1', '1.0.0.1']);

  function cloudflareLookup(hostname, options, callback) {
    resolver.resolve4(hostname, (err4, addrs4) => {
      if (!err4 && addrs4?.length) return callback(null, [{ address: addrs4[0], family: 4 }]);
      resolver.resolve6(hostname, (err6, addrs6) => {
        if (!err6 && addrs6?.length) return callback(null, [{ address: addrs6[0], family: 6 }]);
        
        dns.lookup(hostname, { all: true, ...options }, (err, addresses) => {
          if (err) return callback(err);
          const formatted = Array.isArray(addresses) ? addresses : [{ address: addresses, family: options.family || 4 }];
          callback(null, formatted);
        });
      });
    });
  }

  setGlobalDispatcher(new Agent({ connect: { lookup: cloudflareLookup } }));
}
