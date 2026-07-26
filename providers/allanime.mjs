import { createDecipheriv, createCipheriv, createHash } from 'node:crypto';

const ALLANIME_API = 'https://api.mkissa.net/api';
const ALLANIME_BASE = 'allanime.day';
const ALLANIME_REFERER = 'https://mkissa.to';
const ALLANIME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:150.0) Gecko/20100101 Firefox/150.0';
const ALLANIME_EP_HASH = 'f4662f4b7510b26795dd53ef824a0bf1740fbbc5d1273fab18222ac831bca8d0';

let cachedAaConfig = null;

async function getAaConfig() {
  if (cachedAaConfig && Date.now() - cachedAaConfig.timestamp < 3600000) {
    return cachedAaConfig;
  }
  
  const cdn = "https://cdn.mkissa.net/all/mk/_app/immutable";
  const pageRes = await fetch(ALLANIME_REFERER, { headers: { 'User-Agent': ALLANIME_UA } });
  const pageText = await pageRes.text();
  
  const epochMatch = pageText.match(/"epoch":(\d+)/);
  const partBMatch = pageText.match(/"partB":"([^"]*)"/);
  const appUrlMatch = pageText.match(new RegExp(`${cdn.replace(/\//g, '\\/')}\\/entry\\/app\\.[A-Za-z0-9_.-]+\\.js`));
  
  if (!epochMatch || !partBMatch || !appUrlMatch) {
    throw new Error("Failed to parse mkissa.to for dynamic keys");
  }
  
  const epoch = parseInt(epochMatch[1], 10);
  const partBBuf = Buffer.from(partBMatch[1], 'base64');
  const appUrl = appUrlMatch[0];
  
  const appRes = await fetch(appUrl, { headers: { 'User-Agent': ALLANIME_UA } });
  const appText = await appRes.text();
  
  const chunkMatches = [...appText.matchAll(/"\.\.\/chunks\/([A-Za-z0-9_.-]+\.js)"/g)].slice(0, 5);
  let maskHex = null;
  for (const m of chunkMatches) {
    const chunkRes = await fetch(`${cdn}/chunks/${m[1]}`, { headers: { 'User-Agent': ALLANIME_UA } });
    const hexMatch = (await chunkRes.text()).match(/[0-9a-f]{64}/);
    if (hexMatch) { maskHex = hexMatch[0]; break; }
  }
  
  if (!maskHex) throw new Error("Failed to find mask hex in chunks");
  
  const maskBuf = Buffer.from(maskHex, 'hex');
  const key = Buffer.alloc(32);
  for (let i = 0; i < 32; i++) key[i] = maskBuf[i] ^ partBBuf[i];
  
  cachedAaConfig = { key, epoch, timestamp: Date.now() };
  return cachedAaConfig;
}

function getAaReq(epoch) {
  const ts = Math.floor(Date.now() / 300000) * 300000;
  const iv = createHash('sha256').update(`${epoch}:${ALLANIME_EP_HASH}:${ts}`).digest().subarray(0, 12);
  const payload = JSON.stringify({ v: 1, ts, epoch, qh: ALLANIME_EP_HASH });
  const cipher = createCipheriv('aes-256-gcm', cachedAaConfig.key, iv);
  const ct = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()]);
  return Buffer.concat([Buffer.from([1]), iv, ct, cipher.getAuthTag()]).toString('base64');
}

async function aaFetch(body) {
  const res = await fetch(ALLANIME_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': ALLANIME_UA,
      'Referer': ALLANIME_REFERER,
      'Origin': ALLANIME_REFERER,
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
      'Referer': ALLANIME_REFERER,
      'Origin': ALLANIME_REFERER,
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

function aaDecrypt(tobeparsed, key) {
  const buf = Buffer.from(tobeparsed, 'base64');
  const iv = buf.subarray(1, 13);
  const tag = buf.subarray(buf.length - 16);
  const ct = buf.subarray(13, buf.length - 16);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

async function resolveWixmp(url) {
  if (url.includes('.urlset')) {
    const match = url.match(/,(.+?),/);
    if (match) {
      return url.replace(/,.*\.urlset.*?$/, '').replace(/,[^/]+/, '') + '/' + match[1] + url.match(/(\/[^/]+\/[^/]+)\.urlset/)[1];
    }
  }
  return url;
}

async function aaResolveCdnUrl(cdnPath) {
  try {
    const url = `https://${ALLANIME_BASE}${cdnPath}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': ALLANIME_UA, 'Referer': ALLANIME_REFERER },
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
  const showId = await aaSearchId(title);
  if (!showId) {
    throw new Error(`Could not find showId on AllAnime for title: ${title}`);
  }

  const config = await getAaConfig();
  let epData;
  try {
    const params = new URLSearchParams();
    params.set('variables', JSON.stringify({ showId, translationType: mode, episodeString: String(epNo) }));
    params.set('extensions', JSON.stringify({ 
      persistedQuery: { version: 1, sha256Hash: ALLANIME_EP_HASH },
      aaReq: getAaReq(config.epoch)
    }));
    epData = await aaFetchGET(params);
    if (epData?.errors?.length) throw new Error(epData.errors[0].message);
  } catch (e) {
    const epGql = `query ($showId: String!, $translationType: VaildTranslationTypeEnumType!, $episodeString: String!) { episode( showId: $showId translationType: $translationType episodeString: $episodeString ) { episodeString sourceUrls }}`;
    epData = await aaFetch({ variables: { showId, translationType: mode, episodeString: String(epNo) }, query: epGql });
  }

  const rawStr = JSON.stringify(epData);
  let sourceUrls = [];

  if (rawStr.includes('"tobeparsed"')) {
    const tobeparsedMatch = rawStr.match(/"tobeparsed"\s*:\s*"([^"]+)"/);
    if (!tobeparsedMatch) throw new Error("tobeparsed key present but regex failed to match value");
    try {
      const decrypted = aaDecrypt(tobeparsedMatch[1], config.key);
      const urlMatches = decrypted.matchAll(/"sourceUrl"\s*:\s*"([^"]+)".*?"sourceName"\s*:\s*"([^"]+)"/g);
      for (const m of urlMatches) {
        sourceUrls.push({ sourceUrl: m[1].replace(/\\/g, ''), sourceName: m[2] });
      }
    } catch (e) { throw new Error(`AllAnime decryption failed: ${e.message}`); }
  } else {
    sourceUrls = epData?.data?.episode?.sourceUrls || [];
  }

  if (!sourceUrls.length) {
    throw new Error(`No sourceUrls found in AllAnime response for title: ${title}`);
  }

  // Luf-Mp4 and Fm-mp4 dropped per ani-cli upstream removal
  const ALLANIME_PROVIDERS = ['Default', 'Yt-mp4', 'S-mp4', 'Mp4'];
  
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
      if (m3u8) return { url: m3u8, quality: 'Auto (m3u8)', type: 'hls', isM3U8: true, referer: ALLANIME_REFERER, provider: 'allanime' };
    } else if (providerName === 'S-mp4' || providerName === 'Yt-mp4') {
      if (providerUrl.startsWith('http')) {
        return { url: providerUrl, quality: providerName, type: 'mp4', isM3U8: false, referer: ALLANIME_REFERER, provider: 'allanime' };
      }
    } else if (providerName === 'Mp4') {
      if (!providerUrl.startsWith('http')) throw new Error('mp4upload url not absolute');
      const res = await fetch(providerUrl, {
        headers: { 'User-Agent': ALLANIME_UA, 'Referer': ALLANIME_REFERER },
        signal: AbortSignal.timeout(8000),
      });
      const html = await res.text();
      const m = html.match(/src:\s*"([^"]+)"/);
      if (!m) throw new Error('mp4upload src not found in embed page');
      return { url: m[1], quality: 'Mp4Upload', type: 'mp4', isM3U8: false, referer: 'https://www.mp4upload.com', provider: 'allanime' };
    }
    throw new Error('failed');
  });

  const results = await Promise.allSettled(promises);
  for (const res of results) {
    if (res.status === 'fulfilled' && res.value) {
      return res.value;
    }
  }

  // Fallback regex (matches ani-cli's get_links regex fallback)
  let fallbackStr = rawStr;
  if (rawStr.includes('"tobeparsed"')) {
    try {
      const match = rawStr.match(/"tobeparsed"\s*:\s*"([^"]+)"/);
      if (match) fallbackStr = aaDecrypt(match[1], config.key);
    } catch {}
  }
  
  const fallbackMatch = fallbackStr.match(/hls","url":"([^"]*)".*"hardsub_lang":"en-US"/);
  if (fallbackMatch && fallbackMatch[1]) {
    let fallbackUrl = fallbackMatch[1].replace(/\\/g, '');
    if (fallbackUrl.startsWith('--')) fallbackUrl = aaDecodeProviderHex(fallbackUrl);
    if (!fallbackUrl.startsWith('http')) {
      const cdnUrl = await aaResolveCdnUrl(fallbackUrl);
      if (cdnUrl) fallbackUrl = cdnUrl;
    }
    return { url: fallbackUrl, quality: 'Auto (Fallback)', type: 'hls', isM3U8: true, referer: ALLANIME_REFERER, provider: 'allanime' };
  }

  throw new Error("All resolved providers failed on AllAnime");
}
