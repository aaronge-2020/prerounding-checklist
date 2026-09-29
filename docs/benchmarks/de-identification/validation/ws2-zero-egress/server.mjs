// Static server for ws2 zero-egress validation. Serves the reconstructed
// DEPLOYED app (app/, an overlay of remote main's Pages artifact).
// Sets COOP/COEP so the threaded ONNX wasm build can use SharedArrayBuffer,
// like the deployed app. Copied from deid-benchmark/harness/server.mjs;
// ROOT and PORT changed.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const ROOT = new URL("./app/", import.meta.url).pathname;
const PORT = 8904;

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
  let filePath = path.join(ROOT, urlPath === "/" ? "index.html" : urlPath.slice(1));
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
  console.log(`serving ${ROOT} on http://127.0.0.1:${PORT}`);
});
