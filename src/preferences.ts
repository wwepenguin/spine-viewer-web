import type { SkeletonViewer } from './viewer';
import type { TrackPanel } from './track-panel';
import { $ } from './dom';
const KEY = 'spine-viewer.preferences.v1';
export function parsePreferences(raw: string | null) {
  let data: Record<string, unknown> = {};
  try {
    const value = JSON.parse(raw || '{}');
    if (value && typeof value === 'object') data = value;
  } catch {
    /* Use defaults for corrupt local storage. */
  }
  const number = (key: string, fallback: number, min: number, max: number) =>
    typeof data[key] === 'number' && Number.isFinite(data[key])
      ? Math.max(min, Math.min(max, data[key] as number))
      : fallback;
  const collapsed = Array.isArray(data.collapsed)
    ? data.collapsed.filter((s): s is string => typeof s === 'string').slice(0, 30)
    : [];
  return {
    width: number('width', 310, 260, 480),
    height: number('height', 370, 220, 600),
    volume: number('volume', 0.8, 0, 1),
    muted: data.muted === true,
    fps: [24, 30, 60].includes(Number(data.fps)) ? String(data.fps) : '30',
    collapsed,
    snap: data.snap !== false,
    snapBeats: data.snapBeats === true,
  };
}
export function installPreferences(viewer: SkeletonViewer, timeline: TrackPanel) {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(KEY);
  } catch {
    /* Storage may be disabled. */
  }
  const preferences = parsePreferences(stored);
  const sizes = { width: preferences.width, height: preferences.height };
  const layout = () => {
    document.documentElement.style.setProperty('--sidebar-width', sizes.width + 'px');
    document.documentElement.style.setProperty('--timeline-height', sizes.height + 'px');
    document.querySelector('#sidebarSizer')?.setAttribute('aria-valuenow', String(sizes.width));
    document.querySelector('#timelineSizer')?.setAttribute('aria-valuenow', String(sizes.height));
  };
  layout();
  $('stepFps').value = preferences.fps;
  viewer.music.setVolume(preferences.volume, preferences.muted);
  $('musicVolume').value = String(preferences.volume * 100);
  $('musicMute').checked = preferences.muted;
  timeline.snap = preferences.snap;
  timeline.snapBeats = preferences.snapBeats;
  (document.getElementById('snapTime') as HTMLInputElement).checked = preferences.snap;
  (document.getElementById('snapBeats') as HTMLInputElement).checked = preferences.snapBeats;
  for (const b of document.querySelectorAll<HTMLButtonElement>('.section-toggle')) {
    const id = b.getAttribute('aria-controls')!;
    if (!preferences.collapsed.includes(id)) continue;
    const content = document.getElementById(id);
    if (content) content.hidden = true;
    b.setAttribute('aria-expanded', 'false');
    b.closest('section')?.classList.add('collapsed');
  }
  const save = () => {
    const value = {
      width: sizes.width,
      height: sizes.height,
      volume: viewer.music.volume,
      muted: viewer.music.muted,
      fps: Number($('stepFps').value),
      snap: timeline.snap,
      snapBeats: timeline.snapBeats,
      collapsed: [...document.querySelectorAll('.section-toggle[aria-expanded=false]')].map((b) =>
        b.getAttribute('aria-controls'),
      ),
    };
    try {
      localStorage.setItem(KEY, JSON.stringify(value));
    } catch {
      /* Keep the current session usable without storage. */
    }
  };
  document.addEventListener('click', (e) => {
    if ((e.target as Element).closest('.section-toggle')) queueMicrotask(save);
  });
  for (const id of ['stepFps', 'musicVolume', 'musicMute', 'snapTime', 'snapBeats'])
    document.getElementById(id)!.addEventListener('change', () => queueMicrotask(save));
  for (const [id, orientation, key, min, max] of [
    ['sidebarSizer', 'vertical', 'width', 260, 480],
    ['timelineSizer', 'horizontal', 'height', 220, 600],
  ] as const) {
    const handle = document.createElement('div');
    handle.id = id;
    handle.className = 'panel-sizer';
    handle.tabIndex = 0;
    handle.setAttribute('role', 'separator');
    handle.setAttribute('aria-orientation', orientation);
    handle.setAttribute(
      'aria-label',
      orientation === 'vertical' ? 'Resize sidebar' : 'Resize timeline',
    );
    handle.setAttribute('aria-valuemin', String(min));
    handle.setAttribute('aria-valuemax', String(max));
    handle.setAttribute('aria-valuenow', String(sizes[key]));
    let start: { x: number; y: number; size: number } | undefined;
    handle.onpointerdown = (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const panel =
        orientation === 'vertical'
          ? $('sidebar')
          : document.querySelector<HTMLElement>('.timeline-dock')!;
      start = { x: e.clientX, y: e.clientY, size: panel.getBoundingClientRect()[key] };
      handle.setPointerCapture(e.pointerId);
    };
    handle.onpointermove = (e) => {
      if (!start) return;
      sizes[key] = Math.max(
        min,
        Math.min(
          max,
          start.size + (orientation === 'vertical' ? e.clientX - start.x : start.y - e.clientY),
        ),
      );
      layout();
    };
    handle.onpointerup =
      handle.onpointercancel =
      handle.onlostpointercapture =
        () => {
          start = undefined;
          save();
        };
    handle.onkeydown = (e) => {
      const keys =
        orientation === 'vertical' ? ['ArrowLeft', 'ArrowRight'] : ['ArrowDown', 'ArrowUp'];
      if (!keys.includes(e.key)) return;
      e.preventDefault();
      sizes[key] = Math.max(min, Math.min(max, sizes[key] + (e.key === keys[1] ? 10 : -10)));
      layout();
      save();
    };
    document.querySelector('.workspace')!.append(handle);
  }
  viewer.onChange?.();
}
