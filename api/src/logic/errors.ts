import type { ValidationError } from '../../../src/shared/score';

export type ApiErrorCode =
  | ValidationError
  | 'not_found'
  | 'method_not_allowed'
  | 'unsupported_media_type'
  | 'payload_too_large'
  | 'invalid_json'
  | 'invalid_board'
  | 'invalid_limit'
  | 'rate_limited'
  | 'internal';

export function errorStatus(code: ApiErrorCode): number {
  switch (code) {
    case 'not_found':
      return 404;
    case 'method_not_allowed':
      return 405;
    case 'payload_too_large':
      return 413;
    case 'unsupported_media_type':
      return 415;
    case 'rate_limited':
      return 429;
    case 'internal':
      return 500;
    default:
      return 400;
  }
}
