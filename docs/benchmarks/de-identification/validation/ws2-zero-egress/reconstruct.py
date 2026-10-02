#!/usr/bin/env python3
"""Reconstruct the DEPLOYED prerounding app (remote main, Pages artifact) into OVERLAY.

Deployed set = index.html, styles.css, service-worker.js, favicon.ico +
assets/ data/ models/ prompts/ src/ vendor/ workups/  (per deploy-pages.yml).

For each remote blob:
  - if the worktree file's git blob hash matches the remote blob sha -> copy from worktree
  - else download the blob via the github-api CLI
  - if the blob is a Git LFS pointer -> copy the smudged file from the worktree
    and verify size (and sha256 when cheap)

Writes OVERLAY/manifest.json with provenance per file.
"""
import base64, hashlib, json, os, subprocess, sys

REPO = os.path.expanduser("~/workspace/prerounding/repo")
OVERLAY = os.path.expanduser("~/workspace/deid-validation/ws2-zero-egress/app")
API = os.path.expanduser("~/workspace/skills/github/bin/github-api")
TREE = "/tmp/ws2_tree.json"

KEEP_FILES = {"index.html", "styles.css", "service-worker.js", "favicon.ico", ".nojekyll"}
KEEP_DIRS = ("assets/", "data/", "models/", "prompts/", "src/", "vendor/", "workups/")

def sh(*args):
    return subprocess.run(args, capture_output=True, text=True)

def git_hash(path):
    r = sh("git", "hash-object", path)
    return r.stdout.strip() if r.returncode == 0 else None

def api_blob(sha):
    r = sh(API, "GET", f"/repos/aaronge-2020/prerounding-checklist/git/blobs/{sha}")
    if r.returncode != 0:
        raise RuntimeError(f"blob fetch failed for {sha}: {r.stderr[:300]}")
    obj = json.loads(r.stdout)
    if obj.get("encoding") != "base64":
        raise RuntimeError(f"unexpected blob encoding for {sha}")
    return base64.b64decode(obj["content"])

def parse_lfs_pointer(data):
    try:
        text = data.decode("utf-8", errors="strict")
    except Exception:
        return None
    if not text.startswith("version https://git-lfs.github.com/spec/v1"):
        return None
    info = {}
    for line in text.splitlines():
        if line.startswith("oid sha256:"):
            info["oid"] = line.split(":", 1)[1]
        elif line.startswith("size "):
            info["size"] = int(line.split(" ", 1)[1])
    return info if "oid" in info and "size" in info else None

def main():
    tree = json.load(open(TREE))["tree"]
    blobs = [e for e in tree if e["type"] == "blob"]
    wanted = [e for e in blobs
              if e["path"] in KEEP_FILES or e["path"].startswith(KEEP_DIRS)]
    print(f"remote blobs in deployed set: {len(wanted)}", flush=True)
    manifest = []
    stats = {"worktree": 0, "api": 0, "lfs": 0}
    for i, e in enumerate(wanted):
        path, sha = e["path"], e["sha"]
        src_path = os.path.join(REPO, path)
        dst_path = os.path.join(OVERLAY, path)
        os.makedirs(os.path.dirname(dst_path), exist_ok=True)
        source = None
        if os.path.isfile(src_path) and git_hash(src_path) == sha:
            with open(src_path, "rb") as f:
                data = f.read()
            source = "worktree"
            stats["worktree"] += 1
        else:
            data = api_blob(sha)
            lfs = parse_lfs_pointer(data)
            if lfs:
                if not os.path.isfile(src_path):
                    raise RuntimeError(f"LFS file missing from worktree: {path}")
                size = os.path.getsize(src_path)
                if size != lfs["size"]:
                    raise RuntimeError(f"LFS size mismatch for {path}: {size} != {lfs['size']}")
                with open(src_path, "rb") as f:
                    real = f.read()
                if hashlib.sha256(real).hexdigest() != lfs["oid"]:
                    raise RuntimeError(f"LFS oid mismatch for {path}")
                data = real
                source = "lfs-worktree"
                stats["lfs"] += 1
            else:
                source = "api"
                stats["api"] += 1
        with open(dst_path, "wb") as f:
            f.write(data)
        # verify non-LFS overlay file hashes to the remote blob sha
        if source != "lfs-worktree":
            r = sh("git", "hash-object", dst_path)
            assert r.stdout.strip() == sha, f"hash mismatch after write: {path}"
        manifest.append({"path": path, "remote_blob_sha": sha,
                         "sha256": hashlib.sha256(data).hexdigest(),
                         "bytes": len(data), "source": source})
        if (i + 1) % 50 == 0:
            print(f"  {i+1}/{len(wanted)} ... {stats}", flush=True)
    open(os.path.join(OVERLAY, ".nojekyll"), "w").write("")
    json.dump(manifest, open(os.path.join(OVERLAY, "manifest.json"), "w"), indent=1)
    print("done:", stats, flush=True)
    print("overlay:", OVERLAY)

if __name__ == "__main__":
    main()
