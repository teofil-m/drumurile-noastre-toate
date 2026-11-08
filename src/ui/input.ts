export interface Input {
  keys: ReadonlySet<string>;
  dispose(): void;
}

/** Tracks held keys (KeyboardEvent.code) and forwards one-shot presses of Escape and KeyR. */
export function createInput(onPress: (code: string) => void): Input {
  const keys = new Set<string>();
  const GAME = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);
  const down = (e: KeyboardEvent): void => {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
    if (GAME.has(e.code)) e.preventDefault();
    if (!e.repeat) onPress(e.code);
    keys.add(e.code);
  };
  const up = (e: KeyboardEvent): void => {
    keys.delete(e.code);
  };
  const blur = (): void => keys.clear();
  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
  window.addEventListener('blur', blur);
  return {
    keys,
    dispose() {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    },
  };
}
