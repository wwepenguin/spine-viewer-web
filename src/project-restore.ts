import { load } from './assets';
import { MusicTransport } from './music';
import type { SkeletonViewer, SceneItem } from './viewer';
import type { SkeletonAsset, AssetCatalog } from './types';
import type { ActorState, ProjectSnapshot } from './project';

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
    }
  } catch (error) {
    assets.forEach((a) => a.asset.dispose());
    music.dispose();
    throw error;
  }
  // Prepare every model before setScene disposes the old scene.
  const oldMusic = viewer.music;
  viewer.music = music;
  try {
    viewer.setScene(assets, (items) =>
      items.forEach((i, n) => applyActor(i, snapshot.actors[n].state)),
    );
  } catch (error) {
    viewer.music = oldMusic;
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
