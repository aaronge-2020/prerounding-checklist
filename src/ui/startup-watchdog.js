// Startup watchdog for the static shell in index.html.
//
// The shell paints "Preparing secure vault" before the app module loads. If
// that load stalls (a slow first visit, a half-cached deploy), the shell
// used to sit static with no spinner and no way forward. This classic script
// is loaded by the shell itself, so it runs even when the module graph does
// not: after 15 seconds without the app marking boot complete, it swaps the
// shell message for a reload prompt. The app sets
// window.__preroundingBooted = true when its first render lands.
//
// The replacement nodes are built with createElement/textContent, never
// innerHTML: the page's Trusted Types policy forbids string HTML sinks
// before the app has created its policies.
(function () {
  "use strict";
  var TIMEOUT_MS = 15000;
  setTimeout(function () {
    if (window.__preroundingBooted) return;
    var content = document.getElementById("vaultContent");
    if (!content || !/Preparing secure vault/.test(content.textContent || "")) return;
    var section = document.createElement("section");
    section.className = "locked-vault-shell surface-panel";
    section.setAttribute("aria-live", "polite");
    var heading = document.createElement("h2");
    heading.id = "vault-heading";
    heading.textContent = "The app is taking a long time to load";
    var note = document.createElement("p");
    note.className = "muted";
    note.textContent =
      "Loading runs on this device and can be slow on a first visit. If this message stays, reload the page. Your encrypted vault is not changed by reloading.";
    var row = document.createElement("p");
    var button = document.createElement("button");
    button.className = "button--primary";
    button.type = "button";
    button.textContent = "Reload the page";
    button.addEventListener("click", function () {
      window.location.reload();
    });
    row.appendChild(button);
    section.appendChild(heading);
    section.appendChild(note);
    section.appendChild(row);
    content.replaceChildren(section);
  }, TIMEOUT_MS);
})();
