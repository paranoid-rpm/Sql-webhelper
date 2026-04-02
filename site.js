(() => {
  const EXIT_DURATION_MS = 320;

  function shouldHandleLink(anchor) {
    if (!anchor) return false;
    if (anchor.hasAttribute("download")) return false;
    if (anchor.target && anchor.target !== "_self") return false;
    const href = anchor.getAttribute("href") || "";
    if (!href || href.startsWith("#")) return false;

    const url = new URL(anchor.href, window.location.href);
    if (url.origin !== window.location.origin) return false;
    if (url.pathname === window.location.pathname && url.hash) return false;
    return true;
  }

  function enterAnimation() {
    window.requestAnimationFrame(() => {
      document.body.classList.add("is-loaded");
    });
  }

  function wirePageTransitions() {
    document.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (!shouldHandleLink(anchor)) return;

      event.preventDefault();
      const nextUrl = anchor.href;
      document.body.classList.add("is-transitioning");
      window.setTimeout(() => {
        window.location.href = nextUrl;
      }, EXIT_DURATION_MS);
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    enterAnimation();
    wirePageTransitions();
  });
})();
