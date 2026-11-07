import { describe, expect, it } from 'vitest';
import { HAZARDS, HAZARD_IDS, getHazard, type HazardId } from './hazards';
import { HAZARD_WEIGHTS, MAX_HP, TIER_DAMAGE } from './config';

describe('hazard catalog', () => {
  it('has exactly the 8 specified rows', () => {
    expect(
      HAZARDS.map(({ id, kind, tier, nameRo, subtitle }) => ({ id, kind, tier, nameRo, subtitle })),
    ).toEqual([
      { id: 'gropita', kind: 'pothole', tier: 'small', nameRo: 'Gropița', subtitle: { ro: 'Mică, dar a noastră', en: 'Tiny pothole' } },
      { id: 'gropality', kind: 'pothole', tier: 'medium', nameRo: 'Gropality', subtitle: { ro: 'Groapă cu personalitate', en: 'Pothole with personality' } },
      { id: 'groapa-de-gunoi', kind: 'pothole', tier: 'large', nameRo: 'Groapa de gunoi', subtitle: { ro: 'Aici a fost un asfalt', en: 'The garbage pit' } },
      { id: 'craterul-national', kind: 'pothole', tier: 'epic', nameRo: 'Craterul Național', subtitle: { ro: 'Se vede din spațiu', en: 'National crater' } },
      { id: 'bordura-protocol', kind: 'curb', tier: 'small', nameRo: 'Bordura de protocol', subtitle: { ro: 'Joasă și politicoasă', en: 'Polite curb' } },
      { id: 'bordura-everest', kind: 'curb', tier: 'large', nameRo: 'Bordura Everest', subtitle: { ro: 'Nu e bordură, e alpinism', en: 'Everest curb' } },
      { id: 'capac-dansator', kind: 'manhole', tier: 'small', nameRo: 'Capacul dansator', subtitle: { ro: 'Zdrăngăne la fiecare trecere', en: 'Dancing lid' } },
      { id: 'gura-iadului', kind: 'manhole', tier: 'epic', nameRo: 'Gura iadului', subtitle: { ro: 'Capac furat, drum direct jos', en: 'Mouth of hell' } },
    ]);
  });

  it('has unique ids and HAZARD_IDS follows catalog order', () => {
    expect(new Set(HAZARDS.map((h) => h.id)).size).toBe(HAZARDS.length);
    expect(HAZARD_IDS).toEqual(HAZARDS.map((h) => h.id));
  });

  it('covers every kind enough (AC 3)', () => {
    const count = (k: string) => HAZARDS.filter((h) => h.kind === k).length;
    expect(count('pothole')).toBeGreaterThanOrEqual(3);
    expect(count('curb')).toBeGreaterThanOrEqual(2);
    expect(count('manhole')).toBeGreaterThanOrEqual(2);
  });

  it('looks up hazards by id', () => {
    expect(getHazard('gropality').tier).toBe('medium');
  });

  it('throws for unknown ids', () => {
    expect(() => getHazard('nope' as HazardId)).toThrow(/unknown hazard: nope/);
  });
});

describe('config', () => {
  it('gives every hazard a positive weight', () => {
    for (const id of HAZARD_IDS) expect(HAZARD_WEIGHTS[id]).toBeGreaterThan(0);
  });

  it('keeps required damage values', () => {
    expect(TIER_DAMAGE).toEqual({ small: 10, medium: 25, large: 50, epic: 120 });
    expect(MAX_HP).toBe(1000);
  });
});
