import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Code, Panel } from "@/components/bits";

export function EggConfigurator() {
  const [image, setImage] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function download(event: FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    const reference = image.startsWith("~") ? image.slice(1) : image;
    const host = reference.split("/", 1)[0]?.split(":", 1)[0] || "";
    if (!/^[a-z0-9][a-z0-9._:/-]*(?:@sha256:[a-f0-9]{64})?$/.test(reference)
      || (!image.includes("@") && !image.split("/").at(-1)?.includes(":"))
      || host === "example" || /(^|\.)example\.(org|com|net)$|\.example$/.test(host)) {
      setError("Valódi, már elkészített WebNest runtime image-nevet adj meg taggel vagy digesttel. A példacím nem használható.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}downloads/egg-webnest.json`, { cache: "no-store" });
      if (!response.ok) throw new Error("Az egg sablon nem tölthető le.");
      const egg = await response.json();
      if (egg.meta?.version !== "PLCN_v3" || !egg.scripts?.installation?.script || !egg.startup_commands) {
        throw new Error("Hibás vagy elavult egg sablon.");
      }
      egg._comment = image.startsWith("~")
        ? "Local Wings image: build the image on the SAME node first. The leading ~ disables registry pulling; it is not part of the Docker build tag."
        : "Configured WebNest egg. Registry availability and Wings pull access must be checked by the operator.";
      egg.docker_images = { "WebNest PHP 8.4": image };
      egg.description = "WebNest · PHP 8.4-FPM + nginx + protocol-v1 supervisor. Saját WebNest runtime szükséges; tetszőleges PHP image nem kompatibilis.";
      const url = URL.createObjectURL(new Blob([JSON.stringify(egg, null, 2) + "\n"], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "egg-webnest-configured.json";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage(image.startsWith("~")
        ? "Helyi image-re beállítva. Ugyanezen a Wings node-on előbb meg kell építened az image-et, ~ nélküli Docker taggel. Ez nem ellenőrizte, hogy elkészült-e."
        : "Az egg elkészült a megadott image-névvel. Ez nem ellenőrizte a registry elérhetőségét vagy a Wings hozzáférését.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nem sikerült elkészíteni az egget.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Automatikus runtime telepítés és beállítás">
      <p className="text-sm text-muted-foreground mb-3">
        A script elkészíti és ellenőrzi a runtime-ot. Az nginx és PHP konfigurációját minden induláskor
        automatikusan kezeli; kézi konfigurációszerkesztés nem kell. A már korábban megépített image-et
        egyszer frissíteni kell az alábbi scripttel.
      </p>
      <details className="mb-3">
        <summary className="text-sm cursor-pointer font-medium">Haladó: egyedi registry vagy image használata</summary>
        <p className="text-xs text-muted-foreground my-3">
          Csak már elkészített WebNest image-nevet adj meg, ne jelszót. A korábbi registry.example.org példacím nem működik.
        </p>
      <form onSubmit={download} className="space-y-3">
        <label htmlFor="webnest-runtime-image" className="text-sm font-medium block">Elkészített WebNest runtime image</label>
        <Input id="webnest-runtime-image" value={image} onChange={(e) => setImage(e.target.value)}
          autoComplete="off" placeholder="Teljes image-név saját registryvel és taggel" required className="font-mono text-xs" />
        <Button type="submit" disabled={busy}>{busy ? "Előkészítés…" : "Beállított egg letöltése"}</Button>
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        {message && <p className="text-sm text-muted-foreground" role="status">{message}</p>}
      </form>
      </details>
      <p className="text-xs text-muted-foreground mt-3">
        A külön telepítőimage Alpine. A telepítés sikere nem jelenti azt, hogy a saját futtatóimage is elérhető.
        Ezt a registryben és a Wings node-on külön kell biztosítani.
      </p>
      <div className="mt-5 border-t pt-4">
        <h3 className="font-semibold text-sm mb-2">Automatikus telepítés vagy frissítés a Wings gépen</h3>
        <p className="text-sm text-muted-foreground mb-3">
          Töltsd le és másold a runtime ZIP-et a szervert futtató Wings gépre. Az SSH terminálban,
          a ZIP mappájából futtasd az alábbi parancsokat. Docker, unzip, internet és elegendő szabad tárhely szükséges.
          Rootként a sudo elhagyható.
        </p>
        <Code>{`builddir="$(mktemp -d /tmp/webnest-build.XXXXXX)"
unzip -n webnest-runtime.zip -d "$builddir" &&
sudo sh "$builddir/runtime/setup.sh"`}</Code>
        <p className="text-sm text-muted-foreground mt-3">
          A script külön image-et épít, ideiglenes köteten teszteli az nginx/PHP indulását,
          a PHP-kiszolgálást és a hibás konfiguráció elutasítását. Csak sikeres teszt után cseréli
          a helyi image taget. A futó szervereket és a weboldalfájlokat nem módosítja.
        </p>
        <p className="text-sm text-muted-foreground mt-3">
          Sikeres build után frissítsd a meglévő egget a <a className="underline" href={`${import.meta.env.BASE_URL}downloads/egg-webnest-local.json`} download>helyi Wings eggből</a>,
          majd a szerver Startup oldalán válaszd a <code>~webnest-runtime:php84</code> image-et.
          Ha már ezt használod, a sikeres scriptfutás után indítsd újra a szervert.
          A ~ jel a Pelicanben kell, a Docker build tagjében nem. A Wings így nem próbálja
          registryből letölteni. Meglévő szervert ne törölj és ne telepíts újra emiatt.
        </p>
        <p className="text-sm text-muted-foreground mt-3">
          Az új egg 11 működési beállítást jelenít meg a Pelican Startup oldalán: nginx workerek,
          kapcsolatszám, keepalive, naplózás; PHP folyamatok, újraindítási és üresjárati határok,
          memória, feltöltés és futásidő. Ezek újraindításkor automatikusan érvényesülnek.
          A webhelyenkénti domaineket, SSL-t, fejléceket és proxyt továbbra is a natív pluginban állíthatod.
        </p>
        <p className="text-xs text-muted-foreground mt-2">
          Másik node-ra költözéskor ott is meg kell építeni az image-et. Ne töröld Docker image
          takarítással; frissítésekhez rendszeresen építsd újra. Ez a fejlesztőkörnyezet nem futtatott Docker buildet.
        </p>
      </div>
    </Panel>
  );
}
