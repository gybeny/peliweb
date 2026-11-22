#!/usr/bin/env python3
"""Reproducible delivery bundles; run from repository root."""
from pathlib import Path
import hashlib
import json
import runpy
import shutil
import zipfile

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "artifacts/webnest/public/downloads"
OUT.mkdir(parents=True, exist_ok=True)
PLUGIN = ROOT / "plugins/webnest"
configure = runpy.run_path(str(ROOT / "runtime/configure-egg.py"))["configure"]
local_egg = configure(json.loads((ROOT / "runtime/egg-webnest.json").read_text()), "~webnest-runtime:php84")
local_egg_json = json.dumps(local_egg, ensure_ascii=False, indent=2) + "\n"
(OUT / "egg-webnest-local.json").write_text(local_egg_json, encoding="utf-8")

with zipfile.ZipFile(OUT / "webnest-plugin.zip", "w", zipfile.ZIP_DEFLATED) as bundle:
    for path in sorted(PLUGIN.rglob("*")):
        if path.is_file() and "__pycache__" not in path.parts:
            bundle.write(path, Path("webnest") / path.relative_to(PLUGIN))

with zipfile.ZipFile(OUT / "webnest-runtime.zip", "w", zipfile.ZIP_DEFLATED) as bundle:
    for folder in ("runtime", "edge"):
        for path in sorted((ROOT / folder).rglob("*")):
            if path.is_file() and "__pycache__" not in path.parts:
                bundle.write(path, path.relative_to(ROOT))
    bundle.write(ROOT / "docs/TELEPITES.md", "TELEPITES.md")
    bundle.writestr("runtime/egg-webnest-local.json", local_egg_json)

shutil.copyfile(ROOT / "runtime/egg-webnest.json", OUT / "egg-webnest.json")
shutil.copyfile(ROOT / "docs/TELEPITES.md", OUT / "TELEPITES.md")
lines = []
for path in sorted(OUT.iterdir()):
    if path.is_file() and path.name != "SHA256SUMS":
        lines.append(f"{hashlib.sha256(path.read_bytes()).hexdigest()}  {path.name}")
(OUT / "SHA256SUMS").write_text("\n".join(lines) + "\n")
print("Packaged plugin, runtime, egg, guide and SHA256 checksums.")
