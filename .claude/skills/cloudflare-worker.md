# Cloudflare Workers (Astro adapter)

Deployment target is Cloudflare Workers using the Astro Cloudflare adapter (`output: "server"`).

## Commands

- `npm run deploy` : check + build + wrangler deploy
- Local: `npm run dev` (uses adapter for env injection)
- Preview: `npm run preview`

## Secrets

- Set with `npx wrangler secret put OPENROUTER_API_KEY`
- For model override: `npx wrangler secret put LLM_MODEL` (value: openrouter/free to match local .env)
- Verify: `npx wrangler secret list`

## Environment

wrangler.toml has `name = "app"` so the URL is app.lmia.workers.dev

Always confirm the correct worker name before secret or deploy commands.