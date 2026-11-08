import { MAX_BODY_BYTES } from '../../../src/shared/constants';

export function isJsonContentType(contentType: string | null): boolean {
  if (contentType === null) return false;
  return (contentType.split(';')[0] ?? '').trim().toLowerCase() === 'application/json';
}

export type ParsedBody =
  | { ok: true; value: unknown }
  | { ok: false; error: 'payload_too_large' | 'invalid_json' };

export function parseBody(text: string): ParsedBody {
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) {
    return { ok: false, error: 'payload_too_large' };
  }
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, error: 'invalid_json' };
  }
}
