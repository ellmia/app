// IP-based rate limiting (in-memory per isolate).
// Adapted from ai/.agents/skills/cloudflare-worker.md
// Sufficient for protecting free-tier OpenRouter credits at low volume.

const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

function cleanupRateLimit(): void {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap.entries()) {
    if (now > entry.resetTime) {
      rateLimitMap.delete(ip);
    }
  }
}

export function checkRateLimit(
  ip: string,
  limit: number,
  windowMs: number,
): boolean {
  cleanupRateLimit();
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + windowMs });
    return true;
  }

  if (entry.count >= limit) {
    return false;
  }

  entry.count++;
  return true;
}

export function getClientIp(request: Request): string {
  // Cloudflare provides this; fall back gracefully
  return (
    request.headers.get('CF-Connecting-IP') ||
    request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
    'unknown'
  );
}
