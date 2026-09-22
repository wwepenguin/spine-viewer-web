/** Visible seconds, independent of playback time and track selection. */
export class TimelineViewport {
  start = 0;
  span = 5;
  static readonly minSpan = 0.1;
  static readonly maxSpan = 300;
  zoom(factor: number, anchor = 0.5) {
    if (!Number.isFinite(factor) || factor <= 0) return;
    anchor = Math.max(0, Math.min(1, anchor));
    const time = this.start + anchor * this.span;
    this.span = Math.max(
      TimelineViewport.minSpan,
      Math.min(TimelineViewport.maxSpan, this.span * factor),
    );
    this.start = Math.max(0, time - anchor * this.span);
  }
  pan(seconds: number) {
    if (Number.isFinite(seconds)) this.start = Math.max(0, this.start + seconds);
  }
  reveal(time: number) {
    this.start = Math.max(0, time - this.span * 0.2);
  }
}
