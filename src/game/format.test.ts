import { describe, expect, it } from 'vitest';
import { formatTime } from './format';

describe('formatTime', () => {
  it('formats', () => {
    expect(formatTime(0)).toBe('0:00.00');
    expect(formatTime(59990)).toBe('0:59.99');
    expect(formatTime(192400)).toBe('3:12.40');
    expect(formatTime(3_600_000)).toBe('60:00.00');
    expect(formatTime(5050)).toBe('0:05.05');
  });
  it('clamps invalid to zero', () => {
    expect(formatTime(-5)).toBe('0:00.00');
    expect(formatTime(NaN)).toBe('0:00.00');
  });
});
