import './styles.css';
import { $ } from './dom';
import * as SpineIO from './assets';
import { SkeletonViewer } from './viewer';
import { SkeletonPerformance } from './performance';
import { registerViewerTools } from './webmcp';
import type { AssetCatalog } from './types';
(() => {
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
      throw Error('沒有找到骨架檔。請一起選取 .json 或 .skel、.atlas 和貼圖。');
    catalog = next;
    options($('skeletonSelect'), catalog.skeletons, (e) => e.path);
    options($('atlasSelect'), catalog.atlases, (e) => e.path);
    chooseAtlas();
    await loadSelected();
  }
  async function loadSelected() {
    const id = ++loadingId;
    controller?.abort();
    controller = new AbortController();
    $('errorPanel').hidden = true;
    $('loading').hidden = false;
    try {
      const file = catalog.skeletons[+$('skeletonSelect').value],
        atlas = $('atlasSelect').value === '' ? null : catalog.atlases[+$('atlasSelect').value];
      const asset = await SpineIO.load(catalog, file, atlas, {
        signal: controller.signal,
        pma: $('pma').checked,
        linear: $('linear').checked,
      });
      if (id !== loadingId) {
        asset.dispose();
        return;
      }
      viewer.track = 0;
      viewer.setModel(asset);
      $('flipX').setAttribute('aria-pressed', 'false');
      $('flipY').setAttribute('aria-pressed', 'false');
      $('modelName').textContent = asset.fileName;
      $('formatBadge').textContent = 'SPINE ' + asset.spineData.version;
      $('skeletonInfo').textContent =
        `${asset.spineData.bones.length} bones · ${asset.spineData.slots.length} slots`;
      options($('skinSelect'), asset.spineData.skins, (s) => s.name);
      $('skinCount').textContent = String(asset.spineData.skins.length);
      const current = asset.spineData.skins.findIndex((s) => s.name === 'default');
      if (current >= 0) $('skinSelect').value = String(current);
      $('slotSearch').value = '';
      renderSlots();
      renderAnimations();
      syncControls();
      $('loading').hidden = true;
    } catch (err) {
      if (id === loadingId && !(err instanceof Error && err.name === 'AbortError')) error(err);
    }
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
      p.textContent = '沒有符合的 Slot';
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
      p.textContent = '此骨架沒有動畫';
      list.append(p);
    }
  }
  function syncControls() {
    if (!viewer) return;
    const current = viewer.current();
    $('activeAnimation').textContent = current?.animation.name || 'Setup pose';
    $('playPause').textContent = viewer.paused ? '▶' : 'Ⅱ';
    $('playPause').setAttribute('aria-label', viewer.paused ? '播放' : '暫停');
    $('copySlot').disabled = !viewer.selectedSlot;
    $('slotDetailText').textContent = viewer.selectedSlot || '選取 Slot，在畫面中標示';
    $('slotDetails').classList.toggle('has-selection', !!viewer.selectedSlot);
    for (const button of $('slotList').querySelectorAll<HTMLButtonElement>('[role=option]'))
      button.setAttribute('aria-selected', String(button.dataset.name === viewer.selectedSlot));
    for (const button of $('animationList').querySelectorAll<HTMLButtonElement>('[role=option]'))
      button.setAttribute('aria-selected', String(button.dataset.name === current?.animation.name));
    for (const button of $('tracks').querySelectorAll('button')) {
      const track = +(button.dataset.track || 0);
      button.setAttribute('aria-pressed', String(track === viewer.track));
      button.classList.toggle('has-animation', !!viewer.model?.state.getCurrent(track));
    }
    const settings = viewer.trackSettings[viewer.track];
    $('trackAlpha').value = String(settings.alpha);
    $('alphaValue').textContent = Math.round(settings.alpha * 100) + '%';
    $('additive').checked = settings.additive;
    $('additive').disabled = viewer.track === 0;
    $('loop').checked = viewer.loop;
    updateTimeline();
  }
  function updateTimeline() {
    const entry = viewer.current(),
      duration = entry?.animation.duration || 0;
    const time =
      duration && entry
        ? entry.loop
          ? entry.trackTime % duration
          : Math.min(entry.trackTime, duration)
        : 0;
    $('timeline').max = String(duration || 1);
    $('timeline').value = String(time);
    $('timeline').disabled = !duration;
    $('currentTime').textContent = time.toFixed(2);
    $('duration').textContent = duration.toFixed(2) + ' s';
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
  viewer.onChange = syncControls;
  viewer.onTick = updateTimeline;
  viewer.onViewChange = () => {
    $('zoom').value = String(Math.round(viewer.zoom * 100));
    $('zoomValue').textContent = Math.round(viewer.zoom * 100) + '%';
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
  $('skeletonSelect').onchange = safe(async () => {
    chooseAtlas();
    await loadSelected();
  });
  $('atlasSelect').onchange = safe(loadSelected);
  $('skinSelect').onchange = () =>
    viewer.setSkin(viewer.asset.spineData.skins[+$('skinSelect').value].name);
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
      if (!copied) throw Error('瀏覽器不允許複製，請從 Slot 清單讀取名稱。');
    }
    toast('已複製 Slot 名稱');
  });
  $('playPause').onclick = () => {
    viewer.paused = !viewer.paused;
    syncControls();
  };
  $('restart').onclick = () => viewer.seek(0);
  $('setupPose').onclick = () => viewer.setup();
  $('loop').onchange = () => {
    viewer.loop = $('loop').checked;
    if (viewer.current()) viewer.current()!.loop = viewer.loop;
  };
  $('speed').onchange = () => (viewer.speed = +$('speed').value);
  for (const button of $('tracks').querySelectorAll('button'))
    button.onclick = () => viewer.setTrack(+(button.dataset.track || 0));
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
  $('timeline').oninput = () => {
    viewer.paused = true;
    viewer.seek(+$('timeline').value);
  };
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
  for (const id of ['slotList', 'animationList'])
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
        buttons[index].focus();
        buttons[index].scrollIntoView({ block: 'nearest' });
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
  safe(async () => openCatalog(await SpineIO.sample()))();
})();
