# WebNest – Pelican Webhelykezelő

Natív webhosting plugin Pelican Panel 1.0.0-rc.4-hez, saját nginx/PHP runtime-mal és elkülönített, magyar nyelvű helyi felületi bemutatóval.

## Run & Operate

- `artifacts/webnest: web` — managed workflow for the local interactive preview
- `python3 scripts/src/package-plugin.py` — regenerate downloadable plugin/runtime/egg/docs bundles
- `find plugins/webnest -name '*.php' ! -name '*.blade.php' -print0 | xargs -0 -n1 php -l` — native PHP syntax
- `php tests/native/render.php` — standalone renderer checks
- `python3 -m unittest discover -s tests/native -p 'test_*.py'` — isolated runtime protocol checks
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- No database, secrets or external connections are needed for the browser preview.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `plugins/webnest/` — distributable native PHP plugin, Blade page, migrations and permissions
- `runtime/` — Wings image source, automatic configuration generator, non-root supervisor, host setup script with isolated image smoke test, PLCN_v3 eggs
- `edge/Caddyfile.example` — private Caddy edge bootstrap (staging ACME)
- `docs/TELEPITES.md` — Hungarian installation guide, limitations and staging checklist
- `artifacts/webnest/` — React companion demo, browser-local sample data only
- `artifacts/webnest/public/downloads/` — generated delivery bundles and SHA256 sums
- `tests/native/` — isolated renderer/runtime checks, not Pelican integration tests

## Architecture decisions

- The deliverable is the native plugin; the React app is explicitly only a demo and download surface, never a replacement panel.
- No live Pelican/Wings/DNS/ACME environment is attached here. Do not call the plugin production-ready or claim verified installation.
- Runtime image must be built by the operator. A local same-node Wings build uses Docker tag `webnest-runtime:php84` and Pelican reference `~webnest-runtime:php84` (no registry required). For registry distribution build/push a real reference. `registry.example.org` is a nonfunctional placeholder.
- Egg installation uses a separate Alpine image; success there does not prove the runtime image exists. Use the settings-page configurator or `runtime/configure-egg.py` before import.
- Caddy admin must stay on a private network/VPN with firewall restrictions. Edge→allocation must also use a trusted network.
- Domain reservations and plugin data survive uninstall/soft deletion to avoid orphaned edge routes being reassigned silently.

## Product

Websites, domains/subdomains, DNS TXT ownership, validated nginx generation, per-site PHP limits, safe response headers, IP/CIDR controls, trusted edge IP restoration, loopback HTTP reverse proxy/WebSocket, asynchronous runtime acknowledgments, Caddy route publishing and live certificate inspection.

## User preferences

The user asked for a native all-in-one Pelican plugin, targets their installed 1.0.0-rc4, and delegated egg selection to compatibility and maintained upstreams.

## Gotchas

- Bundle regeneration is required after native/runtime/doc edits.
- Current release is `0.1.1` preview for staging, not verified on an installed Pelican instance. Real non-root nginx/PHP processes are checked locally; image-level smoke tests run on the operator's Docker host via setup.sh.
- Only PHP 8.4 is currently included. Only exact domains (no wildcard) and loopback HTTP proxy targets are supported.
- Restore Caddy with `--resume` after first publish, or re-publish routes after loading a static config.
- Start the frontend through its managed workflow, not manually.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
