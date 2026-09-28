import { captureProject, decodeProject, encodeProject, restoreProject } from './project';
import type { SkeletonViewer } from './viewer';
import type { TrackPanel } from './track-panel';

export function installEditor(
  viewer: SkeletonViewer,
  timeline: TrackPanel,
  report: (error: unknown) => void,
) {
  const section = document.createElement('section');
  section.className = 'panel editor-panel';
  section.innerHTML = `<h2><button class="section-toggle" aria-expanded="true" aria-controls="projectContent">Project</button></h2>
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
      void run(async () =>
        restoreProject(viewer, decodeProject(new Uint8Array(await file.arrayBuffer()))),
      );
  };
}
