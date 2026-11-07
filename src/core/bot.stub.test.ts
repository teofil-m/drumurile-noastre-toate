import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TOP_SPEED_KMH } from './config';
import type { Chunk, HazardSpawn } from './roadgen';

vi.mock('./roadgen', () => ({ generateChunk: vi.fn() }));

import { generateChunk } from './roadgen';
import { BOT, simulateGreedyBot } from './bot';

// Same float expression as bot.ts, accumulated tick by tick, so positions land exactly on the bot's s values.
const sAfter = (ticks: number): number => {
  let s = 0;
  for (let i = 0; i < ticks; i++) s += (TOP_SPEED_KMH / 3.6) * BOT.dtS;
  return s;
};
let n = 0;
const hz = (s: number, lateral: number): HazardSpawn => ({ instanceId: `stub-${n++}`, hazardId: 'gropita', s, lateral });
const useChunk0 = (hazards: HazardSpawn[]): void => {
  vi.mocked(generateChunk).mockImplementation((_seed, index): Chunk => ({
    index, startS: index * 50, curvature: 0, hazards: index === 0 ? hazards : [], traffic: [],
  }));
};
// maxTimeS giving exactly `ticks` ticks (timeS reaches ticks*dt, which is >= maxTimeS).
const ticksLimit = (ticks: number): number => (ticks - 0.5) * BOT.dtS;

describe('greedy bot with stubbed roadgen', () => {
  beforeEach(() => { n = 0; vi.mocked(generateChunk).mockReset(); });

  it('hits a hazard exactly at the tick position (bot.ts:46 `h.s <= s`)', () => {
    useChunk0([hz(sAfter(1), 0)]);
    expect(simulateGreedyBot(1, ticksLimit(1)).hits).toBe(1);
  });
  it('hits at exactly the hit tolerance laterally (bot.ts:46 `<=`)', () => {
    useChunk0([hz(sAfter(1), BOT.hitToleranceM)]);
    expect(simulateGreedyBot(1, ticksLimit(1)).hits).toBe(1);
  });
  it('does not hit on tick 2 a hazard that sits exactly at the tick-1 position (bot.ts:46 `h.s > prevS`)', () => {
    // Decoy pulls the bot sideways; at tick 1 the hazard is just out of tolerance, at tick 2 it would be in.
    useChunk0([hz(sAfter(1), 0.95), hz(500, 3)]);
    expect(simulateGreedyBot(1, ticksLimit(2)).hits).toBe(0);
  });
  it('does not steer toward a hazard exactly at the current position (bot.ts:37 `h.s > s`)', () => {
    useChunk0([hz(sAfter(1), 0.93)]);
    expect(simulateGreedyBot(1, ticksLimit(1)).hits).toBe(0);
  });
  it('targets the nearest hazard when the chunk lists them unsorted (bot.ts:37 sort)', () => {
    // far (+4) listed first, near (-4) second; near sits at tick 4's position so it is the target for ticks 1-3.
    // Probe: near's own hit at tick 4 needs the bot to have drifted negative.
    useChunk0([hz(500, 4), hz(sAfter(4), -0.8)]);
    expect(simulateGreedyBot(1, ticksLimit(4)).hits).toBe(1);
  });
  it('targets the nearest of three unsorted hazards (bot.ts:37 comparator direction)', () => {
    useChunk0([hz(500, 4), hz(400, 4), hz(sAfter(4), -0.8)]);
    expect(simulateGreedyBot(1, ticksLimit(4)).hits).toBe(1);
  });
});
