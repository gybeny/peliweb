#!/bin/sh
# Run on the operator's Wings host, never inside a hosted website container.
set -eu
DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
TAG=webnest-runtime:php84
CANDIDATE="webnest-runtime:check-$(date +%s)-$$"
BUILT=0

cleanup() {
    if [ "$BUILT" = 1 ]; then
        docker image rm "$CANDIDATE" >/dev/null 2>&1 || true
    fi
}
trap cleanup EXIT
command -v docker >/dev/null 2>&1 || {
    echo "HIBA: Docker szükséges ezen a Wings gépen." >&2
    exit 1
}
docker info >/dev/null 2>&1 || {
    echo "HIBA: a Docker daemon nem érhető el. Futtasd rootként vagy Docker-jogosultsággal." >&2
    exit 1
}
for name in Dockerfile manager.py configuration.py selftest.py; do
    [ -f "$DIR/$name" ] || {
        echo "HIBA: hiányos runtime csomag: $name" >&2
        exit 1
    }
done

echo "[WebNest] 1/3 Runtime építése. A régi image és a szerverfájlok változatlanok maradnak."
docker build --pull -t "$CANDIDATE" "$DIR"
BUILT=1
echo "[WebNest] 2/3 Automatikus, nem-root nginx/PHP működési teszt ideiglenes köteten."
docker run --rm --network none --read-only \
    --tmpfs /home/container:rw,uid=1000,gid=1000,mode=0755 \
    --tmpfs /tmp:rw,mode=1777 \
    --entrypoint python3 "$CANDIDATE" /opt/webnest/selftest.py
echo "[WebNest] 3/3 A sikeresen tesztelt image aktiválása."
docker tag "$CANDIDATE" "$TAG"
docker image inspect "$TAG" --format '{{.Id}}'
echo ""
echo "Elkészült. Pelican image: ~$TAG"
echo "Ha a szerver már ezt használja, elegendő újraindítani a Pelicanben."
echo "Az új egg változóihoz a meglévő egget frissítsd az egg-webnest-local.json fájlból."
echo "A script nem módosított weboldalfájlt, Wings-beállítást vagy futó szervert."
