import { TimelineViewport } from './timeline-viewport';
import { TRACK_COUNT } from './animation-tracks';
import type { SkeletonViewer } from './viewer';
import { $ } from './dom';
import { snapTime } from './snapping';

/** Continuous pan/zoom viewport, independent of the shared playback clock. */
export class TrackPanel {
  overview = false;
  private overviewButton = document.createElement('button');
  snap = true;
  bpm = 120;
  beatOffset = 0;
  snapBeats = false;
  markers: number[] = [];
  private startInput = document.createElement('input');
  private asset?: SkeletonViewer['asset'];
  private view = new TimelineViewport();
  private follow = true;
  private get page() {
    return this.view.start;
  }
  private set page(value: number) {
    this.view.start = value;
  }
  private get span() {
    return this.view.span;
  }
  private dragging = false;
  private lastText = 0;
  private rows = Array.from({ length: TRACK_COUNT }, (_, index) => {
    const row = document.createElement('div');
    row.className = 'track-layer';
    const selectTrack = document.createElement('button');
    selectTrack.type = 'button';
    selectTrack.className = 'track-index';
    selectTrack.textContent = `T${index}`;
    selectTrack.setAttribute('aria-label', `Edit Track ${index}`);
    selectTrack.onclick = () => this.viewer.setTrack(index);
    const animation = document.createElement('select');
    animation.setAttribute('aria-label', `Track ${index} animation`);
    animation.onchange = () => {
      if (animation.value === '__sequence__') return;
      if (animation.value) this.viewer.play(animation.value, index);
      else this.viewer.clearTrack(index);
    };
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'track-clear';
    clear.textContent = '×';
    clear.title = `Clear Track ${index}`;
    clear.setAttribute('aria-label', clear.title);
    clear.onclick = () => this.viewer.clearTrack(index);
    const loop = document.createElement('input');
    loop.type = 'checkbox';
    loop.setAttribute('aria-label', `Track ${index} Loop`);
    loop.onchange = () => this.viewer.setTrackLoop(index, loop.checked);
    const sequence = document.createElement('button');
    sequence.type = 'button';
    sequence.className = 'track-clear';
    sequence.textContent = '+';
    sequence.title = 'Edit animation sequence';
    sequence.setAttribute('aria-label', `Edit Track ${index} sequence`);
    sequence.onclick = () => this.openSequence(index);
    row.append(selectTrack, animation, sequence, clear, loop);
    const lane = document.createElement('div');
    lane.className = 'timeline-lane';
    lane.dataset.track = String(index);
    lane.setAttribute('aria-label', `Track ${index} clips`);
    return { row, selectTrack, animation, sequence, clear, loop, lane };
  });
  constructor(
    private readonly viewer: SkeletonViewer,
    private readonly openSequence: (track: number) => void,
  ) {
    const timing = document.createElement('div');
    timing.className = 'editor-actions timing-controls';
    this.overviewButton.textContent = 'Scene overview';
    this.overviewButton.onclick = () => {
      this.overview = !this.overview;
      this.sync();
    };
    timing.innerHTML =
      '<label><input id="snapTime" type="checkbox" checked> Snap</label><label><input id="snapBeats" type="checkbox"> Beats</label>';
    const label = document.createElement('label');
    label.textContent = 'Track start (s) ';
    this.startInput.type = 'number';
    this.startInput.min = '0';
    this.startInput.max = '7200';
    this.startInput.step = '0.001';
    this.startInput.setAttribute('aria-label', 'Selected track start');
    this.startInput.oninput = () => {
      if (this.startInput.value !== '' && this.startInput.validity.valid)
        viewer.setTrackStart(Number(this.startInput.value));
    };
    label.append(this.startInput);
    timing.append(label);
    timing.append(this.overviewButton);
    $('timeRuler').closest('.timeline-grid')!.before(timing);
    timing.querySelector<HTMLInputElement>('#snapTime')!.onchange = (e) => {
      this.snap = (e.target as HTMLInputElement).checked;
    };
    timing.querySelector<HTMLInputElement>('#snapBeats')!.onchange = (e) => {
      this.snapBeats = (e.target as HTMLInputElement).checked;
    };
    $('tracks').replaceChildren($('musicLabel'), ...this.rows.map((row) => row.row));
    $('musicLane').after(...this.rows.map((row) => row.lane));
    $('timelineLanes').ondblclick = (event) => {
      // Pointer capture for panning can retarget clicks to the lane container.
      const lane =
        (event.target as Element).closest<HTMLElement>('[data-track]') ??
        this.rows.find(({ lane }) => {
          const rect = lane.getBoundingClientRect();
          return event.clientY >= rect.top && event.clientY < rect.bottom;
        })?.lane;
      if (lane) this.openSequence(Number(lane.dataset.track));
    };
    const updateView = () => {
      this.render();
      this.tick(true);
    };
    const zoom = (factor: number, anchor = 0.5) => {
      this.follow = false;
      this.view.zoom(factor, anchor);
      updateView();
    };
    const pan = (seconds: number) => {
      this.follow = false;
      this.view.pan(seconds);
      updateView();
    };
    $('zoomTimeIn').onclick = () => zoom(0.8);
    $('zoomTimeOut').onclick = () => zoom(1.25);
    $('previousTime').onclick = () => pan(-this.span / 4);
    $('nextTime').onclick = () => pan(this.span / 4);
    $('followTime').onclick = () => {
      this.follow = !this.follow;
      if (this.follow) this.view.reveal(viewer.timelineTime);
      updateView();
    };
    $('fitTime').onclick = () => this.fit();
    for (const surface of [$('timeRuler'), $('timelineLanes'), $('musicLane')]) {
      let gesture:
        | {
            mode: 'pan' | 'seek' | 'clip';
            x: number;
            start: number;
            width: number;
            track?: number;
            offset?: number;
            clipStart?: number;
          }
        | undefined;
      const seek = (event: PointerEvent) => {
        const rect = surface.getBoundingClientRect();
        const fraction = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
        viewer.seekAll(this.page + fraction * this.span);
      };
      surface.addEventListener(
        'wheel',
        (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (this.dragging) return;
          const rect = surface.getBoundingClientRect();
          const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.width : 1;
          if (event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
            pan((((event.deltaX || event.deltaY) * unit) / rect.width) * this.span);
          } else {
            zoom(
              Math.exp(Math.max(-1, Math.min(1, event.deltaY * unit * 0.002))),
              (event.clientX - rect.left) / rect.width,
            );
          }
        },
        { passive: false },
      );
      surface.onpointerdown = (event) => {
        if (event.button !== 0 && event.button !== 1) return;
        event.preventDefault();
        event.stopPropagation();
        this.follow = false;
        this.dragging = true;
        const clip = (event.target as Element).closest<HTMLElement>('.animation-clip');
        if (clip && event.button === 0 && !event.shiftKey) {
          const track = Number(clip.parentElement!.dataset.track);
          const clipIndex = Number(clip.dataset.clip);
          const scale = viewer.trackSettings[track].speed || 1;
          const actorOffset = viewer.music.loaded ? (viewer.active?.startAt ?? 0) : 0;
          const clipStart =
            actorOffset + (viewer.animationTracks?.layout(track)[clipIndex].start ?? 0) / scale;
          gesture = {
            mode: 'clip',
            x: event.clientX,
            start: this.page,
            width: surface.clientWidth,
            track,
            offset: viewer.trackSettings[track].start ?? 0,
            clipStart,
          };
          surface.setPointerCapture(event.pointerId);
          viewer.paused = true;
          viewer.setTrack(track);
          return;
        }
        const mode =
          event.button === 1 ||
          event.shiftKey ||
          (surface === $('timelineLanes') && !(event.target as Element).closest('#playhead'))
            ? 'pan'
            : 'seek';
        gesture = { mode, x: event.clientX, start: this.page, width: surface.clientWidth };
        surface.setPointerCapture(event.pointerId);
        surface.classList.toggle('panning', mode === 'pan');
        if (mode === 'seek') {
          viewer.paused = true;
          seek(event);
        }
        $('followTime').setAttribute('aria-pressed', 'false');
      };
      surface.onpointermove = (event) => {
        if (!gesture || !surface.hasPointerCapture(event.pointerId)) return;
        if (gesture.mode === 'seek') seek(event);
        else if (gesture.mode === 'clip') {
          const proposed =
            gesture.offset! + ((event.clientX - gesture.x) / gesture.width) * this.span;
          const absolute = proposed + gesture.clipStart!;
          const targets = [viewer.timelineTime, ...this.markers];
          if (this.snapBeats)
            targets.push(
              this.beatOffset +
                (Math.round(((absolute - this.beatOffset) * this.bpm) / 60) * 60) / this.bpm,
            );
          const value = snapTime(
            absolute,
            Number($('stepFps').value),
            targets,
            (this.span / gesture.width) * 10,
            this.snap && !event.altKey,
          );
          viewer.setTrackStart(
            Math.min(7200, Math.max(0, value - gesture.clipStart!)),
            gesture.track,
          );
        } else {
          this.page = Math.max(
            0,
            gesture.start - ((event.clientX - gesture.x) / gesture.width) * this.span,
          );
          updateView();
        }
      };
      const finish = () => {
        this.dragging = false;
        gesture = undefined;
        surface.classList.remove('panning');
      };
      surface.onpointerup = surface.onpointercancel = surface.onlostpointercapture = finish;
    }
    $('timeRuler').onkeydown = (event) => {
      let time = viewer.timelineTime;
      if (!event.shiftKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
        event.preventDefault();
        this.follow = false;
        viewer.stepFrame(event.key === 'ArrowLeft' ? -1 : 1, Number($('stepFps').value));
        this.ensureVisible();
        return;
      }
      if (event.key === 'ArrowLeft') time -= 1;
      else if (event.key === 'ArrowRight') time += 1;
      else if (event.key === 'Home') time = 0;
      else if (event.key === 'End') time = this.page + this.span;
      else return;
      event.preventDefault();
      viewer.paused = true;
      this.follow = false;
      if (time < this.page || time > this.page + this.span) this.view.reveal(Math.max(0, time));
      viewer.seekAll(Math.max(0, time));
    };
    this.sync();
  }
  sync() {
    if (document.activeElement !== this.startInput)
      this.startInput.value = String(this.viewer.trackSettings[this.viewer.track]?.start ?? 0);
    this.startInput.disabled = !this.viewer.active;
    if (this.asset !== this.viewer.asset) {
      this.asset = this.viewer.asset;
      if (!this.viewer.music.loaded && !this.overview) {
        this.view = new TimelineViewport();
        this.follow = true;
      }
      for (const row of this.rows) {
        row.animation.replaceChildren(
          new Option('— No animation —', ''),
          ...(this.asset?.spineData.animations || []).map((a) => new Option(a.name, a.name)),
        );
      }
    }
    let active = 0;
    this.rows.forEach((row, index) => {
      if (this.viewer.animationTracks?.sequences[index].length) active++;
      const selected = this.viewer.track === index;
      row.row.classList.toggle('selected', selected);
      row.lane.classList.toggle('selected', selected);
      row.selectTrack.setAttribute('aria-pressed', String(selected));
      const clips = this.viewer.animationTracks?.sequences[index] ?? [];
      row.animation.querySelector('option[value="__sequence__"]')?.remove();
      if (clips.length > 1)
        row.animation.add(new Option(`Sequence (${clips.length})`, '__sequence__'));
      row.animation.value = clips.length > 1 ? '__sequence__' : clips[0]?.name || '';
      row.animation.disabled = !this.asset?.spineData.animations.length;
      row.sequence.disabled = !this.asset?.spineData.animations.length;
      row.clear.disabled = !clips.length;
      row.loop.checked = this.viewer.trackSettings[index]?.loop ?? true;
    });
    $('trackCount').textContent = `${active} active`;
    $('selectedTrack').textContent = `Track ${this.viewer.track}`;
    $('restartTracks').disabled = !active && !this.viewer.music.loaded;
    this.render();
    this.tick(true);
  }
  fit() {
    this.view.span = Math.max(
      0.1,
      Math.min(
        TimelineViewport.maxSpan,
        Math.max(
          1,
          this.viewer.music.loaded
            ? this.viewer.music.duration
            : this.overview
              ? Math.max(0, ...this.viewer.items.map((item) => item.animationTracks.duration))
              : (this.viewer.animationTracks?.duration ?? 0),
        ) * 1.05,
      ),
    );
    this.page = 0;
    this.follow = false;
    this.render();
    this.tick(true);
  }
  private renderMusic() {
    const music = this.viewer.music;
    this.bpm = music.bpm;
    this.beatOffset = music.beatOffset;
    this.markers = music.markers.map((m) => m.time);
    $('musicLane').querySelector('.music-cues')?.remove();
    $('musicLabel').textContent = music.loaded ? `Music · ${music.name}` : 'Music · No audio';
    $('musicLabel').title = music.name || 'Import audio in the Music panel';
    $('musicEmpty').hidden = music.loaded;
    $('musicWave').setAttribute('d', '');
    if (!music.loaded) return;
    const cues = document.createElement('div');
    cues.className = 'music-cues';
    const line = (time: number, label: string, kind: string) => {
      if (time < this.page || time > this.page + this.span) return;
      const el = document.createElement('button');
      el.type = 'button';
      el.className = `cue ${kind}`;
      el.style.left = `${((time - this.page) / this.span) * 100}%`;
      el.textContent = label;
      el.title = `${label} · ${time.toFixed(3)} s`;
      el.setAttribute('aria-label', `Seek ${label} at ${time.toFixed(3)} seconds`);
      el.onpointerdown = (e) => e.stopPropagation();
      el.onclick = () => {
        this.viewer.paused = true;
        this.viewer.seekAll(time);
      };
      cues.append(el);
    };
    const beat = 60 / music.bpm,
      stride = Math.max(1, Math.ceil(this.span / beat / 120));
    for (
      let i = Math.max(0, Math.ceil((this.page - music.beatOffset) / beat));
      music.beatOffset + i * beat <= this.page + this.span;
      i += stride
    ) {
      const time = music.beatOffset + i * beat;
      if (time > music.duration) break;
      line(time, '', 'beat');
    }
    music.markers.forEach((m) => line(m.time, m.label, 'marker'));
    if (music.range.enabled) {
      line(music.range.start, 'A', 'range-cue');
      line(music.range.end, 'B', 'range-cue');
      const start = Math.max(this.page, music.range.start),
        end = Math.min(this.page + this.span, music.range.end);
      if (end > start) {
        const range = document.createElement('div');
        range.className = 'range-shade';
        range.style.left = `${((start - this.page) / this.span) * 100}%`;
        range.style.width = `${((end - start) / this.span) * 100}%`;
        cues.prepend(range);
      }
    }
    $('musicLane').append(cues);
    const commands: string[] = [];
    for (let x = 0; x < 1000; x += 2) {
      const start = this.page + (x / 1000) * this.span;
      const end = this.page + ((x + 2) / 1000) * this.span;
      if (start >= music.duration) break;
      const from = Math.floor((start / music.duration) * music.peaks.length);
      const to = Math.min(
        music.peaks.length,
        Math.max(from + 1, Math.ceil((end / music.duration) * music.peaks.length)),
      );
      let peak = 0;
      for (let i = from; i < to; i++) peak = Math.max(peak, music.peaks[i]);
      const height = Math.max(0.5, peak * 18);
      commands.push(`M${x} ${20 - height}V${20 + height}`);
    }
    $('musicWave').setAttribute('d', commands.join(''));
  }
  ensureVisible() {
    if (this.viewer.timelineTime < this.page || this.viewer.timelineTime > this.page + this.span)
      this.reveal();
  }
  reveal() {
    this.view.reveal(this.viewer.timelineTime);
    this.render();
    this.tick(true);
  }
  private render() {
    this.overviewButton.setAttribute('aria-pressed', String(this.overview));
    this.overviewButton.textContent = this.overview ? 'Selected tracks' : 'Scene overview';
    this.renderOverview();
    this.renderMusic();
    $('timeScale').textContent = `${this.span.toFixed(this.span < 1 ? 2 : 1)} s`;
    $('followTime').setAttribute('aria-pressed', String(this.follow));
    $('zoomTimeIn').disabled = this.span <= TimelineViewport.minSpan;
    $('zoomTimeOut').disabled = this.span >= TimelineViewport.maxSpan;
    $('previousTime').disabled = this.page === 0;
    const ruler = $('timeRuler');
    ruler.replaceChildren(
      ...Array.from({ length: 11 }, (_, index) => {
        const tick = document.createElement('span');
        tick.style.left = `${index * 10}%`;
        tick.textContent = `${(this.page + (index * this.span) / 10).toFixed(this.span < 1 ? 3 : this.span < 10 ? 2 : 1)}s`;
        return tick;
      }),
    );
    ruler.dataset.start = String(this.page);
    ruler.dataset.span = String(this.span);
    ruler.setAttribute('aria-valuemin', '0');
    ruler.setAttribute(
      'aria-valuemax',
      String(Math.max(this.viewer.timelineTime, this.page + this.span)),
    );
    this.rows.forEach((row, index) => {
      row.row.hidden = row.lane.hidden = this.overview;
      row.lane.replaceChildren();
      row.lane.removeAttribute('title');
      const schedule = this.viewer.animationTracks?.layout(index) ?? [];
      if (!schedule.length) return;
      const speed = this.viewer.trackSettings[index].speed;
      const scale = speed > 0 ? speed : 1;
      schedule.forEach((clip, clipIndex) => {
        const offset =
          (this.viewer.music.loaded ? (this.viewer.active?.startAt ?? 0) : 0) +
          (this.viewer.trackSettings[index].start ?? 0);
        const start = offset + clip.start / scale;
        const end = offset + clip.end / scale;
        if (end < this.page || start > this.page + this.span) return;
        const label = `${clip.name} · ${clip.duration.toFixed(2)}s${this.viewer.trackSettings[index].loop && clipIndex === schedule.length - 1 ? ' · ↻ Loop' : ''}`;
        const block = document.createElement('span');
        block.className = 'animation-clip';
        block.dataset.clip = String(clipIndex);
        block.title = `${label} · Mix in ${clip.mixIn.toFixed(2)}s · Drag to move the track sequence. Alt: disable snapping.`;
        const name = document.createElement('span');
        name.className = 'clip-label';
        name.textContent = label;
        block.append(name);
        block.classList.toggle('alternate', clipIndex % 2 === 1);
        const visibleStart = Math.max(start, this.page);
        block.style.left = `${((visibleStart - this.page) / this.span) * 100}%`;
        block.style.width = `${Math.max(0, ((Math.min(end, this.page + this.span) - visibleStart) / this.span) * 100)}%`;
        if (clip.duration === 0) block.classList.add('pose-clip');
        row.lane.append(block);
        if (clip.mixIn > 0) {
          const mixEnd = Math.min(
            offset + (clip.start + clip.mixIn) / scale,
            this.page + this.span,
          );
          if (mixEnd > visibleStart) {
            const mix = document.createElement('span');
            mix.className = 'mix-region';
            mix.setAttribute('aria-label', `Mix in ${clip.mixIn.toFixed(2)} seconds`);
            mix.title = `${clip.name}: Mix in ${clip.mixIn.toFixed(2)}s`;
            mix.style.left = `${((visibleStart - this.page) / this.span) * 100}%`;
            mix.style.width = `${((mixEnd - visibleStart) / this.span) * 100}%`;
            row.lane.append(mix);
          }
        }
      });
    });
  }
  private renderOverview() {
    document.querySelectorAll('.overview-label,.overview-lane').forEach((el) => el.remove());
    const height = this.overview ? Math.max(192, this.viewer.items.length * 44) : 192;
    const grid = $('tracks').closest<HTMLElement>('.timeline-grid')!;
    grid.style.gridTemplateRows = `25px ${40 + height}px`;
    if (!this.overview) return;
    this.viewer.items.forEach((item, index) => {
      const select = () => {
        this.viewer.selectItem(item.id);
        this.overview = false;
        this.sync();
      };
      const label = document.createElement('button');
      label.className = 'overview-label';
      label.textContent = `${String(index + 1).padStart(2, '0')} · ${item.name}${item.locked ? ' · Locked' : ''}${!item.model.visible ? ' · Hidden' : ''}`;
      label.title = item.name;
      label.setAttribute('aria-label', `Edit timeline for ${item.name} (${index + 1})`);
      label.setAttribute('aria-pressed', String(this.viewer.active === item));
      label.onclick = select;
      $('tracks').append(label);
      const lane = document.createElement('div');
      lane.className = 'overview-lane';
      lane.dataset.actor = String(item.id);
      const offset = this.viewer.music.loaded ? item.startAt : 0;
      item.animationTracks.sequences.forEach((_clips, track) => {
        const settings = item.animationTracks.settings[track];
        item.animationTracks.layout(track).forEach((clip) => {
          const start = offset + (settings.start ?? 0) + clip.start / (settings.speed || 1);
          const end = offset + (settings.start ?? 0) + clip.end / (settings.speed || 1);
          if (end < this.page || start > this.page + this.span) return;
          const block = document.createElement('button');
          block.className = 'overview-clip';
          const visible = Math.max(start, this.page);
          block.style.cssText = `left:${((visible - this.page) / this.span) * 100}%;width:${Math.max(0.3, ((Math.min(end, this.page + this.span) - visible) / this.span) * 100)}%;top:${3 + track * 6}px;background:hsl(${160 + track * 24} 45% 45%)`;
          block.title = `${item.name} · T${track} · ${clip.name} · ${start.toFixed(3)}–${end.toFixed(3)} s`;
          block.setAttribute('aria-label', block.title);
          block.onpointerdown = (e) => e.stopPropagation();
          block.onclick = select;
          lane.append(block);
        });
      });
      const cursor = document.createElement('span');
      cursor.className = 'overview-cursor';
      lane.append(cursor);
      $('timelineLanes').append(lane);
    });
  }
  tick(force = false) {
    const time = this.viewer.timelineTime;
    if (
      this.follow &&
      !this.dragging &&
      !this.viewer.paused &&
      (time < this.page || time >= this.page + this.span)
    ) {
      this.view.reveal(time);
      this.render();
    }
    const relative = (time - this.page) / this.span;
    if (this.overview)
      for (const lane of $('timelineLanes').querySelectorAll<HTMLElement>('.overview-lane')) {
        const item = this.viewer.items.find((i) => i.id === Number(lane.dataset.actor));
        const local = this.viewer.music.loaded ? time : (item?.timelineTime ?? 0);
        const cursor = lane.querySelector<HTMLElement>('.overview-cursor')!;
        cursor.hidden = local < this.page || local > this.page + this.span;
        cursor.style.left = `${((local - this.page) / this.span) * 100}%`;
      }
    $('playhead').hidden = relative < 0 || relative > 1;
    if (this.overview && !this.viewer.music.loaded) $('playhead').hidden = true;
    $('playhead').style.left = `${Math.max(0, Math.min(100, relative * 100))}%`;
    const now = performance.now();
    if (force || now - this.lastText > 80) {
      this.lastText = now;
      $('currentTime').textContent = `${time.toFixed(3)} s`;
      $('frameCounter').textContent = `F ${Math.round(time * Number($('stepFps').value))}`;
      const hasAnimation =
        this.viewer.music.loaded ||
        !!this.viewer.animationTracks?.sequences.some((clips) => clips.length);
      $('previousFrame').disabled = !hasAnimation;
      $('nextFrame').disabled = !hasAnimation;
      $('activeAnimation').textContent =
        `T${this.viewer.track} · ${this.viewer.current()?.animation.name || 'Empty'}`;
      $('timeRuler').setAttribute('aria-valuenow', String(time));
      $('timeRuler').setAttribute('aria-valuetext', `${time.toFixed(2)} seconds`);
    }
  }
}
