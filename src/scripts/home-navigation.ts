export {};
// Banner wrapping and text zoom change the sticky header height.
// Keep native anchor navigation and keyboard focus clear of the header.
const stickyHeader = document.getElementById('site-top');
if (stickyHeader) {
  const updateOffset = () => {
    document.documentElement.style.setProperty('--site-top-height', `${stickyHeader.getBoundingClientRect().height}px`);
  };
  updateOffset();
  new ResizeObserver(updateOffset).observe(stickyHeader);
}
