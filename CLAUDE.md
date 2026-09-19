# Serenata ERP

ERP interno de **Serenata House**, productora audiovisual mexicana (CDMX). Ciclo
completo: cotización → aprobación → proyecto → cuentas por cobrar y por pagar, con
portal de proveedores y extracción AI de eventos.

- **App:** https://serenata-erp.vercel.app · **Repo:** https://github.com/EduardoTerwogt/serenata-erp
- **Rama:** `main` (única) · push a `main` = deploy automático en Vercel
- **Stack:** ver `package.json` (Next.js App Router, Supabase, NextAuth, Tailwind).

---

## Documentos canónicos

Este archivo es **manual de entrada + índice**. Lo específico vive en su lugar:

| Pregunta | Documento |
|---|---|
| ¿Qué estamos haciendo ahora? | `docs/ACTIVE_WORK.md` ← **empezar aquí cada sesión** |
| ¿Hay una iniciativa multi-sesión en definición o en curso? | `docs/PLAN.md` |
| ¿Hacia dónde vamos? | `docs/ROADMAP.md` |
| ¿Cómo está construido y qué funciona hoy? | `ARCHITECTURE.md` |
| ¿Por qué se decidió así? | `docs/decisions/` |
| ¿Cómo se valida? | `TESTING.md` |
| ¿Qué reglas visuales? | `DESIGN_SYSTEM.md` |
| ¿Cómo se llegó hasta aquí? | `docs/archive/` |
| ¿Qué prompt uso para X? | `docs/PROMPTS.md` |

Las reglas por tipo de archivo (API, migraciones, Realtime, UI, PDF) viven en
`.claude/rules/` y se cargan solas al **leer** un archivo de esa ruta;
`.claude/rules/git.md` no tiene `paths:`, así que carga siempre. No repetirlas
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
8. **"Costo Unitario" (antes "X Pagar") siempre es el monto neto al proveedor por
   unidad; "Costo Total" = Costo Unitario × Cantidad.** Todo cálculo de utilidad,
   margen o impuestos parte de ahí. Fórmulas completas, modelo fiscal y glosario en
   `docs/decisions/006-reglas-de-negocio-invariables.md`.

---

## Git — rama, PR y setup

Detalle completo (setup de sesión, ciclo rama+PR, excepción doc-only) en
`.claude/rules/git.md` — carga siempre, igual que este archivo.

**Resumen:** rama dedicada + PR en borrador desde el primer commit útil; merge a
`main` solo cuando todo está en verde. Si el diff completo es solo `.md`, commit +
push **directo a `main`**, sin rama ni PR. Nunca `git reset --hard` automático.

## Autonomía de ejecución

Un cambio está **pre-aprobado** —se ejecuta sin pausar— si cumple las 4 condiciones:
(1) ya se revisó, (2) no altera funcionalidad existente como efecto secundario,
(3) no elimina features, (4) no bloquea features; y sus tests ya corrieron en verde.

Pedir aprobación **solo** ante una decisión de negocio, arquitectura o UX/UI sin
camino claro. Fixes pequeños y seguros van directo, pero el destino del push sigue
la sección "Git" de arriba: rama + PR salvo que el cambio sea 100% documentación.

Un plan ya aprobado se ejecuta completo sin repreguntar, verificando en cada etapa
que quedó **en verde de verdad** (build, deploy, comportamiento real, incluido el
job `live`) — que el push tenga éxito no prueba nada.

Esto incluye Supabase: dentro de un plan ya aprobado, toda migración o cambio que
haga falta para implementarlo (incluido un borrado sin reemplazo) se ejecuta sin
pausar — ver sección "Supabase" abajo para el detalle y el único gatillo de pausa.
`.claude/settings.json` habilita el permiso técnico de forma permanente; que no se
use fuera de la ejecución de un plan es criterio de Claude, no un mecanismo técnico
que distinga ambos casos — igual que el resto de esta sección. Detalle y motivo:
`docs/decisions/012-autonomia-supabase-en-plan-aprobado.md`.

---

## Supabase — conexiones y regla de producción

Dos Custom Connectors al MCP oficial de Supabase, configurados en claude.ai
(Settings → Connectors), no en el repo:
- `supabase-test`: lectura y escritura completas sobre `serenata-erp-test`.
- `supabase-prod`: escritura habilitada, bajo la regla siguiente.

**Producción, dentro de un plan ya aprobado:** todo cambio necesario para
implementar el plan está autorizado sin pausar — incluido un borrado sin reemplazo.
El único gatillo de pausa es que el cambio toque una regla de negocio no clara,
genere una contradicción, o no esté claro cuál es el resultado final esperado; en
ese caso se consulta antes de aplicar. Fuera de un plan (pedido suelto de Supabase
en la sesión, no derivado de un plan ya revisado): los cambios **aditivos o de
mejora** están pre-aprobados; borrar algo existente solo se permite cuando es para
**sustituirlo** (recrear una función, renombrar una columna); un borrado que
elimina una capacidad **sin reemplazo** requiere mostrar el SQL exacto y esperar
confirmación explícita. En ambos casos, todo cambio aplicado se guarda como
migración numerada y se commitea. Detalle y motivo de esta distinción:
`docs/decisions/012-autonomia-supabase-en-plan-aprobado.md`.

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

Si el autocompletado de `/serenata-iniciar-fase` no aparece, basta pedirlo en lenguaje
natural — ver "Nota sobre los slash commands" en `docs/PROMPTS.md`.

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

## Estilo de respuesta

- Toda respuesta visible para el usuario debe comenzar exactamente con `LALOT`.
  Si el prefijo desaparece, tratarlo como señal de que las instrucciones del
  proyecto pueden haber dejado de aplicarse y considerar iniciar una sesión nueva.
- Responder con la menor cantidad de palabras que permita conservar claridad,
  precisión, riesgos relevantes y resultados de verificación.
- Evitar introducciones, repeticiones, cortesías y explicaciones no solicitadas.
- Las auditorías, errores críticos y decisiones de arquitectura pueden extenderse
  cuando sea necesario para no omitir información importante.

---

## Variables de entorno

La lista completa y comentada vive en `docs/ENV.md`. No hay `.env.example`: los
valores reales están en Vercel (producción) y en GitHub Actions Secrets (CI).
