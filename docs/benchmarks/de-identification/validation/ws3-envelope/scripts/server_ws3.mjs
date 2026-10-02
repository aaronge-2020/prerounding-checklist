// ws3 static server: serves overlay/ first, falls back to the benchmark site
// dir. Same COOP/COEP headers as harness/server.mjs so the threaded ONNX wasm
// build works. Does NOT modify the benchmark tree.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OVERLAY = path.join(HERE, "..", "overlay");
const SITE = "/home/hatch/workspace/deid-benchmark/site";
const PORT = Number(process.argv[2] || 8903);

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".json": "application/json",
  ".wasm": "application/wasm",
  ".txt": "text/plain",
  ".onnx": "application/octet-stream"
};

function resolve(urlPath) {
  const rel = urlPath === "/" ? "failclosed.html" : urlPath.slice(1);
  const ov = path.join(OVERLAY, rel);
  if (fs.existsSync(ov) && fs.statSync(ov).isFile()) return ov;
  const site = path.join(SITE, rel);
  if (fs.existsSync(site) && fs.statSync(site).isFile()) return site;
  return null;
}

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split("?")[0]);
  const filePath = resolve(urlPath);
  if (!filePath) {
    res.writeHead(404);
    res.end("not found");
    return;
  }
  const ext = path.extname(filePath);
  fs.stat(filePath, (err, stat) => {
    if (err) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Content-Length": stat.size,
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
      "Cache-Control": "no-store"
    });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`ws3 server on http://127.0.0.1:${PORT} (overlay + site fallback)`);
});
