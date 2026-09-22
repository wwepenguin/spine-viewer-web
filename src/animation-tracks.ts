import type { RuntimeState } from './runtime';

export const TRACK_COUNT = 6;
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
  readonly settings: TrackSettings[] = Array.from({ length: TRACK_COUNT }, () => ({
    alpha: 1,
    additive: false,
    loop: true,
    speed: 1,
  }));
  constructor(
    private readonly model: TrackModel,
    private readonly animations: readonly { name: string }[],
  ) {}
  private validate(track: number) {
    if (!Number.isInteger(track) || track < 0 || track >= TRACK_COUNT)
      throw Error('Track 必須是 0 到 5。');
  }
  play(track: number, name: string, mix: number) {
    this.validate(track);
    if (!this.animations.some((a) => a.name === name)) throw Error(`找不到動畫：${name}`);
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
    this.model.state.clearTrack(track);
    this.model.skeleton.setToSetupPose();
    this.model.update(0);
  }
  seek(track: number, time: number) {
    this.validate(track);
    if (!Number.isFinite(time) || time < 0) throw Error('Invalid animation time');
    this.rebuild((index, previous) => (index === track ? time : previous));
  }
  restartAll() {
    this.rebuild(() => 0);
  }
  seekAll(time: number) {
    if (!Number.isFinite(time) || time < 0) throw Error('Invalid animation time');
    this.rebuild((track) => time * this.settings[track].speed);
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
