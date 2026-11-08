// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { createHud } from './hud';

const base = { timeS: 192.4, speedKmh: 87.2, health: 800, lastHazard: 'gropality' as const };

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
});
