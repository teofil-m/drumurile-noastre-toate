import { describe, expect, it } from 'vitest';
import { RATE_LIMIT, hashIp, isRateLimited, windowStart } from './ratelimit';

describe('rate limit', () => {
  it('constants', () => {
    expect(RATE_LIMIT).toEqual({ windowS: 60, maxPerWindow: 5 });
  });
  it('windowStart floors to window in seconds', () => {
    expect(windowStart(59_999)).toBe(0);
    expect(windowStart(60_000)).toBe(60);
    expect(windowStart(125_000)).toBe(120);
  });
  it('isRateLimited', () => {
    expect(isRateLimited(5)).toBe(false);
    expect(isRateLimited(6)).toBe(true);
  });
});

describe('hashIp', () => {
  it('is 64 lowercase hex', async () => {
    expect(await hashIp('1.2.3.4', 's')).toMatch(/^[0-9a-f]{64}$/);
  });
  it('is SHA-256 of salt:ip', async () => {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('s:1.2.3.4'));
    const hex = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
    expect(await hashIp('1.2.3.4', 's')).toBe(hex);
  });
  it('is deterministic and varies by salt and ip', async () => {
    const a = await hashIp('1.2.3.4', 's');
    expect(await hashIp('1.2.3.4', 's')).toBe(a);
    expect(await hashIp('1.2.3.4', 't')).not.toBe(a);
    expect(await hashIp('1.2.3.5', 's')).not.toBe(a);
  });
  it('always pads to 64 chars even with small bytes', async () => {
    for (let i = 0; i < 300; i++) {
      expect(await hashIp(String(i), 's')).toHaveLength(64);
    }
  });
});
