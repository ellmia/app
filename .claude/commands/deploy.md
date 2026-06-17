# Deploy

Deploy the production build to Cloudflare Workers.

Steps:

1. Check for uncommitted changes (`git status`)
2. Run type check: `npm run check`
3. Build: `npm run build`
4. Confirm with user if ready to deploy
5. Deploy: `npm run deploy`
6. Verify at https://chat.hostorch.workers.dev

Note: Secrets like OPENROUTER_API_KEY and LLM_MODEL must be set via `wrangler secret put` in the Cloudflare dashboard or CLI.