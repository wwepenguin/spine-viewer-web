import type { RuntimeState } from './runtime';

export const TRACK_COUNT = 6;
export interface AnimationClip {
  name: string;
  mixIn: number;
}
export interface ScheduledClip extends AnimationClip {
  start: number;
  end: number;
  duration: number;
}
export interface TrackSettings {
  alpha: number;
  additive: boolean;
  loop: boolean;
  speed: number;
}
interface TrackModel {
  state: RuntimeState;
  skeleton: { setToSetupPose(): void };
  update(delta: number): void;
}
/** One AnimationState owns all layers. Selecting a layer never replaces the others. */
export class AnimationTracks {
  readonly sequences: AnimationClip[][] = Array.from({ length: TRACK_COUNT }, () => []);
  private cursor = 0;
  readonly settings: TrackSettings[] = Array.from({ length: TRACK_COUNT }, () => ({
    alpha: 1,
    additive: false,
    loop: true,
    speed: 1,
  }));
  constructor(
    private readonly model: TrackModel,
    private readonly animations: readonly { name: string; duration: number }[],
  ) {}
  private validate(track: number) {
    if (!Number.isInteger(track) || track < 0 || track >= TRACK_COUNT)
      throw Error('Track must be between 0 and 5.');
  }
  play(track: number, name: string, mix: number) {
    this.validate(track);
    if (!this.animations.some((a) => a.name === name)) throw Error(`Animation not found: ${name}`);
    this.sequences[track] = [{ name, mixIn: 0 }];
    this.model.state.data.defaultMix = mix;
    const settings = this.settings[track];
    const entry = this.model.state.setAnimation(track, name, settings.loop);
    entry.alpha = settings.alpha;
    entry.timeScale = settings.speed;
    entry.mixBlend = track > 0 && settings.additive ? 3 : 2;
    this.model.update(0);
    return entry;
  }
  configure(track: number, patch: Partial<TrackSettings>) {
    this.validate(track);
    if (
      patch.alpha !== undefined &&
      (!Number.isFinite(patch.alpha) || patch.alpha < 0 || patch.alpha > 1)
    )
      throw Error('Invalid track alpha');
    if (
      patch.speed !== undefined &&
      (!Number.isFinite(patch.speed) || patch.speed < 0 || patch.speed > 3)
    )
      throw Error('Invalid track speed');
    const settings = this.settings[track];
    const blendChanged = patch.additive !== undefined && patch.additive !== settings.additive;
    Object.assign(settings, patch);
    if (track === 0) settings.additive = false;
    if (this.sequences.some((clips) => clips.length > 1)) {
      this.seekAll(this.cursor);
      return;
    }
    const entry = this.model.state.getCurrent(track);
    if (!entry) return;
    entry.alpha = settings.alpha;
    entry.loop = settings.loop;
    entry.timeScale = settings.speed;
    // Spine 3.8 requires mixBlend to be set before the entry's first apply.
    if (blendChanged) this.rebuild();
    else this.model.update(0);
  }
  clear(track: number) {
    this.validate(track);
    this.sequences[track] = [];
    this.model.state.clearTrack(track);
    this.model.skeleton.setToSetupPose();
    this.model.update(0);
  }
  seek(track: number, time: number) {
    this.validate(track);
    if (!Number.isFinite(time) || time < 0) throw Error('Invalid animation time');
    this.rebuild((index, previous) => (index === track ? time : previous));
  }
  layout(track: number): ScheduledClip[] {
    let end = 0,
      available = 0;
    return this.sequences[track].map((clip, index) => {
      const duration = this.animations.find((animation) => animation.name === clip.name)!.duration;
      // Prevent three-way overlaps and keep zero-length poses valid.
      const mixIn = index ? Math.min(clip.mixIn, duration, available) : 0;
      const start = end - mixIn;
      end = start + duration;
      available = duration - mixIn;
      return { ...clip, mixIn, duration, start, end };
    });
  }
  setSequence(track: number, clips: readonly AnimationClip[]) {
    this.validate(track);
    if (clips.length > 64) throw Error('A track supports up to 64 clips.');
    for (const clip of clips) {
      if (!this.animations.some((animation) => animation.name === clip.name))
        throw Error(`Animation not found: ${clip.name}`);
      if (!Number.isFinite(clip.mixIn) || clip.mixIn < 0 || clip.mixIn > 4)
        throw Error('Mix in must be between 0 and 4 seconds.');
    }
    this.sequences[track] = clips.map((clip, index) => ({
      ...clip,
      mixIn: index ? clip.mixIn : 0,
    }));
    // Store effective durations so the editor and playback agree after reordering.
    this.sequences[track] = this.layout(track).map(({ name, mixIn }) => ({ name, mixIn }));
    this.seekAll(0);
  }
  get duration() {
    return Math.max(
      0,
      ...this.sequences.map((_clips, track) => {
        const speed = this.settings[track].speed;
        return speed > 0 ? (this.layout(track).at(-1)?.end ?? 0) / speed : 0;
      }),
    );
  }
  private startClip(track: number, clip: ScheduledClip, first = false) {
    const settings = this.settings[track];
    const entry = this.model.state.setAnimation(
      track,
      clip.name,
      this.sequences[track].length === 1 && settings.loop,
    );
    entry.mixDuration = first || settings.speed === 0 ? 0 : clip.mixIn / settings.speed;
    entry.alpha = settings.alpha;
    entry.timeScale = settings.speed;
    entry.mixBlend = track > 0 && settings.additive ? 3 : 2;
  }
  private progress(from: number, to: number, includeOrigin = false) {
    const events = this.sequences
      .flatMap((_clips, track) => {
        const speed = this.settings[track].speed;
        return speed > 0
          ? this.layout(track)
              .slice(1)
              .map((clip) => ({ track, clip, time: clip.start / speed }))
          : [];
      })
      .filter(
        (event) => (event.time > from || (includeOrigin && event.time === 0)) && event.time <= to,
      )
      .sort((a, b) => a.time - b.time || a.track - b.track);
    let current = from;
    for (const event of events) {
      this.model.update(event.time - current);
      this.startClip(event.track, event.clip);
      this.model.update(0);
      current = event.time;
    }
    this.model.update(to - current);
    this.cursor = to;
  }
  restartAll() {
    this.seekAll(0);
  }
  seekAll(time: number) {
    if (!Number.isFinite(time) || time < 0) throw Error('Invalid animation time');
    this.model.state.clearTracks();
    this.model.skeleton.setToSetupPose();
    this.sequences.forEach((_clips, track) => {
      const first = this.layout(track)[0];
      if (first) this.startClip(track, first, true);
    });
    this.model.update(0);
    this.progress(0, time, true);
  }
  advance(time: number, delta: number) {
    const duration = this.duration;
    if (!duration) return { time: 0, complete: true };
    const next = time + delta;
    if (next >= duration) {
      const loop = this.sequences.some(
        (clips, track) =>
          clips.length &&
          this.settings[track].loop &&
          this.settings[track].speed > 0 &&
          (this.layout(track).at(-1)?.end ?? 0) > 0,
      );
      const position = loop ? next % duration : duration;
      this.seekAll(position);
      return { time: position, complete: !loop };
    }
    this.progress(time, next);
    return { time: next, complete: false };
  }
  private rebuild(
    time: (track: number, previous: number) => number = (_track, previous) => previous,
  ) {
    const entries = this.model.state.tracks.map((e) =>
      e ? { name: e.animation.name, time: e.trackTime } : null,
    );
    this.model.state.clearTracks();
    this.model.skeleton.setToSetupPose();
    entries.forEach((previous, index) => {
      if (!previous) return;
      const settings = this.settings[index];
      const entry = this.model.state.setAnimation(index, previous.name, settings.loop);
      entry.mixDuration = 0;
      entry.trackTime = time(index, previous.time);
      entry.alpha = settings.alpha;
      entry.timeScale = settings.speed;
      entry.mixBlend = index > 0 && settings.additive ? 3 : 2;
    });
    this.model.update(0);
  }
}
