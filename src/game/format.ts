export function formatTime(ms: number): string {
  const total = Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 10) : 0;
  const cs = total % 100;
  const secs = Math.floor(total / 100);
  const s = secs % 60;
  const m = Math.floor(secs / 60);
  return `${m}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}
