import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import type { SkeletonViewer } from './viewer';
import type { SkeletonAsset } from './types';
import type { AnimationClip, TrackSettings } from './animation-tracks';
import { MAX_CLIP_DURATION } from './animation-tracks';

export interface ActorState {
  selectedSlot?: string | null;
  locked?: boolean;
  name: string;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  visible: boolean;
  flipX: number;
  flipY: number;
  skin: string;
  startAt: number;
  speed: number;
  mix: number;
  track: number;
  time: number;
  sequences: AnimationClip[][];
  settings: TrackSettings[];
}
export interface ProjectSnapshot {
  actors: { source: SkeletonAsset['source']; state: ActorState }[];
  selected: number;
  audio?: File;
  music: {
    time: number;
    rate: number;
    loop: boolean;
    volume: number;
    muted: boolean;
    markers?: { time: number; label: string }[];
    bpm?: number;
    beatOffset?: number;
    range?: { start: number; end: number; enabled: boolean };
  };
}
export function captureProject(viewer: SkeletonViewer): ProjectSnapshot {
  return {
    actors: viewer.items.map((i) => ({
      source: { ...i.asset.source, entries: [...i.asset.source.entries] },
      state: {
        selectedSlot: i.selectedSlot,
        locked: i.locked,
        name: i.name,
        x: i.model.x,
        y: i.model.y,
        scale: i.model.scale.x,
        rotation: i.model.rotation,
        visible: i.model.visible,
        flipX: i.model.skeleton.scaleX,
        flipY: i.model.skeleton.scaleY,
        skin: i.model.skeleton.skin?.name ?? '',
        startAt: i.startAt,
        speed: i.speed,
        mix: i.mix,
        track: i.track,
        time: i.timelineTime,
        sequences: structuredClone(i.animationTracks.sequences),
        settings: structuredClone(i.animationTracks.settings),
      },
    })),
    selected: viewer.items.indexOf(viewer.active!),
    audio: viewer.music.file,
    music: {
      time: viewer.music.time,
      rate: viewer.music.rate,
      loop: viewer.music.loop,
      volume: viewer.music.volume,
      muted: viewer.music.muted,
      markers: structuredClone(viewer.music.markers),
      bpm: viewer.music.bpm,
      beatOffset: viewer.music.beatOffset,
      range: { ...viewer.music.range },
    },
  };
}
const finite = (value: unknown, min = -1e7, max = 1e7): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max)
    throw Error('Project contains an invalid number.');
  return value;
};
const string = (value: unknown): string => {
  if (typeof value !== 'string' || value.length > 10000) throw Error('Invalid project text.');
  return value;
};
const bool = (value: unknown): boolean => {
  if (typeof value !== 'boolean') throw Error('Invalid project option.');
  return value;
};
function actorState(value: ActorState): ActorState {
  if (
    !value ||
    !Array.isArray(value.sequences) ||
    value.sequences.length !== 6 ||
    !Array.isArray(value.settings) ||
    value.settings.length !== 6
  )
    throw Error('Invalid animation tracks.');
  return {
    name: string(value.name),
    ...(value.selectedSlot !== undefined
      ? { selectedSlot: value.selectedSlot === null ? null : string(value.selectedSlot) }
      : {}),
    ...(value.locked !== undefined ? { locked: bool(value.locked) } : {}),
    x: finite(value.x),
    y: finite(value.y),
    scale: finite(value.scale, 0.01, 100),
    rotation: finite(value.rotation),
    visible: bool(value.visible),
    flipX: finite(value.flipX, -1, 1),
    flipY: finite(value.flipY, -1, 1),
    skin: string(value.skin),
    startAt: finite(value.startAt, 0),
    speed: finite(value.speed, 0, 3),
    mix: finite(value.mix, 0, 4),
    track: Math.floor(finite(value.track, 0, 5)),
    time: finite(value.time, 0),
    sequences: value.sequences.map((clips) => {
      if (!Array.isArray(clips) || clips.length > 64) throw Error('Invalid clip count.');
      return clips.map((c) => ({
        name: string(c.name),
        mixIn: finite(c.mixIn, 0, 4),
        ...(c.duration !== undefined ? { duration: finite(c.duration, 0, MAX_CLIP_DURATION) } : {}),
      }));
    }),
    settings: value.settings.map((s) => ({
      ...(s.start !== undefined ? { start: finite(s.start, 0, 7200) } : {}),
      alpha: finite(s.alpha, 0, 1),
      speed: finite(s.speed, 0, 3),
      additive: bool(s.additive),
      loop: bool(s.loop),
    })),
  };
}
export async function encodeProject(snapshot: ProjectSnapshot) {
  if (snapshot.actors.length > 128) throw Error('Projects support up to 128 skeletons.');
  let total = 0;
  const files: Record<string, Uint8Array> = {};
  const ids = new Map<File, string>();
  const put = async (file: File) => {
    let id = ids.get(file);
    if (!id) {
      total += file.size;
      if (total > 511 * 1024 * 1024) throw Error('Project assets exceed 511 MB.');
      id = `assets/${ids.size}`;
      ids.set(file, id);
      files[id] = new Uint8Array(await file.arrayBuffer());
    }
    return { id, name: file.name, type: file.type };
  };
  const actors = [];
  for (const actor of snapshot.actors) {
    if (actor.source.entries.length > 1000) throw Error('Too many files for one skeleton.');
    const entries = [];
    for (const entry of actor.source.entries)
      entries.push({ path: entry.path, ...(await put(entry.file)) });
    actors.push({ state: actor.state, source: { ...actor.source, entries } });
  }
  const manifest = {
    version: 1,
    actors,
    selected: snapshot.selected,
    music: snapshot.music,
    audio: snapshot.audio ? await put(snapshot.audio) : undefined,
  };
  files['project.json'] = strToU8(JSON.stringify(manifest));
  const bytes = zipSync(files, { level: 0 });
  if (bytes.length > 512 * 1024 * 1024) throw Error('Project exceeds 512 MB.');
  return bytes;
}
export function decodeProject(bytes: Uint8Array): ProjectSnapshot {
  if (bytes.length > 512 * 1024 * 1024) throw Error('Project exceeds 512 MB.');
  let total = 0;
  const files = unzipSync(bytes, {
    filter(entry) {
      total += entry.originalSize;
      if (total > 512 * 1024 * 1024) throw Error('Expanded project exceeds 512 MB.');
      return true;
    },
  });
  if (!files['project.json']) throw Error('This ZIP is not a Spine Viewer project.');
  const manifest = JSON.parse(strFromU8(files['project.json']));
  if (manifest.version !== 1 || !Array.isArray(manifest.actors) || manifest.actors.length > 128)
    throw Error('Unsupported project format.');
  const cache = new Map<string, File>();
  const file = (entry: { id: string; name: string; type: string }): File => {
    const id = string(entry.id),
      name = string(entry.name),
      type = string(entry.type);
    if (!Object.hasOwn(files, id) || !id.startsWith('assets/'))
      throw Error(`Missing project asset: ${name}`);
    if (!cache.has(id)) cache.set(id, new File([files[id].slice().buffer], name, { type }));
    return cache.get(id)!;
  };
  const actors = manifest.actors.map(
    (a: {
      state: ActorState;
      source: {
        entries: { path: string; id: string; name: string; type: string }[];
        skeleton: string;
        atlas: string;
        pma: boolean;
        linear: boolean;
      };
    }) => {
      if (!Array.isArray(a.source.entries) || a.source.entries.length > 1000)
        throw Error('Invalid project assets.');
      const entries = a.source.entries.map((e) => ({ path: string(e.path), file: file(e) }));
      const skeleton = string(a.source.skeleton),
        atlas = string(a.source.atlas);
      if (
        new Set(entries.map((e) => e.path)).size !== entries.length ||
        !entries.some((e) => e.path === skeleton) ||
        !entries.some((e) => e.path === atlas)
      )
        throw Error('Missing or ambiguous skeleton / atlas.');
      return {
        state: actorState(a.state),
        source: {
          entries,
          skeleton,
          atlas,
          pma: bool(a.source.pma),
          linear: bool(a.source.linear),
        },
      };
    },
  );
  const m = manifest.music;
  if (m.markers !== undefined && (!Array.isArray(m.markers) || m.markers.length > 1000))
    throw Error('Invalid markers.');
  return {
    actors,
    selected: Math.floor(finite(manifest.selected, -1, Math.max(0, actors.length - 1))),
    audio: manifest.audio ? file(manifest.audio) : undefined,
    music: {
      time: finite(m.time, 0),
      rate: finite(m.rate, 0.01, 3),
      loop: bool(m.loop),
      volume: finite(m.volume, 0, 1),
      muted: bool(m.muted),
      ...(m.markers !== undefined
        ? {
            markers: m.markers.map((marker: { time: number; label: string }) => ({
              time: finite(marker.time, 0),
              label: string(marker.label),
            })),
          }
        : {}),
      ...(m.bpm !== undefined
        ? { bpm: finite(m.bpm, 20, 400), beatOffset: finite(m.beatOffset, 0) }
        : {}),
      ...(m.range !== undefined
        ? {
            range: {
              start: finite(m.range.start, 0),
              end: finite(m.range.end, 0),
              enabled: bool(m.range.enabled),
            },
          }
        : {}),
    },
  };
}
