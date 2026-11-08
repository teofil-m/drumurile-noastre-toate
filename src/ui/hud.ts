import { MAX_HP } from '../core/config';
import type { HazardId, Tier } from '../core/hazards';
import { hazardLabel, t } from '../core/i18n';
import type { Lang } from '../core/i18n';
import { formatTime } from '../game/format';

export interface HudData {
  timeS: number;
  speedKmh: number;
  health: number;
  lastHazard: HazardId | null;
}

export interface Hud {
  el: HTMLElement;
  update(data: HudData, lang: Lang): void;
  flash(): void;
  popup(damage: number, tier: Tier): void;
  show(visible: boolean): void;
}

export function createHud(parent: HTMLElement): Hud {
  const el = document.createElement('div');
  el.className = 'hud';
  el.innerHTML =
    '<div class="hud-time"></div><div class="hud-health"><span class="hud-health-label"></span><div class="bar"><div class="fill"></div><span class="hp-text"></span></div></div>' +
    '<div class="hud-speed"></div><div class="hud-hazard"><b></b><i></i></div><div class="flash"></div><div class="popups"></div>';
  parent.appendChild(el);
  const q = <T extends Element>(sel: string): T => el.querySelector(sel) as T;
  const time = q<HTMLElement>('.hud-time');
  const health = q<HTMLElement>('.hud-health');
  const label = q<HTMLElement>('.hud-health-label');
  const fill = q<HTMLElement>('.fill');
  const speed = q<HTMLElement>('.hud-speed');
  const hazard = q<HTMLElement>('.hud-hazard');
  const hName = q<HTMLElement>('.hud-hazard b');
  const hSub = q<HTMLElement>('.hud-hazard i');
  const hpText = q<HTMLElement>('.hp-text');
  const popups = q<HTMLElement>('.popups');
  const flashEl = q<HTMLElement>('.flash');

  return {
    el,
    update(d, lang) {
      time.textContent = `${t(lang, 'hud.time')} ${formatTime(d.timeS * 1000)}`;
      label.textContent = t(lang, 'hud.health');
      const frac = Math.max(0, Math.min(1, d.health / MAX_HP));
      fill.style.width = `${(frac * 100).toFixed(1)}%`;
      hpText.textContent = `${Math.max(0, Math.round(d.health))} / ${MAX_HP} HP`;
      health.classList.toggle('low', frac < 0.25);
      speed.textContent = `${Math.round(Math.max(0, d.speedKmh))} ${t(lang, 'hud.speed')}`;
      if (d.lastHazard) {
        const l = hazardLabel(d.lastHazard, lang);
        hName.textContent = l.name;
        hSub.textContent = l.subtitle;
        hazard.style.visibility = 'visible';
      } else {
        hName.textContent = '';
        hSub.textContent = '';
        hazard.style.visibility = 'hidden';
      }
    },
    flash() {
      flashEl.classList.remove('on');
      void flashEl.offsetWidth;
      flashEl.classList.add('on');
    },
    popup(damage, tier) {
      const pop = document.createElement('div');
      pop.className = tier === 'large' || tier === 'epic' ? 'dmg-pop big' : 'dmg-pop';
      pop.textContent = `−${Math.round(damage)} HP`;
      pop.style.marginLeft = `${Math.round((Math.random() - 0.5) * 80)}px`;
      popups.appendChild(pop);
      setTimeout(() => pop.remove(), 1100);
    },
    show(visible) {
      el.style.display = visible ? '' : 'none';
    },
  };
}
