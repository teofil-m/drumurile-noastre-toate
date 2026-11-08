import { describe, expect, it } from 'vitest';
import { GAME_MODES, MODE_CONFIG, isGameMode } from './modes';
import { MIN_WRECK_TIME_MS, MIN_WRECK_TIME_S } from './constants';

describe('modes', () => {
  it('pins the mode config', () => {
    expect(GAME_MODES).toEqual(['classic', 'short']);
    expect(MODE_CONFIG).toEqual({
      classic: { maxHp: 1000, minWreckTimeS: 180 },
      short: { maxHp: 300, minWreckTimeS: 60 },
    });
  });
  it('keeps the classic min wreck time constants in sync', () => {
    expect(MIN_WRECK_TIME_S).toBe(MODE_CONFIG.classic.minWreckTimeS);
    expect(MIN_WRECK_TIME_MS).toBe(180_000);
  });
  it.each(['classic', 'short'])('isGameMode(%p) is true', (m) => { expect(isGameMode(m)).toBe(true); });
  it.each(['nope', '', 'Short', null, undefined, 1, {}, 'toString', '__proto__'])('isGameMode(%p) is false', (m) => { expect(isGameMode(m)).toBe(false); });
});
