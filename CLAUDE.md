# Serenata ERP

ERP interno de **Serenata House**, productora audiovisual mexicana (CDMX). Ciclo
completo: cotización → aprobación → proyecto → cuentas por cobrar y por pagar, con
portal de proveedores y extracción AI de eventos.

- **App:** https://serenata-erp.vercel.app · **Repo:** https://github.com/EduardoTerwogt/serenata-erp
- **Rama:** `main` (única) · push a `main` = deploy automático en Vercel
- **Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 ·
  Supabase (PostgreSQL: cliente directo + RPCs) · NextAuth v5 · Vercel

---

## Documentos canónicos

Este archivo es **manual de entrada + índice**. Lo específico vive en su lugar:

| Pregunta | Documento |
|---|---|
| ¿Qué estamos haciendo ahora? | `docs/ACTIVE_WORK.md` ← **empezar aquí cada sesión** |
| ¿Hacia dónde vamos? | `docs/ROADMAP.md` |
| ¿Cómo está construido y qué funciona hoy? | `ARCHITECTURE.md` |
| ¿Por qué se decidió así? | `docs/decisions/` |
| ¿Cómo se valida? | `TESTING.md` |
| ¿Qué reglas visuales? | `DESIGN_SYSTEM.md` |
| ¿Cómo se llegó hasta aquí? | `docs/archive/` |

Las reglas por tipo de archivo (API, migraciones, Realtime, UI, PDF) viven en
`.claude/rules/` y se cargan solas al tocar esa ruta. No repetirlas aquí.

---

## Principios críticos (no romper)

1. **PostgreSQL es la única fuente de verdad persistente.** Google Sheets es espejo
   de consulta, nunca origen. `service_role` nunca llega al navegador.
2. **Las operaciones multi-write críticas son atómicas por RPC.** Aprobar y cancelar
   cotización, reservar folio y registrar pago tienen efectos laterales
   transaccionales — **nunca recrear esa lógica manualmente**, llamar la RPC existente.
3. **Todo cambio de esquema requiere migración numerada** en `db/migrations/`, commiteada.
4. **Fallar explícito, nunca en silencio.**
5. **No romper funcionalidad existente.** Tocar solo lo que se planea cambiar.
6. **Bugs = causa raíz.** Trazar → diagnosticar → arreglar. Sin atajos ni retries ciegos.
7. **Buscar antes de crear.** Si ya existe infraestructura parecida, se extiende; no
   se construye un segundo motor en paralelo.
8. **"X Pagar" siempre es el monto neto al proveedor.** Todo cálculo de utilidad,
   margen o impuestos parte de ahí. Fórmulas completas, modelo fiscal y glosario en
   `docs/decisions/006-reglas-de-negocio-invariables.md`.

---

## Git — setup y reglas

```bash
git config --global user.name "EduardoTerwogt"
git config --global user.email "eduardoterwogt@gmail.com"
source /home/user/serenata-erp/.env.local.tokens 2>/dev/null
git remote set-url origin https://${GITHUB_TOKEN}@github.com/EduardoTerwogt/serenata-erp.git

# GitHub main es la fuente de verdad — forzar local = origin/main SIEMPRE
git fetch origin main && git checkout main && git reset --hard origin/main
```

`.env.local.tokens` está en `.gitignore` y no viaja en el repo: en un entorno nuevo
hay que crearlo con el `GITHUB_TOKEN` que dé el usuario.

- Siempre `main`. Nunca ramas. Nunca PRs.
- **GitHub `main` = verdad absoluta.** El `main` local del sandbox es desechable:
  nunca preservar divergencias, nunca cherry-pick para "rescatar" commits locales,
  nunca pushear sin resetear antes a `origin/main`.
- Commit + push después de cada cambio funcional terminado.
- **Ejecución entre sesiones:** una sesión nueva con tareas en cola de una sesión
  anterior NUNCA las ejecuta ni pushea al abrir — confirmar primero.
  `.claude/hooks/pre-push-gate.mjs` bloquea el primer `git push` de cada sesión para
  forzar esa pausa; el segundo intento pasa.

---

## Autonomía de ejecución

Un cambio está **pre-aprobado** —se ejecuta sin pausar— si cumple las 4 condiciones:
(1) ya se revisó, (2) no altera funcionalidad existente como efecto secundario,
(3) no elimina features, (4) no bloquea features; y sus tests ya corrieron en verde.

Pedir aprobación **solo** ante una decisión de negocio, arquitectura o UX/UI que no
esté clara o tenga más de un camino razonable. Fixes pequeños y seguros van directo.

Un plan ya aprobado se ejecuta completo sin volver a pedir permiso, siempre que cada
etapa pase sus tests y se verifique que lo pusheado quedó **en verde de verdad**
(build, deploy y comportamiento real, incluido el job `live` de CI). Que el push
tenga éxito no prueba nada.

---

## Supabase — conexiones y regla de producción

Dos Custom Connectors al MCP oficial de Supabase, configurados en claude.ai
(Settings → Connectors), no en el repo:
- `supabase-test`: lectura y escritura completas sobre `serenata-erp-test`.
- `supabase-prod`: escritura habilitada, bajo la regla siguiente.

**Producción:** los cambios **aditivos o de mejora** están pre-aprobados. Borrar algo
existente solo se permite cuando es para **sustituirlo** (recrear una función,
renombrar una columna). Un borrado que elimina una capacidad **sin reemplazo**
requiere mostrar el SQL exacto y esperar confirmación explícita. Todo cambio aplicado
se guarda como migración numerada y se commitea.

---

## Testing — lo mínimo

```bash
npx tsc --noEmit && npm run lint && npm test
npm run test:e2e:smoke && npm run test:e2e:critical
npm run build     # si toca TS/TSX, rutas o config de Next
```

**Regla de oro: no pushear con tests en rojo.** Un test solo se modifica cuando un
cambio de producto lo justifica, nunca para que deje de fallar. Detalle, niveles y
secretos: `TESTING.md`.

---

## Cierre de sesión

Antes de cerrar, correr `/serenata-cerrar-sesion`: actualiza `docs/ACTIVE_WORK.md`,
verifica si `ARCHITECTURE.md` sigue siendo verdad, mueve a `docs/decisions/` lo que
alguien podría volver a cuestionar en seis meses, y purga el debugging ya resuelto.

---

## Convenciones

- **Imports:** alias `@/` = raíz. Ej: `import { supabaseAdmin } from '@/lib/supabase'`.
- **Tipos:** `lib/types.ts`. **Schemas:** `lib/validation/schemas.ts`.
- **Idioma:** código español/inglés mixto (como ya existe); UI en español.
- **No crear archivos innecesarios:** preferir editar los existentes.
- **Respuestas concisas.** Si el usuario debe ejecutar algo manualmente (Supabase,
  Vercel, GitHub Secrets), dar el paso a paso exacto.
- `prisma` aparece en `package.json` pero **no es la capa de datos activa**.
- **Nunca commitear secretos, tokens o credenciales.**

---

## Variables de entorno

La lista completa y comentada vive en `docs/ENV.md`. No hay `.env.example`: los
valores reales están en Vercel (producción) y en GitHub Actions Secrets (CI).
