export type GameMode = 'classic' | 'short';
export const GAME_MODES: readonly GameMode[] = ['classic', 'short'];
export const MODE_CONFIG: Record<GameMode, { maxHp: number; minWreckTimeS: number }> = {
  classic: { maxHp: 1000, minWreckTimeS: 180 },
  short: { maxHp: 300, minWreckTimeS: 60 },
};

export function isGameMode(v: unknown): v is GameMode {
  return typeof v === 'string' && (GAME_MODES as readonly string[]).includes(v);
}
