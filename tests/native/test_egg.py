"""Offline checks for the exported rc4 egg and its actual embedded installer."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
import uuid

ROOT = Path(__file__).parents[2]
EGG = json.loads((ROOT / "runtime/egg-webnest.json").read_text())
spec = importlib.util.spec_from_file_location("configure_egg", ROOT / "runtime/configure-egg.py")
configurator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(configurator)


class EggTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name) / "server"
        self.root.mkdir()

    def install(self):
        return subprocess.run(
            ["/bin/sh", "-eu", "-c", EGG["scripts"]["installation"]["script"]],
            env={**os.environ, "WEBNEST_INSTALL_ROOT": str(self.root)},
            text=True, capture_output=True, timeout=10,
        )

    def test_rc4_schema_and_author(self):
        self.assertEqual(EGG["meta"]["version"], "PLCN_v3")
        self.assertEqual(str(uuid.UUID(EGG["uuid"])), EGG["uuid"])
        self.assertEqual(EGG["author"], "iHyro")
        self.assertEqual(EGG["startup_commands"]["WebNest"], "python3 -u /opt/webnest/manager.py")
        self.assertNotIn("startup", EGG)  # v3 uses startup_commands
        for key in ("files", "startup", "logs"):
            self.assertIsInstance(json.loads(EGG["config"][key]), dict)
        self.assertIn("WebNest ready", json.loads(EGG["config"]["startup"])["done"])
        # A Python-entrypoint runtime image is NOT a valid installer image:
        # Wings supplies the shell in Cmd, not an Entrypoint override.
        self.assertEqual(EGG["scripts"]["installation"]["container"], "alpine:3.22")
        self.assertEqual(EGG["scripts"]["installation"]["entrypoint"], "/bin/sh")

    def test_fresh_install_creates_report(self):
        result = self.install()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue((self.root / "sites/default/public/index.html").is_file())
        report = (self.root / "webnest/INSTALLATION.txt").read_text()
        self.assertIn("SIKERES", report)
        self.assertIn("NEM bizonyitja", report)

    def test_reinstall_preserves_website_and_runtime_state(self):
        self.assertEqual(self.install().returncode, 0)
        page = self.root / "sites/default/public/index.html"
        page.write_text("CUSTOMER CONTENT")
        request = self.root / "webnest/request.json"
        request.write_text('{"revision":"preserve-me"}')
        self.assertEqual(self.install().returncode, 0)
        self.assertEqual(page.read_text(), "CUSTOMER CONTENT")
        self.assertEqual(json.loads(request.read_text())["revision"], "preserve-me")

    def test_symlink_directory_refused_without_touching_target(self):
        target = self.root.parent / "elsewhere"
        target.mkdir()
        (self.root / "sites").symlink_to(target, target_is_directory=True)
        self.assertNotEqual(self.install().returncode, 0)
        self.assertEqual(list(target.iterdir()), [])

    def test_symlink_index_refused_and_failure_report_written(self):
        self.assertEqual(self.install().returncode, 0)
        target = self.root.parent / "secret.txt"
        target.write_text("DO NOT TOUCH")
        page = self.root / "sites/default/public/index.html"
        page.unlink()
        page.symlink_to(target)
        self.assertNotEqual(self.install().returncode, 0)
        self.assertEqual(target.read_text(), "DO NOT TOUCH")
        self.assertIn("SIKERTELEN", (self.root / "webnest/INSTALLATION.txt").read_text())

    def test_configurator_rejects_example_image(self):
        with self.assertRaises(ValueError):
            configurator.configure(EGG, "registry.example.org/webnest/runtime:php84")

    def test_local_wings_reference_accepted(self):
        result = configurator.configure(EGG, "~webnest-runtime:php84")
        self.assertEqual(list(result["docker_images"].values()), ["~webnest-runtime:php84"])
        self.assertEqual(result["scripts"]["installation"]["container"], "alpine:3.22")
        self.assertIn("SAME node", result["_comment"])

    def test_local_marker_does_not_bypass_validation(self):
        for image in ("~~webnest-runtime:php84", "~registry.example.org/runtime:php84", "~", "~runtime"):
            with self.subTest(image=image), self.assertRaises(ValueError):
                configurator.configure(EGG, image)

    def test_configurator_rejects_credentials_and_missing_tag(self):
        for image in ("https://ghcr.io/owner/runtime:php84", "user:password@registry/runtime:php84", "ghcr.io/owner/runtime", "image with space:tag"):
            with self.subTest(image=image), self.assertRaises(ValueError):
                configurator.configure(EGG, image)

    def test_configured_egg_keeps_installer_separate(self):
        image = "ghcr.io/test-owner/webnest-runtime:php84"
        result = configurator.configure(EGG, image)
        self.assertEqual(list(result["docker_images"].values()), [image])
        self.assertEqual(result["scripts"]["installation"]["container"], "alpine:3.22")
        self.assertEqual(result["uuid"], EGG["uuid"])
        self.assertNotEqual(result["docker_images"], EGG["docker_images"])


if __name__ == "__main__":
    unittest.main()
