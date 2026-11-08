import { describe, expect, it } from 'vitest';
import { errorStatus, type ApiErrorCode } from './errors';

describe('errorStatus', () => {
  const table: [ApiErrorCode, number][] = [
    ['not_object', 400],
    ['unknown_field', 400],
    ['nickname_invalid', 400],
    ['time_invalid', 400],
    ['time_too_fast', 400],
    ['potholes_invalid', 400],
    ['potholes_implausible', 400],
    ['version_invalid', 400],
    ['invalid_json', 400],
    ['invalid_board', 400],
    ['invalid_limit', 400],
    ['not_found', 404],
    ['method_not_allowed', 405],
    ['payload_too_large', 413],
    ['unsupported_media_type', 415],
    ['rate_limited', 429],
    ['internal', 500],
  ];
  it.each(table)('%s -> %i', (code, status) => {
    expect(errorStatus(code)).toBe(status);
  });
});
