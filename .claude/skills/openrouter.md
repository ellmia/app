# OpenRouter Integration

The chat backend proxies to OpenRouter at `https://openrouter.ai/api/v1/chat/completions`.

## Configuration

- API key and model via Astro env (astro:env/server)
- Local: set in .env as OPENROUTER_API_KEY and LLM_MODEL=openrouter/free
- Production: use wrangler secrets (see cloudflare-worker skill)
- Default model when not overridden: openrouter/free (env schema default in astro.config.mjs)

## Streaming

- The API route does stream:true and passes the SSE body through to the client
- Client in Chat.tsx parses delta.content chunks
- Always include proper headers: Authorization, HTTP-Referer, X-Title: 'エルミア'

## Persona

The system prompt (イケメンホスト consultant for ソープ嬢) is critical and defined in src/lib/prompts.ts. Any changes must preserve safety, realism, and the gentlemanly tone.