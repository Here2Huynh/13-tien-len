#!/usr/bin/env python3
"""Deploy the built site to Cloudflare Pages (direct upload).

This is the in-repo version of the foreman's deploy step — the
same Cloudflare Pages direct-upload flow, checked in so any
checkout can deploy a clean, tested commit:

  1. credentials come from the environment ONLY (nothing secret
     is ever committed): CLOUDFLARE_API_TOKEN and
     CLOUDFLARE_ACCOUNT_ID are required;
     CLOUDFLARE_PAGES_PROJECT overrides the project name
     (default "13-tien-len"). Absent credentials fail cleanly
     before any other work.
  2. a dirty working tree is refused — what deploys is always
     exactly a commit;
  3. `npm test` and `npm run build` must pass;
  4. dist/ is uploaded with the Pages direct-upload protocol
     (upload-token -> blake3 asset hashes over base64 contents +
     extension -> check-missing -> upload the missing assets ->
     create the deployment), tagged with the commit SHA
     (commit_hash field + the SHA in the commit message).

Usage: python3 tools/deploy/deploy.py
Requires: python3 with the `blake3` package, npm, git.
"""
import base64
import json
import mimetypes
import os
import subprocess
import sys
import urllib.request
import uuid

try:
    from blake3 import blake3
except ImportError:
    print("SETUP: the blake3 package is required (pip install blake3)")
    sys.exit(2)

HOST = "api.cloudflare.com"


def run(cmd, **kwargs):
    return subprocess.run(cmd, capture_output=True, text=True, **kwargs)


def api(path, token, payload=None, jwt=None):
    headers = {"Authorization": f"Bearer {jwt or token}"}
    data = None
    if payload is not None:
        data = json.dumps(payload).encode()
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(
        f"https://{HOST}{path}", data=data, headers=headers,
        method="POST" if payload is not None else "GET")
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.loads(resp.read().decode())


def main():
    token = os.environ.get("CLOUDFLARE_API_TOKEN")
    account = os.environ.get("CLOUDFLARE_ACCOUNT_ID")
    project = os.environ.get("CLOUDFLARE_PAGES_PROJECT", "13-tien-len")
    missing = [name for name, value in
               [("CLOUDFLARE_API_TOKEN", token), ("CLOUDFLARE_ACCOUNT_ID", account)]
               if not value]
    if missing:
        print("SETUP: missing environment variable(s): " + ", ".join(missing))
        sys.exit(2)

    root = run(["git", "rev-parse", "--show-toplevel"]).stdout.strip()
    if not root:
        print("FAIL: not inside a git checkout")
        sys.exit(1)
    os.chdir(root)

    dirty = run(["git", "status", "--porcelain"]).stdout.strip()
    if dirty:
        print("REFUSED: the working tree is dirty — commit first; a deploy is always exactly a commit.")
        print(dirty)
        sys.exit(1)

    sha = run(["git", "rev-parse", "HEAD"]).stdout.strip()
    branch = run(["git", "rev-parse", "--abbrev-ref", "HEAD"]).stdout.strip()

    for cmd in (["npm", "test"], ["npm", "run", "build"]):
        print("+", " ".join(cmd))
        if subprocess.run(cmd).returncode != 0:
            print("FAIL:", " ".join(cmd))
            sys.exit(1)

    files = []  # (url_path, fs_path, ext_no_dot)
    for dirpath, _dirs, names in os.walk("dist"):
        for name in sorted(names):
            fs_path = os.path.join(dirpath, name)
            url_path = "/" + os.path.relpath(fs_path, "dist").replace(os.sep, "/")
            ext = name.rsplit(".", 1)[1] if "." in name else ""
            files.append((url_path, fs_path, ext))
    print(f"files: {len(files)}")

    token_resp = api(f"/client/v4/accounts/{account}/pages/projects/{project}/upload-token", token)
    jwt = token_resp["result"]["jwt"]

    def build_manifest(with_dot):
        manifest, payloads = {}, {}
        for url_path, fs_path, ext in files:
            raw = open(fs_path, "rb").read()
            b64 = base64.b64encode(raw).decode()
            suffix = ("." + ext) if with_dot else ext
            h = blake3((b64 + suffix).encode()).hexdigest()[:32]
            manifest[url_path] = h
            payloads[h] = (b64, fs_path)
        return manifest, payloads

    chosen = None
    for with_dot in (False, True):
        manifest, payloads = build_manifest(with_dot)
        res = api("/client/v4/pages/assets/check-missing", token,
                  {"hashes": list(manifest.values())}, jwt=jwt)
        missing_hashes = res["result"]
        print(f"convention ext_dot={with_dot}: missing={len(missing_hashes)}")
        if chosen is None or len(missing_hashes) < len(chosen[2]):
            chosen = (manifest, payloads, missing_hashes)
        if len(missing_hashes) <= 2:
            break
    manifest, payloads, missing_hashes = chosen

    print(f"uploading {len(missing_hashes)} asset(s)")
    for h in missing_hashes:
        b64, fs_path = payloads[h]
        ctype = mimetypes.guess_type(fs_path)[0] or "application/octet-stream"
        res = api("/client/v4/pages/assets/upload", token,
                  [{"key": h, "value": b64,
                    "metadata": {"contentType": ctype}, "base64": True}], jwt=jwt)
        if not res.get("success"):
            print("UPLOAD FAILED", res)
            sys.exit(1)

    message = f"Deploy {sha[:7]} ({branch})"
    boundary = "----cfdeploy" + uuid.uuid4().hex

    def field(name, value):
        return (f"--{boundary}\r\nContent-Disposition: form-data; "
                f"name=\"{name}\"\r\n\r\n{value}\r\n")

    body = (field("manifest", json.dumps(manifest)) +
            field("branch", branch) +
            field("commit_message", message) +
            field("commit_hash", sha) +
            field("commit_dirty", "false") +
            f"--{boundary}--\r\n").encode()
    req = urllib.request.Request(
        f"https://{HOST}/client/v4/accounts/{account}/pages/projects/{project}/deployments",
        data=body,
        headers={"Authorization": f"Bearer {token}",
                 "Content-Type": f"multipart/form-data; boundary={boundary}"},
        method="POST")
    with urllib.request.urlopen(req, timeout=120) as resp:
        payload = json.loads(resp.read().decode())
    result = payload["result"]
    print("deployment:", result["id"])
    print("url:", result.get("url"))
    print("stage:", result.get("latest_stage", {}).get("status"))


if __name__ == "__main__":
    main()
