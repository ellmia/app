# Astro 6 + Cloudflare Workers + React Islands

This project uses Astro 6 (server output) with the Cloudflare adapter for Workers deployment, React for interactive islands (the chat UI), and Tailwind via Vite.

## Key Conventions

- Main chat UI is in `src/pages/index.astro` + `src/components/islands/Chat.tsx` (client:only="react")
- API routes for chat proxy in `src/pages/api/chat.ts` (uses `astro:env/server` for secrets)
- Always use `@/*` path alias for imports (configured in tsconfig)
- After changes: `npm run check` (astro check) is mandatory
- Streaming chat responses via OpenRouter SSE pass-through
- Japanese UI and persona ("イケメンホスト")

## Important Notes

- `output: "server"` in astro.config.mjs for full SSR / API routes
- Secrets: OPENROUTER_API_KEY and LLM_MODEL are declared in env schema as server secrets; read via `import { ... } from 'astro:env/server'`
- For local dev, use .env ; for prod use `wrangler secret put`
- The persona system prompt is in `src/lib/prompts.ts` and must stay high quality and safety-focused
- Build outputs to `dist/` ; deploy with `wrangler deploy` (worker name "app")