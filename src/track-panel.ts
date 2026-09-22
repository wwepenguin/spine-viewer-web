import { TRACK_COUNT } from './animation-tracks';
import type { SkeletonViewer } from './viewer';
import { $ } from './dom';

/** Shared clock with a paged ruler; loops remain visible without growing the DOM indefinitely. */
export class TrackPanel {
  private asset?: SkeletonViewer['asset'];
  private page = 0;
  private span = 5;
  private dragging = false;
  private lastText = 0;
  private rows = Array.from({ length: TRACK_COUNT }, (_, index) => {
    const row = document.createElement('div');
    row.className = 'track-layer';
    const selectTrack = document.createElement('button');
    selectTrack.type = 'button';
    selectTrack.className = 'track-index';
    selectTrack.textContent = `T${index}`;
    selectTrack.setAttribute('aria-label', `編輯 Track ${index}`);
    selectTrack.onclick = () => this.viewer.setTrack(index);
    const animation = document.createElement('select');
    animation.setAttribute('aria-label', `Track ${index} 動畫`);
    animation.onchange = () => {
      if (animation.value) this.viewer.play(animation.value, index);
      else this.viewer.clearTrack(index);
    };
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'track-clear';
    clear.textContent = '×';
    clear.title = `清除 Track ${index}`;
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
    lane.setAttribute('aria-label', `Track ${index} 動畫區塊`);
    return { row, selectTrack, animation, clear, loop, lane };
  });
  constructor(private readonly viewer: SkeletonViewer) {
    $('tracks').replaceChildren(...this.rows.map((row) => row.row));
    $('timelineLanes').prepend(...this.rows.map((row) => row.lane));
    $('timeWindow').onchange = () => {
      this.span = Number($('timeWindow').value);
      this.page = Math.floor(viewer.timelineTime / this.span) * this.span;
      this.render();
      this.tick(true);
    };
    const navigate = (direction: number) => {
      const nextPage = Math.max(0, this.page + direction * this.span);
      viewer.paused = true;
      viewer.onChange?.();
      this.page = nextPage;
      this.render();
      this.tick(true);
    };
    $('previousTime').onclick = () => navigate(-1);
    $('nextTime').onclick = () => navigate(1);
    for (const surface of [$('timeRuler'), $('timelineLanes')]) {
      const seek = (event: PointerEvent) => {
        const rect = surface.getBoundingClientRect();
        const fraction = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
        viewer.seekAll(this.page + fraction * this.span);
      };
      surface.onpointerdown = (event) => {
        if (event.button !== 0 || !viewer.model) return;
        viewer.paused = true;
        this.dragging = true;
        surface.setPointerCapture(event.pointerId);
        const lane = (event.target as Element).closest<HTMLElement>('[data-track]');
        if (lane) viewer.setTrack(Number(lane.dataset.track));
        seek(event);
      };
      surface.onpointermove = (event) => {
        if (this.dragging && surface.hasPointerCapture(event.pointerId)) seek(event);
      };
      surface.onpointerup = surface.onpointercancel = () => {
        this.dragging = false;
      };
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
      this.page = Math.floor(Math.max(0, time) / this.span) * this.span;
      viewer.seekAll(Math.max(0, time));
    };
    this.sync();
  }
  sync() {
    if (!this.dragging) this.page = Math.floor(this.viewer.timelineTime / this.span) * this.span;
    if (this.asset !== this.viewer.asset) {
      this.asset = this.viewer.asset;
      this.page = 0;
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
  private render() {
    $('previousTime').disabled = this.page === 0;
    const ruler = $('timeRuler');
    ruler.replaceChildren(
      ...Array.from({ length: 11 }, (_, index) => {
        const tick = document.createElement('span');
        tick.style.left = `${index * 10}%`;
        tick.textContent = `${(this.page + (index * this.span) / 10).toFixed(1)}s`;
        return tick;
      }),
    );
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
      !this.dragging &&
      !this.viewer.paused &&
      (time < this.page || time >= this.page + this.span)
    ) {
      this.page = Math.floor(time / this.span) * this.span;
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
