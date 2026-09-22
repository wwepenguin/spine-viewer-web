/** Step to the adjacent frame boundary without accumulating floating-point drift. */
export function stepFrameTime(time: number, direction: -1 | 1, fps: number, duration: number) {
  if (!Number.isFinite(fps) || fps <= 0 || !Number.isFinite(time) || !Number.isFinite(duration))
    throw Error('Invalid frame step');
  const frame = Math.max(0, time) * fps;
  const index = direction > 0 ? Math.floor(frame + 1e-7) + 1 : Math.ceil(frame - 1e-7) - 1;
  return Math.max(0, Math.min(Math.max(0, duration), index / fps));
}
