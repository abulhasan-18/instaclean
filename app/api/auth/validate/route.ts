import { NextRequest, NextResponse } from 'next/server';
import { instagramApiRequest, autoFetchCsrfToken, parseCookieString } from '@/lib/instagram';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { cookieHeader } = body;
    let sessionId = body.sessionId?.trim() || '';
    let csrfToken = body.csrfToken?.trim() || '';
    let dsUserId = body.dsUserId?.trim() || '';

    if (cookieHeader) {
      const parsed = parseCookieString(cookieHeader);
      if (parsed['sessionid'] && !sessionId) sessionId = parsed['sessionid'];
      if (parsed['csrftoken'] && !csrfToken) csrfToken = parsed['csrftoken'];
      if (parsed['ds_user_id'] && !dsUserId) dsUserId = parsed['ds_user_id'];
    }

    if (!sessionId) {
      return NextResponse.json(
        { ok: false, message: 'Session ID or Cookie Header is required' },
        { status: 400 }
      );
    }

    if (!csrfToken) {
      csrfToken = await autoFetchCsrfToken(sessionId);
    }
    if (!dsUserId) {
      dsUserId = sessionId.split(/%3A|:/)[0] || '';
    }

    console.log('[Auth Validate] Testing session for dsUserId:', dsUserId);

    const assembledCookie = cookieHeader || `sessionid=${sessionId.trim()}; ds_user_id=${dsUserId}${csrfToken ? `; csrftoken=${csrfToken}` : ''}`;

    // Method 1: Fetch main page https://www.instagram.com/ with session cookie
    const homeRes = await fetch('https://www.instagram.com/', {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36',
        Cookie: assembledCookie,
      },
      redirect: 'manual',
    });

    const location = homeRes.headers.get('location') || '';

    if (homeRes.status === 302 && location.includes('/accounts/login/')) {
      return NextResponse.json(
        {
          ok: false,
          message: 'Instagram redirected to login. Your sessionid cookie appears to be expired or invalid.',
        },
        { status: 401 }
      );
    }

    let username = '';
    const html = await homeRes.text().catch(() => '');
    
    // Check if HTML has logged in viewer info
    const usernameMatch = html.match(/"username":"([a-zA-Z0-9._]+)"/);
    if (usernameMatch) {
      username = usernameMatch[1];
    }

    // Also extract csrftoken from set-cookie if missing
    const setCookie = homeRes.headers.get('set-cookie') || '';
    const cookieCsrfMatch = setCookie.match(/csrftoken=([^;]+)/);
    if (cookieCsrfMatch && !csrfToken) {
      csrfToken = cookieCsrfMatch[1];
    }

    // If home page returned 200 or html contains "logged-in", session is confirmed!
    if (homeRes.status === 200 || html.includes('logged-in')) {
      return NextResponse.json({
        ok: true,
        username: username || dsUserId,
        csrfToken,
        dsUserId,
        sessionId,
        message: username ? `Connected as @${username}` : 'Instagram session is valid and active!',
      });
    }

    return NextResponse.json(
      {
        ok: false,
        message: `Instagram returned status ${homeRes.status}. Check your session tokens.`,
      },
      { status: 400 }
    );
  } catch (err: any) {
    console.error('[Auth Validate] Exception:', err);
    return NextResponse.json(
      {
        ok: false,
        message: err.message ? `Network/Server error: ${err.message}` : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
