# Hostorch Architecture

## Overview

Hostorch is a minimal, production-focused chat Web UI where an "イケメンホスト" (handsome host) persona acts as a practical consultant for ソープ嬢 (soapland workers). It provides real-world advice on client acquisition, pricing, safety, mental health, and business decisions using streaming LLM responses via OpenRouter.

The project follows the exact multi-agent coding and project conventions used across the workspace (Astro 6 + Cloudflare Workers pattern from `ai` and `paperlevels`).

## Stack

| Layer | Technology |
|-------|------------|
| Framework | Astro 6 (output: "server") |
| UI | React 19 Islands (client:only="react") + Tailwind CSS 4 (@tailwindcss/vite) |
| Backend | Cloudflare Workers (via @astrojs/cloudflare adapter) |
| LLM | OpenRouter (chat completions with stream:true) |
| Persona | Hardcoded high-quality system prompt in Japanese (gentlemanly cool host tone) |
| Secrets | Astro env schema + wrangler secrets (OPENROUTER_API_KEY, LLM_MODEL) |
| Deploy | `wrangler deploy` (worker name: "chat") → https://chat.hostorch.workers.dev |

## Repository Layout

```
src/
  pages/
    index.astro                 # Ultra-minimal full-screen chat shell
    api/
      chat.ts                   # OpenRouter proxy + rate limit + SSE streaming
  components/
    islands/
      Chat.tsx                  # React chat state machine + SSE reader + UI
  lib/
    prompts.ts                  # SYSTEM_PROMPT (イケメンホスト consultant)
    rateLimit.ts                # IP-based in-memory rate limiting
    api-response.ts             # Consistent { error } JSON responses
  styles/
    global.css                  # Dark luxury host theme + chat bubble styles
  layouts/
    Layout.astro
  env.d.ts                      # Type declarations for cloudflare:workers (legacy) + astro env

wrangler.toml                   # name = "chat"
astro.config.mjs                # server output + cloudflare adapter + env schema
```

## Key Flows

### Chat Request
1. User sends message (or clicks suggestion chip) in `Chat.tsx`
2. POST /api/chat with messages array
3. `src/pages/api/chat.ts`:
   - Rate limit check (IP based, using pattern from workspace skills)
   - Injects fixed SYSTEM_PROMPT as first system message
   - Reads secrets via `astro:env/server` (OPENROUTER_API_KEY + optional LLM_MODEL)
   - Fetches OpenRouter with stream: true, proper headers (Referer, X-Title)
   - Passes the SSE response body directly to client
4. Client parses `data: {...}` chunks, accumulates `delta.content`, updates UI live

### Secrets & Config
- Local: `.env` (loaded by Astro/Vite)
- Production: `wrangler secret put OPENROUTER_API_KEY` and `LLM_MODEL` (value `openrouter/free` to match local)
- Model fallback: `google/gemini-2.0-flash-exp:free`
- Referer set to the production domain for OpenRouter tracking / free tier

## Safety & Persona
- The consultant must prioritize safety, consent, mental health, and legal boundaries.
- Strong refusals for illegal/dangerous requests.
- Realistic, actionable advice with specific next steps.
- Tone: respectful タメ口 mix with care (gentlemanly cool host).

## Deployment
- `npm run deploy` = check + build + wrangler deploy
- Worker name "chat" produces the chat.hostorch.workers.dev URL
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
- Keep dependencies minimal (no extra markdown libs etc.)
