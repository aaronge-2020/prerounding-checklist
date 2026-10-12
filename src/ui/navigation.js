// Responsive navigation belongs to the shell, independent of patient state.
let compactNavigation = null;
export function syncNavigationDisclosure() {
  const compact = window.matchMedia("(max-width: 1040px)").matches || ["dailyView", "reviewView"].some(id => document.getElementById(id)?.classList.contains("active"));
  if (compact === compactNavigation) return;
  compactNavigation = compact;
  const menu = document.getElementById("secondaryNavigation");
  if (menu) menu.open = !compact;
}

export function installNavigationDisclosure() {
  const menu = document.getElementById("secondaryNavigation");
  if (!menu) return;
  const narrow = window.matchMedia("(max-width: 1040px)");
  const update = syncNavigationDisclosure;
  update();
  narrow.addEventListener("change", update);
  menu.addEventListener("click", event => {
    if (compactNavigation && event.target.closest("button")) menu.open = false;
  });
}
