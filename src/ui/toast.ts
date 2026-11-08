import type { AchievementId } from '../core/achievements';
import { achievementLabel } from '../core/i18n';
import type { Lang } from '../core/i18n';

export const TOAST_MS = 3000;

export interface Toaster {
  show(ids: readonly AchievementId[], lang: Lang): void;
}

export function createToaster(parent: HTMLElement): Toaster {
  const box = document.createElement('div');
  box.className = 'toasts';
  parent.appendChild(box);
  return {
    show(ids, lang) {
      for (const id of ids) {
        const l = achievementLabel(id, lang);
        const el = document.createElement('div');
        el.className = 'toast';
        el.innerHTML = '<b></b><i></i>';
        (el.querySelector('b') as HTMLElement).textContent = `🏆 ${l.name}`;
        (el.querySelector('i') as HTMLElement).textContent = l.subtitle;
        box.appendChild(el);
        setTimeout(() => el.remove(), TOAST_MS);
      }
    },
  };
}
