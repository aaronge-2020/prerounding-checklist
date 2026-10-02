// Minimal static server for the ws5 utility harness. Serves the ORIGINAL
// deid-benchmark site directory (models + pipeline code) unchanged; only the
// port differs so it never collides with the benchmark server on 8902.
// COOP/COEP headers preserved so the threaded ONNX wasm build works.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const ROOT = "/home/hatch/workspace/deid-benchmark/site/";
const WS5_HARNESS = "/home/hatch/workspace/deid-validation/ws5-utility/harness/ws5-harness.html";
const PORT = 8905;

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".json": "application/json",
  ".wasm": "application/wasm",
  ".txt": "text/plain",
  ".onnx": "application/octet-stream",
};

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split("?")[0]);
  // ws5-harness.html lives in the ws5 harness dir, not the site dir.
  let filePath = urlPath === "/ws5-harness.html"
    ? WS5_HARNESS
    : path.join(ROOT, urlPath === "/" ? "ws5-harness.html" : urlPath.slice(1));
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Content-Length": stat.size,
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
      "Cache-Control": "no-store",
    });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`serving ${ROOT} (+ ws5-harness.html) on http://127.0.0.1:${PORT}`);
});
