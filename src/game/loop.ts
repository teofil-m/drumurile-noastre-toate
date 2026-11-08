export function fixedSteps(
  accS: number,
  frameDtS: number,
  stepS = 1 / 60,
  maxSteps = 5,
): { steps: number; accS: number } {
  const dt = Number.isFinite(frameDtS) && frameDtS > 0 ? frameDtS : 0;
  let acc = accS + dt;
  let steps = 0;
  while (acc >= stepS && steps < maxSteps) {
    acc -= stepS;
    steps++;
  }
  if (acc >= stepS) acc %= stepS;
  return { steps, accS: acc };
}
