import { ACHIEVEMENTS } from '../core/achievements';
import type { AchievementId } from '../core/achievements';
import { achievementLabel, t } from '../core/i18n';
import type { Lang, MessageKey } from '../core/i18n';
import type { KeyValueStore } from '../core/ports';
import type { ApiClient } from '../adapters/apiClient';
import { formatTime } from '../game/format';
import type { GameMode } from '../shared/modes';
import { validateSubmission } from '../shared/score';

export const NICKNAME_KEY = 'dn.nickname';

export interface RunResult {
  mode: GameMode;
  kind: 'wrecked' | 'dnf';
  timeMs: number;
  potholes: number;
  newAchievements: readonly AchievementId[];
}

export interface ScreenDeps {
  root: HTMLElement;
  store: KeyValueStore;
  api: ApiClient;
  clientVersion: string;
  getLang(): Lang;
  setLang(lang: Lang): void;
  unlocked(): ReadonlySet<AchievementId>;
  onPlay(mode: GameMode): void;
  /** The mode last played this session (default board in the leaderboard); classic when none. */
  lastMode(): GameMode;
  onResume(): void;
  onRestart(): void;
  /** Called when the player leaves a run for the main menu (discard the run, rebuild an idle world). */
  onMenu(): void;
}

export interface Screens {
  showMenu(): void;
  showPause(): void;
  showResult(result: RunResult): void;
  showError(message: string): void;
  hide(): void;
  readonly visible: boolean;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

function button(label: string, onClick: () => void, cls = ''): HTMLButtonElement {
  const b = el('button', `btn ${cls}`.trim(), label);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

export function createScreens(deps: ScreenDeps): Screens {
  const layer = el('div', 'screen');
  layer.style.display = 'none';
  deps.root.appendChild(layer);
  let render: (() => void) | null = null;
  let token = 0;
  // Remembers a successful submit per result so re-rendering (e.g. returning from the leaderboard) keeps it.
  const submittedFor = new WeakSet<RunResult>();

  const lang = (): Lang => deps.getLang();
  const tr = (key: MessageKey, params?: Record<string, string | number>): string => t(lang(), key, params);

  const mount = (r: () => void): void => {
    render = r;
    token++;
    layer.replaceChildren();
    layer.style.display = '';
    r();
  };

  const panel = (title: string, ...children: HTMLElement[]): void => {
    const p = el('div', 'panel');
    p.appendChild(el('h1', 'title', title));
    for (const c of children) p.appendChild(c);
    layer.appendChild(p);
  };

  const toMenu = (): void => {
    deps.onMenu();
    menu();
  };

  const menu = (): void =>
    mount(() => {
      const langBtn = button(
        tr('menu.language'),
        () => {
          deps.setLang(lang() === 'ro' ? 'en' : 'ro');
          render?.();
        },
        'small',
      );
      panel(
        tr('menu.title'),
        button(tr('menu.playShort'), () => deps.onPlay('short'), 'primary'),
        button(tr('menu.playClassic'), () => deps.onPlay('classic'), 'primary'),
        button(tr('menu.leaderboard'), () => leaderboard(menu)),
        button(tr('menu.achievements'), () => achievements(menu)),
        langBtn,
      );
    });

  const leaderboard = (
    back: () => void,
    initial: 'fastest' | 'potholes' = 'fastest',
    initialMode: GameMode = deps.lastMode(),
  ): void => {
    let board = initial;
    let mode = initialMode;
    mount(() => {
      const mine = token;
      const modeTabs = el('div', 'tabs');
      for (const m of ['short', 'classic'] as const) {
        modeTabs.appendChild(
          button(
            tr(m === 'short' ? 'mode.short' : 'mode.classic'),
            () => {
              mode = m;
              render?.();
            },
            m === mode ? 'tab active' : 'tab',
          ),
        );
      }
      const tabs = el('div', 'tabs');
      const list = el('div', 'lb');
      for (const b of ['fastest', 'potholes'] as const) {
        tabs.appendChild(
          button(
            tr(b === 'fastest' ? 'leaderboard.fastest' : 'leaderboard.potholes'),
            () => {
              board = b;
              render?.();
            },
            b === board ? 'tab active' : 'tab',
          ),
        );
      }
      list.textContent = tr('nav.loading');
      panel(tr('menu.leaderboard'), modeTabs, tabs, list, button(tr('nav.back'), back, 'small'));
      void deps.api.leaderboard(board, 20, mode).then((res) => {
        if (mine !== token) return; // screen changed meanwhile
        list.replaceChildren();
        if (!res.ok) {
          list.textContent = tr('result.offline');
          return;
        }
        if (res.entries.length === 0) {
          list.textContent = tr('leaderboard.empty');
          return;
        }
        res.entries.forEach((e, i) => {
          const row = el('div', 'lb-row');
          row.append(
            el('span', 'rank', `${i + 1}.`),
            el('span', 'nick', e.nickname),
            el('span', 'val', board === 'fastest' ? formatTime(e.timeMs) : String(e.potholes)),
          );
          list.appendChild(row);
        });
      });
    });
  };

  const achievements = (back: () => void): void =>
    mount(() => {
      const grid = el('div', 'ach-grid');
      const have = deps.unlocked();
      for (const a of ACHIEVEMENTS) {
        const l = achievementLabel(a.id, lang());
        const unlocked = have.has(a.id);
        const card = el('div', unlocked ? 'ach' : 'ach locked');
        card.append(el('b', undefined, l.name), el('i', undefined, unlocked ? l.subtitle : tr('achievements.locked')));
        grid.appendChild(card);
      }
      panel(tr('menu.achievements'), grid, button(tr('nav.back'), back, 'small'));
    });

  const pause = (): void =>
    mount(() => {
      panel(
        tr('pause.title'),
        button(tr('pause.resume'), deps.onResume, 'primary'),
        button(tr('pause.restart'), deps.onRestart),
        button(tr('pause.menu'), toMenu),
      );
    });

  const result = (r: RunResult): void => {
    const back = (): void => result(r);
    mount(() => {
      const kids: HTMLElement[] = [];
      kids.push(el('p', 'stat', tr('result.mode', { mode: tr(r.mode === 'short' ? 'mode.short' : 'mode.classic') })));
      if (r.kind === 'wrecked') {
        kids.push(el('p', 'stat', tr('result.time', { time: formatTime(r.timeMs) })));
        kids.push(el('p', 'stat', tr('result.potholes', { count: r.potholes })));
      }
      if (r.newAchievements.length > 0) {
        const box = el('div', 'newach');
        box.appendChild(el('h2', undefined, tr('result.newAchievements')));
        for (const id of r.newAchievements) {
          const l = achievementLabel(id, lang());
          box.appendChild(el('div', 'ach', `${l.name} - ${l.subtitle}`));
        }
        kids.push(box);
      }
      if (r.kind === 'wrecked') {
        const form = el('div', 'submit');
        const input = el('input');
        input.type = 'text';
        input.maxLength = 16;
        input.placeholder = tr('result.nickname');
        input.value = deps.store.get(NICKNAME_KEY) ?? '';
        const status = el('p', 'status');
        const submit = button(
          tr('result.submit'),
          () => {
            const v = validateSubmission({
              nickname: input.value,
              timeMs: r.timeMs,
              potholes: r.potholes,
              mode: r.mode,
              clientVersion: deps.clientVersion,
            });
            if (!v.ok) {
              status.className = 'status err';
              status.textContent = v.error === 'nickname_invalid' ? tr('result.nicknameInvalid') : tr('result.failed');
              return;
            }
            deps.store.set(NICKNAME_KEY, v.value.nickname);
            submit.disabled = true;
            status.className = 'status';
            status.textContent = tr('result.submitting');
            void deps.api.submitScore(v.value).then((res) => {
              if (res.ok) {
                submittedFor.add(r);
              }
              if (mountedToken !== token) return;
              if (res.ok) {
                status.className = 'status ok';
                status.textContent = tr('result.submitted');
                input.disabled = true;
                return;
              }
              submit.disabled = false;
              submit.textContent = tr('result.retry');
              status.className = 'status err';
              status.textContent =
                res.error === 'offline' ? tr('result.offline') : `${tr('result.failed')} (${res.error})`;
            });
          },
          'primary',
        );
        const mountedToken = token;
        if (submittedFor.has(r)) {
          submit.disabled = true;
          input.disabled = true;
          status.className = 'status ok';
          status.textContent = tr('result.submitted');
        }
        form.append(input, submit, status);
        kids.push(form);
      }
      const row = el('div', 'row');
      row.append(
        button(tr('result.restart'), deps.onRestart, 'primary'),
        button(tr('result.leaderboard'), () => leaderboard(back, 'fastest', r.mode)),
        button(tr('result.menu'), toMenu),
      );
      kids.push(row);
      panel(tr(r.kind === 'dnf' ? 'result.dnf' : 'result.wrecked'), ...kids);
    });
  };

  return {
    showMenu: menu,
    showPause: pause,
    showResult: result,
    showError(message) {
      mount(() => panel(message));
    },
    hide() {
      render = null;
      token++;
      layer.style.display = 'none';
      layer.replaceChildren();
    },
    get visible() {
      return layer.style.display !== 'none';
    },
  };
}
