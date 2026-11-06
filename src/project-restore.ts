import { load } from './assets';
import { MusicTransport } from './music';
import type { SkeletonViewer, SceneItem } from './viewer';
import type { SkeletonAsset, AssetCatalog } from './types';
import type { ActorState, ProjectSnapshot } from './project';
import { prepareBoneImage, type PreparedBoneImage } from './bone-images';
import { prepareBoneNumber, type PreparedBoneNumber } from './bone-numbers';

function applyActor(item: SceneItem, state: ActorState) {
  if (state.selectedSlot && !item.model.skeleton.findSlot(state.selectedSlot))
    throw Error(`Slot not found: ${state.selectedSlot}`);
  item.selectedSlot = state.selectedSlot ?? null;
  item.locked = state.locked ?? false;
  item.model.position.set(state.x, state.y);
  item.model.scale.set(state.scale);
  item.model.rotation = state.rotation;
  item.model.visible = state.visible;
  item.model.skeleton.scaleX = state.flipX;
  item.model.skeleton.scaleY = state.flipY;
  if (state.skin) item.model.skeleton.setSkinByName(state.skin);
  item.startAt = state.startAt;
  item.speed = state.speed;
  item.mix = state.mix;
  item.track = state.track;
  item.timelineTime = state.time;
  item.paused = true;
  state.sequences.forEach((clips, index) => {
    item.animationTracks.configure(index, state.settings[index]);
    item.animationTracks.setSequence(index, clips);
  });
  item.animationTracks.seekAll(state.time);
}
export async function restoreProject(viewer: SkeletonViewer, snapshot: ProjectSnapshot) {
  const assets: { asset: SkeletonAsset; name: string }[] = [];
  const images: PreparedBoneImage[][] = [];
  const numbers: PreparedBoneNumber[][] = [];
  const music = new MusicTransport();
  try {
    if (snapshot.audio) await music.load(snapshot.audio);
    music.setRate(snapshot.music.rate);
    music.loop = snapshot.music.loop;
    music.setVolume(snapshot.music.volume, snapshot.music.muted);
    music.markers = structuredClone(snapshot.music.markers ?? []);
    music.bpm = snapshot.music.bpm ?? 120;
    music.beatOffset = snapshot.music.beatOffset ?? 0;
    const range = snapshot.music.range;
    if (range && music.loaded) music.setRange(range.start, range.end, range.enabled);
    music.seek(snapshot.music.time);
    for (const { source, state } of snapshot.actors) {
      const data: AssetCatalog = { entries: source.entries, skeletons: [], atlases: [] };
      const asset = await load(
        data,
        source.entries.find((e) => e.path === source.skeleton),
        source.entries.find((e) => e.path === source.atlas),
        source,
      );
      assets.push({ asset, name: state.name });
      const prepared: PreparedBoneImage[] = [];
      images.push(prepared);
      for (const image of state.boneImages ?? []) prepared.push(await prepareBoneImage(image));
      const preparedNumbers: PreparedBoneNumber[] = [];
      numbers.push(preparedNumbers);
      for (const number of state.boneNumbers ?? [])
        preparedNumbers.push(await prepareBoneNumber(number));
    }
  } catch (error) {
    assets.forEach((a) => a.asset.dispose());
    images.flat().forEach((image) => image.release());
    numbers.flat().forEach((number) => number.release());
    music.dispose();
    throw error;
  }
  // Prepare every model before setScene disposes the old scene.
  const oldMusic = viewer.music;
  viewer.music = music;
  try {
    viewer.setScene(assets, (items) => {
      items.forEach((i, n) => applyActor(i, snapshot.actors[n].state));
      items.forEach((item, index) =>
        images[index].forEach((image) => item.boneImages.attach(image)),
      );
      items.forEach((item, index) =>
        numbers[index].forEach((number) => item.boneNumbers.attach(number)),
      );
    });
  } catch (error) {
    viewer.music = oldMusic;
    images.flat().forEach((image) => image.release());
    numbers.flat().forEach((number) => number.release());
    music.dispose();
    throw error;
  }
  oldMusic.dispose();
  music.onError = oldMusic.onError;
  music.onChange = () => {
    if (music.loaded) viewer.syncMusic(true);
    viewer.onChange?.();
  };
  viewer.selectItem(viewer.items[snapshot.selected]?.id);
}
