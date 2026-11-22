#!/usr/bin/env python3
"""WebNest protocol v1: unprivileged nginx/PHP-FPM supervisor for Pelican Wings.

No network management endpoint, no Docker socket, no host mounts, no shell eval.
The panel transfers requests/results through Wings' existing file API.
"""
from __future__ import annotations

import json
import http.client
import os
from pathlib import Path
import re
import signal
import socket
import subprocess
import sys
import time
from datetime import datetime, timezone
from configuration import Settings, TEMP_DIRS, VERSION, apply_connections, bootstrap_nginx, normalize_nginx, php_fpm

HOME = Path("/home/container")
STATE = HOME / "webnest"
RUN = STATE / "run"
STOP = False
MAX_REQUEST = 1024 * 1024
NGINX_CONF = Path("/etc/nginx")


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
        ["nginx", "-e", "stderr", "-p", str(RUN) + "/", *args],
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


def apply_request(request: dict, process: subprocess.Popen, settings=None) -> None:
    if not isinstance(request, dict):
        raise ValueError("The request must be a JSON object")
    revision = request.get("revision", "")
    if request.get("protocol") != 1 or not isinstance(revision, str) or not re.fullmatch(r"[a-f0-9-]{36}", revision):
        raise ValueError("Invalid request protocol or revision")
    content = request.get("nginx")
    if not isinstance(content, str) or len(content.encode()) > MAX_REQUEST:
        raise ValueError("Invalid nginx configuration size")
    settings = settings or Settings.from_env()
    content = apply_connections(normalize_nginx(content, RUN, settings), settings)
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


def prepare(settings: Settings) -> None:
    """Prepare all script-owned files without overwriting customer content."""
    for path in (STATE, RUN):
        if path.is_symlink():
            raise ValueError("Management directories cannot be symlinks")
        path.mkdir(exist_ok=True)
    for name in TEMP_DIRS:
        if (RUN / name).is_symlink():
            raise ValueError(f"Symlink temporary directory: {name}")
        (RUN / name).mkdir(exist_ok=True)
    for name in ("mime.types", "fastcgi_params", "access.log", "php-fpm-error.log", "php-error.log", "capabilities.json"):
        path = (STATE if name == "capabilities.json" else RUN) / name
        if path.is_symlink():
            raise ValueError(f"Symlink management file: {name}")
    (STATE / "capabilities.json").unlink(missing_ok=True)
    atomic_write(RUN / "mime.types", (NGINX_CONF / "mime.types").read_text())
    # These two values are set from the trusted-edge scheme map by the renderer.
    # Do not send conflicting duplicate FastCGI parameters from distro defaults.
    params = (NGINX_CONF / "fastcgi_params").read_text()
    atomic_write(RUN / "fastcgi_params", "\n".join(
        line for line in params.splitlines()
        if not re.match(r"\s*fastcgi_param\s+(?:HTTPS|REQUEST_SCHEME)\s", line)
    ) + "\n")
    mkdir_root("sites/default/public")
    welcome = HOME / "sites/default/public/index.html"
    if welcome.is_symlink():
        raise ValueError("Symlink welcome page is not supported")
    if not welcome.exists():
        atomic_write(welcome, '<!doctype html><meta charset="utf-8"><title>WebNest</title><h1>A WebNest futtatókörnyezet elindult.</h1><p>A webhelyeket a Pelican Webhelykezelő menüjében állíthatod be.</p>')
    for name in ("access.log", "php-fpm-error.log", "php-error.log"):
        (RUN / name).touch(exist_ok=True)
    atomic_write(RUN / "php-fpm.conf", php_fpm(HOME, RUN, settings))
    active = RUN / "nginx.conf"
    if active.is_symlink():
        raise ValueError("Symlink active configuration is not supported")
    old = active.read_text() if active.exists() else ""
    config = old or bootstrap_nginx(HOME, RUN, settings)
    config = apply_connections(normalize_nginx(config, RUN, settings), settings)
    atomic_write(RUN / "startup-candidate.conf", config)
    try:
        nginx("-t", "-c", "startup-candidate.conf")
    except subprocess.SubprocessError:
        # Never replace a site's invalid config with an empty default silently.
        previous = RUN / "nginx.previous.conf"
        if not old or not previous.is_file() or previous.is_symlink():
            raise
        recovered = apply_connections(normalize_nginx(previous.read_text(), RUN, settings), settings)
        atomic_write(RUN / "startup-candidate.conf", recovered)
        nginx("-t", "-c", "startup-candidate.conf")
        atomic_write(RUN / "nginx.rejected.conf", old)
        config = recovered
        print("WebNest FIGYELEM: hibás aktív konfiguráció; az utolsó működő konfiguráció helyreállítva. Mentés: webnest/run/nginx.rejected.conf", file=sys.stderr, flush=True)
    if old and old != config:
        atomic_write(RUN / "nginx.before-runtime-upgrade.conf", old)
    atomic_write(active, config)
    (RUN / "startup-candidate.conf").unlink(missing_ok=True)
    subprocess.run(
        ["php-fpm", "-t", "-y", str(RUN / "php-fpm.conf")],
        capture_output=True, text=True, timeout=15, check=True,
    )


def wait_ready(php, web, port: int) -> None:
    deadline = time.monotonic() + 15
    last_error = ""
    while time.monotonic() < deadline and not STOP:
        if php.poll() is not None or web.poll() is not None:
            raise RuntimeError("Az nginx vagy PHP-FPM az indulás közben leállt.")
        connection = http.client.HTTPConnection("127.0.0.1", port, timeout=0.5)
        try:
            with socket.create_connection(("127.0.0.1", 9000), timeout=0.5):
                pass
            connection.request("HEAD", "/", headers={"Host": "localhost"})
            connection.getresponse().read()
            return
        except (OSError, http.client.HTTPException) as exc:
            last_error = str(exc)
            time.sleep(0.1)
        finally:
            connection.close()
    raise RuntimeError(f"A szolgáltatások nem lettek készek 15 másodpercen belül: {last_error}")


def rotate_logs() -> None:
    for name in ("access.log", "php-fpm-error.log", "php-error.log"):
        path = RUN / name
        if path.is_symlink():
            raise ValueError(f"Symlink log file: {name}")
        if path.exists() and path.stat().st_size > 5 * 1024 * 1024:
            # Keep the same inode: nginx/FPM hold it open. Save one bounded tail.
            with path.open("rb+") as log:
                log.seek(-1024 * 1024, os.SEEK_END)
                tail = log.read()
                atomic_write(RUN / (name + ".previous"), tail.decode("utf-8", errors="replace"))
                log.truncate(0)


def main() -> int:
    global STOP
    STOP = False
    php = web = None
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    try:
        settings = Settings.from_env()
        prepare(settings)
        atomic_write(STATE / "runtime-status.json", json.dumps({"state": "starting", "runtime": VERSION}))
        php = subprocess.Popen(["php-fpm", "-F", "-y", str(RUN / "php-fpm.conf")])
        web = subprocess.Popen(["nginx", "-e", "stderr", "-p", str(RUN) + "/", "-c", "nginx.conf", "-g", "daemon off;"])
        wait_ready(php, web, settings.port)
        last_revision = ""
        try:
            old_status = json.loads((STATE / "status.json").read_text())
            last_revision = old_status.get("revision", "") if isinstance(old_status, dict) and old_status.get("state") == "applied" else ""
        except (OSError, ValueError):
            pass
        atomic_write(STATE / "capabilities.json", json.dumps({"protocol": 1, "runtime": VERSION, "php": "8.4"}))
        atomic_write(STATE / "runtime-status.json", json.dumps({"state": "ready", "runtime": VERSION, "port": settings.port}))
        print(f"WebNest ready · runtime {VERSION} · port {settings.port}", flush=True)
        while not STOP:
            if php.poll() is not None or web.poll() is not None:
                raise RuntimeError("Az nginx vagy PHP-FPM leállt; a másik folyamatot is leállítjuk.")
            request_file = STATE / "request.json"
            if request_file.exists():
                try:
                    if request_file.stat().st_size > MAX_REQUEST:
                        raise ValueError("Request exceeds 1 MiB")
                    request = json.loads(request_file.read_text())
                    if not isinstance(request, dict):
                        raise ValueError("The request must be a JSON object")
                    revision = request.get("revision", "")
                    if revision != last_revision:
                        # Record the revision even on failure; do not retry a broken
                        # configuration every second indefinitely.
                        last_revision = revision
                        try:
                            apply_request(request, web, settings)
                        except (ValueError, OSError) as exc:
                            status(str(revision)[:100], "failed", str(exc))
                except (ValueError, OSError) as exc:
                    print(f"Unreadable request: {exc}", file=sys.stderr, flush=True)
                    time.sleep(4)
            rotate_logs()
            time.sleep(1)
        atomic_write(STATE / "runtime-status.json", json.dumps({"state": "stopped", "runtime": VERSION}))
        return 0
    except (ValueError, OSError, RuntimeError, subprocess.SubprocessError) as exc:
        detail = getattr(exc, "stderr", None) or getattr(exc, "stdout", None) or str(exc)
        if isinstance(detail, bytes):
            detail = detail.decode("utf-8", errors="replace")
        print(f"WebNest indulási/futtatási hiba:\n{detail}", file=sys.stderr, flush=True)
        try:
            if not STATE.is_symlink() and STATE.is_dir():
                atomic_write(STATE / "runtime-status.json", json.dumps({"state": "failed", "runtime": VERSION, "message": str(detail)[:8000]}, ensure_ascii=False))
            for name in ("php-fpm-error.log", "php-error.log"):
                path = RUN / name
                if path.is_file() and not path.is_symlink():
                    with path.open("rb") as log:
                        log.seek(max(0, path.stat().st_size - 4000))
                        print(log.read().decode("utf-8", errors="replace"), file=sys.stderr)
        except (OSError, ValueError):
            pass
        return 1
    finally:
        if STATE.is_dir() and not STATE.is_symlink():
            try:
                (STATE / "capabilities.json").unlink(missing_ok=True)
            except OSError as exc:
                print(f"WebNest: a kész állapot jelzője nem törölhető: {exc}", file=sys.stderr)
        for proc in (p for p in (web, php) if p is not None):
            if proc.poll() is None:
                proc.terminate()
        for proc in (p for p in (web, php) if p is not None):
            try:
                proc.wait(timeout=8)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait()


if __name__ == "__main__":
    raise SystemExit(main())
