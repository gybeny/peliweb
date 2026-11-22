"""Automatic configuration regressions, including real unprivileged services."""
import contextlib
from http.client import HTTPConnection, HTTPException
import io
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import unittest
import uuid
from unittest.mock import Mock, patch

ROOT = Path(__file__).parents[2]
sys.path.insert(0, str(ROOT / "runtime"))
import configuration
import manager
from configuration import Settings, TEMP_DIRS, normalize_nginx

MIME = "types { text/html html; text/plain txt; }\n"
FASTCGI = """fastcgi_param REQUEST_METHOD $request_method;
fastcgi_param QUERY_STRING $query_string;
fastcgi_param CONTENT_TYPE $content_type;
fastcgi_param CONTENT_LENGTH $content_length;
fastcgi_param REDIRECT_STATUS 200;
fastcgi_param HTTPS $https;
fastcgi_param REQUEST_SCHEME $scheme;
"""


class ConfigurationTests(unittest.TestCase):
    def test_all_egg_defaults_match_runtime(self):
        egg = json.loads((ROOT / "runtime/egg-webnest.json").read_text())
        defaults = {v["env_variable"]: v["default_value"] for v in egg["variables"]}
        self.assertEqual(len(defaults), 11)
        self.assertEqual(Settings.from_env(defaults), Settings())

    def test_invalid_settings_rejected(self):
        for env in (
            {"SERVER_PORT": "80"}, {"SERVER_PORT": "not-a-port"},
            {"WEBNEST_NGINX_WORKERS": "100"},
            {"WEBNEST_NGINX_CONNECTIONS": "1"},
            {"WEBNEST_PHP_CHILDREN": "0"},
            {"WEBNEST_PHP_MEMORY_MB": "256;include=/tmp/evil"},
            {"WEBNEST_LOG_LEVEL": "warn;events{}"},
            {"WEBNEST_ACCESS_LOG": "yes"},
            {"WEBNEST_PHP_EXECUTION_TIME": "999999"},
        ):
            with self.subTest(env=env), self.assertRaises(ValueError):
                Settings.from_env(env)

    def test_nginx_migration_covers_every_temp_path_and_port(self):
        old = """worker_processes 1;
pid nginx.pid;
error_log stderr warn;
events { worker_connections 1024; }
http {
access_log /dev/stdout;
client_body_temp_path client_temp;
proxy_temp_path proxy_temp;
fastcgi_temp_path fastcgi_temp;
server { listen 8080 default_server; return 404; }
}
"""
        settings = Settings(port=9090, workers=2, keepalive=30)
        result = normalize_nginx(old, Path("/home/container/webnest/run"), settings)
        for name in TEMP_DIRS:
            self.assertIn(f'/home/container/webnest/run/{name}"', result)
        self.assertNotIn("/dev/stdout", result)
        self.assertIn("listen 9090", result)
        self.assertIn("worker_processes 2;", result)
        self.assertIn("keepalive_timeout 30;", result)
        self.assertEqual(normalize_nginx(result, Path("/home/container/webnest/run"), settings), result)

    def test_php_generated_from_settings(self):
        config = configuration.php_fpm(Path("/home/container"), Path("/home/container/webnest/run"),
                                       Settings(php_children=12, php_memory=512, php_execution=240))
        self.assertIn("pm.max_children = 12", config)
        self.assertIn("php_value[memory_limit] = 512M", config)
        self.assertIn("php_value[max_execution_time] = 240", config)
        self.assertNotIn("/proc/self/fd", config)


class PreparationTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.home = Path(temporary.name)
        self.state = self.home / "webnest"
        self.run = self.state / "run"
        self.source = self.home / "etc"
        self.source.mkdir()
        (self.source / "mime.types").write_text(MIME)
        (self.source / "fastcgi_params").write_text(FASTCGI)
        for name, value in (("HOME", self.home), ("STATE", self.state), ("RUN", self.run), ("NGINX_CONF", self.source)):
            p = patch.object(manager, name, value)
            p.start()
            self.addCleanup(p.stop)

    def prepare(self):
        with patch.object(manager, "nginx") as nginx, patch.object(manager.subprocess, "run") as php:
            manager.prepare(Settings())
            return nginx, php

    def test_prepares_every_directory_and_preserves_customer_page(self):
        page = self.home / "sites/default/public/index.html"
        page.parent.mkdir(parents=True)
        page.write_text("KEEP CUSTOMER PAGE")
        nginx, php = self.prepare()
        self.assertEqual(page.read_text(), "KEEP CUSTOMER PAGE")
        for name in TEMP_DIRS:
            self.assertTrue((self.run / name).is_dir())
        self.assertIn('uwsgi_temp_path "', (self.run / "nginx.conf").read_text())
        self.assertIn("php-fpm.conf", str(php.call_args))
        self.assertEqual(nginx.call_count, 1)
        self.assertNotIn("fastcgi_param HTTPS", (self.run / "fastcgi_params").read_text())

    def test_recovers_last_known_good_without_losing_rejected_config(self):
        self.run.mkdir(parents=True)
        (self.run / "nginx.conf").write_text("events {}\nhttp {\nbroken on;\n}\n")
        previous = "events {}\nhttp {\nserver { listen 8080; return 404; }\n}\n"
        (self.run / "nginx.previous.conf").write_text(previous)
        with patch.object(manager, "nginx", side_effect=[
            subprocess.CalledProcessError(1, "nginx", stderr="unknown directive"),
            Mock(),
        ]), patch.object(manager.subprocess, "run"):
            manager.prepare(Settings())
        self.assertIn("broken on", (self.run / "nginx.rejected.conf").read_text())
        self.assertNotIn("broken on", (self.run / "nginx.conf").read_text())

    def test_fatal_startup_prints_nginx_reason_and_clears_stale_capability(self):
        self.run.mkdir(parents=True)
        (self.state / "capabilities.json").write_text('{"protocol":1}')
        with patch.object(manager, "nginx", side_effect=subprocess.CalledProcessError(
            1, "nginx", stderr='nginx: [emerg] permission denied: /var/lib/nginx/tmp/uwsgi'
        )), patch.object(manager.subprocess, "Popen") as popen, contextlib.redirect_stderr(io.StringIO()) as console:
            self.assertEqual(manager.main(), 1)
        self.assertIn("/var/lib/nginx/tmp/uwsgi", console.getvalue())
        self.assertEqual(json.loads((self.state / "runtime-status.json").read_text())["state"], "failed")
        self.assertFalse((self.state / "capabilities.json").exists())
        popen.assert_not_called()

    def test_second_process_spawn_failure_cleans_up_php(self):
        self.run.mkdir(parents=True)
        php = Mock()
        php.poll.return_value = None
        with patch.object(manager, "prepare"), patch.object(manager.subprocess, "Popen", side_effect=[
            php, OSError("nginx executable missing")
        ]), contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(manager.main(), 1)
        php.terminate.assert_called_once()
        php.wait.assert_called_once()

    def test_symlink_temp_directory_rejected(self):
        self.run.mkdir(parents=True)
        (self.run / "uwsgi_temp").symlink_to(self.source, target_is_directory=True)
        with self.assertRaises(ValueError):
            manager.prepare(Settings())


@unittest.skipUnless(shutil.which("nginx") and shutil.which("php-fpm") and os.geteuid() != 0,
                     "Real nginx/PHP-FPM and a non-root user required")
class RealRuntimeTests(unittest.TestCase):
    def test_cold_start_php_deploy_rejection_and_restart_without_manual_configs(self):
        with socket.socket() as check:
            try:
                check.bind(("127.0.0.1", 9000))
            except OSError:
                self.skipTest("PHP port 9000 is in use by another service")
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory)
            source = home / "etc"
            source.mkdir()
            (source / "mime.types").write_text(MIME)
            (source / "fastcgi_params").write_text(FASTCGI)
            with socket.socket() as choose:
                choose.bind(("127.0.0.1", 0))
                port = choose.getsockname()[1]
            boot = (
                "import sys;from pathlib import Path;import manager;"
                "manager.HOME=Path(sys.argv[1]);manager.STATE=manager.HOME/'webnest';"
                "manager.RUN=manager.STATE/'run';manager.NGINX_CONF=manager.HOME/'etc';"
                "raise SystemExit(manager.main())"
            )
            state = home / "webnest"
            def http():
                connection = HTTPConnection("127.0.0.1", port, timeout=1)
                try:
                    connection.request("GET", "/")
                    response = connection.getresponse()
                    return response.status, response.read().decode()
                finally:
                    connection.close()
            def wait(check, process, log):
                deadline = time.monotonic() + 20
                while time.monotonic() < deadline:
                    if process.poll() is not None:
                        self.fail(log.read_text())
                    try:
                        if check():
                            return
                    except (OSError, ValueError, HTTPException):
                        pass
                    time.sleep(0.1)
                self.fail("Timed out: " + log.read_text())
            for attempt in range(2):
                log = home / f"console-{attempt}.log"
                with log.open("w") as output:
                    process = subprocess.Popen([sys.executable, "-u", "-c", boot, str(home)],
                        cwd=ROOT / "runtime", stdout=output, stderr=subprocess.STDOUT,
                        env={**os.environ, "SERVER_PORT": str(port), "WEBNEST_NGINX_WORKERS": "2"})
                    try:
                        wait(lambda: json.loads((state / "capabilities.json").read_text())["runtime"] == "0.1.1" and http()[0] == 200, process, log)
                        if attempt == 0:
                            self.assertIn("WebNest", http()[1])
                            site = home / "sites/test/public"
                            site.mkdir(parents=True)
                            (site / "index.php").write_text('<?php echo "real-php-ok";')
                            config = f"""worker_processes 1;
events {{ worker_connections 1024; }}
http {{
include mime.types;
server {{ listen 8080;
root "{site}";
location / {{
include fastcgi_params;
fastcgi_param SCRIPT_FILENAME $document_root/index.php;
fastcgi_pass 127.0.0.1:9000;
}}
}}
}}
"""
                            def deploy(content):
                                revision = str(uuid.uuid4())
                                temporary = state / "test-request.tmp"
                                temporary.write_text(json.dumps({"protocol": 1, "revision": revision,
                                    "nginx": content, "roots": ["sites/test/public"]}))
                                temporary.replace(state / "request.json")
                                return revision
                            def result_is(revision, expected):
                                result = json.loads((state / "status.json").read_text())
                                return result["revision"] == revision and result["state"] == expected
                            revision = deploy(config)
                            wait(lambda: result_is(revision, "applied") and http() == (200, "real-php-ok"), process, log)
                            invalid = deploy(config.replace("include mime.types;", "invalid_webnest_directive on;"))
                            wait(lambda: result_is(invalid, "failed") and http() == (200, "real-php-ok"), process, log)
                        else:
                            self.assertEqual(http(), (200, "real-php-ok"))
                            self.assertEqual((home / "sites/test/public/index.php").read_text(), '<?php echo "real-php-ok";')
                    finally:
                        process.terminate()
                        try:
                            process.wait(timeout=12)
                        except subprocess.TimeoutExpired:
                            process.kill()
                            process.wait()
                self.assertEqual(process.returncode, 0, log.read_text())
                self.assertFalse((state / "capabilities.json").exists())


class SetupScriptTests(unittest.TestCase):
    def test_failed_smoke_test_does_not_replace_existing_image_tag(self):
        self.run_setup(fail=True)

    def test_successful_smoke_test_precedes_image_activation(self):
        self.run_setup(fail=False)

    def run_setup(self, fail):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            commands = folder / "commands"
            docker = folder / "docker"
            docker.write_text('#!/bin/sh\nprintf "%s\\n" "$*" >> "$WEBNEST_TEST_COMMANDS"\nif [ "$1" = run ] && [ "$WEBNEST_TEST_FAIL" = 1 ]; then exit 9; fi\nexit 0\n')
            docker.chmod(0o755)
            result = subprocess.run(["/bin/sh", str(ROOT / "runtime/setup.sh")], capture_output=True, text=True,
                env={**os.environ, "PATH": str(folder) + os.pathsep + os.environ["PATH"],
                    "WEBNEST_TEST_COMMANDS": str(commands), "WEBNEST_TEST_FAIL": "1" if fail else "0"})
            lines = commands.read_text().splitlines()
            if fail:
                self.assertNotEqual(result.returncode, 0)
                self.assertFalse(any(line.startswith("tag ") for line in lines))
            else:
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertLess(next(i for i, line in enumerate(lines) if line.startswith("run ")),
                                next(i for i, line in enumerate(lines) if line.startswith("tag ")))


if __name__ == "__main__":
    unittest.main()
