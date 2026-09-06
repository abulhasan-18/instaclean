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

    const res = await instagramApiRequest(`/api/v1/web/likes/${mediaId}/unlike/`, {
      method: 'POST',
      sessionId,
      csrfToken,
      dsUserId,
      body: {},
    });

    if (res.status === 200 && res.data?.status === 'ok') {
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
