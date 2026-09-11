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
| ¿Qué prompt uso para X? | `docs/PROMPTS.md` |

Las reglas por tipo de archivo (API, migraciones, Realtime, UI, PDF) viven en
`.claude/rules/` y se cargan solas al **leer** un archivo de esa ruta. No repetirlas
aquí — con la excepción de abajo.

### Patrones obligatorios al crear archivos nuevos

Las rules por ruta se inyectan al leer un archivo, no siempre al crearlo. Estos tres
son innegociables y se repiten aquí a propósito para que nunca falten:

1. **Rutas API:** auth primero (`requireSection('<seccion>')` o `requireAnySection()`,
   copiando el patrón de una ruta hermana) y payload validado con Zod antes de usarlo.
2. **`params` es Promise en Next.js 16:** `const { id } = await params`.
3. **UI:** tokens `--sn-*` de `app/globals.css`. Nunca `gray-*` ni `#f97316`.

El detalle completo de cada uno está en `.claude/rules/`.

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
git config --global user.email "eduardoterwogth@gmail.com"
source /home/user/serenata-erp/.env.local.tokens 2>/dev/null
git remote set-url origin https://${GITHUB_TOKEN}@github.com/EduardoTerwogt/serenata-erp.git
```

**El correo lleva "h" al final.** `eduardoterwogt@gmail.com` (sin "h") no corresponde
a ninguna cuenta de GitHub y Vercel rechaza el deploy con "could not be matched to a
GitHub account". Ya pasó una vez; no volver a quitarla.

`.env.local.tokens` está en `.gitignore` y no viaja en el repo: en un entorno nuevo
hay que crearlo con el `GITHUB_TOKEN` que dé el usuario.

### Rama + PR, merge al final

**Se trabaja en rama dedicada, nunca directo sobre `main`.** El merge a `main` ocurre
solo cuando el trabajo está terminado y todas las suites pasaron. `main` siempre debe
ser una versión desplegable.

**Excepción — solo documentación:** si el diff completo toca **únicamente archivos
`.md`** — cualquiera del repo, sin excepción: `CLAUDE.md`, `README.md`,
`ARCHITECTURE.md`, `TESTING.md`, `DESIGN_SYSTEM.md`, lo que sea bajo `docs/`,
`.claude/skills/*/SKILL.md`, `.claude/rules/*.md`, etc. — cero código de la app,
migraciones, config o scripts — se commitea y pushea **directo a `main`**, sin rama
ni PR. Un `.md` no lo ejecuta el build ni los tests, así que no hay CI real que
perderse. Si el diff toca aunque sea un archivo que no sea `.md`, deja de aplicar la
excepción y todo el cambio (incluida la parte de documentación) sigue el flujo
normal de rama + PR.

```bash
git fetch origin main
git switch main && git pull --ff-only origin main
git switch -c <rama-de-trabajo>      # o git switch <rama> si ya existe
```

**Un push a la rama sin PR abierto no corre CI.** `test.yml`, `e2e.yml` y
`migrations.yml` solo se disparan por evento de Pull Request o por push a `main` —
nunca por un push simple a una rama. En cuanto exista el primer commit útil de la
rama, abrir el PR hacia `main` **en borrador**, precisamente para que cada push
subsecuente dispare los workflows reales. No esperar a terminar el trabajo para
abrirlo.

- **Nunca `git reset --hard` automático.** Destruye trabajo local sin aviso. Si el
  árbol está sucio, `git status` primero y preguntar.
- Commit + push a la rama después de cada cambio funcional terminado. Pushear a una
  rama es seguro: no despliega ni mergea nada.
- **Antes del merge:** todas las suites verdes en el PR y el Preview de Vercel
  desplegando bien. Que el push haya tenido éxito no prueba nada — y si nunca se
  abrió el PR, esas suites nunca corrieron.
- `origin/main` es la verdad para el punto de partida de una rama, no para
  sobrescribir la rama en la que estás trabajando.
- **Ejecución entre sesiones:** una sesión nueva con tareas en cola de una sesión
  anterior NUNCA las ejecuta ni pushea al abrir — confirmar primero.
  `.claude/hooks/pre-push-gate.mjs` bloquea el primer push **a `main`** de cada sesión
  para forzar esa pausa; los pushes a ramas pasan sin fricción.

## Autonomía de ejecución

Un cambio está **pre-aprobado** —se ejecuta sin pausar— si cumple las 4 condiciones:
(1) ya se revisó, (2) no altera funcionalidad existente como efecto secundario,
(3) no elimina features, (4) no bloquea features; y sus tests ya corrieron en verde.

Pedir aprobación **solo** ante una decisión de negocio, arquitectura o UX/UI que no
esté clara o tenga más de un camino razonable. Fixes pequeños y seguros van directo
— es decir, se ejecutan sin pausar a pedir permiso, pero **el destino del push sigue
la sección "Rama + PR" de arriba**: rama + PR salvo que el cambio sea 100%
documentación.

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

## Skills del proyecto

Dos procedimientos fijos viven en `.claude/skills/`:

- **`serenata-iniciar-fase`** — al abrir sesión: leer `docs/ACTIVE_WORK.md`, inspeccionar
  `main`, localizar infraestructura reutilizable, clasificar riesgos P0/P1/P2 y proponer
  **sin implementar**.
- **`serenata-cerrar-sesion`** — antes de cerrar: actualizar `docs/ACTIVE_WORK.md`,
  verificar si `ARCHITECTURE.md` sigue siendo verdad, mover a `docs/decisions/` lo que
  alguien podría volver a cuestionar en seis meses, y purgar el debugging resuelto.

El registro de slash commands se arma al arrancar la sesión, así que si el repo se
actualiza después, `/serenata-iniciar-fase` puede no aparecer en el autocompletado
aunque el archivo exista. **Eso no impide usarlas:** basta pedirlo en lenguaje natural
("arranca la fase actual", "vamos a cerrar la sesión") o nombrarla ("usa la skill
serenata-cerrar-sesion"). Si el comando no responde, leer el `SKILL.md` correspondiente
y seguir el procedimiento.

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
