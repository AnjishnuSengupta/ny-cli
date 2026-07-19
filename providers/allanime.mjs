import { createDecipheriv, createHash } from 'node:crypto';

const ALLANIME_API = 'https://api.allanime.day/api';
const ALLANIME_BASE = 'allanime.day';
const ALLANIME_PERSISTED_REFERER = 'https://youtu-chan.com';
const ALLANIME_GRAPHQL_REFERER = 'https://allanime.to';
const ALLANIME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:150.0) Gecko/20100101 Firefox/150.0';
const ALLANIME_EP_HASH = 'd405d0edd690624b66baba3068e0edc3ac90f1597d898a1ec8db4e5c43c00fec';

async function aaFetch(body) {
  const res = await fetch(ALLANIME_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': ALLANIME_UA,
      'Referer': ALLANIME_GRAPHQL_REFERER,
      'Origin': ALLANIME_GRAPHQL_REFERER,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`AllAnime HTTP ${res.status}`);
  return res.json();
}

async function aaFetchGET(params) {
  const url = `${ALLANIME_API}?${params.toString()}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': ALLANIME_UA,
      'Referer': ALLANIME_PERSISTED_REFERER,
      'Origin': ALLANIME_PERSISTED_REFERER,
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`AllAnime HTTP ${res.status}`);
  return res.json();
}

export async function aaSearchId(title) {
  const searchGql = `query($search:SearchInput $limit:Int $page:Int $translationType:VaildTranslationTypeEnumType $countryOrigin:VaildCountryOriginEnumType){shows(search:$search limit:$limit page:$page translationType:$translationType countryOrigin:$countryOrigin){edges{_id name availableEpisodes}}}`;
  const body = {
    variables: { search: { allowAdult: false, allowUnknown: false, query: title }, limit: 10, page: 1, translationType: 'sub', countryOrigin: 'ALL' },
    query: searchGql,
  };
  const data = await aaFetch(body);
  const edges = data?.data?.shows?.edges || [];
  if (!edges.length) return null;
  return edges[0]._id;
}

function aaDecodeProviderHex(raw) {
  if (!raw.startsWith('--')) return raw;
  const hexMap = {
    '79':'A','7a':'B','7b':'C','7c':'D','7d':'E','7e':'F','7f':'G','70':'H','71':'I','72':'J','73':'K','74':'L','75':'M','76':'N','77':'O',
    '68':'P','69':'Q','6a':'R','6b':'S','6c':'T','6d':'U','6e':'V','6f':'W','60':'X','61':'Y','62':'Z',
    '59':'a','5a':'b','5b':'c','5c':'d','5d':'e','5e':'f','5f':'g','50':'h','51':'i','52':'j','53':'k','54':'l','55':'m','56':'n','57':'o',
    '48':'p','49':'q','4a':'r','4b':'s','4c':'t','4d':'u','4e':'v','4f':'w','40':'x','41':'y','42':'z',
    '08':'0','09':'1','0a':'2','0b':'3','0c':'4','0d':'5','0e':'6','0f':'7','00':'8','01':'9',
    '15':'-','16':'.','67':'_','46':'~','02':':','17':'/','07':'?','1b':'#','63':'[','65':']','78':'@',
    '19':'!','1c':'$','1e':'&','10':'(','11':')','12':'*','13':'+','14':',','03':';','05':'=','1d':'%',
  };
  const hexStr = raw.slice(2);
  let result = '';
  for (let i = 0; i < hexStr.length; i += 2) {
    const byte = hexStr.slice(i, i + 2).toLowerCase();
    if (byte === '--') { result += '\n'; continue; }
    result += hexMap[byte] || '';
  }
  return result.replace('/clock', '/clock.json');
}

function aaDecrypt(tobeparsed) {
  const key = createHash('sha256').update('Xot36i3lK3:v1').digest();
  const buf = Buffer.from(tobeparsed, 'base64');
  const ivBytes = buf.subarray(1, 13);
  const iv = Buffer.concat([ivBytes, Buffer.from([0, 0, 0, 2])]);
  const ciphertext = buf.subarray(13, buf.length - 16);
  const decipher = createDecipheriv('aes-256-ctr', key, iv);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

async function resolveWixmp(url) {
  if (url.includes('urlset=')) {
    const parts = url.split('urlset=');
    const urls = parts[1].split(',');
    return urls[urls.length - 1]; // Pick last (usually highest quality)
  }
  return url;
}

async function aaResolveCdnUrl(cdnPath) {
  try {
    const url = `https://${ALLANIME_BASE}${cdnPath}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': ALLANIME_UA, 'Referer': ALLANIME_GRAPHQL_REFERER },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const text = await res.text();
    try {
      const json = JSON.parse(text);
      const links = json?.links || [];
      if (!links.length) return null;
      links.sort((a, b) => {
        const aRes = parseInt(a.resolutionStr || '0') || 0;
        const bRes = parseInt(b.resolutionStr || '0') || 0;
        return bRes - aRes;
      });
      return await resolveWixmp(links[0].link);
    } catch {
      const match = text.match(/"link"\s*:\s*"([^"]+)"/);
      return match ? await resolveWixmp(match[1]) : null;
    }
  } catch {
    return null;
  }
}

export async function allanimeGetSource(title, epNo, mode = 'sub', malId = null) {
  try {
    const showId = await aaSearchId(title);
    if (!showId) { console.error("Could not find showId for:", title); return null; }

    let epData;
    try {
      const params = new URLSearchParams();
      params.set('variables', JSON.stringify({ showId, translationType: mode, episodeString: String(epNo) }));
      params.set('extensions', JSON.stringify({ persistedQuery: { version: 1, sha256Hash: ALLANIME_EP_HASH } }));
      epData = await aaFetchGET(params);
      if (epData?.errors?.length) throw new Error(epData.errors[0].message);
    } catch (e) {
      const epGql = `query ($showId: String!, $translationType: VaildTranslationTypeEnumType!, $episodeString: String!) { episode( showId: $showId translationType: $translationType episodeString: $episodeString ) { episodeString sourceUrls }}`;
      epData = await aaFetch({ variables: { showId, translationType: mode, episodeString: String(epNo) }, query: epGql });
    }

    console.log("epData:", JSON.stringify(epData)); const rawStr = JSON.stringify(epData);
    let sourceUrls = [];

    if (rawStr.includes('"tobeparsed"')) {
      const tobeparsedMatch = rawStr.match(/"tobeparsed"\s*:\s*"([^"]+)"/);
      if (!tobeparsedMatch) return null;
      try {
        const decrypted = aaDecrypt(tobeparsedMatch[1]);
        const urlMatches = decrypted.matchAll(/"sourceUrl"\s*:\s*"([^"]+)".*?"sourceName"\s*:\s*"([^"]+)"/g);
        for (const m of urlMatches) {
          sourceUrls.push({ sourceUrl: m[1].replace(/\\/g, ''), sourceName: m[2] });
        }
      } catch (e) { console.error("Decryption failed:", e); return null; }
    } else {
      sourceUrls = epData?.data?.episode?.sourceUrls || [];
    }

    if (!sourceUrls.length) { console.error("No sourceUrls found in response"); return null; }

    const ALLANIME_PROVIDERS = ['Default', 'Yt-mp4', 'S-mp4', 'Fm-mp4', 'Luf-Mp4'];
    
    // Concurrently resolve all
    const promises = ALLANIME_PROVIDERS.map(async (providerName) => {
      const entry = sourceUrls.find(s => s.sourceName === providerName);
      if (!entry) throw new Error('not found ' + providerName);

      let providerUrl = entry.sourceUrl;
      if (providerUrl.startsWith('--')) {
        providerUrl = aaDecodeProviderHex(providerUrl);
      }
      providerUrl = providerUrl.replace(/\\\//g, '/');

      if (providerName === 'Default') {
        const m3u8 = await aaResolveCdnUrl(providerUrl);
        if (m3u8) return { url: m3u8, quality: 'Auto (m3u8)', type: 'hls', isM3U8: true, referer: ALLANIME_GRAPHQL_REFERER, provider: 'allanime' };
      } else if (providerName === 'S-mp4' || providerName === 'Yt-mp4' || providerName === 'Luf-Mp4' || providerName === 'Fm-mp4') {
        if (providerUrl.startsWith('http')) {
          return { url: providerUrl, quality: providerName, type: 'mp4', isM3U8: false, referer: ALLANIME_GRAPHQL_REFERER, provider: 'allanime' };
        }
      }
      throw new Error('failed');
    });

    const results = await Promise.allSettled(promises);
    for (const res of results) {
      if (res.status === 'fulfilled' && res.value) {
        return res.value;
      }
    }

    console.error("All providers failed to resolve");
    return null;
  } catch (e) {
    console.error(`[allanime] Error: ${e.message}`);
    return null;
  }
}
