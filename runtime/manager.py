#!/usr/bin/env python3
"""WebNest protocol v1: unprivileged nginx/PHP-FPM supervisor for Pelican Wings.

No network management endpoint, no Docker socket, no host mounts, no shell eval.
The panel transfers requests/results through Wings' existing file API.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
import re
import shutil
import signal
import subprocess
import sys
import time
from datetime import datetime, timezone

HOME = Path("/home/container")
STATE = HOME / "webnest"
RUN = STATE / "run"
STOP = False
MAX_REQUEST = 1024 * 1024


def atomic_write(path: Path, content: str) -> None:
    tmp = path.with_name(path.name + ".tmp")
    # A malicious PHP application is not isolated from its own server's files.
    # Refuse symlinks nonetheless to avoid accidental writes outside this tree.
    if path.is_symlink() or tmp.is_symlink():
        raise ValueError("Symlink is not a writable management file")
    with tmp.open("w", encoding="utf-8") as out:
        out.write(content)
        out.flush()
        os.fsync(out.fileno())
    os.replace(tmp, path)


def status(revision: str, state: str, message: str) -> None:
    atomic_write(STATE / "status.json", json.dumps({
        "protocol": 1, "revision": revision, "state": state,
        "message": message[:8000],
        "at": datetime.now(timezone.utc).isoformat(),
    }, ensure_ascii=False))


def nginx(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["nginx", "-p", str(RUN) + "/", *args],
        capture_output=True, text=True, timeout=15, check=True,
    )


def mkdir_root(root: str) -> None:
    if not isinstance(root, str) or not re.fullmatch(r"sites/[A-Za-z0-9_-]+(?:/[A-Za-z0-9_-]+)*", root):
        raise ValueError("Invalid document root")
    current = HOME
    for part in root.split("/"):
        current = current / part
        if current.is_symlink():
            raise ValueError("Symlink document roots are not supported")
        current.mkdir(exist_ok=True)


def apply_request(request: dict, process: subprocess.Popen) -> None:
    revision = request.get("revision", "")
    if request.get("protocol") != 1 or not re.fullmatch(r"[a-f0-9-]{36}", revision):
        raise ValueError("Invalid request protocol or revision")
    content = request.get("nginx")
    if not isinstance(content, str) or len(content.encode()) > MAX_REQUEST:
        raise ValueError("Invalid nginx configuration size")
    roots = request.get("roots", [])
    if not isinstance(roots, list) or len(roots) > 200:
        raise ValueError("Invalid document root list")
    for root in roots:
        mkdir_root(root)
    candidate = RUN / "candidate.conf"
    active = RUN / "nginx.conf"
    previous = active.read_text()
    swapped = False
    try:
        atomic_write(candidate, content)
        nginx("-t", "-c", "candidate.conf")
        atomic_write(RUN / "nginx.previous.conf", previous)
        atomic_write(active, content)
        swapped = True
        nginx("-s", "reload", "-c", "nginx.conf")
        time.sleep(0.3)
        if process.poll() is not None:
            raise RuntimeError("nginx exited after reload")
        status(revision, "applied", "nginx -t sikeres; az újratöltési jel elküldve, a master folyamat fut. Ez nem külső elérhetőségi teszt.")
        print(f"WebNest applied {revision}", flush=True)
    except (subprocess.SubprocessError, OSError, RuntimeError) as exc:
        detail = getattr(exc, "stderr", None) or str(exc)
        rollback = ""
        if swapped:
            atomic_write(active, previous)
            try:
                nginx("-s", "reload", "-c", "nginx.conf")
                rollback = " Az előző konfiguráció visszaállítva."
            except (subprocess.SubprocessError, OSError) as rollback_error:
                rollback = f" FIGYELEM: a visszaállítás újratöltése is hibás: {rollback_error}."
        status(revision, "failed", f"Az alkalmazás sikertelen: {detail}.{rollback}")
        print(f"WebNest failed {revision}: {detail}", file=sys.stderr, flush=True)
    finally:
        candidate.unlink(missing_ok=True)


def stop(_signum, _frame) -> None:
    global STOP
    STOP = True


def main() -> int:
    port_text = os.environ.get("SERVER_PORT", "8080")
    if not port_text.isdecimal() or not 1024 <= int(port_text) <= 65535:
        print("SERVER_PORT must be 1024–65535", file=sys.stderr)
        return 1
    for path in (STATE, RUN):
        if path.is_symlink():
            raise ValueError("Management directories cannot be symlinks")
        path.mkdir(exist_ok=True)
    for name in ("client_temp", "proxy_temp", "fastcgi_temp"):
        (RUN / name).mkdir(exist_ok=True)
    shutil.copyfile("/etc/nginx/mime.types", RUN / "mime.types")
    # These two values are set from the trusted-edge scheme map by the renderer.
    # Do not send conflicting duplicate FastCGI parameters from distro defaults.
    params = Path("/etc/nginx/fastcgi_params").read_text()
    atomic_write(RUN / "fastcgi_params", "\n".join(
        line for line in params.splitlines()
        if not re.match(r"\s*fastcgi_param\s+(?:HTTPS|REQUEST_SCHEME)\s", line)
    ) + "\n")
    active = RUN / "nginx.conf"
    if not active.exists():
        atomic_write(active, f"""worker_processes 1;
pid nginx.pid;
error_log stderr warn;
events {{ worker_connections 1024; }}
http {{
    include mime.types;
    access_log /dev/stdout;
    client_body_temp_path client_temp;
    proxy_temp_path proxy_temp;
    fastcgi_temp_path fastcgi_temp;
    server {{ listen {int(port_text)} default_server; server_name _; return 404; }}
}}
""")
    nginx("-t", "-c", "nginx.conf")
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    php = subprocess.Popen(["php-fpm", "-F", "-y", "/opt/webnest/php-fpm.conf"])
    web = subprocess.Popen(["nginx", "-p", str(RUN) + "/", "-c", "nginx.conf", "-g", "daemon off;"])
    last_revision = ""
    try:
        old_status = json.loads((STATE / "status.json").read_text())
        last_revision = old_status.get("revision", "")
    except (OSError, ValueError):
        pass
    atomic_write(STATE / "capabilities.json", json.dumps({"protocol": 1, "runtime": "0.1.0", "php": "8.4"}))
    print("WebNest ready", flush=True)
    try:
        while not STOP:
            if php.poll() is not None or web.poll() is not None:
                print("A managed process exited; stopping server", file=sys.stderr, flush=True)
                return 1
            request_file = STATE / "request.json"
            if request_file.exists():
                try:
                    if request_file.stat().st_size > MAX_REQUEST:
                        raise ValueError("Request exceeds 1 MiB")
                    request = json.loads(request_file.read_text())
                    revision = request.get("revision", "")
                    if revision != last_revision:
                        # Record the revision even on failure; do not retry a broken
                        # configuration every second indefinitely.
                        last_revision = revision
                        try:
                            apply_request(request, web)
                        except (ValueError, OSError) as exc:
                            status(str(revision)[:100], "failed", str(exc))
                except (ValueError, OSError) as exc:
                    print(f"Unreadable request: {exc}", file=sys.stderr, flush=True)
                    time.sleep(4)
            time.sleep(1)
    finally:
        (STATE / "capabilities.json").unlink(missing_ok=True)
        for proc in (web, php):
            if proc.poll() is None:
                proc.terminate()
        for proc in (web, php):
            try:
                proc.wait(timeout=8)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
