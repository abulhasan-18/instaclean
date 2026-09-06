import { NextRequest, NextResponse } from 'next/server';
import { instagramApiRequest, autoFetchCsrfToken } from '@/lib/instagram';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { sessionId } = body;
    let csrfToken = body.csrfToken?.trim() || '';
    let dsUserId = body.dsUserId?.trim() || '';

    if (!sessionId) {
      return NextResponse.json(
        { ok: false, message: 'Session ID is required' },
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
    console.log('[Auth Validate] Using csrfToken:', csrfToken);

    // Method 1: Fetch main page https://www.instagram.com/ with session cookie
    // If authenticated, it does not redirect to /accounts/login/ and contains viewer data
    const homeRes = await fetch('https://www.instagram.com/', {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        Cookie: `sessionid=${sessionId.trim()}; ds_user_id=${dsUserId}${csrfToken ? `; csrftoken=${csrfToken}` : ''}`,
      },
      redirect: 'manual',
    });

    console.log('[Auth Validate] homeRes status:', homeRes.status);
    const location = homeRes.headers.get('location') || '';
    console.log('[Auth Validate] homeRes redirect location:', location);

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
      console.log('[Auth Validate] Found username in HTML:', username);
    }

    // Also extract csrftoken from set-cookie if missing
    const setCookie = homeRes.headers.get('set-cookie') || '';
    const cookieCsrfMatch = setCookie.match(/csrftoken=([^;]+)/);
    if (cookieCsrfMatch && !csrfToken) {
      csrfToken = cookieCsrfMatch[1];
    }

    // Method 2: API check via web_profile_info or notifications
    const apiRes = await instagramApiRequest('/api/v1/notifications/badge/', {
      method: 'GET',
      sessionId,
      csrfToken,
      dsUserId,
    });
    console.log('[Auth Validate] badgeRes status:', apiRes.status, 'data:', JSON.stringify(apiRes.data));

    // If home page didn't redirect to login OR badgeRes returned 200, session is confirmed valid!
    if (homeRes.status === 200 || apiRes.status === 200) {
      return NextResponse.json({
        ok: true,
        username: username || dsUserId,
        csrfToken,
        dsUserId,
        message: username ? `Connected as @${username}` : 'Instagram session is valid and active!',
      });
    }

    return NextResponse.json(
      {
        ok: false,
        message: `Instagram returned status ${homeRes.status || apiRes.status}. Check your session tokens.`,
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
