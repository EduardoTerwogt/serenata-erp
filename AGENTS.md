# AGENTS

Las instrucciones para agentes de este repo viven en un solo lugar: **[`CLAUDE.md`](CLAUDE.md)**.

Antes eran dos documentos casi idénticos que se desincronizaron entre sí. Se dejó uno solo para que no haya dos versiones de la misma regla.

Orden de lectura:

1. [`CLAUDE.md`](CLAUDE.md) — principios críticos, git, autonomía, e índice del resto.
2. [`docs/ACTIVE_WORK.md`](docs/ACTIVE_WORK.md) — qué se está construyendo ahora.
3. [`ARCHITECTURE.md`](ARCHITECTURE.md) · [`docs/ESTADO.md`](docs/ESTADO.md) · [`docs/decisions/`](docs/decisions/) — según lo que vayas a tocar.

Las reglas por tipo de archivo viven en `.claude/rules/` y se cargan solas.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
