# AGENTS

Las instrucciones para agentes de este repo viven en un solo lugar: **[`CLAUDE.md`](CLAUDE.md)**.

Antes eran dos documentos casi idénticos que se desincronizaron entre sí. Se dejó uno solo para que no haya dos versiones de la misma regla.

Orden de lectura:

1. [`CLAUDE.md`](CLAUDE.md) — reglas de git, permisos, gotchas, patrones, variables de entorno.
2. [`docs/ESTADO.md`](docs/ESTADO.md) — qué está hecho, qué está a medias, qué está en rojo.
3. [`ARCHITECTURE.md`](ARCHITECTURE.md) · [`TESTING.md`](TESTING.md) · [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md) — según lo que vayas a tocar.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
