import { TimelineViewport } from './timeline-viewport';
import { TRACK_COUNT } from './animation-tracks';
import type { SkeletonViewer } from './viewer';
import { $ } from './dom';

/** Continuous pan/zoom viewport, independent of the shared playback clock. */
export class TrackPanel {
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
    row.append(selectTrack, animation, clear, loop);
    const lane = document.createElement('div');
    lane.className = 'timeline-lane';
    lane.dataset.track = String(index);
    lane.setAttribute('aria-label', `Track ${index} clips`);
    return { row, selectTrack, animation, clear, loop, lane };
  });
  constructor(private readonly viewer: SkeletonViewer) {
    $('tracks').replaceChildren(...this.rows.map((row) => row.row));
    $('timelineLanes').prepend(...this.rows.map((row) => row.lane));
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
    $('fitTime').onclick = () => {
      const durations =
        viewer.model?.state.tracks.map((entry) =>
          entry && entry.timeScale > 0 ? entry.animation.duration / entry.timeScale : 0,
        ) ?? [];
      this.view.span = Math.max(0.1, Math.min(300, Math.max(1, ...durations) * 1.1));
      this.page = 0;
      this.follow = false;
      updateView();
    };
    for (const surface of [$('timeRuler'), $('timelineLanes')]) {
      let gesture: { mode: 'pan' | 'seek'; x: number; start: number; width: number } | undefined;
      const seek = (event: PointerEvent) => {
        const rect = surface.getBoundingClientRect();
        const fraction = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
        viewer.seekAll(this.page + fraction * this.span);
      };
      surface.addEventListener(
        'wheel',
        (event) => {
          event.preventDefault();
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
        this.follow = false;
        this.dragging = true;
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
        this.render();
      };
      surface.onpointermove = (event) => {
        if (!gesture || !surface.hasPointerCapture(event.pointerId)) return;
        if (gesture.mode === 'seek') seek(event);
        else {
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
      if (event.key === 'ArrowLeft') time -= event.shiftKey ? 1 : 1 / 30;
      else if (event.key === 'ArrowRight') time += event.shiftKey ? 1 : 1 / 30;
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
    if (this.asset !== this.viewer.asset) {
      this.asset = this.viewer.asset;
      this.view = new TimelineViewport();
      this.follow = true;
      for (const row of this.rows) {
        row.animation.replaceChildren(
          new Option('— No animation —', ''),
          ...(this.asset?.spineData.animations || []).map((a) => new Option(a.name, a.name)),
        );
      }
    }
    let active = 0;
    this.rows.forEach((row, index) => {
      const entry = this.viewer.model?.state.getCurrent(index);
      if (entry) active++;
      const selected = this.viewer.track === index;
      row.row.classList.toggle('selected', selected);
      row.lane.classList.toggle('selected', selected);
      row.selectTrack.setAttribute('aria-pressed', String(selected));
      row.animation.value = entry?.animation.name || '';
      row.animation.disabled = !this.asset?.spineData.animations.length;
      row.clear.disabled = !entry;
      row.loop.checked = this.viewer.trackSettings[index]?.loop ?? true;
    });
    $('trackCount').textContent = `${active} active`;
    $('selectedTrack').textContent = `Track ${this.viewer.track}`;
    $('restartTracks').disabled = !active;
    this.render();
    this.tick(true);
  }
  reveal() {
    this.view.reveal(this.viewer.timelineTime);
    this.render();
    this.tick(true);
  }
  private render() {
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
      row.lane.replaceChildren();
      const entry = this.viewer.model?.state.getCurrent(index);
      row.lane.removeAttribute('title');
      if (!entry) return;
      const duration = entry.animation.duration;
      const period = entry.timeScale > 0 ? duration / entry.timeScale : 0;
      const label = `${entry.animation.name} · ${duration.toFixed(2)}s${entry.loop ? ' ↻' : ''}${entry.timeScale !== 1 ? ` · ${entry.timeScale}×` : ''}`;
      row.lane.title = label;
      const clip = (start: number, end: number, repeat = false) => {
        const block = document.createElement('span');
        block.className = `animation-clip${repeat ? ' repeated' : ''}`;
        block.textContent = label;
        block.style.left = `${Math.max(0, ((start - this.page) / this.span) * 100)}%`;
        block.style.width = `${Math.max(0, ((Math.min(end, this.page + this.span) - Math.max(start, this.page)) / this.span) * 100)}%`;
        row.lane.append(block);
      };
      if (period <= 0) {
        clip(this.page, this.page + this.span);
      } else if (entry.loop) {
        // Tiny animation cycles use a single striped bar instead of thousands of DOM nodes.
        if (this.span / period > 100) clip(this.page, this.page + this.span, true);
        else
          for (
            let cycle = Math.floor(this.page / period);
            cycle * period < this.page + this.span;
            cycle++
          ) {
            clip(cycle * period, (cycle + 1) * period, cycle > 0);
          }
      } else if (period > this.page) clip(0, period);
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
    $('playhead').hidden = relative < 0 || relative > 1;
    $('playhead').style.left = `${Math.max(0, Math.min(100, relative * 100))}%`;
    const now = performance.now();
    if (force || now - this.lastText > 80) {
      this.lastText = now;
      $('currentTime').textContent = `${time.toFixed(2)} s`;
      $('timeRuler').setAttribute('aria-valuenow', String(time));
      $('timeRuler').setAttribute('aria-valuetext', `${time.toFixed(2)} seconds`);
    }
  }
}
