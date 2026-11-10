import pkg from '../package.json';
import { createApiClient } from './adapters/apiClient';
import { createLocalStore } from './adapters/localStore';
import { ROAD } from './core/config';
import { getHazard } from './core/hazards';
import { loadLang, saveLang, t } from './core/i18n';
import type { Lang } from './core/i18n';
import { scoreTimeMs } from './core/run';
import type { RunEvent, RunOutput } from './core/run';
import type { GameMode } from './shared/modes';
import { createRng } from './core/rng';
import { createSteering, effectiveSteer, stepSteering } from './core/steering';
import type { SteeringState } from './core/steering';
import { fixedSteps } from './game/loop';
import { createSession, sessionEvent, withMode } from './game/session';
import type { Session } from './game/session';
import { createRenderer } from './render/scene';
import type { Renderer } from './render/scene';
import { createSim } from './sim/sim';
import type { Sim, SimSnapshot } from './sim/sim';
import { controlsFromKeys } from './ui/keys';
import { createHud } from './ui/hud';
import { createInput } from './ui/input';
import { createScreens } from './ui/screens';
import { createToaster } from './ui/toast';
import './ui/style.css';

const API_URL: string =
  import.meta.env.VITE_API_URL ?? 'https://drumurile-api-superpowers.mititelu-teofil.workers.dev';
const STEP_S = 1 / 60;
const KEEP_BEHIND_M = 80;

interface World {
  canvas: HTMLCanvasElement;
  sim: Sim;
  renderer: Renderer;
  snapshot: SimSnapshot;
  steering: SteeringState;
  session: Session;
  runAchievements: ReturnType<typeof sessionEvent>['unlockedNow'];
}

const store = createLocalStore();
const api = createApiClient(API_URL);
let lang: Lang = loadLang(store);

const stage = document.getElementById('stage') as HTMLElement;
const ui = document.getElementById('ui') as HTMLElement;

let world: World | null = null;
let accS = 0;
let buildId = 0;
let building: Promise<World | null> | null = null;
let lastMode: GameMode = 'classic';
let shakeTimer: ReturnType<typeof setTimeout> | undefined;

const hud = createHud(ui);
hud.show(false);
const toaster = createToaster(ui);

const screens = createScreens({
  root: ui,
  store,
  api,
  clientVersion: pkg.version,
  getLang: () => lang,
  setLang: (l) => {
    lang = l;
    saveLang(store, l);
    document.documentElement.lang = l;
  },
  unlocked: () => world?.session.unlocked ?? new Set(),
  onPlay: (mode) => void startRun(mode),
  lastMode: () => lastMode,
  onResume: () => resume(),
  onRestart: () => void startRun(lastMode),
  onMenu: () => {
    hud.show(false);
    void buildWorld();
  },
});
document.documentElement.lang = lang;

function showFatal(err: unknown): void {
  console.error(err);
  world = null;
  hud.show(false);
  screens.showError(t(lang, 'error.physics'));
}

function disposeWorld(): void {
  if (!world) return;
  try {
    world.renderer.dispose();
  } catch (e) {
    console.error(e);
  }
  world.sim.dispose();
  world.canvas.remove();
  world = null;
}

/** Builds a fresh sim + renderer (new canvas) and an idle (menu-phase) session. Returns the world or null on failure. */
function buildWorld(): Promise<World | null> {
  const p = buildWorldImpl().finally(() => {
    if (building === p) building = null;
  });
  building = p;
  return p;
}

async function buildWorldImpl(): Promise<World | null> {
  const id = ++buildId;
  disposeWorld();
  accS = 0;
  const seed = Date.now() >>> 0;
  let sim: Sim | null = null;
  let renderer: Renderer | null = null;
  let canvas: HTMLCanvasElement | null = null;
  try {
    sim = await createSim(seed);
    if (id !== buildId) {
      sim.dispose();
      return null;
    }
    canvas = document.createElement('canvas');
    stage.appendChild(canvas);
    renderer = createRenderer(canvas);
    renderer.resize(window.innerWidth, window.innerHeight);
    const first = sim.ensureRoadAhead(0);
    renderer.addChunks(first, sim.path);
    const { snapshot } = sim.step({ throttle: 0, brake: 0, steer: 0, handbrake: false }, 0, STEP_S);
    const w: World = {
      canvas,
      sim,
      renderer,
      snapshot,
      steering: createSteering(createRng(seed)),
      session: createSession(seed, store),
      runAchievements: [],
    };
    world = w;
    return w;
  } catch (err) {
    try {
      renderer?.dispose();
    } catch {
      /* ignore */
    }
    sim?.dispose();
    canvas?.remove();
    if (id === buildId) showFatal(err);
    return null;
  }
}

function apply(ev: RunEvent): RunOutput[] {
  if (!world) return [];
  const r = sessionEvent(world.session, ev, store);
  world.session = r.session;
  if (r.unlockedNow.length > 0) {
    world.runAchievements = [...world.runAchievements, ...r.unlockedNow];
    toaster.show(r.unlockedNow, lang);
  }
  return r.outputs;
}

function bigHit(): void {
  hud.flash();
  stage.classList.remove('shake');
  void stage.offsetWidth;
  stage.classList.add('shake');
  clearTimeout(shakeTimer);
  shakeTimer = setTimeout(() => stage.classList.remove('shake'), 400);
}

function handleOutputs(outputs: RunOutput[]): void {
  if (!world) return;
  for (const o of outputs) {
    if (o.type === 'partDetached') {
      world.sim.detach(o.part);
      world.renderer.detach(o.part);
    } else if (o.type === 'hazardHit') {
      const tier = getHazard(o.hazardId).tier;
      hud.popup(o.damage, tier);
      if (tier === 'large' || tier === 'epic') bigHit();
    } else if (o.type === 'roll') {
      hud.popup(o.damage, 'large', t(lang, 'hud.roll'));
      bigHit();
    }
  }
}

function finishIfOver(): void {
  if (!world) return;
  const run = world.session.run;
  if (run.phase !== 'wrecked' && run.phase !== 'dnf') return;
  hud.show(true);
  screens.showResult({
    mode: run.mode,
    kind: run.phase,
    timeMs: scoreTimeMs(run),
    potholes: run.stats.potholes,
    newAchievements: world.runAchievements,
  });
}

async function startRun(mode: GameMode): Promise<void> {
  lastMode = mode;
  screens.hide();
  hud.show(false);
  // Reuse the idle world (built at load / Menu) when there is one; otherwise (restart) build a fresh one.
  let w: World | null;
  if (building) w = await building;
  else if (world && world.session.run.phase === 'menu') w = world;
  else w = await buildWorld();
  if (!w || world !== w || w.session.run.phase !== 'menu') return;
  w.session = withMode(w.session, mode);
  apply({ type: 'start' });
  hud.show(true);
}

function pause(): void {
  if (!world || world.session.run.phase !== 'driving') return;
  apply({ type: 'pause' });
  screens.showPause();
}

function resume(): void {
  if (!world || world.session.run.phase !== 'paused') return;
  apply({ type: 'resume' });
  screens.hide();
  accS = 0;
}

const input = createInput((code) => {
  if (!world) return;
  const phase = world.session.run.phase;
  if (code === 'Escape') {
    if (phase === 'driving') pause();
    else if (phase === 'paused') resume();
  } else if (code === 'KeyR') {
    if (phase === 'driving' || phase === 'paused' || phase === 'wrecked' || phase === 'dnf') void startRun(lastMode);
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) pause();
});

window.addEventListener('resize', () => world?.renderer.resize(window.innerWidth, window.innerHeight));

function stepWorld(w: World): void {
  const controls = controlsFromKeys(input.keys);
  w.steering = stepSteering(w.steering, controls.steer, STEP_S, w.snapshot.speedKmh);
  const steer = effectiveSteer(w.steering, w.snapshot.speedKmh);
  const { snapshot, events } = w.sim.step(controls, steer, STEP_S);
  w.snapshot = snapshot;
  handleOutputs(apply({ type: 'tick', dtS: STEP_S, steerInput: controls.steer, offRoad: Math.abs(snapshot.lateral) > ROAD.halfWidthM + 1 }));
  for (const ev of events) {
    if (world !== w || w.session.run.phase !== 'driving') break;
    handleOutputs(apply(ev));
  }
}

let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.25, Math.max(0, (now - last) / 1000));
  last = now;
  const w = world;
  if (w) {
    try {
      if (w.session.run.phase === 'driving') {
        const r = fixedSteps(accS, dt, STEP_S, 5);
        accS = r.accS;
        for (let i = 0; i < r.steps && world === w && w.session.run.phase === 'driving'; i++) stepWorld(w);
        finishIfOver();
      }
      const chunks = w.sim.ensureRoadAhead(w.session.run.timeS);
      if (chunks.length > 0) w.renderer.addChunks(chunks, w.sim.path);
      w.renderer.removeChunksBefore(w.snapshot.s - KEEP_BEHIND_M);
      w.renderer.update(w.snapshot, dt);
      w.renderer.render();
      hud.update(
        {
          timeS: w.session.run.timeS,
          speedKmh: w.snapshot.speedKmh,
          health: w.session.run.health,
          maxHp: w.session.run.maxHp,
          lastHazard: w.session.run.lastHazard,
        },
        lang,
      );
    } catch (err) {
      showFatal(err);
    }
  }
  requestAnimationFrame(frame);
}

screens.showMenu();
void buildWorld();
requestAnimationFrame(frame);
