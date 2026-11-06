import type { SceneItem, SkeletonViewer } from './viewer';
import { prepareBoneImage } from './bone-images';
import { MAX_BONE_IMAGES } from './bone-image-state';

export function installBoneImagePanel(viewer: SkeletonViewer, report: (error: unknown) => void) {
  const panel = document.createElement('section');
  panel.className = 'bone-image-panel';
  panel.innerHTML = `<div class="section-heading"><h2><button class="section-toggle" aria-expanded="true" aria-controls="boneImagesContent"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m5 3 5 5-5 5"/></svg>Bone images</button></h2><span class="count" id="boneImageCount">0</span></div>
    <div id="boneImagesContent" class="section-content">
      <label for="boneImageSelect">Image</label><select id="boneImageSelect"></select>
      <label for="boneImageBone">Target bone</label><select id="boneImageBone"></select>
      <div class="bone-image-actions"><button id="uploadBoneImage">Upload image</button><button id="removeBoneImage" class="scene-remove" aria-label="Remove bone image" title="Remove image (Undo to restore)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/></svg></button></div>
      <input id="boneImageFile" type="file" accept=".png,.webp,.jpg,.jpeg,image/png,image/webp,image/jpeg" hidden>
      <div class="bone-image-fields">
        <label>Offset X<input id="boneImageX" type="number" min="-10000000" max="10000000" step="any" value="0"></label>
        <label>Offset Y<input id="boneImageY" type="number" min="-10000000" max="10000000" step="any" value="0"></label>
        <label>Scale<input id="boneImageScale" type="number" min="0.001" max="1000" step="any" value="1"></label>
        <label>Rotation °<input id="boneImageRotation" type="number" min="-36000" max="36000" step="any" value="0"></label>
      </div>
      <p class="file-note">PNG / WebP / JPG. Images are centered on the bone and drawn above the skeleton. Offsets use bone coordinates (Y up). At scale 1, one image pixel equals one skeleton unit.</p>
      <p class="file-note" id="boneImageHint"></p>
    </div>`;
  document.querySelector('.scene-section')!.after(panel);
  const element = <T extends HTMLElement>(id: string) => panel.querySelector<T>(`#${id}`)!;
  const bone = element<HTMLSelectElement>('boneImageBone');
  const select = element<HTMLSelectElement>('boneImageSelect');
  const upload = element<HTMLButtonElement>('uploadBoneImage');
  const remove = element<HTMLButtonElement>('removeBoneImage');
  const fileInput = element<HTMLInputElement>('boneImageFile');
  let actor: SceneItem | undefined,
    selected = -1,
    targetBone = '',
    busy = false;
  const toggle = panel.querySelector<HTMLButtonElement>('.section-toggle')!;
  toggle.onclick = () => {
    const content = element<HTMLElement>('boneImagesContent');
    content.hidden = !content.hidden;
    toggle.setAttribute('aria-expanded', String(!content.hidden));
    panel.classList.toggle('collapsed', content.hidden);
  };
  const fields = [
    ['boneImageX', 'x', 0],
    ['boneImageY', 'y', 0],
    ['boneImageScale', 'scale', 1],
    ['boneImageRotation', 'rotation', 0],
  ] as const;
  const changed = () => {
    viewer.drawHighlight();
    viewer.onChange?.();
  };
  for (const [id, key] of fields) {
    const input = element<HTMLInputElement>(id);
    input.oninput = () => {
      if (actor && input.value !== '' && input.validity.valid) {
        actor.boneImages.update(selected, { [key]: Number(input.value) });
        changed();
      }
    };
    input.onblur = () => queueMicrotask(sync);
  }
  bone.onchange = () => {
    targetBone = bone.value;
    if (actor?.boneImages.images[selected]) {
      actor.boneImages.update(selected, { bone: targetBone });
      changed();
    }
  };
  select.onchange = () => {
    selected = Number(select.value);
    sync();
  };
  upload.onclick = () => fileInput.click();
  fileInput.onchange = async () => {
    const file = fileInput.files?.[0],
      destination = viewer.active,
      boneName = bone.value;
    fileInput.value = '';
    if (!file || !destination || !boneName) return;
    busy = true;
    sync();
    try {
      const prepared = await prepareBoneImage({
        file,
        bone: boneName,
        x: 0,
        y: 0,
        scale: 1,
        rotation: 0,
      });
      if (!viewer.items.includes(destination)) {
        prepared.release();
        return;
      }
      try {
        destination.boneImages.attach(prepared);
      } catch (error) {
        prepared.release();
        throw error;
      }
      if (viewer.active === destination) selected = destination.boneImages.images.length - 1;
      changed();
    } catch (error) {
      report(error);
    } finally {
      busy = false;
      sync();
    }
  };
  remove.onclick = () => {
    actor?.boneImages.remove(selected);
    selected = Math.min(selected, (actor?.boneImages.images.length ?? 0) - 1);
    changed();
  };
  function sync() {
    if (actor !== viewer.active) {
      actor = viewer.active;
      selected = actor?.boneImages.images.length ? 0 : -1;
      const bones = actor?.model.skeleton.bones ?? [];
      targetBone =
        bones.find((b) => b.data.name.toLowerCase() === 'track-bone')?.data.name ??
        bones[0]?.data.name ??
        '';
    }
    const images = actor?.boneImages.images ?? [],
      bones = actor?.model.skeleton.bones ?? [];
    if (selected >= images.length) selected = images.length - 1;
    const image = images[selected];
    if (image) targetBone = image.state.bone;
    select.replaceChildren(
      new Option('New image', '-1'),
      ...images.map((image, i) => new Option(`${i + 1} · ${image.state.file.name}`, String(i))),
    );
    select.value = String(selected);
    select.disabled = !actor;
    bone.replaceChildren(...bones.map((b) => new Option(b.data.name, b.data.name)));
    bone.value = targetBone;
    bone.disabled = !bones.length;
    upload.disabled = busy || !bones.length || images.length >= MAX_BONE_IMAGES;
    upload.textContent = busy ? 'Loading…' : 'Upload image';
    remove.disabled = !image;
    element<HTMLElement>('boneImageCount').textContent = String(images.length);
    element<HTMLElement>('boneImageHint').textContent = !actor
      ? 'Select a skeleton on the stage first.'
      : bones.some((b) => b.data.name.toLowerCase() === 'track-bone')
        ? 'track-bone is available. Select a target bone before uploading.'
        : 'No track-bone in this skeleton. Choose any available bone.';
    for (const [id, key, fallback] of fields) {
      const input = element<HTMLInputElement>(id);
      input.disabled = !image;
      if (document.activeElement !== input) input.value = String(image?.state[key] ?? fallback);
    }
  }
  const previous = viewer.onChange;
  viewer.onChange = () => {
    previous?.();
    sync();
  };
  sync();
}
