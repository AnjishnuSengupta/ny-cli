import dns from 'node:dns';
import { Agent, setGlobalDispatcher } from 'undici';

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
