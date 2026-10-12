// Responsive navigation belongs to the shell, independent of patient state.
export function installNavigationDisclosure() {
  const menu = document.getElementById("secondaryNavigation");
  if (!menu) return;
  const narrow = window.matchMedia("(max-width: 1040px)");
  const update = () => { menu.open = !narrow.matches; };
  update();
  narrow.addEventListener("change", update);
  menu.addEventListener("click", event => {
    if (narrow.matches && event.target.closest("button")) menu.open = false;
  });
}
