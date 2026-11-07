import {
  MAX_CLIENT_VERSION_LENGTH,
  MAX_POTHOLES,
  MAX_POTHOLES_PER_SECOND,
  MAX_TIME_MS,
  MIN_WRECK_TIME_MS,
} from './constants';

export interface ScoreSubmission {
  nickname: string;
  timeMs: number;
  potholes: number;
  clientVersion: string;
}

export type ValidationError =
  | 'not_object'
  | 'unknown_field'
  | 'nickname_invalid'
  | 'time_invalid'
  | 'time_too_fast'
  | 'potholes_invalid'
  | 'potholes_implausible'
  | 'version_invalid';

export type ValidationResult =
  | { ok: true; value: ScoreSubmission }
  | { ok: false; error: ValidationError };

const ALLOWED_FIELDS = ['nickname', 'timeMs', 'potholes', 'clientVersion'];
const NICKNAME_RE = /^[\p{L}\p{N} _-]{2,16}$/u;

const fail = (error: ValidationError): ValidationResult => ({ ok: false, error });

export function validateSubmission(input: unknown): ValidationResult {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return fail('not_object');
  const obj = input as Record<string, unknown>;
  if (Object.keys(obj).some((k) => !ALLOWED_FIELDS.includes(k))) return fail('unknown_field');

  const { nickname, timeMs, potholes, clientVersion } = obj;

  if (typeof nickname !== 'string') return fail('nickname_invalid');
  const trimmed = nickname.trim();
  if (!NICKNAME_RE.test(trimmed)) return fail('nickname_invalid');

  if (typeof timeMs !== 'number' || !Number.isInteger(timeMs)) return fail('time_invalid');
  if (timeMs < MIN_WRECK_TIME_MS) return fail('time_too_fast');
  if (timeMs > MAX_TIME_MS) return fail('time_invalid');

  if (typeof potholes !== 'number' || !Number.isInteger(potholes) || potholes < 0 || potholes > MAX_POTHOLES) {
    return fail('potholes_invalid');
  }
  if (potholes > (timeMs / 1000) * MAX_POTHOLES_PER_SECOND) return fail('potholes_implausible');

  if (typeof clientVersion !== 'string' || clientVersion.length < 1 || clientVersion.length > MAX_CLIENT_VERSION_LENGTH) {
    return fail('version_invalid');
  }

  return { ok: true, value: { nickname: trimmed, timeMs, potholes, clientVersion } };
}
