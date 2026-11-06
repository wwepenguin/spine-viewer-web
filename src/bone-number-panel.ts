import type { SceneItem, SkeletonViewer } from './viewer';
import { prepareBoneNumber } from './bone-numbers';
import { boneNumberSettings, MAX_BONE_NUMBERS, type BoneNumberState } from './bone-number-state';

export function installBoneNumberPanel(viewer: SkeletonViewer, report: (error: unknown) => void) {
  const panel = document.createElement('section');
  panel.className = 'bone-number-panel';
  panel.innerHTML = `<div class="section-heading"><h2><button class="section-toggle" aria-expanded="true" aria-controls="boneNumbersContent"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m5 3 5 5-5 5"/></svg>Bone numbers</button></h2><span class="count" id="boneNumberCount">0</span></div>
    <div id="boneNumbersContent" class="section-content">
      <label for="boneNumberSelect">Number</label><select id="boneNumberSelect"></select>
      <label for="boneNumberTarget">Target slot / bone</label><select id="boneNumberTarget"></select>
      <label for="boneNumberText">Display text</label><input id="boneNumberText" type="text" maxlength="128" value="x100">
      <div class="bone-image-actions"><button id="addBoneNumber">Add number</button><button id="removeBoneNumber" class="scene-remove" aria-label="Remove bone number" title="Remove number (Undo to restore)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/></svg></button></div>
      <p id="boneNumberFont" class="file-note">System font (Arial)</p>
      <div class="bone-image-actions"><button id="loadNumberFont">Load bitmap font</button><button id="resetNumberFont" title="Use Arial">System font</button></div>
      <input id="boneNumberFontFiles" type="file" multiple accept=".fnt,.png,.webp,.jpg,.jpeg" hidden>
      <div class="bone-image-fields">
        <label>Font size<input id="boneNumberSize" type="number" min="1" max="1000" step="any"></label>
        <label>Color<input id="boneNumberColor" type="color" value="#ffffff"></label>
        <label>Spacing<input id="boneNumberSpacing" type="number" min="-1000" max="1000" step="any"></label>
        <label>Max width (0 = off)<input id="boneNumberMaxWidth" type="number" min="0" max="10000000" step="any"></label>
        <label>Offset X<input id="boneNumberX" type="number" min="-10000000" max="10000000" step="any"></label>
        <label>Offset Y<input id="boneNumberY" type="number" min="-10000000" max="10000000" step="any"></label>
        <label>Scale<input id="boneNumberScale" type="number" min="0.001" max="1000" step="any"></label>
        <label>Rotation °<input id="boneNumberRotation" type="number" min="-36000" max="36000" step="any"></label>
      </div>
      <label class="check-label"><input id="boneNumberHide" type="checkbox" checked>Hide slot placeholder</label>
      <p class="file-note">Enter numbers or multipliers, e.g. 12,345.67 or x100. Add a number, then select one .fnt plus all its page images to use a game font.</p>
      <p class="file-note">Slot targets follow draw order, clipping, visibility and alpha. Bone targets draw above the skeleton. Dragging the timeline previews either mount.</p>
    </div>`;
  document.querySelector('.bone-image-panel')!.after(panel);
  const el = <T extends HTMLElement>(id: string) => panel.querySelector<T>(`#${id}`)!;
  const select = el<HTMLSelectElement>('boneNumberSelect'),
    target = el<HTMLSelectElement>('boneNumberTarget');
  const text = el<HTMLInputElement>('boneNumberText'),
    color = el<HTMLInputElement>('boneNumberColor'),
    hide = el<HTMLInputElement>('boneNumberHide');
  const add = el<HTMLButtonElement>('addBoneNumber'),
    remove = el<HTMLButtonElement>('removeBoneNumber');
  const load = el<HTMLButtonElement>('loadNumberFont'),
    reset = el<HTMLButtonElement>('resetNumberFont'),
    fileInput = el<HTMLInputElement>('boneNumberFontFiles');
  const toggle = panel.querySelector<HTMLButtonElement>('.section-toggle')!;
  toggle.onclick = () => {
    const content = el<HTMLElement>('boneNumbersContent');
    content.hidden = !content.hidden;
    toggle.setAttribute('aria-expanded', String(!content.hidden));
    panel.classList.toggle('collapsed', content.hidden);
  };
  let actor: SceneItem | undefined,
    selected = -1,
    busy = false;
  let draft: BoneNumberState = {
    mount: 'bone',
    target: '',
    text: 'x100',
    fontSize: 64,
    color: '#ffffff',
    letterSpacing: 0,
    maxWidth: 0,
    x: 0,
    y: 0,
    scale: 1,
    rotation: 0,
    hidePlaceholder: true,
  };
  const fields = [
    ['boneNumberSize', 'fontSize'],
    ['boneNumberSpacing', 'letterSpacing'],
    ['boneNumberMaxWidth', 'maxWidth'],
    ['boneNumberX', 'x'],
    ['boneNumberY', 'y'],
    ['boneNumberScale', 'scale'],
    ['boneNumberRotation', 'rotation'],
  ] as const;
  const changed = () => {
    viewer.drawHighlight();
    viewer.onChange?.();
  };
  function edit(patch: Partial<BoneNumberState>) {
    try {
      if (actor?.boneNumbers.numbers[selected]) {
        actor.boneNumbers.update(selected, patch);
        changed();
      } else {
        draft = { ...boneNumberSettings({ ...draft, ...patch }) };
        sync();
      }
    } catch (error) {
      report(error);
    }
  }
  for (const [id, key] of fields) {
    const input = el<HTMLInputElement>(id);
    input.oninput = () => {
      if (input.value !== '' && input.validity.valid) edit({ [key]: Number(input.value) });
    };
    input.onblur = () => queueMicrotask(sync);
  }
  text.oninput = () => {
    if (text.value.trim()) edit({ text: text.value });
  };
  text.onblur = () => queueMicrotask(sync);
  color.oninput = () => edit({ color: color.value });
  hide.onchange = () => edit({ hidePlaceholder: hide.checked });
  target.onchange = () => {
    const [mount, name] = JSON.parse(target.value);
    edit({ mount, target: name });
  };
  select.onchange = () => {
    selected = Number(select.value);
    sync();
  };
  async function prepare(state: BoneNumberState, replace = false) {
    const destination = actor;
    if (!destination) return;
    const previous = replace ? destination.boneNumbers.numbers[selected] : undefined;
    busy = true;
    sync();
    try {
      const number = await prepareBoneNumber(state);
      const index = previous ? destination.boneNumbers.numbers.indexOf(previous) : -1;
      if (!viewer.items.includes(destination) || (replace && index < 0)) {
        number.release();
        return;
      }
      try {
        if (replace) destination.boneNumbers.replace(index, number);
        else destination.boneNumbers.attach(number);
      } catch (error) {
        number.release();
        throw error;
      }
      if (viewer.active === destination)
        selected = replace ? index : destination.boneNumbers.numbers.length - 1;
      changed();
    } catch (error) {
      report(error);
    } finally {
      busy = false;
      sync();
    }
  }
  add.onclick = () => void prepare(actor?.boneNumbers.numbers[selected]?.state ?? draft);
  remove.onclick = () => {
    actor?.boneNumbers.remove(selected);
    selected = Math.min(selected, (actor?.boneNumbers.numbers.length ?? 0) - 1);
    changed();
  };
  load.onclick = () => fileInput.click();
  fileInput.onchange = () => {
    const files = [...(fileInput.files ?? [])],
      current = actor?.boneNumbers.numbers[selected];
    fileInput.value = '';
    if (!current || !files.length) return;
    const fonts = files.filter((file) => /\.fnt$/i.test(file.name));
    if (fonts.length !== 1) {
      report(Error('Choose exactly one .fnt plus its page images.'));
      return;
    }
    void prepare(
      {
        ...current.state,
        font: {
          file: fonts[0],
          pages: files.filter((file) => /\.(png|webp|jpe?g)$/i.test(file.name)),
        },
      },
      true,
    );
  };
  reset.onclick = () => {
    const current = actor?.boneNumbers.numbers[selected];
    if (current) void prepare({ ...current.state, font: undefined }, true);
  };
  function sync() {
    if (actor !== viewer.active) {
      actor = viewer.active;
      selected = actor?.boneNumbers.numbers.length ? 0 : -1;
      const slots = actor?.model.skeleton.slots ?? [],
        bones = actor?.model.skeleton.bones ?? [];
      const slot =
        slots.find((s) => s.data.name === 'track_mul') ??
        slots.find((s) => /^track[_-]/i.test(s.data.name));
      const bone = bones.find((b) => b.data.name === 'track-bone') ?? bones[0];
      draft = {
        ...draft,
        font: undefined,
        mount: slot ? 'slot' : 'bone',
        target: slot?.data.name ?? bone?.data.name ?? '',
      };
    }
    const numbers = actor?.boneNumbers.numbers ?? [];
    if (selected >= numbers.length) selected = numbers.length - 1;
    const number = numbers[selected],
      state = number?.state ?? draft;
    select.replaceChildren(
      new Option('New number', '-1'),
      ...numbers.map(
        (n, i) => new Option(`${i + 1} · ${n.state.text} · ${n.state.target}`, String(i)),
      ),
    );
    select.value = String(selected);
    select.disabled = busy || !actor;
    target.replaceChildren(
      ...(actor?.model.skeleton.slots ?? []).map(
        (s) => new Option(`Slot · ${s.data.name}`, JSON.stringify(['slot', s.data.name])),
      ),
      ...(actor?.model.skeleton.bones ?? []).map(
        (b) => new Option(`Bone · ${b.data.name}`, JSON.stringify(['bone', b.data.name])),
      ),
    );
    target.value = JSON.stringify([state.mount, state.target]);
    target.disabled = busy || !actor;
    if (document.activeElement !== text) text.value = state.text;
    text.disabled = color.disabled = busy || !actor;
    color.value = state.color;
    hide.checked = state.hidePlaceholder;
    hide.disabled = busy || !actor || state.mount !== 'slot';
    add.disabled = busy || !actor || !state.target || numbers.length >= MAX_BONE_NUMBERS;
    add.textContent = busy ? 'Loading…' : 'Add number';
    remove.disabled = busy || !number;
    load.disabled = busy || !number;
    reset.disabled = busy || !number?.font;
    el<HTMLElement>('boneNumberFont').textContent =
      number?.state.font?.file.name ?? 'System font (Arial)';
    el<HTMLElement>('boneNumberCount').textContent = String(numbers.length);
    for (const [id, key] of fields) {
      const input = el<HTMLInputElement>(id);
      input.disabled = busy || !actor;
      if (document.activeElement !== input) input.value = String(state[key]);
    }
  }
  const previous = viewer.onChange;
  viewer.onChange = () => {
    previous?.();
    sync();
  };
  sync();
}
