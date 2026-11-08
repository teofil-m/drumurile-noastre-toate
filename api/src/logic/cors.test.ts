import { describe, expect, it } from 'vitest';
import { corsHeaders, parseAllowedOrigins } from './cors';

describe('parseAllowedOrigins', () => {
  it('splits, trims, drops empties', () => {
    expect(parseAllowedOrigins(' https://a.dev , ,http://localhost:5173 ')).toEqual([
      'https://a.dev',
      'http://localhost:5173',
    ]);
  });
  it('undefined -> []', () => {
    expect(parseAllowedOrigins(undefined)).toEqual([]);
  });
});

describe('corsHeaders', () => {
  const allowed = ['https://a.dev', 'http://localhost:5173'];
  it('returns the four headers for an allowed origin', () => {
    expect(corsHeaders('https://a.dev', allowed)).toEqual({
      'Access-Control-Allow-Origin': 'https://a.dev',
      Vary: 'Origin',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
  });
  it('returns {} for null or disallowed origin', () => {
    expect(corsHeaders(null, allowed)).toEqual({});
    expect(corsHeaders('https://evil.dev', allowed)).toEqual({});
  });
});
