# Serenata ERP

ERP interno para **Serenata House**, productora audiovisual mexicana. Cubre el ciclo
completo: cotización → aprobación → proyecto → cuentas por cobrar y por pagar, con
portal para proveedores y extracción AI de eventos desde mensajes informales.

- **App en producción:** https://serenata-erp.vercel.app
- **Repo:** https://github.com/EduardoTerwogt/serenata-erp
- **Rama única:** `main` (push a `main` = deploy automático en Vercel)

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · Supabase
(PostgreSQL: cliente directo + RPCs) · NextAuth v5 · Playwright + Vitest · Vercel.

> `prisma` aparece en `package.json` pero **no es la capa de datos activa**. Todo el
> acceso va por `supabaseAdmin` / `supabase` y RPCs.

## Arrancar en local

```bash
npm install
# Crear .env.local con las variables listadas en CLAUDE.md ("Variables de entorno").
# No hay .env.example en el repo: los valores reales viven en Vercel.
npm run dev   # http://localhost:3000
```

## Verificar antes de pushear

```bash
npx tsc --noEmit
npm run lint
npm test                   # Vitest — 351 tests
npm run test:e2e:smoke     # Playwright, APIs mockeadas
npm run test:e2e:critical  # Playwright, APIs mockeadas
```

El nivel `live` (Playwright contra Supabase y Drive de prueba **reales**) solo corre
en GitHub Actions, porque necesita secretos que no viven en el repo. Detalles en
[`TESTING.md`](TESTING.md).

## Documentación

| Archivo | Para qué sirve |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | Manual de operación para agentes: reglas de git, permisos, gotchas, variables de entorno. **Empezar aquí.** |
| [`docs/ESTADO.md`](docs/ESTADO.md) | Qué está hecho de verdad y qué falta. Punto de partida para retomar el trabajo. |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Cómo está organizado el código y por qué. |
| [`TESTING.md`](TESTING.md) | Los cuatro niveles de prueba, qué corre dónde y con qué secretos. |
| [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md) | Tokens visuales reales y estado de la migración de UI. |
