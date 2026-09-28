import type { SkeletonViewer } from './viewer';
export function installMusicTools(viewer: SkeletonViewer, report: (error: unknown) => void) {
  const panel = document.createElement('div');
  panel.className = 'music-tools';
  panel.innerHTML = `<div class="editor-actions"><label>BPM <input id="beatBpm" aria-label="Beat BPM" type="number" min="20" max="400" value="120"></label><label>Beat offset (s) <input id="beatOffset" aria-label="Beat offset" type="number" min="0" step="0.001" value="0"></label></div>
  <div class="editor-actions"><button id="addMarker">Add marker (M)</button></div><div id="cueList" class="cue-list"></div>
  <div class="editor-actions"><button id="setRangeA">Set A</button><input id="rangeA" aria-label="Loop range A" type="number" min="0" step="0.001"><button id="setRangeB">Set B</button><input id="rangeB" aria-label="Loop range B" type="number" min="0" step="0.001"></div>
  <label><input id="loopRange" type="checkbox"> Loop A–B</label><p class="hint">Set A / B at the playhead. Click markers to seek. BPM is manual; no automatic beat detection.</p>`;
  document.getElementById('musicContent')!.append(panel);
  const input = (id: string) => panel.querySelector<HTMLInputElement>(`#${id}`)!;
  const button = (id: string) => panel.querySelector<HTMLButtonElement>(`#${id}`)!;
  const changed = () => viewer.onChange?.();
  const add = () => {
    const music = viewer.music;
    if (!music.loaded || music.markers.length >= 1000) return;
    music.markers.push({ time: music.time, label: `Marker ${music.markers.length + 1}` });
    changed();
  };
  button('addMarker').onclick = add;
  window.addEventListener('keydown', (event) => {
    if (
      event.key.toLowerCase() !== 'm' ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      event.repeat ||
      document.querySelector('dialog[open]') ||
      (event.target as HTMLElement).closest('input,select,textarea,[contenteditable=true]')
    )
      return;
    event.preventDefault();
    add();
  });
  const range = () => {
    try {
      viewer.music.setRange(
        Number(input('rangeA').value),
        Number(input('rangeB').value),
        input('loopRange').checked,
      );
    } catch (error) {
      report(error);
      sync();
    }
  };
  input('rangeA').onchange = input('rangeB').onchange = input('loopRange').onchange = range;
  button('setRangeA').onclick = () => {
    input('rangeA').value = viewer.music.time.toFixed(3);
    range();
  };
  button('setRangeB').onclick = () => {
    input('rangeB').value = viewer.music.time.toFixed(3);
    range();
  };
  input('beatBpm').onchange = () => {
    if (input('beatBpm').value && input('beatBpm').validity.valid)
      viewer.music.bpm = Number(input('beatBpm').value);
    changed();
  };
  input('beatOffset').onchange = () => {
    if (input('beatOffset').value && input('beatOffset').validity.valid)
      viewer.music.beatOffset = Number(input('beatOffset').value);
    changed();
  };
  function sync() {
    const music = viewer.music;
    for (const control of panel.querySelectorAll<HTMLInputElement | HTMLButtonElement>(
      'input,button',
    ))
      control.disabled = !music.loaded;
    for (const [id, value] of [
      ['beatBpm', music.bpm],
      ['beatOffset', music.beatOffset],
      ['rangeA', music.range.start],
      ['rangeB', music.range.end],
    ] as const)
      if (document.activeElement !== input(id)) input(id).value = String(value);
    input('loopRange').checked = music.range.enabled;
    const list = panel.querySelector<HTMLElement>('#cueList')!;
    if (list.contains(document.activeElement)) return;
    list.replaceChildren(
      ...music.markers.map((marker, index) => {
        const row = document.createElement('div');
        row.className = 'cue-row';
        const name = document.createElement('input');
        name.type = 'text';
        name.value = marker.label;
        name.maxLength = 100;
        name.setAttribute('aria-label', `Marker ${index + 1} name`);
        name.onchange = () => {
          marker.label = name.value || `Marker ${index + 1}`;
          changed();
        };
        const time = document.createElement('input');
        time.type = 'number';
        time.min = '0';
        time.max = String(music.duration);
        time.step = '.001';
        time.value = marker.time.toFixed(3);
        time.setAttribute('aria-label', `Marker ${index + 1} time`);
        time.onchange = () => {
          if (time.value && time.validity.valid) marker.time = Number(time.value);
          changed();
        };
        const seek = document.createElement('button');
        seek.textContent = 'Go';
        seek.onclick = () => {
          viewer.paused = true;
          viewer.seekAll(marker.time);
        };
        const remove = document.createElement('button');
        remove.textContent = '×';
        remove.setAttribute('aria-label', `Remove marker ${index + 1}`);
        remove.onclick = () => {
          music.markers.splice(index, 1);
          remove.blur();
          changed();
        };
        row.append(name, time, seek, remove);
        return row;
      }),
    );
  }
  const previous = viewer.onChange;
  viewer.onChange = () => {
    previous?.();
    sync();
  };
  sync();
}
