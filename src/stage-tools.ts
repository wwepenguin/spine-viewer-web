import type { SkeletonViewer } from './viewer';
export function installStageTools(viewer: SkeletonViewer) {
  const panel = document.createElement('div');
  panel.className = 'stage-tools';
  panel.innerHTML = `<div class="editor-actions"><button data-mode="move">Move</button><button data-mode="rotate">Rotate</button><button data-mode="scale">Scale</button></div>
    <div class="editor-actions"><label>Scale <input id="actorScale" aria-label="Selected skeleton scale" type="number" min="0.01" max="100" step="0.01"></label><label>Rotation ° <input id="actorRotation" aria-label="Selected skeleton rotation" type="number" step="1"></label></div>
    <div class="editor-actions"><label><input id="actorVisible" type="checkbox"> Visible</label><label><input id="actorLocked" type="checkbox"> Lock transforms</label></div>
    <div class="editor-actions"><button id="actorBack">Send backward</button><button id="actorFront">Bring forward</button></div>
    <p class="hint">Drag a character with the selected tool. Shift + drag, middle drag or drag empty space to pan. Scale / rotation use the skeleton origin.</p>`;
  document.getElementById('sceneContent')!.append(panel);
  const input = (id: string) => panel.querySelector<HTMLInputElement>(`#${id}`)!;
  const button = (id: string) => panel.querySelector<HTMLButtonElement>(`#${id}`)!;
  const scale = input('actorScale'),
    rotation = input('actorRotation');
  scale.oninput = rotation.oninput = () => {
    if (scale.value && rotation.value && scale.validity.valid && rotation.validity.valid)
      viewer.transformSelected(Number(scale.value), Number(rotation.value));
  };
  input('actorVisible').onchange = () => {
    if (viewer.active) viewer.model.visible = input('actorVisible').checked;
    viewer.drawHighlight();
    viewer.onChange?.();
  };
  input('actorLocked').onchange = () => {
    if (viewer.active) viewer.active.locked = input('actorLocked').checked;
    viewer.onChange?.();
  };
  button('actorBack').onclick = () => viewer.reorderSelected(-1);
  button('actorFront').onclick = () => viewer.reorderSelected(1);
  for (const b of panel.querySelectorAll<HTMLButtonElement>('[data-mode]'))
    b.onclick = () => {
      viewer.transformMode = b.dataset.mode as typeof viewer.transformMode;
      sync();
    };
  function sync() {
    const item = viewer.active;
    for (const b of panel.querySelectorAll<HTMLButtonElement>('[data-mode]'))
      b.setAttribute('aria-pressed', String(b.dataset.mode === viewer.transformMode));
    scale.disabled = rotation.disabled = !item || item.locked;
    input('actorVisible').disabled = input('actorLocked').disabled = !item;
    input('actorVisible').checked = item?.model.visible ?? false;
    input('actorLocked').checked = item?.locked ?? false;
    if (document.activeElement !== scale) scale.value = (item?.model.scale.x ?? 1).toFixed(3);
    if (document.activeElement !== rotation)
      rotation.value = (((item?.model.rotation ?? 0) * 180) / Math.PI).toFixed(2);
    button('actorBack').disabled = !item || item.locked || viewer.items.indexOf(item) === 0;
    button('actorFront').disabled =
      !item || item.locked || viewer.items.indexOf(item) === viewer.items.length - 1;
    for (const id of ['sceneX', 'sceneY'])
      (document.getElementById(id) as HTMLInputElement).disabled = !item || item.locked;
  }
  const previous = viewer.onChange;
  viewer.onChange = () => {
    previous?.();
    sync();
  };
  sync();
}
