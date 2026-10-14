// Responsive navigation belongs to the shell, independent of patient state.
let compactNavigation = null;

function workViewActive() {
  return ["dailyView", "reviewView"].some((id) => document.getElementById(id)?.classList.contains("active"));
}

export function syncNavigationDisclosure() {
  const narrow = window.matchMedia("(max-width: 1040px)").matches;
  const rail = narrow || workViewActive();
  const menu = document.getElementById("secondaryNavigation");
  if (!menu) {
    compactNavigation = rail;
    return;
  }
  if (rail) {
    // Slim-rail frame (work views at any width, every view when narrow):
    // the Tools group stays open so every destination remains one click
    // away; the rail scrolls when the list is taller than the screen.
    compactNavigation = true;
    menu.open = true;
    return;
  }
  // Full labeled sidebar: the group starts open; after that the user's
  // own summary toggle is left alone.
  if (compactNavigation === false) return;
  compactNavigation = false;
  menu.open = true;
}

export function installNavigationDisclosure() {
  const menu = document.getElementById("secondaryNavigation");
  if (!menu) return;
  const narrow = window.matchMedia("(max-width: 1040px)");
  const update = syncNavigationDisclosure;
  update();
  narrow.addEventListener("change", update);
}
