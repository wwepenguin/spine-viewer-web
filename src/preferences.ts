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
  const panel = document.createElement('section');
  panel.innerHTML = `<div class="section-heading"><h2><button class="section-toggle" aria-expanded="true" aria-controls="preferencesContent"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>Preferences</button></h2></div>
    <div id="preferencesContent"><label for="sidebarWidth">Sidebar width</label><input id="sidebarWidth" aria-label="Sidebar width" type="range" min="260" max="480" step="10">
    <label for="timelineHeight">Timeline height</label><input id="timelineHeight" aria-label="Timeline height" type="range" min="220" max="600" step="10">
    <p class="hint">Drag the panel dividers or use these sliders. Layout, collapsed sections, audio volume and frame FPS are remembered on this browser.</p></div>`;
  $('sidebar').append(panel);
  const toggle = panel.querySelector<HTMLButtonElement>('button')!;
  toggle.onclick = () => {
    const content = panel.querySelector<HTMLElement>('#preferencesContent')!;
    content.hidden = !content.hidden;
    toggle.setAttribute('aria-expanded', String(!content.hidden));
  };
  const width = panel.querySelector<HTMLInputElement>('#sidebarWidth')!,
    height = panel.querySelector<HTMLInputElement>('#timelineHeight')!;
  width.value = String(preferences.width);
  height.value = String(preferences.height);
  const layout = () => {
    document.documentElement.style.setProperty('--sidebar-width', width.value + 'px');
    document.documentElement.style.setProperty('--timeline-height', height.value + 'px');
    document.querySelector('#sidebarSizer')?.setAttribute('aria-valuenow', width.value);
    document.querySelector('#timelineSizer')?.setAttribute('aria-valuenow', height.value);
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
      width: Number(width.value),
      height: Number(height.value),
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
  width.oninput = height.oninput = () => {
    layout();
    save();
  };
  document.addEventListener('click', (e) => {
    if ((e.target as Element).closest('.section-toggle')) queueMicrotask(save);
  });
  for (const id of ['stepFps', 'musicVolume', 'musicMute', 'snapTime', 'snapBeats'])
    document.getElementById(id)!.addEventListener('change', () => queueMicrotask(save));
  for (const [id, orientation, input] of [
    ['sidebarSizer', 'vertical', width],
    ['timelineSizer', 'horizontal', height],
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
    handle.setAttribute('aria-valuemin', input.min);
    handle.setAttribute('aria-valuemax', input.max);
    handle.setAttribute('aria-valuenow', input.value);
    let start: { x: number; y: number; size: number } | undefined;
    handle.onpointerdown = (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      start = { x: e.clientX, y: e.clientY, size: Number(input.value) };
      handle.setPointerCapture(e.pointerId);
    };
    handle.onpointermove = (e) => {
      if (!start) return;
      input.value = String(
        Math.max(
          Number(input.min),
          Math.min(
            Number(input.max),
            start.size + (orientation === 'vertical' ? e.clientX - start.x : start.y - e.clientY),
          ),
        ),
      );
      layout();
    };
    handle.onpointerup = handle.onpointercancel = () => {
      start = undefined;
      save();
    };
    handle.onkeydown = (e) => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
      e.preventDefault();
      input.value = String(
        Number(input.value) + (['ArrowRight', 'ArrowUp'].includes(e.key) ? 10 : -10),
      );
      layout();
      save();
    };
    document.querySelector('.workspace')!.append(handle);
  }
  viewer.onChange?.();
}
