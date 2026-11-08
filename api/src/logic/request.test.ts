import { describe, expect, it } from 'vitest';
import { isJsonContentType, parseBody } from './request';

// Equivalent mutant: request.ts:5 the '?? ""' fallback is unreachable (split always yields one element); noUncheckedIndexedAccess only.
describe('isJsonContentType', () => {
  it('accepts application/json with params, case-insensitive', () => {
    expect(isJsonContentType('application/json')).toBe(true);
    expect(isJsonContentType('Application/JSON; charset=utf-8')).toBe(true);
  });
  it('rejects others', () => {
    expect(isJsonContentType(null)).toBe(false);
    expect(isJsonContentType('text/plain')).toBe(false);
    expect(isJsonContentType('application/jsonp')).toBe(false);
  });
});

describe('parseBody', () => {
  const pad = (n: number) => JSON.stringify('a'.repeat(n - 2));
  it('accepts exactly 1024 bytes', () => {
    const text = pad(1024);
    expect(new TextEncoder().encode(text).length).toBe(1024);
    expect(parseBody(text)).toEqual({ ok: true, value: 'a'.repeat(1022) });
  });
  it('rejects 1025 bytes', () => {
    expect(parseBody(pad(1025))).toEqual({ ok: false, error: 'payload_too_large' });
  });
  it('counts bytes, not characters', () => {
    const text = JSON.stringify('é'.repeat(600));
    expect(text.length).toBeLessThanOrEqual(1024);
    expect(parseBody(text)).toEqual({ ok: false, error: 'payload_too_large' });
  });
  it('rejects bad JSON', () => {
    expect(parseBody('{oops')).toEqual({ ok: false, error: 'invalid_json' });
  });
  it('parses objects', () => {
    expect(parseBody('{"a":1}')).toEqual({ ok: true, value: { a: 1 } });
  });
});
