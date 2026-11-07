export type Tier = 'small' | 'medium' | 'large' | 'epic';
export type HazardKind = 'pothole' | 'curb' | 'manhole';
export type HazardId =
  | 'gropita'
  | 'gropality'
  | 'groapa-de-gunoi'
  | 'craterul-national'
  | 'bordura-protocol'
  | 'bordura-everest'
  | 'capac-dansator'
  | 'gura-iadului';

export interface Localized {
  ro: string;
  en: string;
}

export interface HazardType {
  id: HazardId;
  kind: HazardKind;
  tier: Tier;
  nameRo: string;
  subtitle: Localized;
}

export const HAZARDS: readonly HazardType[] = [
  { id: 'gropita', kind: 'pothole', tier: 'small', nameRo: 'Gropița', subtitle: { ro: 'Mică, dar a noastră', en: 'Tiny pothole' } },
  { id: 'gropality', kind: 'pothole', tier: 'medium', nameRo: 'Gropality', subtitle: { ro: 'Groapă cu personalitate', en: 'Pothole with personality' } },
  { id: 'groapa-de-gunoi', kind: 'pothole', tier: 'large', nameRo: 'Groapa de gunoi', subtitle: { ro: 'Aici a fost un asfalt', en: 'The garbage pit' } },
  { id: 'craterul-national', kind: 'pothole', tier: 'epic', nameRo: 'Craterul Național', subtitle: { ro: 'Se vede din spațiu', en: 'National crater' } },
  { id: 'bordura-protocol', kind: 'curb', tier: 'small', nameRo: 'Bordura de protocol', subtitle: { ro: 'Joasă și politicoasă', en: 'Polite curb' } },
  { id: 'bordura-everest', kind: 'curb', tier: 'large', nameRo: 'Bordura Everest', subtitle: { ro: 'Nu e bordură, e alpinism', en: 'Everest curb' } },
  { id: 'capac-dansator', kind: 'manhole', tier: 'small', nameRo: 'Capacul dansator', subtitle: { ro: 'Zdrăngăne la fiecare trecere', en: 'Dancing lid' } },
  { id: 'gura-iadului', kind: 'manhole', tier: 'epic', nameRo: 'Gura iadului', subtitle: { ro: 'Capac furat, drum direct jos', en: 'Mouth of hell' } },
];

export const HAZARD_IDS: readonly HazardId[] = HAZARDS.map((h) => h.id);

export function getHazard(id: HazardId): HazardType {
  const hazard = HAZARDS.find((h) => h.id === id);
  if (!hazard) throw new Error(`unknown hazard: ${id}`);
  return hazard;
}
