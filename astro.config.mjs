// @ts-check
import { defineConfig, envField } from 'astro/config';
import react from '@astrojs/react';
import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  site: 'https://app.lmia.workers.dev',
  output: 'server',
  adapter: cloudflare(),
  integrations: [react()],
  env: {
    schema: {
      // Server-only secret. Set via wrangler secret put OPENROUTER_API_KEY
      OPENROUTER_API_KEY: envField.string({
        context: 'server',
        access: 'secret',
      }),
      // Optional: override default model.
      // Recommended for free tier: "openrouter/free" (lets OpenRouter pick the best available free model)
      // You can also pin a specific model, e.g. "google/gemini-2.0-flash-exp:free"
      LLM_MODEL: envField.string({
        context: 'server',
        access: 'secret',
        optional: true,
        default: 'openrouter/free',
      }),
    },
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
