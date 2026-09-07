import { NextRequest, NextResponse } from 'next/server';
import { instagramApiRequest } from '@/lib/instagram';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { mediaId, sessionId, csrfToken, dsUserId } = body;

    if (!sessionId) {
      return NextResponse.json(
        { ok: false, error: 'Missing session credentials' },
        { status: 400 }
      );
    }

    if (!mediaId) {
      return NextResponse.json(
        { ok: false, error: 'Missing media ID' },
        { status: 400 }
      );
    }

    const userAgent = req.headers.get('user-agent') || undefined;
    let res = await instagramApiRequest(`/api/v1/web/likes/${mediaId}/unlike/`, {
      method: 'POST',
      sessionId,
      csrfToken,
      dsUserId,
      userAgent,
      body: {},
    });

    // If web endpoint 404s, try fallback media endpoint
    if (res.status === 404 || res.status === 500) {
      const fallback = await instagramApiRequest(`/api/v1/media/${mediaId}/unlike/`, {
        method: 'POST',
        sessionId,
        csrfToken,
        dsUserId,
        userAgent,
        body: {
          media_id: mediaId,
          _uid: dsUserId || sessionId.split(/%3A|:/)[0] || '',
        },
      });
      if (fallback.status === 200) {
        res = fallback;
      }
    }

    if (res.status === 200 && (res.data?.status === 'ok' || !res.data?.status)) {
      return NextResponse.json({ ok: true, status: 'ok' });
    }

    const errorMsg = res.data?.message || `HTTP ${res.status}`;
    return NextResponse.json(
      { ok: false, error: errorMsg },
      { status: res.status >= 400 && res.status < 500 ? res.status : 400 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err.message || 'Internal network error' },
      { status: 500 }
    );
  }
}
