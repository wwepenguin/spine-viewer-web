/** Local decoded audio. The audio device clock is the stage's master clock. */
export function animationTime(musicTime: number, start: number, duration: number, loop: boolean) {
  const elapsed = Math.max(0, musicTime - start);
  if (duration <= 0) return 0;
  return loop ? elapsed % duration : Math.min(elapsed, duration);
}

export function waveformPeaks(channels: readonly Float32Array[], bins = 4096) {
  const length = channels[0]?.length ?? 0;
  const count = Math.min(bins, length);
  const peaks = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const start = Math.floor((i * length) / count),
      end = Math.floor(((i + 1) * length) / count);
    for (const channel of channels)
      for (let j = start; j < end; j++) peaks[i] = Math.max(peaks[i], Math.abs(channel[j]));
  }
  return peaks;
}

export class MusicTransport {
  private context?: AudioContext;
  private gain?: GainNode;
  private source?: AudioBufferSourceNode;
  private buffer?: AudioBuffer;
  private offset = 0;
  private startedAt = 0;
  private playing = false;
  private playbackRate = 1;
  private ticket = 0;
  private loadTicket = 0;
  private repeating = false;
  name = '';
  file?: File;
  peaks = new Float32Array();
  volume = 0.8;
  muted = false;
  markers: { time: number; label: string }[] = [];
  bpm = 120;
  beatOffset = 0;
  range = { start: 0, end: 0, enabled: false };
  setRange(start: number, end: number, enabled: boolean) {
    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      start < 0 ||
      end > this.duration ||
      end - start < 0.001
    )
      throw Error('Loop range requires 0 ≤ A < B ≤ audio duration.');
    const resume = this.playing;
    this.pause(false);
    this.range = { start, end, enabled };
    if (resume) void this.play();
    else this.onChange?.();
  }
  onChange?: () => void;
  onError?: (error: unknown) => void;
  constructor(private readonly createContext: () => AudioContext = () => new AudioContext()) {}
  get loaded() {
    return !!this.buffer;
  }
  get duration() {
    return this.buffer?.duration ?? 0;
  }
  get paused() {
    return !this.playing;
  }
  get rate() {
    return this.playbackRate;
  }
  get loop() {
    return this.repeating;
  }
  set loop(value: boolean) {
    const time = this.time;
    this.offset = time;
    this.startedAt = this.context?.currentTime ?? 0;
    this.repeating = value;
    if (this.source) this.source.loop = value || this.range.enabled;
    this.onChange?.();
  }
  get time() {
    const time =
      this.offset +
      (this.source && this.context
        ? (this.context.currentTime - this.startedAt) * this.playbackRate
        : 0);
    if (this.range.enabled && this.playing && time >= this.range.end)
      return this.range.start + ((time - this.range.start) % (this.range.end - this.range.start));
    return this.repeating && !this.range.enabled && this.duration && this.playing
      ? time % this.duration
      : Math.min(time, this.duration);
  }
  async load(file: File) {
    const ticket = ++this.loadTicket;
    const context = (this.context ??= this.createContext());
    const buffer = await context.decodeAudioData(await file.arrayBuffer());
    if (ticket !== this.loadTicket) return false;
    if (!Number.isFinite(buffer.duration) || buffer.duration <= 0)
      throw Error('The audio file is empty.');
    const peaks = waveformPeaks(
      Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i)),
      Math.min(1000000, Math.ceil(buffer.duration * 200)),
    );
    this.pause(false);
    this.buffer = buffer;
    this.peaks = peaks;
    this.name = file.name;
    this.file = file;
    this.offset = 0;
    this.range = { start: 0, end: buffer.duration, enabled: false };
    this.markers = [];
    this.onChange?.();
    return true;
  }
  cancelLoad() {
    ++this.loadTicket;
  }
  private stopSource() {
    ++this.ticket;
    if (this.source) {
      this.source.onended = null;
      this.source.stop();
      this.source.disconnect();
      this.source = undefined;
    }
  }
  async play() {
    if (!this.buffer || this.playing) return;
    if (this.offset >= this.duration) this.offset = 0;
    if (this.range.enabled && (this.offset < this.range.start || this.offset >= this.range.end))
      this.offset = this.range.start;
    const ticket = ++this.ticket;
    this.playing = true;
    this.onChange?.();
    try {
      const context = this.context!;
      await context.resume();
      if (ticket !== this.ticket || !this.playing || !this.buffer) return;
      this.gain ??= context.createGain();
      this.gain.disconnect();
      this.gain.connect(context.destination);
      this.setVolume(this.volume, this.muted);
      const source = context.createBufferSource();
      source.buffer = this.buffer;
      source.playbackRate.value = this.playbackRate;
      source.loop = this.repeating || this.range.enabled;
      source.loopStart = this.range.enabled ? this.range.start : 0;
      source.loopEnd = this.range.enabled ? this.range.end : this.duration;
      source.connect(this.gain);
      this.source = source;
      this.startedAt = context.currentTime;
      source.onended = () => {
        if (this.source !== source) return;
        source.disconnect();
        this.source = undefined;
        this.offset = this.duration;
        this.playing = false;
        this.onChange?.();
      };
      source.start(0, this.offset);
    } catch (error) {
      if (ticket === this.ticket) {
        this.stopSource();
        this.playing = false;
        this.onChange?.();
        this.onError?.(error);
      }
    }
  }
  pause(notify = true) {
    this.offset = this.time;
    this.playing = false;
    this.stopSource();
    if (notify) this.onChange?.();
  }
  seek(time: number) {
    if (!Number.isFinite(time)) return;
    const resume = this.playing;
    this.pause(false);
    this.offset = Math.max(0, Math.min(this.duration, time));
    // Seeking to the end holds the last pose, even with Loop enabled.
    if (resume && this.offset < this.duration) void this.play();
    else this.onChange?.();
  }
  setRate(rate: number) {
    if (!Number.isFinite(rate) || rate <= 0 || rate > 3) return;
    const resume = this.playing;
    this.pause(false);
    this.playbackRate = rate;
    if (resume) void this.play();
    else this.onChange?.();
  }
  setVolume(volume: number, muted = this.muted) {
    this.volume = Math.max(0, Math.min(1, volume));
    this.muted = muted;
    if (this.gain) this.gain.gain.value = muted ? 0 : this.volume;
  }
  clear() {
    ++this.loadTicket;
    this.pause(false);
    this.buffer = undefined;
    this.peaks = new Float32Array();
    this.name = '';
    this.file = undefined;
    this.markers = [];
    this.range = { start: 0, end: 0, enabled: false };
    this.offset = 0;
    this.onChange?.();
  }
  dispose() {
    this.onChange = undefined;
    this.clear();
    void this.context?.close();
  }
}
