"""Fast isolated protocol checks; no server, Docker or network is started."""
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch
sys.path.insert(0, str(Path(__file__).parents[2] / "runtime"))

spec = importlib.util.spec_from_file_location("manager", Path(__file__).parents[2] / "runtime/manager.py")
manager = importlib.util.module_from_spec(spec)
spec.loader.exec_module(manager)


class RuntimeProtocolTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        home = Path(self.tmp.name)
        self.patchers = [
            patch.object(manager, "HOME", home),
            patch.object(manager, "STATE", home / "webnest"),
            patch.object(manager, "RUN", home / "webnest/run"),
            patch.object(manager.time, "sleep"),
        ]
        for p in self.patchers:
            p.start()
            self.addCleanup(p.stop)
        manager.RUN.mkdir(parents=True)
        (manager.RUN / "nginx.conf").write_text("previous config")
        self.process = Mock()
        self.process.poll.return_value = None
        self.request = {
            "protocol": 1, "revision": "11111111-1111-4111-a111-111111111111",
            "nginx": "worker_processes 1;\nevents { worker_connections 1024; }\nhttp {\nserver { listen 8080; return 404; }\n}\n", "roots": ["sites/test/public"],
        }

    def test_success_requires_nginx_test_and_reload(self):
        with patch.object(manager, "nginx") as nginx:
            manager.apply_request(self.request, self.process)
            self.assertEqual(nginx.call_args_list[0].args, ("-t", "-c", "candidate.conf"))
            self.assertEqual(nginx.call_args_list[1].args, ("-s", "reload", "-c", "nginx.conf"))
        result = json.loads((manager.STATE / "status.json").read_text())
        self.assertEqual(result["state"], "applied")
        self.assertEqual(result["revision"], self.request["revision"])

    def test_invalid_config_keeps_previous(self):
        with patch.object(manager, "nginx", side_effect=subprocess.CalledProcessError(1, "nginx", stderr="bad directive")):
            manager.apply_request(self.request, self.process)
        self.assertEqual((manager.RUN / "nginx.conf").read_text(), "previous config")
        self.assertEqual(json.loads((manager.STATE / "status.json").read_text())["state"], "failed")

    def test_reload_error_restores_previous(self):
        with patch.object(manager, "nginx", side_effect=[Mock(), subprocess.CalledProcessError(1, "nginx"), Mock()]):
            manager.apply_request(self.request, self.process)
        self.assertEqual((manager.RUN / "nginx.conf").read_text(), "previous config")
        self.assertEqual(json.loads((manager.STATE / "status.json").read_text())["state"], "failed")

    def test_parent_traversal_rejected(self):
        with self.assertRaises(ValueError):
            manager.mkdir_root("sites/../../etc")

    def test_symlink_root_rejected(self):
        (manager.HOME / "sites").symlink_to(manager.STATE, target_is_directory=True)
        with self.assertRaises(ValueError):
            manager.mkdir_root("sites/test/public")

    def test_protocol_rejected(self):
        with self.assertRaises(ValueError):
            manager.apply_request({**self.request, "protocol": 2}, self.process)


if __name__ == "__main__":
    unittest.main()
