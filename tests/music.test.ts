import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MusicTransport, animationTime, waveformPeaks } from '../src/music';

const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
function fixture() {
  const sources: {
    stopped: boolean;
    onended: (() => void) | null;
    loop: boolean;
    playbackRate: { value: number };
    start: () => void;
    stop: () => void;
    disconnect: () => void;
    connect: () => void;
  }[] = [];
  const gain = { gain: { value: 1 }, disconnect() {}, connect() {} };
  const context = {
    currentTime: 0,
    resume: async () => {},
    decodeAudioData: async (_raw: ArrayBuffer) => ({
      duration: 12,
      numberOfChannels: 1,
      getChannelData: () => new Float32Array([0, 1, 0, -1]),
    }),
    createGain: () => gain,
    createBufferSource() {
      const source = {
        stopped: false,
        onended: null as (() => void) | null,
        loop: false,
        playbackRate: { value: 1 },
        start() {},
        stop() {
          this.stopped = true;
        },
        disconnect() {},
        connect() {},
      };
      sources.push(source);
      return source;
    },
  };
  return {
    music: new MusicTransport(() => context as unknown as AudioContext),
    context,
    sources,
    gain,
  };
}
const file = () => new File(['test'], 'beat.wav');

test('music uses the audio clock across pauses, seeks and rate changes', async () => {
  const { music, context, sources } = fixture();
  await music.load(file());
  await music.play();
  context.currentTime = 2;
  close(music.time, 2);
  music.pause();
  context.currentTime = 100;
  close(music.time, 2);
  music.seek(4);
  await music.play();
  context.currentTime = 101;
  close(music.time, 5);
  music.setRate(2);
  await Promise.resolve();
  context.currentTime = 102;
  close(music.time, 7);
  assert.ok(sources[0].stopped);
  music.pause();
  music.seek(999);
  close(music.time, 12);
  assert.equal(music.paused, true);
});
test('looping wraps music time and natural completion stops at the end', async () => {
  const { music, context, sources } = fixture();
  await music.load(file());
  music.loop = true;
  await music.play();
  context.currentTime = 25;
  close(music.time, 1);
  music.loop = false;
  context.currentTime = 26;
  close(music.time, 2);
  sources.at(-1)!.onended!();
  close(music.time, 12);
  assert.ok(music.paused);
  await music.play();
  close(music.time, 0);
});
test('pause cancels pending resume and removal cancels pending decode', async () => {
  const { music, context, sources } = fixture();
  await music.load(file());
  let resume!: () => void;
  context.resume = () =>
    new Promise<void>((resolve) => {
      resume = resolve;
    });
  const play = music.play();
  music.pause();
  resume();
  await play;
  assert.equal(sources.length, 0);
  let decode!: (buffer: {
    duration: number;
    numberOfChannels: number;
    getChannelData: () => Float32Array<ArrayBuffer>;
  }) => void;
  context.decodeAudioData = () =>
    new Promise((resolve) => {
      decode = resolve;
    });
  const loading = music.load(file());
  await new Promise((resolve) => setImmediate(resolve));
  music.clear();
  decode({ duration: 12, numberOfChannels: 1, getChannelData: () => new Float32Array(4) });
  assert.equal(await loading, false);
  assert.equal(music.loaded, false);
});
test('failed replacement retains the current audio and gain supports mute', async () => {
  const { music, context, gain } = fixture();
  await music.load(file());
  await music.play();
  music.setVolume(0.3, true);
  assert.equal(gain.gain.value, 0);
  music.setVolume(0.3, false);
  assert.equal(gain.gain.value, 0.3);
  context.decodeAudioData = async () => {
    throw Error('bad audio');
  };
  await assert.rejects(music.load(file()), /bad audio/);
  assert.equal(music.name, 'beat.wav');
  assert.equal(music.loaded, true);
});
test('different skeleton offsets hold, loop or clamp against the same music time', () => {
  close(animationTime(1, 2, 1, true), 0);
  close(animationTime(2, 2, 1, true), 0);
  close(animationTime(2.4, 2, 1, true), 0.4);
  close(animationTime(2.4, 0, 1, true), 0.4);
  close(animationTime(20, 2, 1, false), 1);
  close(animationTime(20, 2, 0, true), 0);
  close(animationTime(0.2, 2, 1, true), 0);
});
test('waveform retains transients from every channel, including the final sample', () => {
  const peaks = waveformPeaks(
    [new Float32Array([0, 0, 0, 0, 0]), new Float32Array([0, -0.8, 0, 0, 1])],
    2,
  );
  assert.ok(Math.abs(peaks[0] - 0.8) < 1e-6);
  assert.equal(peaks[1], 1);
  assert.equal(waveformPeaks([]).length, 0);
});
