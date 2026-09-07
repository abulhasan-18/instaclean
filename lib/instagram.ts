/**
 * Utility functions for Instagram API interactions, GraphQL mutations,
 * and Shortcode to Media ID conversion.
 */

export interface LikedPostItem {
  id: string;
  url: string;
  shortcode: string;
  mediaId: string;
  timestamp?: number;
  dateStr?: string;
  caption?: string;
  status?: 'pending' | 'processing' | 'unliked' | 'failed' | 'skipped';
  error?: string;
}

/**
 * Convert Instagram shortcode (from /p/CODE/ or /reel/CODE/) to a 64-bit integer Media ID.
 */
export function instagramCodeToMediaId(urlOrCode: string): string {
  const match = urlOrCode.match(/\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/);
  const code = match ? match[1] : urlOrCode.trim().replace(/^\/+|\/+$/g, '');
  const charmap = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let id = BigInt(0);
  for (let i = 0; i < code.length; i++) {
    const char = code[i];
    const index = charmap.indexOf(char);
    if (index === -1) continue;
    id = id * BigInt(64) + BigInt(index);
  }
  return id.toString();
}

/**
 * Parse a raw cookie string (copied from DevTools or browser) into key-value pairs.
 */
export function parseCookieString(rawCookie: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!rawCookie || typeof rawCookie !== 'string') return result;

  const parts = rawCookie.split(';');
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      if (key) result[key] = val;
    }
  }
  return result;
}

/**
 * Automatically fetch a valid csrftoken using sessionid if not provided
 */
export async function autoFetchCsrfToken(sessionId: string): Promise<string> {
  try {
    const res = await fetch('https://www.instagram.com/', {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36',
        Cookie: `sessionid=${sessionId.trim()}`,
      },
      redirect: 'manual',
    });
    let cookies: string[] = [];
    if (typeof (res.headers as any).getSetCookie === 'function') {
      cookies = (res.headers as any).getSetCookie();
    } else {
      const single = res.headers.get('set-cookie');
      if (single) cookies = [single];
    }
    for (const c of cookies) {
      const match = c.match(/csrftoken=([^;]+)/);
      if (match) return match[1];
    }
  } catch {
    // fallback
  }
  return '';
}

export interface InstagramUnlikeOptions {
  mediaId: string;
  cookieHeader?: string;
  sessionId?: string;
  csrfToken?: string;
  dsUserId?: string;
  lsd?: string;
  actorId?: string;
  userAgent?: string;
}

/**
 * Execute verified Instagram GraphQL mutation (usePolarisLikeMediaXIGUnlikeMutation)
 * to unlike a reel or post.
 */
export async function instagramGraphQLUnlike(options: InstagramUnlikeOptions) {
  const {
    mediaId,
    cookieHeader: rawCookieHeader = '',
    sessionId = '',
    csrfToken: rawCsrfToken = '',
    dsUserId: rawDsUserId = '',
    lsd: rawLsd = '',
    actorId: rawActorId = '',
    userAgent,
  } = options;

  // 1. Build cookie header
  let cookiesMap: Record<string, string> = {};
  if (rawCookieHeader) {
    cookiesMap = parseCookieString(rawCookieHeader);
  }

  // Inject or override individual fields if provided
  if (sessionId) cookiesMap['sessionid'] = sessionId.trim();
  if (rawCsrfToken) cookiesMap['csrftoken'] = rawCsrfToken.trim();
  if (rawDsUserId) cookiesMap['ds_user_id'] = rawDsUserId.trim();

  // If csrftoken is not present in cookie map, try to auto-fetch
  let csrfToken = cookiesMap['csrftoken'] || rawCsrfToken;
  const currentSessionId = cookiesMap['sessionid'] || sessionId;

  if (!csrfToken && currentSessionId) {
    csrfToken = await autoFetchCsrfToken(currentSessionId);
    if (csrfToken) cookiesMap['csrftoken'] = csrfToken;
  }

  const dsUserId = cookiesMap['ds_user_id'] || rawDsUserId || (currentSessionId ? currentSessionId.split(/%3A|:/)[0] : '');
  const lsd = rawLsd || 'g8HgGw5BNu0tuh9aLYVmlJ';
  const actorId = rawActorId || (cookiesMap['rur'] ? cookiesMap['rur'].split('%2C')[1] : '') || dsUserId || '17841414649173776';

  const assembledCookieString = Object.entries(cookiesMap)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');

  const headers: Record<string, string> = {
    'User-Agent':
      userAgent ||
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36',
    'X-IG-App-ID': '936619743392459',
    'X-ASBD-ID': '359341',
    'X-FB-Friendly-Name': 'usePolarisLikeMediaXIGUnlikeMutation',
    'X-FB-LSD': lsd,
    'X-CSRFToken': csrfToken,
    'Cookie': assembledCookieString,
    'Referer': 'https://www.instagram.com/',
    'Origin': 'https://www.instagram.com',
    'Sec-Fetch-Site': 'same-origin',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Dest': 'empty',
    'Content-Type': 'application/x-www-form-urlencoded',
    'Accept': '*/*',
  };

  const variables = JSON.stringify({
    input: {
      actor_id: actorId,
      client_mutation_id: '1',
      media_id: mediaId,
    },
  });

  const bodyParams: Record<string, string> = {
    av: actorId,
    __d: 'www',
    __user: '0',
    __a: '1',
    __req: '1c',
    __hs: '20703.HYP:instagram_web_pkg.2.1...0',
    dpr: '2',
    __ccg: 'GOOD',
    __rev: '1046934385',
    __s: 'nxu0z4:i4ld6o:574azy',
    __hsi: '7682748963931492866',
    __dyn:
      '7xeUjG1mxu1syaxG4Vp41twpUnwgU7SbzEdF8vyUco2qwJyEiw50x609vCwjE1EEc87m0yE462mcw5Mx62G5UswoEcE7O2l0Fwqo5W1yw9O1lwxwQzXwae4UaEW2G0AEco5G0zK5o4q0HU420k62-azo7u3C2u2J0bS1LyUaUbGxK3R08-269wr84-6o5p389oed6goK10xKi2qi7E5y4UrwlE2xyVrx60jy7EGq2Kq11whE984O0XEdoCQbwhU',
    __csr:
      'jN47c9WPPZsci96ktfPl_Ze8jlFKAkBj3cJbnHqsjYQLJblRi-KAiIxSEBx16Gh2AP6K4mrllKz8CIrSHrGqIJkOQoHW8BGKm9SriXDsBlF9rGivCKBAjIHgkBvXihUxaVHx2mt7hHAzaDxWEyKm8xa9ypF8jyK9Gdymu8Ay8CjADzAAcByryHG8CG9GEWt6CAxa7d5Az8yhejogKh2Gw_K4UjDCgBei49Xm3-UgBwNG06n801jvoO6U0ubAgdIV82Mwba3R01xa05M81DrU6BwNwSg1wExq203Dw8VxK1mgaU0xR4xS1Jg4ok9wPxS0gzhqwEKlw2Z984tw0UQw3cE0qkw0wdyE0_i2-pS9y8x02UoG0R80mnw1ha',
    __hsdp:
      'gjB0NllsescsiO7FFJAONy49W8PA_myFsEwu7Y8U9k5a5mt1Cugi4C4A2O69p-cEw2jxIw4Z286C5SSVU-i1iGQ985Umxq7UmwdeUb85q2qEtxm4WwrUjw8-13xu5K12waCEO261pgS4awnFU1--09JwPw5Fw3iotwbu3y1Jw1CG0g-2y0FO1q1mw2X8a81dElwgU0zKm0fmw7NwXw4_CFk0_6',
    __hblp:
      '0CCwxw9i79uq2Sfz8O2inyuawoVUO4K4UyeAz5HyudFUko42i26u2a6mcg6bwkaVUliAGfjwxy8kxaGxa4Vrz8HVUK8BAxq78Om3S2O7kfBKUb84KawCGfzolxeKfgZ0iUjwXxN0yghw-Axt38zwgEyE2siyK9F1e2268Ku6EgF38y17DwSw74U3-wnU5i1hxi498f98bE4No12EW1hwOw62z81d8twZwuoe86S0fvw2voO1Nw9S5oixSiawPwhi7zE8EcU7G0ji0jO2y1hwkU2cK5ofXyU26w9a0Q84im0Ko0I61qw-wZU3twl8G3i3K3a0O88UuhGl0s82bo',
    __sjsp: 'gjB0NllsYn4scsiS8FFJAONy49W8PA_myFsEwu7Y8wDgtRgx1Cucx9w',
    __comet_req: '7',
    fb_dtsg:
      'NAfyKrwo2dGm6zOVQIkEsLZGv7JYhUytGFZny2MwfZ8PUo7RwAOVrqA:17843671327157124:1788779364',
    jazoest: '26451',
    lsd: lsd,
    __spin_r: '1046934385',
    __spin_b: 'trunk',
    __spin_t: '1788779386',
    __crn: 'comet.igweb.PolarisFeedRoute',
    fb_api_caller_class: 'RelayModern',
    fb_api_req_friendly_name: 'usePolarisLikeMediaXIGUnlikeMutation',
    server_timestamps: 'true',
    doc_id: '27345296031770102',
    variables,
  };

  const reqBody = new URLSearchParams(bodyParams).toString();

  const res = await fetch('https://www.instagram.com/api/graphql', {
    method: 'POST',
    headers,
    body: reqBody,
  });

  const contentType = res.headers.get('content-type') || '';
  let data: any = {};
  if (contentType.includes('application/json') || contentType.includes('text/javascript')) {
    data = await res.json().catch(() => ({}));
  } else {
    const text = await res.text().catch(() => '');
    data = { raw: text };
  }

  const isSuccess =
    res.status === 200 &&
    data?.data?.xig_media_unlike?.media?.has_liked === false;

  return {
    status: res.status,
    ok: isSuccess,
    data,
  };
}

/**
 * Make an authenticated call to Instagram Web API (Legacy / Generic)
 */
export async function instagramApiRequest(
  endpoint: string,
  options: {
    method?: string;
    sessionId: string;
    csrfToken?: string;
    dsUserId?: string;
    userAgent?: string;
    body?: Record<string, string>;
  }
) {
  let {
    method = 'GET',
    sessionId,
    csrfToken = '',
    dsUserId = '',
    userAgent,
    body,
  } = options;

  if (!csrfToken) {
    csrfToken = await autoFetchCsrfToken(sessionId);
  }

  const autoUserId = (dsUserId && dsUserId.trim()) || (sessionId.split(/%3A|:/)[0] || '');
  const cookieParts = [`sessionid=${sessionId.trim()}`];
  if (csrfToken) {
    cookieParts.push(`csrftoken=${csrfToken.trim()}`);
  }
  if (autoUserId) {
    cookieParts.push(`ds_user_id=${autoUserId}`);
  }

  const headers: Record<string, string> = {
    'User-Agent':
      userAgent ||
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36',
    'X-IG-App-ID': '936619743392459',
    'X-ASBD-ID': '359341',
    'X-IG-WWW-Claim': '0',
    'X-Requested-With': 'XMLHttpRequest',
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    Referer: 'https://www.instagram.com/',
    Origin: 'https://www.instagram.com',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
    Cookie: cookieParts.join('; '),
  };

  if (csrfToken) {
    headers['X-CSRFToken'] = csrfToken.trim();
  }

  let reqBody: string | undefined;
  if (body) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    reqBody = new URLSearchParams(body).toString();
  }

  const res = await fetch(`https://www.instagram.com${endpoint}`, {
    method,
    headers,
    body: reqBody,
  });

  const contentType = res.headers.get('content-type') || '';
  let data: any = {};
  if (contentType.includes('application/json') || contentType.includes('text/javascript')) {
    data = await res.json().catch(() => ({}));
  } else {
    const text = await res.text().catch(() => '');
    data = { raw: text };
  }

  return { status: res.status, ok: res.ok, data };
}
