import { describe, expect, it } from 'vitest';
import type { HazardSpawn } from '../core/roadgen';
import { CAR_HALF_LENGTH_M, CAR_HALF_WIDTH_M, HAZARD_RADIUS_M, hazardContacts, trafficCollision } from './contacts';

const h = (s: number, lateral: number, id = 'x'): HazardSpawn => ({ instanceId: id, hazardId: 'gropita', s, lateral });

describe('hazardContacts', () => {
  it('constants', () => {
    expect([CAR_HALF_WIDTH_M, CAR_HALF_LENGTH_M, HAZARD_RADIUS_M]).toEqual([0.8, 2.0, 0.6]);
  });
  it('hits a hazard under the car', () => {
    expect(hazardContacts(9, 10, 0, [h(10.5, 0.5)])).toHaveLength(1);
  });
  it('hits a hazard just ahead within half length', () => {
    expect(hazardContacts(9, 10, 0, [h(11.9, 0)])).toHaveLength(1);
    expect(hazardContacts(9, 10, 0, [h(12.1, 0)])).toHaveLength(0);
  });
  it('s upper bound is inclusive', () => {
    expect(hazardContacts(9, 10, 0, [h(12, 0)])).toHaveLength(1);
  });
  it('lower bound is exclusive and swept from prevS', () => {
    expect(hazardContacts(10, 12, 0, [h(8, 0)])).toHaveLength(0);
    expect(hazardContacts(10, 12, 0, [h(8.1, 0)])).toHaveLength(1);
  });
  it('misses a hazard on the far side of the road', () => {
    expect(hazardContacts(9, 10, 2.5, [h(10, -3)])).toHaveLength(0);
  });
  it('lateral tolerance is 1.4 inclusive, both directions', () => {
    expect(hazardContacts(9, 10, 0, [h(10, 1.4)])).toHaveLength(1);
    expect(hazardContacts(9, 10, 0, [h(10, -1.4)])).toHaveLength(1);
    expect(hazardContacts(9, 10, 0, [h(10, 1.41)])).toHaveLength(0);
    expect(hazardContacts(9, 10, 0, [h(10, -1.41)])).toHaveLength(0);
  });
  it('ignores hazards already passed', () => {
    expect(hazardContacts(20, 21, 0, [h(10, 0)])).toHaveLength(0);
  });
  it('returns every matching hazard', () => {
    expect(hazardContacts(9, 10, 0, [h(10, 0, 'a'), h(30, 0, 'b'), h(11, 0.2, 'c')]).map((x) => x.instanceId)).toEqual(['a', 'c']);
  });
});

describe('trafficCollision', () => {
  it('same lane overlapping', () => {
    expect(trafficCollision(70, 1.75, [{ s: 72, lane: 1 }])).toBe(true);
  });
  it('other lane does not collide', () => {
    expect(trafficCollision(70, 1.75, [{ s: 70, lane: -1 }])).toBe(false);
  });
  it('5 m ahead does not collide', () => {
    expect(trafficCollision(70, 1.75, [{ s: 75, lane: 1 }])).toBe(false);
  });
  it('4 m boundary: touching counts as no overlap', () => {
    expect(trafficCollision(70, 1.75, [{ s: 73.9, lane: 1 }])).toBe(true);
    expect(trafficCollision(70, 1.75, [{ s: 74, lane: 1 }])).toBe(false);
    expect(trafficCollision(70, 1.75, [{ s: 66, lane: 1 }])).toBe(false);
    expect(trafficCollision(70, 1.75, [{ s: 66.1, lane: 1 }])).toBe(true);
  });
  it('lateral overlap threshold 1.6', () => {
    expect(trafficCollision(70, 0.16, [{ s: 70, lane: 1 }])).toBe(true); // |dLat| = 1.59
    expect(trafficCollision(70, 0.15, [{ s: 70, lane: 1 }])).toBe(false); // 1.60
    expect(trafficCollision(70, 3.34, [{ s: 70, lane: 1 }])).toBe(true);
    expect(trafficCollision(70, 3.35, [{ s: 70, lane: 1 }])).toBe(false);
  });
  it('custom lane offset and empty list', () => {
    expect(trafficCollision(70, 3, [{ s: 70, lane: 1 }], 3)).toBe(true);
    expect(trafficCollision(70, 3, [{ s: 70, lane: -1 }], 3)).toBe(false);
    expect(trafficCollision(70, -3, [{ s: 70, lane: -1 }], 3)).toBe(true);
    expect(trafficCollision(70, 0, [])).toBe(false);
  });
  it('any car in the list can hit', () => {
    expect(trafficCollision(70, 1.75, [{ s: 100, lane: 1 }, { s: 70, lane: 1 }])).toBe(true);
  });
});
