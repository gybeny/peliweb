import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/bits";

export function EggConfigurator() {
  const [image, setImage] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function download(event: FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    const host = image.split("/", 1)[0]?.split(":", 1)[0] || "";
    if (!/^[a-z0-9][a-z0-9._:/-]*(?:@sha256:[a-f0-9]{64})?$/.test(image)
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
      egg._comment = "Configured WebNest egg. Registry availability and Wings pull access must be checked by the operator.";
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
      setMessage("Az egg elkészült a megadott image-névvel. Ez nem ellenőrizte a registry elérhetőségét vagy a Wings hozzáférését.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nem sikerült elkészíteni az egget.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Importálható egg előkészítése">
      <p className="text-sm text-muted-foreground mb-3">
        A korábbi egg runtime-címe csak példa volt, nem letölthető image. Előbb készítsd el és töltsd fel
        a runtime csomag Dockerfile-jából a saját image-edet. Itt annak nem titkos nevét add meg, ne jelszót.
      </p>
      <form onSubmit={download} className="space-y-3">
        <label htmlFor="webnest-runtime-image" className="text-sm font-medium block">Elkészített WebNest runtime image</label>
        <Input id="webnest-runtime-image" value={image} onChange={(e) => setImage(e.target.value)}
          autoComplete="off" placeholder="Teljes image-név saját registryvel és taggel" required className="font-mono text-xs" />
        <Button type="submit" disabled={busy}>{busy ? "Előkészítés…" : "Beállított egg letöltése"}</Button>
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        {message && <p className="text-sm text-muted-foreground" role="status">{message}</p>}
      </form>
      <p className="text-xs text-muted-foreground mt-3">
        A külön telepítőimage Alpine. A telepítés sikere nem jelenti azt, hogy a saját futtatóimage is elérhető.
        Ezt a registryben és a Wings node-on külön kell biztosítani.
      </p>
    </Panel>
  );
}
