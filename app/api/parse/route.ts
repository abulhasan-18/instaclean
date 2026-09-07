import { NextRequest, NextResponse } from 'next/server';
import { instagramCodeToMediaId, LikedPostItem } from '@/lib/instagram';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { rawJson } = body;

    if (!rawJson) {
      return NextResponse.json({ ok: false, error: 'No JSON content provided' }, { status: 400 });
    }

    let parsed: any;
    try {
      parsed = typeof rawJson === 'string' ? JSON.parse(rawJson) : rawJson;
    } catch (e: any) {
      return NextResponse.json({ ok: false, error: 'Invalid JSON format: ' + e.message }, { status: 400 });
    }

    let rawLikes: any[] = [];
    if (Array.isArray(parsed)) {
      rawLikes = parsed;
    } else if (parsed && typeof parsed === 'object') {
      rawLikes = parsed.likes_media_likes || parsed.media_likes || [];
    }

    const items: LikedPostItem[] = [];
    for (let i = 0; i < rawLikes.length; i++) {
      const item = rawLikes[i];
      let href = '';
      let timestamp: number | undefined = item.timestamp;
      let caption: string | undefined;

      if (Array.isArray(item.label_values)) {
        for (const lv of item.label_values) {
          if (lv?.label === 'URL' || lv?.href) {
            href = lv.href || lv.value || '';
          } else if (lv?.label === 'Caption' && typeof lv.value === 'string') {
            caption = lv.value;
          } else if (!href && typeof lv?.value === 'string' && lv.value.includes('instagram.com')) {
            href = lv.value;
          }
        }
      }

      if (!href && Array.isArray(item.string_list_data) && item.string_list_data.length > 0) {
        href = item.string_list_data[0]?.href || '';
        if (!timestamp) timestamp = item.string_list_data[0]?.timestamp;
      } else if (!href && typeof item.href === 'string') {
        href = item.href;
      } else if (!href && typeof item.url === 'string') {
        href = item.url;
      } else if (!href && typeof item.link === 'string') {
        href = item.link;
      }

      if (!href) continue;

      const match = href.match(/\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/);
      const shortcode = match ? match[1] : '';
      let mediaId = shortcode ? instagramCodeToMediaId(shortcode) : '';
      if (!mediaId && item.fbid) mediaId = String(item.fbid);

      let dateStr = '';
      if (timestamp) {
        try {
          dateStr = new Date(Number(timestamp) * 1000).toLocaleString();
        } catch {
          // ignore
        }
      }

      items.push({
        id: `like-${i}-${shortcode || i}`,
        url: href,
        shortcode,
        mediaId,
        caption,
        timestamp: typeof timestamp === 'number' ? timestamp : Number(timestamp),
        dateStr,
        status: 'pending',
      });
    }

    return NextResponse.json({
      ok: true,
      type: 'likes',
      total: items.length,
      items,
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message || 'Parsing error' }, { status: 500 });
  }
}
