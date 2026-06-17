import type { APIRoute } from 'astro';
import { z } from 'zod';
import { jsonResponse } from '@/lib/api-response';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { SYSTEM_PROMPT } from '@/lib/prompts';

// Use Astro's env system (defined in astro.config.mjs with envField).
// This is the recommended way when using env.schema + Cloudflare adapter.
// The adapter injects secrets from wrangler / dashboard at runtime.
import { OPENROUTER_API_KEY, LLM_MODEL } from 'astro:env/server';

const MessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string().min(1).max(4000),
});

const BodySchema = z.object({
  messages: z.array(MessageSchema).min(1).max(30),
});

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const REQUEST_TIMEOUT_MS = 45000;
const RATE_LIMIT = 12; // messages
const RATE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes;

/**
 * Map the LLM model identifier to an in-character host name.
 * This keeps the イケメンホスト role-play world consistent instead of
 * showing raw model names like "gemini-2.0-flash".
 */
function getHostDisplayName(model: string): string {
  const m = model.toLowerCase();

  if (m.includes('gemini')) {
    return 'ジェミー';
  }
  if (m.includes('qwen')) {
    return '久遠';
  }
  if (m.includes('mistral')) {
    return 'Mistral';
  }
  if (m.includes('phi')) {
    return 'PHI';
  }
  if (m.includes('zephyr')) {
    return 'Zephyr';
  }
  if (m.includes('llama')) {
    return 'RYOMA';
  }
  // openrouter/free often falls back to Gemini-class free models
  if (m.includes('openrouter/free') || m.includes('/free')) {
    return 'ジェミー';
  }

  // Fallback keeps the persona
  return 'エルミア';
}

/**
 * LLM_MODEL=openrouter/free を指定した場合に OpenRouter が自動選択する可能性のある無料モデル（2026年時点の主なもの）。
 *
 * ※ OpenRouter の free tier は可用性・クォータによって動的に変わるため、以下は代表例です。
 *
 * 主な選択候補:
 * - google/gemini-2.0-flash-exp:free
 * - google/gemini-1.5-flash-8b-exp:free
 * - meta-llama/llama-3.2-3b-instruct:free
 * - meta-llama/llama-3.1-8b-instruct:free
 * - meta-llama/llama-4-scout:free など
 * - qwen/qwen-2.5-7b-instruct:free
 * - qwen/qwen-2.5-14b-instruct:free
 * - mistralai/mistral-7b-instruct:free
 * - microsoft/phi-3-mini-128k-instruct:free
 * - huggingfaceh4/zephyr-7b-beta:free など
 *
 * そのため getHostDisplayName では "openrouter/free" をデフォルトで「ジェミー」（Gemini系）にマッピングしています。
 * 実際に使われたモデルが Gemini 系以外だった場合は、ホスト名が「久遠」や「RYOMA」になることもあります。
 */

/**
 * Safely encode a UTF-8 string (e.g. Japanese host name) into Base64
 * so it can be transported in an HTTP header without encoding issues.
 * (HTTP headers are historically ASCII; non-ASCII often gets mangled
 * as latin1 → UTF-8 mojibake on the way to the browser.)
 */
function utf8ToBase64(str: string): string {
  // Works in Cloudflare Workers (btoa is available).
  // Uses the classic encodeURIComponent + unescape trick to produce
  // correct UTF-8 base64 without relying on deprecated globals in all envs.
  const utf8Bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < utf8Bytes.length; i++) {
    binary += String.fromCharCode(utf8Bytes[i]);
  }
  return btoa(binary);
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

export const POST: APIRoute = async ({ request }) => {
  const ip = getClientIp(request);

  // Rate limit first (protects the free credits)
  if (!checkRateLimit(ip, RATE_LIMIT, RATE_WINDOW_MS)) {
    return jsonResponse(
      { error: 'ちょっと話しかけすぎだぞ。少し時間を置いてからまた来てくれよ。' },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'メッセージがうまく伝わってこなかった。もう一度、ちゃんとした形で送ってみて。' }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse(
      { error: 'メッセージの形がちょっと変だったみたいだ。もう一度送ってみてくれ。' },
      { status: 400 },
    );
  }

  const { messages } = parsed.data;

  // Inject system prompt as the very first message
  const fullMessages = [
    { role: 'system' as const, content: SYSTEM_PROMPT },
    ...messages.filter((m) => m.role !== 'system'), // prevent user-injected system
  ];

  // Secrets come from astro:env/server (wired to Cloudflare secrets by the adapter)
  const apiKey = OPENROUTER_API_KEY;

  if (!apiKey) {
    console.error('OPENROUTER_API_KEY is not configured (check wrangler secret or dashboard)');
    return jsonResponse({ error: 'ごめん、今ちょっと僕の準備ができてなくて話せないみたいだ。後でまた来てくれ。' }, { status: 500 });
  }

  const model = LLM_MODEL || 'openrouter/free';

  // Map the technical model to an in-character host name for display
  // (keeps the イケメンホスト world view)
  const hostName = getHostDisplayName(model);

  const referer =
    (import.meta.env as any)?.PUBLIC_SITE_URL || 'https://app.lmia.workers.dev';

  try {
    const upstreamRes = await fetchWithTimeout(
      OPENROUTER_URL,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': referer,
          'X-Title': 'エルミア',
        },
        body: JSON.stringify({
          model,
          messages: fullMessages,
          stream: true,
          // modest temperature for consistent consultant tone
          temperature: 0.7,
          max_tokens: 1200,
        }),
      },
      REQUEST_TIMEOUT_MS,
    );

    if (!upstreamRes.ok || !upstreamRes.body) {
      const errorText = await upstreamRes.text().catch(() => '');
      console.error('OpenRouter upstream error', {
        status: upstreamRes.status,
        statusText: upstreamRes.statusText,
        body: errorText.slice(0, 500), // truncated for logs
        model,
      });

      // Return more details temporarily for debugging (remove details in production later)
      return jsonResponse(
        { error: 'うーん、うまく言葉が出てこなかったみたいだ。少し待ってからもう一回話しかけてみてくれ。' },
        { status: 502 },
      );
    }

    // Pass-through the SSE stream (OpenRouter format is OpenAI compatible)
    // We also expose which in-character host is replying via a custom header.
    return new Response(upstreamRes.body, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no', // for some proxies
        'X-Host-Name': utf8ToBase64(hostName),
      },
    });
  } catch (err: any) {
    console.error('Chat proxy error (fetch to OpenRouter failed)', {
      name: err?.name,
      message: err?.message,
      model,
    });
    if (err?.name === 'AbortError') {
      return jsonResponse({ error: '返事が遅くなっちゃった。ごめんな。もう一度試してみて。' }, { status: 504 });
    }
    return jsonResponse({ error: 'ちょっと予期せぬことが起こっちゃったみたいだ。時間をおいてからまた来てくれよ。' }, { status: 500 });
  }
};
