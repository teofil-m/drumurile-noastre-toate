import { describe, expect, it } from 'vitest';
import { validateSubmission } from './score';

const valid = { nickname: 'Ion', timeMs: 200_000, potholes: 10, clientVersion: '0.1.0' };
const err = (x: unknown) => (validateSubmission(x) as { error: string }).error;

describe('validateSubmission', () => {
  it('accepts a valid submission and trims nickname', () => {
    expect(validateSubmission({ ...valid, nickname: '  Ștefan_1-a  ' })).toEqual({ ok: true, value: { ...valid, nickname: 'Ștefan_1-a' } });
  });
  it.each([null, 42, 'x', [], undefined])('rejects non-object %p', (x) => { expect(err(x)).toBe('not_object'); });
  it('rejects unknown fields', () => { expect(err({ ...valid, extra: 1 })).toBe('unknown_field'); });
  it.each(['a', 'x'.repeat(17), '   ', 'a\tb', '<script>', 'ion😀', 42, undefined])('rejects nickname %p', (n) => { expect(err({ ...valid, nickname: n })).toBe('nickname_invalid'); });
  it.each(['ab', 'x'.repeat(16), 'Ion Popescu'])('accepts nickname %p', (n) => { expect(validateSubmission({ ...valid, nickname: n }).ok).toBe(true); });
  it('enforces the minimum wreck time boundary', () => {
    expect(err({ ...valid, timeMs: 179_999 })).toBe('time_too_fast');
    expect(validateSubmission({ ...valid, timeMs: 180_000, potholes: 0 }).ok).toBe(true);
  });
  it.each([3_600_001, 180_000.5, '200000', Infinity, NaN, -1])('rejects timeMs %p', (t) => {
    expect(err({ ...valid, timeMs: t })).toBe(t === -1 ? 'time_too_fast' : 'time_invalid');
  });
  it('accepts MAX_TIME_MS', () => { expect(validateSubmission({ ...valid, timeMs: 3_600_000 }).ok).toBe(true); });
  it.each([-1, 5001, 1.5, '3', null])('rejects potholes %p', (p) => { expect(err({ ...valid, potholes: p })).toBe('potholes_invalid'); });
  it('rejects implausible pothole rate (> 4 per second)', () => {
    expect(validateSubmission({ ...valid, timeMs: 180_000, potholes: 720 }).ok).toBe(true);
    expect(err({ ...valid, timeMs: 180_000, potholes: 721 })).toBe('potholes_implausible');
  });
  it.each(['', 'x'.repeat(21), 1])('rejects clientVersion %p', (v) => { expect(err({ ...valid, clientVersion: v })).toBe('version_invalid'); });
  it('accepts boundary potholes and clientVersion lengths', () => {
    expect(validateSubmission({ ...valid, timeMs: 3_600_000, potholes: 5000 }).ok).toBe(true);
    expect(validateSubmission({ ...valid, clientVersion: 'v' }).ok).toBe(true);
    expect(validateSubmission({ ...valid, clientVersion: 'x'.repeat(20) }).ok).toBe(true);
  });
});
