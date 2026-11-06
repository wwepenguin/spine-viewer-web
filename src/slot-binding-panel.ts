import type { SceneItem, SkeletonViewer } from './viewer';
import { prepareBoneImage } from './bone-images';
import { prepareBoneNumber } from './bone-numbers';
import type { BoneNumberState } from './bone-number-state';

/** One editor for both attachment types; selecting a slot never moves an existing binding. */
export function installSlotBindingPanel(viewer: SkeletonViewer, report: (error: unknown) => void) {
  const panel = document.createElement('div');
  panel.className = 'slot-binding-panel';
  panel.innerHTML = `<h3>Slot content</h3>
    <label for="bindingTarget">Target slot / bone</label><select id="bindingTarget"></select>
    <label for="bindingType">Content type</label><select id="bindingType"><option value="none">None (original content)</option><option value="image">Image</option><option value="number">Number</option></select>
    <div id="bindingImageFields"><label for="bindingImage">Library image</label><select id="bindingImage"></select></div>
    <div id="bindingNumberFields"><label for="bindingFont">Number font</label><select id="bindingFont"></select>
      <label for="bindingText">Display text</label><input id="bindingText" type="text" maxlength="128" value="x100">
      <div class="bone-image-fields">
        <label>Font size<input id="bindingSize" type="number" min="1" max="1000" step="any" value="64"></label>
        <label>Color<input id="bindingColor" type="color" value="#ffffff"></label>
        <label>Spacing<input id="bindingSpacing" type="number" min="-1000" max="1000" step="any" value="0"></label>
        <label>Max width (0 = off)<input id="bindingWidth" type="number" min="0" max="10000000" step="any" value="0"></label>
      </div>
    </div>
    <div id="bindingTransformFields"><div class="bone-image-fields">
      <label>Offset X<input id="bindingX" type="number" min="-10000000" max="10000000" step="any" value="0"></label>
      <label>Offset Y<input id="bindingY" type="number" min="-10000000" max="10000000" step="any" value="0"></label>
      <label>Scale<input id="bindingScale" type="number" min="0.001" max="1000" step="any" value="1"></label>
      <label>Rotation °<input id="bindingRotation" type="number" min="-36000" max="36000" step="any" value="0"></label>
    </div><label class="check-label"><input id="bindingHide" type="checkbox" checked>Hide slot placeholder</label></div>
    <button id="applyBinding">Apply content</button><p class="file-note" id="bindingHint"></p>
    <p class="file-note">Choose a slot above, then Image, Number or None. Assets come from Media library. Slot content follows animation, draw order, clipping and alpha. Offsets use bone coordinates (Y up).</p>`;
  document.querySelector('#slotsContent')!.append(panel);
  const el = <T extends HTMLElement>(id: string) => panel.querySelector<T>(`#${id}`)!;
  const target = el<HTMLSelectElement>('bindingTarget'),
    type = el<HTMLSelectElement>('bindingType'),
    image = el<HTMLSelectElement>('bindingImage'),
    font = el<HTMLSelectElement>('bindingFont'),
    text = el<HTMLInputElement>('bindingText'),
    color = el<HTMLInputElement>('bindingColor'),
    hide = el<HTMLInputElement>('bindingHide'),
    apply = el<HTMLButtonElement>('applyBinding');
  const fields = [
    ['bindingSize', 'fontSize', 64],
    ['bindingSpacing', 'letterSpacing', 0],
    ['bindingWidth', 'maxWidth', 0],
    ['bindingX', 'x', 0],
    ['bindingY', 'y', 0],
    ['bindingScale', 'scale', 1],
    ['bindingRotation', 'rotation', 0],
  ] as const;
  let actor: SceneItem | undefined,
    targetValue = '',
    lastSlot: string | null | undefined,
    lastBinding: object | undefined,
    busy = false,
    force = true;
  function destination() {
    return targetValue
      ? (JSON.parse(targetValue) as ['slot' | 'bone', string])
      : (['slot', ''] as const);
  }
  const matchingImages = () => {
    const [mount, name] = destination();
    return (
      actor?.boneImages.images.filter((entry) =>
        mount === 'slot'
          ? entry.state.slot === name
          : !entry.state.slot && entry.state.bone === name,
      ) ?? []
    );
  };
  const matchingNumbers = () => {
    const [mount, name] = destination();
    return (
      actor?.boneNumbers.numbers.filter(
        (entry) => entry.state.mount === mount && entry.state.target === name,
      ) ?? []
    );
  };
  function options() {
    const oldImage = image.value,
      oldFont = font.value;
    image.replaceChildren(
      ...viewer.mediaLibrary.images.map(
        (file, i) => new Option(`${i + 1} · ${file.name}`, String(i)),
      ),
    );
    image.value = oldImage;
    if (image.selectedIndex < 0) image.selectedIndex = 0;
    font.replaceChildren(
      new Option('System font (Arial)', '-1'),
      ...viewer.mediaLibrary.fonts.map(
        (asset, i) => new Option(`${i + 1} · ${asset.file.name}`, String(i)),
      ),
    );
    font.value = oldFont;
    if (font.selectedIndex < 0) font.value = '-1';
  }
  let lastLibrary = viewer.mediaLibrary;
  function sync() {
    if (actor !== viewer.active) {
      actor = viewer.active;
      lastSlot = undefined;
      force = true;
      target.replaceChildren(
        ...(actor?.model.skeleton.slots ?? []).map(
          (slot) =>
            new Option(`Slot · ${slot.data.name}`, JSON.stringify(['slot', slot.data.name])),
        ),
        ...(actor?.model.skeleton.bones ?? []).map(
          (bone) =>
            new Option(`Bone · ${bone.data.name}`, JSON.stringify(['bone', bone.data.name])),
        ),
      );
      targetValue = target.options[0]?.value ?? '';
    }
    if (lastSlot !== actor?.selectedSlot) {
      lastSlot = actor?.selectedSlot;
      if (lastSlot) {
        targetValue = JSON.stringify(['slot', lastSlot]);
        force = true;
      }
    }
    target.value = targetValue;
    if (lastLibrary !== viewer.mediaLibrary || force) {
      lastLibrary = viewer.mediaLibrary;
      options();
      force = true;
    }
    const picture = matchingImages()[0],
      number = matchingNumbers()[0],
      binding = number ?? picture;
    if (force || lastBinding !== binding?.state) {
      type.value = number ? 'number' : picture ? 'image' : 'none';
      image.value = String(viewer.mediaLibrary.images.indexOf(picture?.state.file as File));
      if (image.selectedIndex < 0) image.selectedIndex = 0;
      font.value = String(
        number?.state.font
          ? viewer.mediaLibrary.fonts.findIndex((asset) => asset.file === number.state.font?.file)
          : -1,
      );
      text.value = number?.state.text ?? 'x100';
      color.value = number?.state.color ?? '#ffffff';
      hide.checked = binding?.state.hidePlaceholder !== false;
      for (const [id, key, fallback] of fields) {
        const input = el<HTMLInputElement>(id);
        if (document.activeElement !== input)
          input.value = String(
            (binding?.state as Partial<BoneNumberState> | undefined)?.[key] ?? fallback,
          );
      }
      lastBinding = binding?.state;
      force = false;
    }
    el('bindingImageFields').hidden = type.value !== 'image';
    el('bindingNumberFields').hidden = type.value !== 'number';
    el('bindingTransformFields').hidden = type.value === 'none';
    for (const control of panel.querySelectorAll<
      HTMLInputElement | HTMLSelectElement | HTMLButtonElement
    >('input,select,button'))
      control.disabled = busy || !actor;
    hide.disabled ||= destination()[0] !== 'slot';
    apply.disabled ||=
      !destination()[1] ||
      (type.value === 'image' && !viewer.mediaLibrary.images[Number(image.value)]);
    apply.textContent = busy
      ? 'Loading…'
      : type.value === 'none'
        ? 'Restore original content'
        : 'Apply content';
    const count = matchingImages().length + matchingNumbers().length;
    el('bindingHint').textContent = !actor
      ? 'Select a skeleton on the stage first.'
      : count > 1
        ? `${count} existing bindings here. Apply replaces them with one content item.`
        : binding
          ? `Attached: ${number ? number.state.text : picture!.state.file.name}`
          : 'No custom content at this target.';
  }
  const changed = () => {
    viewer.drawHighlight();
    viewer.onChange?.();
  };
  target.onchange = () => {
    targetValue = target.value;
    force = true;
    const [mount, name] = destination();
    if (actor) {
      lastSlot = mount === 'slot' ? name : null;
      viewer.selectSlot(lastSlot);
    }
    sync();
  };
  type.onchange = sync;
  function readState(): BoneNumberState {
    for (const input of panel.querySelectorAll<HTMLInputElement>('input:not([type=checkbox])')) {
      if (
        type.value === 'none' ||
        (type.value === 'image' && input.closest('#bindingNumberFields'))
      )
        continue;
      if (!input.validity.valid || input.value === '') throw Error('Enter valid content settings.');
    }
    const [mount, name] = destination();
    return {
      mount,
      target: name,
      text: text.value,
      color: color.value,
      hidePlaceholder: hide.checked,
      font: viewer.mediaLibrary.fonts[Number(font.value)],
      ...Object.fromEntries(
        fields.map(([id, key]) => [key, Number(el<HTMLInputElement>(id).value)]),
      ),
    } as BoneNumberState;
  }
  // Transform and number edits preview immediately once the selected content has been applied.
  function liveEdit() {
    if (busy || !actor) return;
    try {
      const state = readState(),
        picture = matchingImages()[0],
        number = matchingNumbers()[0];
      if (type.value === 'number' && number && number.state.font?.file === state.font?.file) {
        actor.boneNumbers.update(actor.boneNumbers.numbers.indexOf(number), state);
        changed();
      } else if (
        type.value === 'image' &&
        picture &&
        picture.state.file === viewer.mediaLibrary.images[Number(image.value)]
      ) {
        const { x, y, scale, rotation, hidePlaceholder } = state;
        actor.boneImages.update(actor.boneImages.images.indexOf(picture), {
          x,
          y,
          scale,
          rotation,
          hidePlaceholder,
        });
        changed();
      }
    } catch (error) {
      report(error);
    }
  }
  for (const input of panel.querySelectorAll<HTMLInputElement>('input')) {
    input.oninput = () => {
      if (input.value && input.validity.valid) liveEdit();
    };
  }
  apply.onclick = async () => {
    const item = actor,
      library = viewer.mediaLibrary,
      selectedTarget = targetValue,
      kind = type.value;
    if (!item || busy) return;
    const oldImages = matchingImages(),
      oldNumbers = matchingNumbers();
    let prepared:
      | Awaited<ReturnType<typeof prepareBoneImage>>
      | Awaited<ReturnType<typeof prepareBoneNumber>>
      | undefined;
    busy = true;
    try {
      const state = readState();
      sync();
      if (kind === 'image') {
        const file = library.images[Number(image.value)];
        if (!file) throw Error('Import and choose a library image first.');
        const bone =
          state.mount === 'slot'
            ? item.model.skeleton.findSlot(state.target)?.bone.data.name
            : state.target;
        prepared = await prepareBoneImage({
          file,
          bone: bone ?? '',
          ...(state.mount === 'slot' ? { slot: state.target } : {}),
          x: state.x,
          y: state.y,
          scale: state.scale,
          rotation: state.rotation,
          hidePlaceholder: state.hidePlaceholder,
        });
      } else if (kind === 'number') prepared = await prepareBoneNumber(state);
      if (
        !viewer.items.includes(item) ||
        viewer.mediaLibrary !== library ||
        targetValue !== selectedTarget
      ) {
        prepared?.release();
        prepared = undefined;
        return;
      }
      if (prepared && kind === 'image') {
        const imageResource = prepared as Awaited<ReturnType<typeof prepareBoneImage>>;
        if (oldImages[0])
          item.boneImages.replace(item.boneImages.images.indexOf(oldImages[0]), imageResource);
        else item.boneImages.attach(imageResource);
      } else if (prepared && kind === 'number') {
        const numberResource = prepared as Awaited<ReturnType<typeof prepareBoneNumber>>;
        if (oldNumbers[0])
          item.boneNumbers.replace(item.boneNumbers.numbers.indexOf(oldNumbers[0]), numberResource);
        else item.boneNumbers.attach(numberResource);
      }
      prepared = undefined; // Layer now owns the resource.
      for (const entry of oldImages) {
        const index = item.boneImages.images.indexOf(entry);
        if (index >= 0) item.boneImages.remove(index);
      }
      for (const entry of oldNumbers) {
        const index = item.boneNumbers.numbers.indexOf(entry);
        if (index >= 0) item.boneNumbers.remove(index);
      }
      force = true;
      changed();
    } catch (error) {
      prepared?.release();
      report(error);
    } finally {
      busy = false;
      sync();
    }
  };
  const previous = viewer.onChange;
  viewer.onChange = () => {
    previous?.();
    sync();
  };
  sync();
}
