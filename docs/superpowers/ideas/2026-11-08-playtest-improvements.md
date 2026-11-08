# Playtest improvements (backlog)

First local playtest, 2026-11-08. Verdict: fun. Items below are saved for a later round; each would go through brainstorming → plan before implementation.

## 1. Car windows
The yellow Dacia needs visible glass: a rear window and a windshield (dark-tinted triangles/quads on the cabin's sloped front and back), maybe side windows too. Pure `src/render/car.ts` change.

## 2. Faster, momentum-driven damage
Feedback: wrecking the car takes quite a long time.
Idea: damage = obstacle weight × speed × coefficient, so hitting a big hole fast and then **rolling** the car does extra damage (rolling/tumbling becomes a damage source of its own).
Notes for the design:
- Today a hit deals `round(tierDamage × clamp(speedKmh / 110, 0.1, 1.0))`; requirements AC 12 fixes the tiers (10/25/50, epic more) as *starting values, tune after first playtest* — this playtest is that moment, so a retune is allowed, but record it in `plan/comparison.md` / requirements notes.
- Roll damage needs the sim to report roll events (chassis rotation about the forward axis past ~180°/360°) and impact speed; today the sim auto-resets a flipped car after 1.5 s — keep that, but count/score the roll first.
- The 180 s minimum wreck time stays (AC 4); faster damage mostly means the clamp matters more — the greedy-bot balance guard (spec §4.6) must be re-run and re-tuned with the new formula.

## 3. New achievements (with gameplay changes where needed)
- **They See Me Rollin'** — perform 5 rolls in one run. Needs roll detection (see 2).
- **Ierbivor** — *iarba verde de acasă*: spend a lot of time on the grass (e.g. ≥ 30 s total off the asphalt in a run). Needs the sim/session to track time with `|lateral| > ROAD.halfWidthM + 1` (verge edge).
Both need i18n (RO name + EN subtitle) and core rule tests like the existing 11.

## Done immediately (not part of this backlog)
- HP number shown in the health bar.
- "−X HP" pop-ups on every hit.
