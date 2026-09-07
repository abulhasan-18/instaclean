/**
 * Utility functions for Instagram API interactions and Shortcode to Media ID conversion.
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
 * Automatically fetch a valid csrftoken using sessionid if not provided
 */
export async function autoFetchCsrfToken(sessionId: string): Promise<string> {
  try {
    const res = await fetch('https://www.instagram.com/', {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        Cookie: `sessionid=${sessionId.trim()}`,
      },
      redirect: 'manual',
    });
    const setCookie = res.headers.get('set-cookie') || '';
    const match = setCookie.match(/csrftoken=([^;]+)/);
    if (match) return match[1];
  } catch {
    // fallback
  }
  return '';
}

/**
 * Make an authenticated call to Instagram Web API
 */
export async function instagramApiRequest(
  endpoint: string,
  options: {
    method?: string;
    sessionId: string;
    csrfToken?: string;
    dsUserId?: string;
    body?: Record<string, string>;
  }
) {
  let { method = 'GET', sessionId, csrfToken = '', dsUserId = '', body } = options;

  if (!csrfToken) {
    csrfToken = await autoFetchCsrfToken(sessionId);
  }

  const autoUserId = (dsUserId && dsUserId.trim()) || (sessionId.split(/%3A|:/)[0] || '');
  const cookieParts = [
    `sessionid=${sessionId.trim()}`,
  ];
  if (csrfToken) {
    cookieParts.push(`csrftoken=${csrfToken.trim()}`);
  }
  if (autoUserId) {
    cookieParts.push(`ds_user_id=${autoUserId}`);
  }

  const headers: Record<string, string> = {
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'X-IG-App-ID': '936619743392459',
    'X-ASBD-ID': '129477',
    'X-IG-WWW-Claim': '0',
    'X-Requested-With': 'XMLHttpRequest',
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    Referer: 'https://www.instagram.com/',
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
  if (contentType.includes('application/json')) {
    data = await res.json().catch(() => ({}));
  } else {
    const text = await res.text().catch(() => '');
    data = { raw: text };
  }

  return { status: res.status, ok: res.ok, data };
}
