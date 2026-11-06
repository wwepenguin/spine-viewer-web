import { PIXI, type RuntimeSpine } from './runtime';

// Images and numbers share ownership so swapping types never loses the original renderable flag.
const placeholders = new WeakMap<
  RuntimeSpine,
  {
    owners: Map<object, Set<string>>;
    originals: Map<PIXI.DisplayObject, boolean>;
  }
>();
export function syncSlotPlaceholders(model: RuntimeSpine, owner: object, names: Set<string>) {
  let state = placeholders.get(model);
  if (!state && !names.size) return;
  if (!state) {
    state = { owners: new Map(), originals: new Map() };
    placeholders.set(model, state);
  }
  if (names.size) state.owners.set(owner, names);
  else state.owners.delete(owner);
  const hidden = new Set<PIXI.DisplayObject>();
  for (const slots of state.owners.values())
    for (const name of slots) {
      const slot = model.skeleton.findSlot(name);
      for (const display of [slot?.currentSprite, slot?.currentMesh])
        if (display) hidden.add(display);
    }
  for (const [display, renderable] of state.originals)
    if (!hidden.has(display)) {
      display.renderable = renderable;
      state.originals.delete(display);
    }
  for (const display of hidden) {
    if (!state.originals.has(display)) state.originals.set(display, display.renderable);
    display.renderable = false;
  }
  if (!state.owners.size && !state.originals.size) placeholders.delete(model);
}
/** Region containers already follow the bone; mesh containers may be identity transforms. */
export function syncSlotTransform(model: RuntimeSpine, root: PIXI.Container, name: string) {
  const slot = model.skeleton.findSlot(name);
  root.visible = !!slot && slot.bone.active !== false;
  if (!slot || !root.parent) return;
  const parent = root.parent;
  parent.transform.updateLocalTransform();
  const matrix = parent.localTransform;
  if (Math.abs(matrix.a * matrix.d - matrix.b * matrix.c) < 1e-12) {
    root.visible = false;
    return;
  }
  root.transform.setFromMatrix(matrix.clone().invert().append(slot.bone.matrix));
  parent.setChildIndex(root, parent.children.length - 1);
}
