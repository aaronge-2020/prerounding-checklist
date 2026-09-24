// Preload shim: point Playwright at the system Chromium when the bundled
// headless shell is unavailable. Usage:
//   node --import ./tests/helpers/playwright-system-chromium.js tests/foo.js
//
// NOTE: In sandboxed environments where Chromium enforces Local Network
// Access checks (ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS on 127.0.0.1),
// browser tests still cannot reach the local test server. That is an
// environment limitation, not a test bug.
const SYSTEM_CHROMIUM = process.env.PLAYWRIGHT_SYSTEM_CHROMIUM || "/opt/meta-chromium/chrome";

try {
  const { chromium } = await import("playwright");
  const originalLaunch = chromium.launch.bind(chromium);
  chromium.launch = (options = {}) => {
    if (!options.executablePath && !process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) {
      options = { ...options, executablePath: SYSTEM_CHROMIUM };
    }
    // Sandboxed environments trip Chromium's Local Network Access checks when
    // the test server binds 127.0.0.1; the harness is first-party test infra.
    // Also bypass any proxy env vars so loopback stays loopback.
    const args = [
      ...(options.args || []),
      "--disable-features=LocalNetworkAccessChecks",
      "--no-proxy-server"
    ];
    return originalLaunch({ ...options, args });
  };
} catch {
  // Playwright not installed; tests will fail on their own terms.
}
