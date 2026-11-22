#!/usr/bin/env python3
"""Generate an rc4 egg using an operator-supplied, already built runtime image.

This tool does NOT build/publish an image or verify registry authentication.
"""
import argparse
import json
from pathlib import Path
import re
import sys


def validate_image(image: str) -> str:
    if image != image.strip() or any(c.isspace() for c in image) or "://" in image:
        raise ValueError("Image-nevet adj meg, protokoll, jelszó és szóköz nélkül.")
    reference = image[1:] if image.startswith("~") else image
    if not re.fullmatch(r"[a-z0-9][a-z0-9._:/-]*(?:@sha256:[a-f0-9]{64})?", reference):
        raise ValueError("Érvénytelen image-hivatkozás.")
    if "@" not in image and ":" not in image.rsplit("/", 1)[-1]:
        raise ValueError("Adj meg kifejezett taget vagy sha256 digestet.")
    host = reference.split("/", 1)[0].split(":", 1)[0]
    if host == "example" or host.endswith((".example", ".example.org", ".example.com", ".example.net")) or host in ("example.org", "example.com", "example.net"):
        raise ValueError("A példacím nem használható. Előbb építsd meg és töltsd fel a saját WebNest image-et.")
    return image


def configure(template: dict, image: str) -> dict:
    image = validate_image(image)
    # Roundtrip clone so repeated use cannot mutate the source template.
    egg = json.loads(json.dumps(template))
    egg["_comment"] = (
        f"Local Wings image: build {image[1:]} on the SAME node first. The leading ~ disables registry pulling; it is not part of the Docker build tag."
        if image.startswith("~") else
        "Configured WebNest egg. Registry availability and Wings pull access must be checked by the operator."
    )
    egg["docker_images"] = {"WebNest PHP 8.4": image}
    egg["description"] = "WebNest · PHP 8.4-FPM + nginx + protocol-v1 supervisor. Saját WebNest runtime szükséges; tetszőleges PHP image nem kompatibilis."
    return egg


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--image", required=True, help="Az elkészített runtime image taggel/digesttel; helyi Wings image-hez ~ előtaggal.")
    parser.add_argument("--output", type=Path, default=Path("egg-webnest-configured.json"))
    args = parser.parse_args()
    try:
        template = json.loads((Path(__file__).resolve().parent / "egg-webnest.json").read_text())
        egg = configure(template, args.image)
        if args.output.resolve() == (Path(__file__).resolve().parent / "egg-webnest.json"):
            raise ValueError("A sablon nem írható felül; másik kimeneti fájlt adj meg.")
        # Do not silently overwrite the operator's prior configured file.
        with args.output.open("x", encoding="utf-8") as out:
            json.dump(egg, out, ensure_ascii=False, indent=2)
            out.write("\n")
    except (ValueError, OSError) as exc:
        print(str(exc), file=sys.stderr)
        return 1
    print(f"Elkészült: {args.output}. Ez nem registry- vagy Wings-kapcsolati teszt.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
