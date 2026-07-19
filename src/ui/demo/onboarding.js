// First-use routing is intentionally a pure decision. The app persists the
// result in encrypted preferences only after a brand-new vault is created.
export function shouldStartGuidedDemo({ isNewVault = false, hasStartedGuidedDemo = false } = {}) {
  return Boolean(isNewVault && !hasStartedGuidedDemo);
}
