import { NextRequest } from 'next/server';
import { instagramGraphQLUnlike } from '@/lib/instagram';

export const dynamic = 'force-dynamic';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRandom(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const {
    items = [],
    sessionId,
    csrfToken,
    dsUserId,
    settings = {
      minDelay: 5,
      maxDelay: 12,
      breakProbability: 0.05,
      breakMin: 180,
      breakMax: 600,
      maxRetries: 3,
    },
  } = body;

  if (!sessionId || !csrfToken) {
    return new Response(JSON.stringify({ error: 'Missing session credentials' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (eventData: any) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(eventData)}\n\n`));
      };

      sendEvent({ type: 'init', total: items.length });

      let successCount = 0;
      let errorCount = 0;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const mediaId = item.mediaId;
        const url = item.url || '';

        sendEvent({
          type: 'item_start',
          index: i,
          id: item.id,
          url,
        });

        if (!mediaId) {
          errorCount++;
          sendEvent({
            type: 'item_error',
            index: i,
            id: item.id,
            error: 'Missing media ID',
          });
          continue;
        }

        // Action delay before request
        const delaySec = getRandom(settings.minDelay || 5, settings.maxDelay || 12);
        await sleep(delaySec * 1000);

        let success = false;
        let lastError = '';

        const maxRetries = settings.maxRetries || 3;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            const res = await instagramGraphQLUnlike({
              mediaId,
              sessionId,
              csrfToken,
              dsUserId,
            });

            if (res.ok) {
              success = true;
              break;
            } else {
              lastError = res.data?.errors?.[0]?.message || res.data?.message || `HTTP ${res.status}`;
              if (attempt < maxRetries) {
                await sleep(5000);
              }
            }
          } catch (err: any) {
            lastError = err.message || 'Network error';
            if (attempt < maxRetries) {
              await sleep(5000);
            }
          }
        }

        if (success) {
          successCount++;
          sendEvent({
            type: 'item_success',
            index: i,
            id: item.id,
            url,
            successCount,
          });
        } else {
          errorCount++;
          sendEvent({
            type: 'item_error',
            index: i,
            id: item.id,
            url,
            error: lastError,
            errorCount,
          });
        }

        // Random safety break
        const shouldBreak = Math.random() < (settings.breakProbability ?? 0.05);
        if (shouldBreak && i < items.length - 1) {
          const pauseSec = Math.round(getRandom(settings.breakMin || 180, settings.breakMax || 600));
          sendEvent({
            type: 'pause',
            duration: pauseSec,
            message: `Safety break: pausing for ${Math.round(pauseSec / 60)} minutes to protect your account.`,
          });
          await sleep(pauseSec * 1000);
          sendEvent({ type: 'resume' });
        }
      }

      sendEvent({
        type: 'done',
        total: items.length,
        successCount,
        errorCount,
      });

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
