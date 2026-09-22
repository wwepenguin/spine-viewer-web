import { $ } from './dom';
import type { SkeletonViewer } from './viewer';
import type { AnimationClip } from './animation-tracks';

export class SequenceEditor {
  private track = 0;
  constructor(private readonly viewer: SkeletonViewer) {
    $('closeSequence').onclick = () => $('sequenceDialog').close();
    $('addSequenceClip').onclick = () => {
      const name = $('sequenceAnimation').value;
      if (name)
        this.change([...this.clips, { name, mixIn: this.clips.length ? this.viewer.mix : 0 }]);
    };
  }
  private get clips() {
    return this.viewer.animationTracks?.sequences[this.track] ?? [];
  }
  private change(clips: AnimationClip[]) {
    this.viewer.setSequence(clips, this.track);
  }
  open(track: number) {
    this.track = track;
    this.viewer.setTrack(track);
    $('sequenceDialog').showModal();
    this.sync();
  }
  sync() {
    if (!$('sequenceDialog').open) return;
    $('sequenceTitle').textContent = `Track ${this.track} sequence`;
    const animations = this.viewer.asset?.spineData.animations ?? [];
    const previous = $('sequenceAnimation').value;
    $('sequenceAnimation').replaceChildren(...animations.map((a) => new Option(a.name, a.name)));
    if (animations.some((a) => a.name === previous)) $('sequenceAnimation').value = previous;
    $('addSequenceClip').disabled = !animations.length || this.clips.length >= 64;
    const schedule = this.viewer.animationTracks?.layout(this.track) ?? [];
    const speed = this.viewer.trackSettings[this.track]?.speed ?? 1;
    const length = schedule.at(-1)?.end ?? 0;
    $('sequenceInfo').textContent =
      `${this.clips.length} clips · ${speed > 0 ? (length / speed).toFixed(2) + ' s' : 'Frozen'} · ${speed}× speed`;
    if (
      document.activeElement instanceof HTMLInputElement &&
      $('sequenceList').contains(document.activeElement)
    )
      return;
    $('sequenceList').replaceChildren(
      ...this.clips.map((clip, index) => {
        const row = document.createElement('div');
        row.className = 'sequence-row';
        const number = document.createElement('span');
        number.textContent = String(index + 1).padStart(2, '0');
        const select = document.createElement('select');
        select.setAttribute('aria-label', `Clip ${index + 1} animation`);
        select.replaceChildren(...animations.map((a) => new Option(a.name, a.name)));
        select.value = clip.name;
        select.onchange = () =>
          this.change(
            this.clips.map((item, i) => (i === index ? { ...item, name: select.value } : item)),
          );
        const mix = document.createElement('input');
        mix.type = 'number';
        mix.min = '0';
        mix.max = '4';
        mix.step = '0.01';
        mix.value = String(clip.mixIn);
        mix.disabled = index === 0;
        mix.setAttribute('aria-label', `Clip ${index + 1} Mix in`);
        mix.oninput = () => {
          if (mix.value === '' || !Number.isFinite(Number(mix.value))) return;
          this.change(
            this.clips.map((item, i) =>
              i === index ? { ...item, mixIn: Math.max(0, Math.min(4, Number(mix.value))) } : item,
            ),
          );
        };
        mix.onblur = () => {
          mix.value = String(this.clips[index]?.mixIn ?? 0);
        };
        const buttons = (label: string, text: string, action: () => void, disabled = false) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.textContent = text;
          button.setAttribute('aria-label', `${label} clip ${index + 1}`);
          button.title = label;
          button.disabled = disabled;
          button.onclick = action;
          return button;
        };
        const move = (offset: number) => {
          const next = [...this.clips];
          [next[index], next[index + offset]] = [next[index + offset], next[index]];
          this.change(next);
        };
        row.append(
          number,
          select,
          mix,
          buttons('Move up', '↑', () => move(-1), index === 0),
          buttons('Move down', '↓', () => move(1), index === this.clips.length - 1),
          buttons('Remove', '×', () => this.change(this.clips.filter((_item, i) => i !== index))),
        );
        return row;
      }),
    );
  }
}
