# エルミア Architecture

## Overview

エルミア (Ellmia) is a minimal, production-focused chat Web UI for ソープ嬢 (soapland workers). The UI uses a playful unicorn brand (🦄) with per-model character names (ジェミー, 久遠, etc.), while the consultant tone and expertise come from a hardcoded イケメンホスト SYSTEM_PROMPT. It provides real-world advice on client acquisition, pricing, safety, mental health, and business decisions using streaming LLM responses via OpenRouter.

The project follows the exact multi-agent coding and project conventions used across the workspace (Astro 6 + Cloudflare Workers pattern from `ai` and `paperlevels`).

## Stack

| Layer | Technology |
|-------|------------|
| Framework | Astro 6 (output: "server") |
| UI | React 19 Islands (client:only="react") + Tailwind CSS 4 (@tailwindcss/vite) |
| Markdown | react-markdown + remark-gfm (assistant responses only) |
| Backend | Cloudflare Workers (via @astrojs/cloudflare adapter) |
| LLM | OpenRouter (chat completions with stream:true) |
| Persona | Hardcoded SYSTEM_PROMPT in Japanese (イケメンホスト consultant) |
| Analytics | Google Analytics (gtag in Layout.astro) |
| Secrets | Astro env schema + wrangler secrets (OPENROUTER_API_KEY, LLM_MODEL) |
| Deploy | `wrangler deploy` (worker name: "app") → https://app.lmia.workers.dev |

## Repository Layout

```
src/
  layouts/
    Layout.astro                # HTML shell, meta tags, Google Analytics
  pages/
    index.astro                 # Full-screen chat shell
    api/
      chat.ts                   # OpenRouter proxy + rate limit + SSE + X-Host-Name header
  components/
    islands/
      Chat.tsx                  # React chat state + SSE reader + 1問1答 UI + markdown
  lib/
    prompts.ts                  # SYSTEM_PROMPT (イケメンホスト consultant)
    rateLimit.ts                # IP-based in-memory rate limiting (12/5min)
    api-response.ts             # Consistent { error } JSON responses
  styles/
    global.css                  # Light ChatGPT-style theme (mobile-first, 440px max)

wrangler.toml                   # name = "app"
astro.config.mjs                # server output + cloudflare adapter + env schema
```

## Key Flows

### Chat Request
1. User sends message (or clicks suggestion chip) in `Chat.tsx`
2. POST /api/chat with messages array (1問1答: typically a single user message)
3. `src/pages/api/chat.ts`:
   - Rate limit check (IP based, 12 messages per 5 minutes)
   - Injects fixed SYSTEM_PROMPT as first system message
   - Reads secrets via `astro:env/server` (OPENROUTER_API_KEY + optional LLM_MODEL)
   - Maps model to in-character host name (ジェミー, 久遠, RYOMA, etc.)
   - Fetches OpenRouter with stream: true, proper headers (Referer, X-Title: エルミア)
   - Passes the SSE response body directly to client with `X-Host-Name` header
4. Client parses `data: {...}` chunks, accumulates `delta.content`, renders markdown, shows host signature

### Regenerate
- User can re-run the last question without history accumulation ("ねぇ、酔いすぎ！ちゃんと答えて！")
- Resets to single-turn mode for accuracy

### Secrets & Config
- Local: `.env` (loaded by Astro/Vite)
- Production: `wrangler secret put OPENROUTER_API_KEY` and `LLM_MODEL` (value `openrouter/free` to match local)
- Model fallback: `openrouter/free` (env schema default and code fallback)
- Referer set via `PUBLIC_SITE_URL` or `https://app.lmia.workers.dev`

## Safety & Persona
- The consultant must prioritize safety, consent, mental health, and legal boundaries.
- Strong refusals for illegal/dangerous requests.
- Realistic, actionable advice with specific next steps.
- Tone: respectful タメ口 mix with care (イケメンホスト in prompt; unicorn characters in UI).

## Deployment
- `npm run deploy` = check + build + wrangler deploy
- Worker name "app" produces the app.lmia.workers.dev URL
- Observability enabled in wrangler.toml

## Development Rules (from AGENTS.md / workspace)
- TypeScript strict, no `any`
- `@/*` imports only
- `npm run check` after every change
- Error responses always `{ error: string }`
- External fetches use AbortController + timeout
- Follow patterns from sibling projects (ai, paperlevels)

## Non-Goals (MVP)
- No persistent chat history across devices
- No user accounts or auth
- No pre-chat profile form (ultra-minimal scope chosen via requirements)
- No server-side message storage