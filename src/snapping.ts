/** Snap with a pixel-derived tolerance; Alt temporarily bypasses every snap. */
export function snapTime(
  time: number,
  fps: number,
  targets: readonly number[],
  tolerance: number,
  enabled = true,
) {
  const value = Math.max(0, time);
  if (!enabled) return value;
  const candidates = [Math.round(value * fps) / fps, ...targets].filter(
    (t) => Number.isFinite(t) && t >= 0,
  );
  const nearest = candidates.reduce(
    (a, b) => (Math.abs(b - value) < Math.abs(a - value) ? b : a),
    value + tolerance + 1,
  );
  return Math.abs(nearest - value) <= tolerance ? nearest : value;
}
