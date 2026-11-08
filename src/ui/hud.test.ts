// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { createHud } from './hud';

const base = { timeS: 192.4, speedKmh: 87.2, health: 800, maxHp: 1000, lastHazard: 'gropality' as const };

describe('hud', () => {
  it('renders time, speed, hazard name and EN subtitle', () => {
    const hud = createHud(document.body);
    hud.update(base, 'en');
    const text = hud.el.textContent ?? '';
    expect(text).toContain('3:12.40');
    expect(text).toContain('87 km/h');
    expect(text).toContain('Gropality');
    expect(text).toContain('Pothole with personality');
  });
  it('uses RO subtitle and marks low health', () => {
    const hud = createHud(document.body);
    hud.update({ ...base, health: 200 }, 'ro');
    expect(hud.el.textContent).toContain('Groapă cu personalitate');
    expect(hud.el.querySelector('.hud-health')?.classList.contains('low')).toBe(true);
    hud.update(base, 'ro');
    expect(hud.el.querySelector('.hud-health')?.classList.contains('low')).toBe(false);
  });
  it('shows the HP number', () => {
    const hud = createHud(document.body);
    hud.update({ ...base, health: 742 }, 'en');
    expect(hud.el.textContent).toContain('742 / 1000 HP');
  });
  it('scales the bar and low-health mark by maxHp', () => {
    const hud = createHud(document.body);
    hud.update({ ...base, health: 100, maxHp: 300 }, 'en');
    expect(hud.el.textContent).toContain('100 / 300 HP');
    expect((hud.el.querySelector('.fill') as HTMLElement).style.width).toBe('33.3%');
    expect(hud.el.querySelector('.hud-health')?.classList.contains('low')).toBe(false);
    hud.update({ ...base, health: 74, maxHp: 300 }, 'en');
    expect(hud.el.querySelector('.hud-health')?.classList.contains('low')).toBe(true);
    hud.update({ ...base, health: 75, maxHp: 300 }, 'en');
    expect(hud.el.querySelector('.hud-health')?.classList.contains('low')).toBe(false);
  });
  it('adds a damage pop-up', () => {
    const hud = createHud(document.body);
    hud.popup(38, 'small');
    const pop = hud.el.querySelector('.dmg-pop');
    expect(pop?.textContent).toBe('−38 HP');
    expect(pop?.classList.contains('big')).toBe(false);
    hud.popup(120, 'epic');
    expect(hud.el.querySelectorAll('.dmg-pop.big').length).toBe(1);
  });
});
