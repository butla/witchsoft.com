// Theme and fancy-mode switches. The fancy-mode animation itself lives in fancy.js,
// which only gets loaded once fancy mode is turned on.
(function () {
  "use strict";

  const root = document.documentElement;

  function save(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (e) {}
  }

  const themeSwitch = document.getElementById("theme-switch");
  const fancySwitch = document.getElementById("fancy-switch");

  themeSwitch.addEventListener("click", function () {
    root.dataset.theme = root.dataset.theme === "light" ? "dark" : "light";
    save("theme", root.dataset.theme);
    if (window.fancyBackground) window.fancyBackground.readColors();
  });

  let fancyLoading = null;

  function loadFancy() {
    fancyLoading =
      fancyLoading ||
      new Promise(function (resolve, reject) {
        const script = document.createElement("script");
        script.src = "js/fancy.js";
        script.onload = resolve;
        script.onerror = reject;
        document.body.appendChild(script);
      });
    return fancyLoading;
  }

  function applyFancy() {
    const on = root.dataset.fancy === "on";
    fancySwitch.setAttribute("aria-pressed", String(on));
    if (on) {
      loadFancy().then(function () {
        // the switch may have been turned off again while the script was loading
        if (root.dataset.fancy === "on") window.fancyBackground.start();
      });
    } else if (window.fancyBackground) {
      window.fancyBackground.stop();
    }
  }

  fancySwitch.addEventListener("click", function () {
    root.dataset.fancy = root.dataset.fancy === "on" ? "off" : "on";
    save("fancy", root.dataset.fancy);
    applyFancy();
  });

  applyFancy();
})();
