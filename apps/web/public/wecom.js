// Runs before first paint, as a file because the app's CSP blocks inline scripts.
(() => {
  if (!/wxwork/i.test(navigator.userAgent)) return;
  document.documentElement.dataset.wecom = "";
  const viewport = document.querySelector('meta[name="viewport"]');
  if (viewport) {
    viewport.setAttribute("content", "width=device-width, initial-scale=1, viewport-fit=cover");
  }
})();
