import type { SkeletonViewer } from './viewer';
import { planMediaImport } from './media-library';
import { prepareBoneImage } from './bone-images';
import { acquireNumberFont } from './number-font';
import { installSlotBindingPanel } from './slot-binding-panel';

export function installMediaPanel(viewer: SkeletonViewer, report: (error: unknown) => void) {
  const panel = document.createElement('section');
  panel.className = 'media-panel';
  panel.innerHTML = `<div class="section-heading"><h2><button class="section-toggle" aria-expanded="true" aria-controls="mediaContent"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m5 3 5 5-5 5"/></svg>Media library</button></h2><span class="count" id="mediaCount">0</span></div>
    <div id="mediaContent" class="section-content">
      <div class="bone-image-actions"><button id="addMedia">Add media</button><button id="addMediaFolder">Add folder</button></div>
      <input id="mediaFiles" type="file" multiple accept=".png,.webp,.jpg,.jpeg,.fnt" hidden>
      <input id="mediaFolder" type="file" multiple webkitdirectory hidden>
      <label for="mediaAsset">Library assets</label><select id="mediaAsset"></select>
      <div class="media-preview"><img id="mediaPreview" alt="Selected image preview" hidden><span id="mediaSummary" class="file-note"></span></div>
      <button id="removeMedia">Remove asset</button>
      <p class="file-note">Batch import PNG / WebP / JPG and bitmap fonts (.fnt + page images). Reuse assets in Slots below. All library assets are saved in the project ZIP.</p>
      <p id="mediaStatus" class="file-note" role="status"></p>
    </div>`;
  document.querySelector('.scene-section')!.after(panel);
  const el = <T extends HTMLElement>(id: string) => panel.querySelector<T>(`#${id}`)!;
  const select = el<HTMLSelectElement>('mediaAsset'),
    preview = el<HTMLImageElement>('mediaPreview');
  const remove = el<HTMLButtonElement>('removeMedia');
  let busy = false,
    selected = '',
    previewFile: File | undefined,
    previewUrl = '';
  const toggle = panel.querySelector<HTMLButtonElement>('.section-toggle')!;
  toggle.onclick = () => {
    const content = el('mediaContent');
    content.hidden = !content.hidden;
    toggle.setAttribute('aria-expanded', String(!content.hidden));
    panel.classList.toggle('collapsed', content.hidden);
  };
  const used = () => {
    const library = viewer.mediaLibrary,
      [kind, index] = selected.split(':');
    const image = kind === 'image' ? library.images[Number(index)] : undefined;
    const font = kind === 'font' ? library.fonts[Number(index)] : undefined;
    return viewer.items.some((item) =>
      image
        ? item.boneImages.images.some((entry) => entry.state.file === image) ||
          item.boneNumbers.numbers.some((entry) => entry.state.font?.pages.includes(image))
        : font && item.boneNumbers.numbers.some((entry) => entry.state.font?.file === font.file),
    );
  };
  function sync() {
    const library = viewer.mediaLibrary;
    select.replaceChildren(
      ...library.images.map((file, i) => new Option(`Image ${i + 1} · ${file.name}`, `image:${i}`)),
      ...library.fonts.map(
        (font, i) => new Option(`Font ${i + 1} · ${font.file.name}`, `font:${i}`),
      ),
    );
    select.value = selected;
    if (select.selectedIndex < 0) {
      select.selectedIndex = 0;
      selected = select.value;
    }
    const [kind, index] = selected.split(':'),
      file = kind === 'image' ? library.images[Number(index)] : undefined,
      font = kind === 'font' ? library.fonts[Number(index)] : undefined;
    if (file !== previewFile) {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewFile = file;
      previewUrl = file ? URL.createObjectURL(file) : '';
      if (previewUrl) preview.src = previewUrl;
      else preview.removeAttribute('src');
    }
    preview.hidden = !file;
    el('mediaSummary').textContent = font
      ? `${font.pages.length} font page(s)`
      : file
        ? `${(file.size / 1024).toFixed(1)} KB`
        : 'No media yet.';
    remove.disabled = busy || (!file && !font) || used();
    remove.title = used()
      ? 'Clear the slot / bone bindings using this asset first.'
      : 'Remove from the library (Undo to restore)';
    select.disabled = busy || !select.options.length;
    el<HTMLButtonElement>('addMedia').disabled = el<HTMLButtonElement>('addMediaFolder').disabled =
      busy;
    el('mediaCount').textContent = String(library.images.length + library.fonts.length);
  }
  select.onchange = () => {
    selected = select.value;
    sync();
  };
  remove.onclick = () => {
    if (used()) return;
    const [kind, index] = selected.split(':');
    viewer.mediaLibrary = {
      images: viewer.mediaLibrary.images.filter((_, i) => kind !== 'image' || i !== Number(index)),
      fonts: viewer.mediaLibrary.fonts.filter((_, i) => kind !== 'font' || i !== Number(index)),
    };
    viewer.onChange?.();
  };
  async function importFiles(files: File[]) {
    if (!files.length || busy) return;
    const previous = viewer.mediaLibrary,
      leases: { release(): void }[] = [];
    busy = true;
    el('mediaStatus').textContent = 'Validating media…';
    sync();
    try {
      const library = await planMediaImport(files, previous);
      for (const file of library.images)
        if (!previous.images.includes(file))
          leases.push(
            await prepareBoneImage({ file, bone: 'library', x: 0, y: 0, scale: 1, rotation: 0 }),
          );
      for (const font of library.fonts)
        if (!previous.fonts.includes(font)) leases.push(await acquireNumberFont(font));
      if (viewer.mediaLibrary !== previous) return;
      viewer.mediaLibrary = library;
      el('mediaStatus').textContent =
        `Imported ${library.images.length - previous.images.length} image(s), ${library.fonts.length - previous.fonts.length} font(s).`;
      viewer.onChange?.();
    } catch (error) {
      el('mediaStatus').textContent = 'Import failed. The library is unchanged.';
      report(error);
    } finally {
      leases.forEach((lease) => lease.release());
      busy = false;
      sync();
    }
  }
  for (const [button, input] of [
    ['addMedia', 'mediaFiles'],
    ['addMediaFolder', 'mediaFolder'],
  ]) {
    const field = el<HTMLInputElement>(input);
    el<HTMLButtonElement>(button).onclick = () => field.click();
    field.onchange = () => {
      const files = [...(field.files ?? [])];
      field.value = '';
      void importFiles(files);
    };
  }
  const previous = viewer.onChange;
  viewer.onChange = () => {
    previous?.();
    sync();
  };
  sync();
  installSlotBindingPanel(viewer, report);
}
