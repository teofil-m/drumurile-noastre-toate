export const RATE_LIMIT = { windowS: 60, maxPerWindow: 5 } as const;

export function windowStart(nowMs: number): number {
  const nowS = Math.floor(nowMs / 1000);
  return nowS - (nowS % RATE_LIMIT.windowS);
}

export function isRateLimited(countAfterIncrement: number): boolean {
  return countAfterIncrement > RATE_LIMIT.maxPerWindow;
}

export async function hashIp(ip: string, salt: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${ip}`));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
