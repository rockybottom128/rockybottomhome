const gallery = document.querySelector<HTMLElement>('.photo-gallery')!;
const dialog = document.querySelector<HTMLDialogElement>('#photo-dialog')!;
const thumbs = [...document.querySelectorAll<HTMLButtonElement>('.photo-thumbnail')];
const mainImage = document.querySelector<HTMLImageElement>('#gallery-current')!;
const enlargedImage = document.querySelector<HTMLImageElement>('#dialog-current')!;
const openButton = document.querySelector<HTMLButtonElement>('#open-photo')!;
let current = 0;
let suppressClickUntil = 0;
function select(index: number) {
  current = (index + thumbs.length) % thumbs.length;
  const thumb = thumbs[current];
  const caption = thumb.dataset.caption!;
  for (const image of [mainImage, enlargedImage]) {
    image.style.objectPosition = thumb.dataset.position!;
    image.style.transformOrigin = thumb.dataset.position!;
    image.style.transform = `scale(${thumb.dataset.zoom})`;
    image.alt = `${caption}. Inspiration image, not the property for sale.`;
  }
  thumbs.forEach((button, i) => button.setAttribute('aria-current', String(i === current)));
  document.querySelector('#gallery-caption')!.textContent = caption;
  document.querySelector('#photo-count')!.textContent = `${current + 1} / ${thumbs.length}`;
  document.querySelector('#dialog-caption')!.textContent = `${caption} — ${current + 1} / ${thumbs.length}`;
  // Scroll only the thumbnail strip, without moving the page behind an open dialog.
  const strip = thumb.parentElement!;
  strip.scrollTo({ left: thumb.offsetLeft - strip.offsetLeft - (strip.clientWidth - thumb.clientWidth) / 2, behavior: 'auto' });
}
thumbs.forEach((thumb, index) => thumb.addEventListener('click', () => select(index)));
document.querySelectorAll<HTMLButtonElement>('[data-step]').forEach(button => {
  button.addEventListener('click', () => select(current + Number(button.dataset.step)));
});
openButton.addEventListener('click', () => { if (Date.now() > suppressClickUntil) dialog.showModal(); });
document.querySelector('.close-photo')!.addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
dialog.addEventListener('close', () => openButton.focus({ preventScroll: true }));
function keyboard(event: KeyboardEvent) {
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault(); select(current + (event.key === 'ArrowRight' ? 1 : -1));
  } else if (event.key === 'Home' || event.key === 'End') {
    event.preventDefault(); select(event.key === 'Home' ? 0 : thumbs.length - 1);
  }
}
gallery.addEventListener('keydown', keyboard);
dialog.addEventListener('keydown', keyboard);
for (const surface of [openButton, document.querySelector<HTMLElement>('.dialog-image-crop')!]) {
  let start: { x: number; y: number; id: number } | null = null;
  surface.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse' || !event.isPrimary) return;
    start = { x: event.clientX, y: event.clientY, id: event.pointerId };
    surface.setPointerCapture(event.pointerId);
  });
  surface.addEventListener('pointerup', event => {
    if (!start || start.id !== event.pointerId) return;
    const dx = event.clientX - start.x, dy = event.clientY - start.y;
    start = null;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.3) {
      suppressClickUntil = Date.now() + 500;
      select(current + (dx < 0 ? 1 : -1));
    }
  });
  surface.addEventListener('pointercancel', () => { start = null; });
}
