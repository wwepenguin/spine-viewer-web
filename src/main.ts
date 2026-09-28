import { installEditor } from './editor';
import { SequenceEditor } from './sequence-editor';
import { TrackPanel } from './track-panel';
import './styles.css';
import { $ } from './dom';
import * as SpineIO from './assets';
import { SkeletonViewer } from './viewer';
import { SkeletonPerformance } from './performance';
import { registerViewerTools } from './webmcp';
import type { AssetCatalog, SkeletonAsset } from './types';
(() => {
  document.querySelectorAll<HTMLButtonElement>('.section-toggle').forEach((toggle) => {
    const content = document.getElementById(toggle.getAttribute('aria-controls')!);
    if (!content) return;
    toggle.addEventListener('click', () => {
      const expanded = toggle.getAttribute('aria-expanded') !== 'true';
      toggle.setAttribute('aria-expanded', String(expanded));
      content.hidden = !expanded;
      toggle.closest('section')?.classList.toggle('collapsed', !expanded);
    });
  });
  let viewer: SkeletonViewer,
    catalog: AssetCatalog,
    controller: AbortController | undefined,
    loadingId = 0,
    toastTimer: ReturnType<typeof setTimeout>;
  function error(err: unknown) {
    $('loading').hidden = true;
    $('errorText').textContent = err instanceof Error ? err.message : String(err);
    $('errorPanel').hidden = false;
  }
  function toast(message: string) {
    $('toast').textContent = message;
    $('toast').hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => ($('toast').hidden = true), 2400);
  }
  function options<T>(select: HTMLSelectElement, items: T[], label: (item: T) => string) {
    select.replaceChildren(
      ...items.map((item, i) => {
        const o = document.createElement('option');
        o.value = String(i);
        o.textContent = label(item);
        return o;
      }),
    );
    select.disabled = !items.length;
  }
  function chooseAtlas() {
    const file = catalog.skeletons[+$('skeletonSelect').value];
    const match = SpineIO.matchAtlas(catalog, file);
    $('atlasSelect').value = match ? String(catalog.atlases.indexOf(match)) : '';
  }
  async function openCatalog(next: AssetCatalog) {
    if (!next.skeletons.length)
      throw Error('No skeleton found. Select a .json or .skel file with its .atlas and textures.');
    const id = ++loadingId;
    controller?.abort();
    const request = (controller = new AbortController());
    catalog = next;
    options($('skeletonSelect'), catalog.skeletons, (e) => e.path);
    options($('atlasSelect'), catalog.atlases, (e) => e.path);
    chooseAtlas();
    $('addToStage').disabled = true;
    $('errorPanel').hidden = true;
    $('loading').hidden = false;
    const loaded: { asset: SkeletonAsset; name: string }[] = [];
    const failures: string[] = [];
    for (const [index, file] of next.skeletons.entries()) {
      $('loading').textContent = `Loading skeleton ${index + 1} / ${next.skeletons.length}…`;
      try {
        const asset = await SpineIO.load(next, file, SpineIO.matchAtlas(next, file), {
          signal: request.signal,
          pma: $('pma').checked,
          linear: $('linear').checked,
        });
        loaded.push({ asset, name: file.path });
      } catch (err) {
        if (!request.signal.aborted)
          failures.push(`${file.path}: ${err instanceof Error ? err.message : String(err)}`);
      }
      if (id !== loadingId) {
        for (const { asset } of loaded) asset.dispose();
        return;
      }
    }
    $('loading').hidden = true;
    $('addToStage').disabled = !catalog.atlases.length;
    if (loaded.length) {
      viewer.setScene(loaded);
      toast(`Loaded ${loaded.length} skeleton${loaded.length === 1 ? '' : 's'} onto the stage`);
    }
    if (failures.length)
      error(
        new Error(
          `${loaded.length} loaded, ${failures.length} skipped. Select a skeleton and atlas in Assets, then use Add selected asset to stage to retry.\n\n${failures.join('\n\n')}`,
        ),
      );
  }
  async function addSelected() {
    const id = ++loadingId;
    controller?.abort();
    const request = (controller = new AbortController());
    const file = catalog.skeletons[+$('skeletonSelect').value];
    const atlas = catalog.atlases[+$('atlasSelect').value];
    $('loading').textContent = 'Adding skeleton…';
    $('loading').hidden = false;
    $('addToStage').disabled = true;
    try {
      const asset = await SpineIO.load(
        catalog,
        file,
        $('atlasSelect').value === '' ? null : atlas,
        {
          signal: request.signal,
          pma: $('pma').checked,
          linear: $('linear').checked,
        },
      );
      if (id !== loadingId) {
        asset.dispose();
        return;
      }
      viewer.addModel(asset, file.path);
      $('errorPanel').hidden = true;
    } finally {
      if (id === loadingId) {
        $('loading').hidden = true;
        $('addToStage').disabled = !catalog.atlases.length;
      }
    }
  }
  function renderScene() {
    $('sceneCount').textContent = String(viewer.items.length);
    $('sceneList').replaceChildren(
      ...viewer.items.map((item, index) => {
        const button = row(item.name, index);
        button.setAttribute('aria-selected', String(item === viewer.active));
        button.onclick = () => viewer.selectItem(item.id);
        return button;
      }),
    );
    for (const id of [
      'removeScene',
      'sceneX',
      'sceneY',
      'playScene',
      'pauseScene',
      'arrangeScene',
    ] as const)
      $(id).disabled = !viewer.items.length;
  }
  function selectedModelChanged() {
    if ($('sequenceDialog').open) $('sequenceDialog').close();
    const asset = viewer.asset;
    if (asset) {
      $('pma').checked = asset.source.pma;
      $('linear').checked = asset.source.linear;
    }
    $('modelName').textContent = viewer.active?.name ?? 'Empty stage';
    $('formatBadge').textContent = asset ? 'SPINE ' + asset.spineData.version : 'SPINE 3.8';
    $('skeletonInfo').textContent =
      `${viewer.items.length} skeleton${viewer.items.length === 1 ? '' : 's'} on stage`;
    $('flipX').setAttribute('aria-pressed', String((viewer.model?.skeleton.scaleX ?? 1) < 0));
    $('flipY').setAttribute('aria-pressed', String((viewer.model?.skeleton.scaleY ?? 1) < 0));
    const skins = asset?.spineData.skins ?? [];
    options($('skinSelect'), skins, (skin) => skin.name);
    $('skinCount').textContent = String(skins.length);
    $('skinSelect').value = String(
      skins.findIndex((s) => s.name === viewer.model?.skeleton.skin?.name),
    );
    $('slotSearch').value = '';
    $('speed').value = String(viewer.speed);
    $('mix').value = String(viewer.mix);
    renderScene();
    renderSlots();
    renderAnimations();
    syncControls();
  }
  function row(name: string, index: number, duration?: number) {
    const button = document.createElement('button');
    button.className = 'list-option';
    button.type = 'button';
    button.setAttribute('role', 'option');
    button.setAttribute('aria-selected', 'false');
    button.title = name;
    button.dataset.name = name;
    const number = document.createElement('span');
    number.className = 'item-index';
    number.textContent = String(index).padStart(2, '0');
    const text = document.createElement('span');
    text.className = 'item-name';
    text.textContent = name;
    button.append(number, text);
    if (duration !== undefined) {
      const span = document.createElement('span');
      span.className = 'item-duration';
      span.textContent = duration.toFixed(2) + 's';
      button.append(span);
    }
    return button;
  }
  function renderSlots() {
    const list = $('slotList'),
      search = $('slotSearch').value.toLocaleLowerCase();
    list.replaceChildren();
    const slots = viewer.model?.skeleton.slots || [];
    let count = 0;
    slots.forEach((slot, i) => {
      if (!slot.data.name.toLocaleLowerCase().includes(search)) return;
      count++;
      const button = row(slot.data.name, i);
      button.onclick = () =>
        viewer.selectSlot(viewer.selectedSlot === slot.data.name ? null : slot.data.name);
      list.append(button);
    });
    if (!count) {
      const p = document.createElement('p');
      p.className = 'empty-list';
      p.textContent = 'No matching slots';
      list.append(p);
    }
    $('slotCount').textContent = search ? `${count} / ${slots.length}` : String(slots.length);
    syncControls();
  }
  function renderAnimations() {
    const list = $('animationList');
    list.replaceChildren();
    const animations = viewer.asset?.spineData.animations || [];
    animations.forEach((animation, i) => {
      const button = row(animation.name, i, animation.duration);
      button.onclick = () => {
        viewer.play(animation.name);
        syncControls();
      };
      list.append(button);
    });
    $('animationCount').textContent = String(animations.length);
    if (!animations.length) {
      const p = document.createElement('p');
      p.className = 'empty-list';
      p.textContent = 'This skeleton has no animations';
      list.append(p);
    }
  }
  function syncControls() {
    if (!viewer) return;
    const current = viewer.current();
    const music = viewer.music;
    $('musicVolume').value = String(Math.round(music.volume * 100));
    $('musicVolumeValue').textContent = $('musicVolume').value + '%';
    $('musicMute').checked = music.muted;
    $('musicLoop').checked = music.loop;
    $('musicName').textContent = music.name || 'Choose a local MP3 or WAV file.';
    $('musicDuration').textContent = music.loaded ? `${music.duration.toFixed(2)} s` : 'No audio';
    $('musicStatus').textContent = music.loaded
      ? 'Music sync: playback and seeking control the entire stage.'
      : 'Without audio, each skeleton plays independently.';
    $('removeMusic').disabled = !music.loaded;
    $('musicStart').disabled = !music.loaded || !viewer.active;
    if (document.activeElement !== $('musicStart'))
      $('musicStart').value = String(viewer.active?.startAt ?? 0);
    $('speed').value = String(viewer.speed);
    if (document.activeElement !== $('sceneX'))
      $('sceneX').value = String(Math.round(viewer.model?.x ?? 0));
    if (document.activeElement !== $('sceneY'))
      $('sceneY').value = String(Math.round(viewer.model?.y ?? 0));
    $('activeAnimation').textContent = `T${viewer.track} · ${current?.animation.name || 'Empty'}`;
    trackPanel.sync();
    sequenceEditor.sync();
    $('playPausePath').setAttribute(
      'd',
      viewer.paused ? 'M7 3l14 9-14 9z' : 'M6 4h4v16H6zM14 4h4v16h-4z',
    );
    $('playPause').title = viewer.paused ? 'Play' : 'Pause';
    $('playPause').setAttribute('aria-label', viewer.paused ? 'Play' : 'Pause');
    $('copySlot').disabled = !viewer.selectedSlot;
    $('slotDetailText').textContent = viewer.selectedSlot || 'Select a slot to highlight it';
    $('slotDetails').classList.toggle('has-selection', !!viewer.selectedSlot);
    for (const button of $('slotList').querySelectorAll<HTMLButtonElement>('[role=option]'))
      button.setAttribute('aria-selected', String(button.dataset.name === viewer.selectedSlot));
    for (const button of $('animationList').querySelectorAll<HTMLButtonElement>('[role=option]'))
      button.setAttribute('aria-selected', String(button.dataset.name === current?.animation.name));
    const settings = viewer.trackSettings[viewer.track] ?? {
      alpha: 1,
      additive: false,
      loop: true,
      speed: 1,
    };
    if (document.activeElement !== $('trackSpeed')) $('trackSpeed').value = String(settings.speed);
    $('trackAlpha').value = String(settings.alpha);
    $('alphaValue').textContent = Math.round(settings.alpha * 100) + '%';
    $('additive').checked = settings.additive;
    $('additive').disabled = viewer.track === 0;
    $('loop').checked = viewer.loop;
  }
  const safe =
    <Args extends unknown[]>(fn: (...args: Args) => unknown) =>
    (...args: Args) =>
      Promise.resolve()
        .then(() => fn(...args))
        .catch(error);
  try {
    viewer = new SkeletonViewer($('canvasMount'), $('slotMarker'));
  } catch (err) {
    error(err);
    return;
  }
  const sequenceEditor = new SequenceEditor(viewer);
  const trackPanel = new TrackPanel(viewer, (track) => sequenceEditor.open(track));
  viewer.onChange = syncControls;
  viewer.onSelectionChange = selectedModelChanged;
  viewer.onTick = () => {
    trackPanel.tick();
  };
  viewer.onViewChange = () => {
    $('zoom').value = String(Math.round(viewer.zoom * 100));
    $('zoomValue').textContent = Math.round(viewer.zoom * 100) + '%';
  };
  viewer.music.onError = (err) =>
    error(new Error(`Audio playback failed: ${err instanceof Error ? err.message : String(err)}`));
  $('importMusic').onclick = () => $('musicInput').click();
  let musicImport = 0;
  $('musicInput').onchange = async () => {
    const file = $('musicInput').files?.[0];
    $('musicInput').value = '';
    if (!file) return;
    const request = ++musicImport;
    $('musicStatus').textContent = 'Decoding audio and building waveform…';
    $('removeMusic').disabled = false;
    try {
      if (await viewer.music.load(file)) {
        viewer.setAllPaused(true);
        trackPanel.fit();
        toast('Audio loaded. Press Play to sync the stage.');
      }
    } catch (err) {
      if (request === musicImport)
        error(
          new Error(
            `Unable to load audio. Try a valid MP3 or WAV file. ${err instanceof Error ? err.message : String(err)}`,
          ),
        );
    } finally {
      if (request === musicImport) syncControls();
    }
  };
  $('removeMusic').onclick = () => {
    ++musicImport;
    viewer.removeMusic();
    syncControls();
  };
  $('musicVolume').oninput = $('musicMute').onchange = () => {
    viewer.music.setVolume(Number($('musicVolume').value) / 100, $('musicMute').checked);
    $('musicVolumeValue').textContent = $('musicVolume').value + '%';
  };
  $('musicLoop').onchange = () => {
    viewer.music.loop = $('musicLoop').checked;
  };
  $('musicStart').oninput = () => {
    if ($('musicStart').value !== '' && $('musicStart').validity.valid)
      viewer.setStartAt(Number($('musicStart').value));
  };
  new SkeletonPerformance(viewer, document);
  $('openButton').onclick = () => $('fileInput').click();
  $('folderButton').onclick = () => $('folderInput').click();
  for (const id of ['fileInput', 'folderInput'] as const)
    $(id).onchange = safe(async (event: Event) => {
      const input = event.target as HTMLInputElement;
      const files = Array.from(input.files || []);
      input.value = '';
      if (files.length) await openCatalog(SpineIO.catalog(files));
    });
  $('sampleButton').onclick = safe(async () => {
    await openCatalog(await SpineIO.sample());
  });
  $('skeletonSelect').onchange = chooseAtlas;
  $('addToStage').onclick = safe(addSelected);
  $('arrangeScene').onclick = () => viewer.arrange();
  $('removeScene').onclick = () => viewer.removeSelected();
  $('playScene').onclick = () => viewer.setAllPaused(false);
  $('pauseScene').onclick = () => viewer.setAllPaused(true);
  for (const id of ['sceneX', 'sceneY'] as const)
    $(id).oninput = () => {
      const value = Number($(id).value);
      if ($(id).value !== '' && $(id).validity.valid && viewer.model)
        viewer.moveSelected(
          id === 'sceneX' ? value : viewer.model.x,
          id === 'sceneY' ? value : viewer.model.y,
        );
    };
  $('skinSelect').onchange = () => {
    const skin = viewer.asset?.spineData.skins[+$('skinSelect').value];
    if (skin) viewer.setSkin(skin.name);
  };
  $('slotSearch').oninput = renderSlots;
  $('clearSlot').onclick = () => viewer.selectSlot(null);
  $('copySlot').onclick = safe(async () => {
    try {
      await navigator.clipboard.writeText(viewer.selectedSlot || '');
    } catch {
      const field = document.createElement('textarea');
      field.value = viewer.selectedSlot || '';
      field.style.cssText = 'position:fixed;opacity:0';
      document.body.append(field);
      field.select();
      const copied = document.execCommand('copy');
      field.remove();
      if (!copied) throw Error('Clipboard access denied. Read the name from the slot list.');
    }
    toast('Slot name copied');
  });
  $('playPause').onclick = () => {
    viewer.paused = !viewer.paused;
    syncControls();
  };
  const stepFrame = (direction: -1 | 1) => {
    viewer.stepFrame(direction, Number($('stepFps').value));
    trackPanel.ensureVisible();
  };
  $('previousFrame').onclick = () => stepFrame(-1);
  $('nextFrame').onclick = () => stepFrame(1);
  $('stepFps').onchange = () => trackPanel.tick(true);
  $('restart').onclick = () => {
    viewer.seekAll(0);
    trackPanel.reveal();
  };
  $('setupPose').onclick = () => viewer.setup();
  $('loop').onchange = () => {
    viewer.setTrackLoop(viewer.track, $('loop').checked);
  };
  $('speed').onchange = () => (viewer.speed = +$('speed').value);
  $('restartTracks').onclick = () => {
    viewer.restartAllTracks();
    trackPanel.reveal();
    viewer.paused = false;
    syncControls();
  };
  $('trackSpeed').oninput = () => {
    const input = $('trackSpeed');
    if (input.value !== '' && input.validity.valid) viewer.setTrackSpeed(Number(input.value));
  };
  $('trackSpeed').onchange = () => {
    viewer.setTrackSpeed(Math.max(0, Math.min(3, Number($('trackSpeed').value) || 0)));
    $('trackSpeed').value = String(viewer.trackSettings[viewer.track]?.speed ?? 1);
  };
  $('mix').onchange = () => {
    viewer.mix = Math.max(0, Math.min(4, Number($('mix').value) || 0));
    $('mix').value = String(viewer.mix);
  };
  $('trackAlpha').oninput = $('additive').onchange = () => {
    viewer.configureTrack(+$('trackAlpha').value, $('additive').checked);
    $('alphaValue').textContent = Math.round(+$('trackAlpha').value * 100) + '%';
  };
  $('clearTrack').onclick = () => viewer.clearTrack();
  $('debugOptions').onchange = () =>
    viewer.setDebug(
      Object.fromEntries(
        [...$('debugOptions').querySelectorAll('input')].map((input) => [
          input.dataset.debug,
          input.checked,
        ]),
      ),
    );
  $('fitButton').onclick = () => viewer.fit();
  $('zoom').oninput = () => viewer.setZoom(+$('zoom').value / 100);
  for (const axis of ['X', 'Y'] as const)
    $('flip' + axis).onclick = () => {
      const on = $('flip' + axis).getAttribute('aria-pressed') !== 'true';
      $('flip' + axis).setAttribute('aria-pressed', String(on));
      viewer.flip(axis.toLowerCase(), on);
    };
  for (const id of ['pma', 'linear'] as const)
    $(id).onchange = () => viewer.setTextureMode($('pma').checked, $('linear').checked);
  $('dismissError').onclick = () => ($('errorPanel').hidden = true);
  $('panelToggle').onclick = () => {
    $('sidebar').classList.toggle('open');
    $('panelToggle').setAttribute('aria-expanded', String($('sidebar').classList.contains('open')));
  };
  window.addEventListener('keydown', (event) => {
    if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
    if (
      $('sequenceDialog').open ||
      (event.target instanceof Element &&
        event.target.closest(
          'input,select,textarea,[contenteditable]:not([contenteditable="false"])',
        ))
    )
      return;
    if (['<', '>', ',', '.'].includes(event.key)) {
      event.preventDefault();
      stepFrame(event.key === '<' || event.key === ',' ? -1 : 1);
      return;
    }

    if (
      event.target instanceof Element &&
      event.target.closest('input,select,textarea,button,[role=listbox]')
    )
      return;
    if (event.code === 'Space') {
      event.preventDefault();
      $('playPause').click();
    }
    if (event.key.toLowerCase() === 'f') {
      event.preventDefault();
      viewer.fit();
    }
    if (event.key === 'Escape') {
      viewer.selectSlot(null);
      $('sidebar').classList.remove('open');
    }
  });
  for (const id of ['slotList', 'animationList', 'sceneList'])
    $(id).addEventListener('keydown', (event) => {
      const buttons = [...$(id).querySelectorAll('button')];
      if (!buttons.length) return;
      let index = buttons.findIndex((b) => b.getAttribute('aria-selected') === 'true');
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        index = Math.max(
          0,
          Math.min(buttons.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)),
        );
        buttons[index].click();
        const selected = $(id).querySelectorAll('button')[index];
        selected?.focus();
        selected?.scrollIntoView({ block: 'nearest' });
      }
    });
  let dragDepth = 0;
  window.addEventListener('dragenter', (e) => {
    if (e.dataTransfer?.types.includes('Files')) {
      e.preventDefault();
      dragDepth++;
      $('dropOverlay').hidden = false;
    }
  });
  window.addEventListener('dragover', (e) => {
    if (e.dataTransfer?.types.includes('Files')) e.preventDefault();
  });
  window.addEventListener('dragleave', () => {
    if (--dragDepth <= 0) $('dropOverlay').hidden = true;
  });
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    dragDepth = 0;
    $('dropOverlay').hidden = true;
    const pending = e.dataTransfer?.items?.length
      ? SpineIO.droppedFiles(e.dataTransfer?.items)
      : Promise.resolve(Array.from(e.dataTransfer?.files || []));
    pending
      .then(async (files) => {
        if (files.length) await openCatalog(SpineIO.catalog(files));
      })
      .catch(error);
  });
  registerViewerTools(viewer, syncControls);
  installEditor(viewer, trackPanel, error, () => {
    ++loadingId;
    ++musicImport;
    controller?.abort();
    viewer.music.cancelLoad();
    $('loading').hidden = true;
    $('addToStage').disabled = !catalog?.atlases.length;
  });
  safe(async () => openCatalog(await SpineIO.sample()))();
})();
