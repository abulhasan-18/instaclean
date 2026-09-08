import { NextRequest, NextResponse } from 'next/server';
import { instagramGraphQLUnlike, instagramApiRequest } from '@/lib/instagram';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const {
      mediaId,
      cookieHeader,
      sessionId,
      csrfToken,
      dsUserId,
      lsd,
      actorId,
    } = body;

    if (!mediaId) {
      return NextResponse.json(
        { ok: false, error: 'Missing media ID' },
        { status: 400 }
      );
    }

    if (!cookieHeader && !sessionId) {
      return NextResponse.json(
        { ok: false, error: 'Missing session credentials or cookies' },
        { status: 400 }
      );
    }

    const userAgent = req.headers.get('user-agent') || undefined;

    // 1. Primary Method: Modern Instagram GraphQL Mutation (2026 Verified)
    const gqlRes = await instagramGraphQLUnlike({
      mediaId,
      cookieHeader,
      sessionId,
      csrfToken,
      dsUserId,
      lsd,
      actorId,
      userAgent,
    });

    if (gqlRes.ok) {
      return NextResponse.json({
        ok: true,
        status: 'unliked',
        data: gqlRes.data,
      });
    }

    if (gqlRes.status === 302 || gqlRes.status === 401) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Instagram session expired (HTTP ' + gqlRes.status + '). Please copy fresh cookies in Account tab.',
          details: gqlRes.data,
        },
        { status: 401 }
      );
    }

    // If GraphQL returned an error, check message
    const gqlErrorMsg =
      gqlRes.data?.message ||
      gqlRes.data?.errors?.[0]?.message ||
      (gqlRes.status !== 200 ? `GraphQL HTTP ${gqlRes.status}` : null);

    // 2. Fallback to Legacy REST API only if GraphQL returned non-200 or unexpected structure
    if (!gqlRes.ok && gqlRes.status !== 200) {
      const restRes = await instagramApiRequest(`/api/v1/web/likes/${mediaId}/unlike/`, {
        method: 'POST',
        sessionId: sessionId || '',
        csrfToken,
        dsUserId,
        userAgent,
        body: {},
      });

      if (restRes.status === 200 && (restRes.data?.status === 'ok' || !restRes.data?.status)) {
        return NextResponse.json({ ok: true, status: 'unliked' });
      }
    }

    return NextResponse.json(
      {
        ok: false,
        error: gqlErrorMsg || 'Failed to unlike post. Check session validity.',
        details: gqlRes.data,
      },
      { status: 400 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err.message || 'Internal network error' },
      { status: 500 }
    );
  }
}
