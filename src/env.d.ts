/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />
/// <reference types="@astrojs/cloudflare" />

// Virtual module provided by @astrojs/cloudflare adapter (Astro v6+)
// Gives access to Cloudflare Workers bindings and secrets (OPENROUTER_API_KEY etc.)
declare module "cloudflare:workers" {
  export const env: {
    OPENROUTER_API_KEY?: string;
    LLM_MODEL?: string;
    // Add other secrets / vars here as the app grows
    [key: string]: string | undefined;
  };
}
