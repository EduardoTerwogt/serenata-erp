# Serenata ERP

ERP interno para **Serenata House**, productora audiovisual mexicana. Cubre el ciclo
completo: cotización → aprobación → proyecto → cuentas por cobrar y por pagar, con
portal para proveedores y extracción AI de eventos desde mensajes informales.

- **App en producción:** https://serenata-erp.vercel.app
- **Repo:** https://github.com/EduardoTerwogt/serenata-erp
- **Flujo:** rama dedicada → PR (en borrador, desde el primer commit) → CI real en
  verde → merge a `main`. Push a `main` = deploy automático en Vercel, por eso `main`
  siempre debe quedar desplegable. Única excepción: un cambio que sea 100%
  documentación (`.md`) va directo a `main`, sin rama ni PR. Detalle completo en
  [`CLAUDE.md`](CLAUDE.md).

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · Supabase
(PostgreSQL: cliente directo + RPCs) · NextAuth v5 · Playwright + Vitest · Vercel.

> `prisma` aparece en `package.json` pero **no es la capa de datos activa**. Todo el
> acceso va por `supabaseAdmin` / `supabase` y RPCs.

## Arrancar en local

```bash
npm install
# Crear .env.local con las variables listadas en docs/ENV.md.
# No hay .env.example en el repo: los valores reales viven en Vercel.
npm run dev   # http://localhost:3000
```

## Verificar antes de pushear

```bash
npx tsc --noEmit
npm run lint
npm test                   # Vitest
npm run test:e2e:smoke     # Playwright, APIs mockeadas
npm run test:e2e:critical  # Playwright, APIs mockeadas
```

El nivel `live` (Playwright contra Supabase y Drive de prueba **reales**) solo corre
en GitHub Actions, porque necesita secretos que no viven en el repo. Detalles en
[`TESTING.md`](TESTING.md).

## Documentación

| Archivo | Para qué sirve |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | Manual de entrada e índice: principios críticos, git, autonomía. **Empezar aquí.** |
| [`docs/ACTIVE_WORK.md`](docs/ACTIVE_WORK.md) | Qué se está construyendo ahora mismo. Punto de partida de cada sesión. |
| [`docs/PLAN.md`](docs/PLAN.md) | Tracker de la iniciativa multi-sesión activa (nombre fijo, vacío si no hay ninguna en curso). |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | Hacia dónde va el producto y qué está a medias a propósito. |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Cómo está organizado el código, qué módulos funcionan, las tablas y los gotchas. |
| [`docs/decisions/`](docs/decisions/) | Decisiones duraderas y por qué se tomaron. |
| [`TESTING.md`](TESTING.md) | Los niveles de prueba (unit, E2E smoke/critical/live) más el workflow de Migrations, qué corre dónde y con qué secretos. |
| [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md) | Tokens visuales reales y estado de la migración de UI. |
| [`docs/ENV.md`](docs/ENV.md) | Variables de entorno. |
| [`docs/PROMPTS.md`](docs/PROMPTS.md) | Prompts reutilizables para trabajar el repo desde Claude Code. |
| [`docs/archive/`](docs/archive/) | Historia cerrada. No es contexto de trabajo. |
