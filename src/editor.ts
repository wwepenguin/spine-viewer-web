import { captureProject, decodeProject, encodeProject } from './project';
import { restoreProject } from './project-restore';
import type { SkeletonViewer } from './viewer';
import type { TrackPanel } from './track-panel';
import { EditHistory } from './history';
import { installMusicTools } from './music-tools';
import { installStageTools } from './stage-tools';
import { installPreferences } from './preferences';
import type { ProjectSnapshot } from './project';

export function installEditor(
  viewer: SkeletonViewer,
  timeline: TrackPanel,
  report: (error: unknown) => void,
  cancelPending: () => void,
) {
  const section = document.createElement('section');
  section.className = 'panel editor-panel';
  section.innerHTML = `<div class="section-heading"><h2><button class="section-toggle" aria-expanded="true" aria-controls="projectContent"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>Project</button></h2></div>
    <div id="projectContent"><div class="editor-actions"><button id="saveProject">Save project ZIP</button><button id="openProject">Open project ZIP</button></div>
    <input id="projectFile" type="file" accept=".zip" hidden><p class="hint">Includes skeletons, textures, audio and track settings. Opens paused.</p></div>`;
  document.getElementById('sidebar')!.prepend(section);
  const toggle = section.querySelector('button')!;
  toggle.onclick = () => {
    const content = section.querySelector<HTMLElement>('#projectContent')!;
    content.hidden = !content.hidden;
    toggle.setAttribute('aria-expanded', String(!content.hidden));
  };
  const save = section.querySelector<HTMLButtonElement>('#saveProject')!;
  const open = section.querySelector<HTMLButtonElement>('#openProject')!;
  const input = section.querySelector<HTMLInputElement>('#projectFile')!;
  const busy = document.createElement('dialog');
  busy.className = 'project-busy';
  busy.textContent = 'Preparing project…';
  busy.oncancel = (e) => e.preventDefault();
  document.body.append(busy);
  const run = async (fn: () => Promise<void>) => {
    busy.showModal();
    try {
      await fn();
      timeline.fit();
    } catch (error) {
      report(error);
    } finally {
      busy.close();
    }
  };
  save.onclick = () =>
    void run(async () => {
      const bytes = await encodeProject(captureProject(viewer));
      const url = URL.createObjectURL(
        new Blob([bytes.slice().buffer], { type: 'application/zip' }),
      );
      const a = document.createElement('a');
      a.href = url;
      a.download = 'spine-project.zip';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    });
  open.onclick = () => input.click();
  input.onchange = () => {
    const file = input.files?.[0];
    input.value = '';
    if (file)
      void run(async () => {
        if (file.size > 512 * 1024 * 1024) throw Error('Project exceeds 512 MB.');
        const snapshot = decodeProject(new Uint8Array(await file.arrayBuffer()));
        cancelPending();
        await restoreProject(viewer, snapshot);
      });
  };
  const actions = document.createElement('div');
  actions.className = 'editor-actions';
  actions.innerHTML =
    '<button id="undoEdit" title="Ctrl+Z / Cmd+Z">Undo</button><button id="redoEdit" title="Ctrl+Shift+Z / Ctrl+Y">Redo</button>';
  section.querySelector('#projectContent')!.prepend(actions);
  const undo = actions.querySelector<HTMLButtonElement>('#undoEdit')!;
  const redo = actions.querySelector<HTMLButtonElement>('#redoEdit')!;
  const fileIds = new WeakMap<File, number>();
  let nextFile = 0;
  const fileId = (file?: File) => {
    if (!file) return null;
    if (!fileIds.has(file)) fileIds.set(file, nextFile++);
    return fileIds.get(file);
  };
  const history = new EditHistory<ProjectSnapshot>((s) =>
    JSON.stringify({
      actors: s.actors.map((a) => ({
        source: {
          ...a.source,
          entries: a.source.entries.map((e) => ({ path: e.path, id: fileId(e.file) })),
        },
        state: { ...a.state, time: 0, track: 0, selectedSlot: null },
      })),
      audio: fileId(s.audio),
      music: { ...s.music, time: 0 },
    }),
  );
  const refresh = () => {
    undo.disabled = !history.canUndo;
    redo.disabled = !history.canRedo;
  };
  const record = () => {
    history.record(captureProject(viewer));
    refresh();
  };
  let pointerDown = false;
  const schedule = () =>
    queueMicrotask(() => {
      const editing = document.activeElement?.matches(
        'input[type=number], input[type=range], input[type=text]',
      );
      if (!pointerDown && !editing) record();
    });
  const previousChange = viewer.onChange;
  viewer.onChange = () => {
    previousChange?.();
    schedule();
  };
  window.addEventListener(
    'pointerdown',
    () => {
      pointerDown = true;
    },
    true,
  );
  window.addEventListener(
    'pointerup',
    () => {
      pointerDown = false;
      queueMicrotask(record);
    },
    true,
  );
  window.addEventListener(
    'pointercancel',
    () => {
      pointerDown = false;
      queueMicrotask(record);
    },
    true,
  );
  window.addEventListener('change', () => queueMicrotask(record));
  window.addEventListener('focusout', schedule);
  window.addEventListener('click', schedule);
  const move = (direction: -1 | 1) => {
    record();
    void run(async () => {
      cancelPending();
      try {
        await history.move(direction, (state) => restoreProject(viewer, state));
      } finally {
        refresh();
      }
    });
  };
  undo.onclick = () => move(-1);
  redo.onclick = () => move(1);
  window.addEventListener('keydown', (event) => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey || busy.open) return;
    if ((event.target as HTMLElement).closest('input,textarea,[contenteditable=true]')) return;
    if (event.key.toLowerCase() === 'z') {
      event.preventDefault();
      move(event.shiftKey ? 1 : -1);
    } else if (event.key.toLowerCase() === 'y') {
      event.preventDefault();
      move(1);
    }
  });
  record();
  installMusicTools(viewer, report);
  installStageTools(viewer);
  installPreferences(viewer, timeline);
}
