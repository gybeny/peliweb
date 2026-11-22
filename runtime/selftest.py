#!/usr/bin/env python3
"""Disposable image smoke test. Invoked ONLY on a fresh temporary HOME volume."""
import http.client
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import uuid

from configuration import VERSION

HOME = Path("/home/container")


def request():
    connection = http.client.HTTPConnection("127.0.0.1", 8080, timeout=1)
    try:
        connection.request("GET", "/")
        response = connection.getresponse()
        return response.status, response.read().decode()
    finally:
        connection.close()


def eventually(check, process, timeout=25):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeError("A runtime az image tesztje közben leállt.")
        try:
            if check():
                return
        except (OSError, ValueError, http.client.HTTPException):
            pass
        time.sleep(0.2)
    raise RuntimeError("Időtúllépés az image működési tesztjében.")


def main():
    if os.geteuid() == 0:
        raise RuntimeError("A tesztnek a konténer nem-root felhasználójával kell futnia.")
    if (HOME / "sites").exists() or (HOME / "webnest").exists():
        raise RuntimeError("Az image tesztje csak üres, ideiglenes köteten futtatható.")
    log = HOME / "selftest.log"
    process = None
    try:
        with log.open("w") as output:
            process = subprocess.Popen(
                [sys.executable, "-u", "/opt/webnest/manager.py"],
                stdout=output, stderr=subprocess.STDOUT,
                env={**os.environ, "SERVER_PORT": "8080"},
            )
            eventually(lambda: request()[0] == 200 and json.loads(
                (HOME / "webnest/capabilities.json").read_text())["runtime"] == VERSION, process)
            root = HOME / "sites/selftest/public"
            root.mkdir(parents=True)
            (root / "index.php").write_text('<?php echo "webnest-php-ok";')
            config = f"""worker_processes 1;
pid nginx.pid;
events {{ worker_connections 1024; }}
http {{
include mime.types;
server {{
listen 8080 default_server;
server_name _;
root "{root}";
location / {{
include fastcgi_params;
fastcgi_param SCRIPT_FILENAME $document_root/index.php;
fastcgi_pass 127.0.0.1:9000;
}}
}}
}}
"""
            state = HOME / "webnest"
            revision = str(uuid.uuid4())
            def write_request(content, revision):
                temporary = state / "selftest-request.tmp"
                temporary.write_text(json.dumps({
                    "protocol": 1, "revision": revision, "nginx": content,
                    "roots": ["sites/selftest/public"],
                }))
                temporary.replace(state / "request.json")
            def result_is(revision, expected):
                result = json.loads((state / "status.json").read_text())
                return result["revision"] == revision and result["state"] == expected
            write_request(config, revision)
            eventually(lambda: result_is(revision, "applied") and request() == (200, "webnest-php-ok"), process)
            bad_revision = str(uuid.uuid4())
            write_request(config.replace("include mime.types;", "unknown_webnest_directive on;"), bad_revision)
            eventually(lambda: result_is(bad_revision, "failed") and request() == (200, "webnest-php-ok"), process)
        print("WebNest image teszt sikeres: nem-root nginx/PHP, HTTP, PHP-végrehajtás, konfigurációalkalmazás és hibás konfiguráció elutasítása.")
        return 0
    except Exception:
        if log.exists():
            print(log.read_text()[-12000:], file=sys.stderr)
        raise
    finally:
        if process is not None:
            process.terminate()
            try:
                process.wait(timeout=12)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()


if __name__ == "__main__":
    raise SystemExit(main())
