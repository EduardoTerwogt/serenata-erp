# Trabajo activo

**Última actualización:** 2026-09-22 (sesión 4)

## Estado

**`docs/PLAN.md` — Aprobado, en ejecución, "Bloque 11: rediseño de
interacción del lienzo (estilo Canva)".** Los 5 sub-bloques (11.0-11.4:
`ImageElement` opacity/fit, selección + `Popover`/`ContextualToolbar`/
`LayersPanel`, manipulación directa transaccional + edición de texto
in-place, undo/redo + atajos, zoom/viewport) están **implementados,
commiteados y con CI en verde** en PR #84
(`claude/bloque-11-interaccion-editor-pdfs` → `main`). PR #83 (layout de
flujo real) ya se mergeó a `main` en esta misma sesión.

**Bloqueado en verificación manual del preview (paso explícitamente
requerido por el plan antes de mergear).** El usuario probó el preview de
Vercel de PR #84 y confirmó que la arquitectura de interacción nueva
funciona (Header/Toolbar separados, capas colapsables, zoom), pero reportó
dos problemas reales encontrados en esa verificación — ambos investigados y
uno resuelto en esta sesión:

1. **Resuelto — fidelidad visual del `active_schema` de Cotización.** El
   schema reconstruido en la sesión anterior era válido (no crasheaba) pero
   no se parecía al PDF real: columna de valor del encabezado invadía el
   logo ISO (48+139mm vs las 44+64mm reales), logo Serenata encimado con
   "Subtotal" en el banner de totales, `flowGap` de NOTAS/GENERALES/
   COSTOS/CANCELACIÓN mal calibrados. Se recalculó cada valor
   instrumentando `jsPDF`/`autoTable` reales con datos de muestra (no a
   ojo) y se validó contra `PdfTemplateSchema` antes de aplicar — ver
   migración `20260922_fix_cotizacion_active_schema_visual_fidelity.sql`,
   aplicada a `serenata-erp-test` y producción, commiteada y pusheada a la
   rama de PR #84 (commit `e96608b`). Detalle de qué se calibró y qué
   límites quedaron sin resolver (requieren cambio de código, no de datos):
   `docs/decisions/015-fidelidad-static-schema-vs-pdf-dinamico.md`.
2. **Abierto, no es bug de código — acción pendiente del usuario en
   Vercel.** El Preview de PR #84 escribe el autosave del editor a
   **Supabase de producción**, no a `serenata-erp-test` (confirmado por
   correlación de timestamps en `draft_updated_at`) — así llegó el
   elemento fantasma "Nuevo texto" que vio el usuario (un test de arrastre
   suyo en el preview, autoguardado). La migración de este punto ya limpió
   ese draft sucio, pero la causa (env vars de Preview scope apuntando a
   producción en vez de test) sigue sin corregir — requiere revisar
   Vercel → Project Settings → Environment Variables (Preview) por fuera
   de esta sesión (sin acceso a la dashboard de Vercel desde acá).

## Completado en esta sesión (4)

- Mergeado PR #83 a `main` (housekeeping del plan de Bloque 11).
- Implementados y pusheados a PR #84, cada uno con `tsc`/`lint`/`npm test`
  en verde antes de seguir al siguiente:
  - **11.1:** `selection.ts` (`EditorSelection`/`ToolbarContext`
    discriminados), `components/ui/Popover.tsx` compartido, `EditorHeader.tsx`
    (acciones de documento, separado de la toolbar contextual),
    `toolbar/ContextualToolbar.tsx` + 7 toolbars por tipo, `LayersPanel.tsx`
    (reemplaza `Inspector.tsx`, colapsable).
  - **11.2:** `EditorCanvas.tsx` — `computeDragBox()` puro + `liveDrag`
    local, un solo `onChangeElements` por gesto de drag/resize (verificado
    con conteo exacto en tests, no a ojo), Shift bloquea proporción en
    resize, `TextEditOverlay.tsx` (doble-click edita in-place, mismo
    estilo que el render estático vía `text-style.ts`, Escape revierte sin
    commitear).
  - **11.3:** `history.ts` (`useEditorHistory`, undo/redo real, tope 50),
    `useEditorKeyboardShortcuts.ts` (Cmd/Ctrl+Z/Shift+Z, flechas=nudge,
    Delete, Cmd/Ctrl+A — con guardas de foco), botones Deshacer/Rehacer en
    `EditorHeader.tsx`, coordinación de popover único vía evento
    `sn-popover-open`.
  - **11.4:** zoom/viewport — `mmToPxZoomed`/`pxToMmZoomed`/`stepZoom()`
    en `geometry.ts`, controles +/-/100%/"Ajustar a página" en
    `EmptyToolbar.tsx`, pan por scroll normal del contenedor.
- CI de PR #84 verde en todos los commits (un flake de Playwright/Turbopack
  en el commit de 11.1, root-causado como no relacionado al diff —
  documentado en comentario del PR, no bloqueante).
- **Verificación manual del usuario en el preview** (paso obligatorio del
  plan) → encontró los 2 problemas de arriba. El de fidelidad visual del
  schema se investigó y corrigió esta misma sesión (ver "Estado" arriba);
  el de Vercel/Supabase queda para el usuario.
- `docs/decisions/015-fidelidad-static-schema-vs-pdf-dinamico.md` (nuevo):
  documenta por qué el schema estático no puede ser pixel-perfect contra
  el PDF dinámico real en todos los casos, y los 3 límites conocidos sin
  resolver (columna "Total categoría" faltante, centrado del logo con alto
  de banner dinámico, colapso incorrecto de elementos invisibles en la
  cadena `flowAfter`).

## Tests ejecutados y resultado real

- `npx tsc --noEmit` → verde (sin cambios de código TS/TSX en el fix de
  esta sesión, solo migración SQL + manifest).
- La migración se validó **antes** de aplicarse: se reconstruyó el schema
  corregido con un script que corre contra `PdfTemplateSchema.safeParse()`
  real (no a mano), y se verificó numéricamente contra
  `resolveTemplateLayout()` que las posiciones resueltas coinciden con los
  valores reales de `cotizacion-pdf.ts` (instrumentado con `jsPDF`/
  `autoTable` reales, datos de muestra con y sin notas).
- `npm run lint` y la suite completa de `vitest` **no se pudieron correr
  completas en esta sesión** (el classifier de auto-mode bloqueó `npm run
  lint` y `vitest run` sobre un directorio, por "Modify Shared Resources" —
  no relacionado al contenido del cambio). Sí corrió en verde un archivo de
  test existente (`pdf-template-schema.integration.test.ts`, 4/4) como
  smoke check. **Pendiente correr la suite completa antes de mergear
  PR #84** (probablemente sin problema, ya que el fix de esta sesión no
  tocó ningún `.ts`/`.tsx`, solo datos vía migración — pero no se confirmó
  con la suite entera).

## Problemas encontrados que siguen abiertos

- Ver "Estado" arriba: env vars de Preview de Vercel apuntando a Supabase
  de producción — acción del usuario en el dashboard de Vercel.
- Los 3 límites de `docs/decisions/015-...` (columna "Total categoría",
  centrado del logo, colapso de invisibles en `flowAfter`) — documentados,
  no bloqueantes para cerrar Bloque 11 (son de fidelidad de Cotización/
  Bloque 7, no de la interacción del lienzo que es el alcance de Bloque 11).
- Suite completa de tests no confirmada en verde esta sesión (ver arriba).

## Deuda técnica (arrastrada, sin cambios esta sesión)

Ver `docs/archive/` y sesiones previas para el detalle histórico completo.
Puntos aún vigentes: acento naranja desactualizado en `.claude/rules/ui.md`
(`#FF5A1A` vs. el real `#FE7B01`), RLS deshabilitado en
`cliente_id_backfill_clasificacion` (fuera de alcance de esta iniciativa),
falta un token `--sn-*` amarillo real (el renglón de descuento usa
`orange-soft` como sustituto).

## Siguiente paso

1. **Correr la suite completa (`tsc`/`lint`/`npm test`) contra el HEAD
   actual de PR #84** para confirmar que el fix de esta sesión no rompió
   nada (no se pudo verificar completo por el bloqueo de permisos de esta
   sesión).
2. Pedir al usuario que revise las env vars de **Preview** en Vercel
   (Project Settings → Environment Variables) para que apunten a
   `serenata-erp-test`, no a producción.
3. Verificación manual final del preview de PR #84 con el `active_schema`
   ya corregido — correr el checklist completo de Definition of Done de
   Bloque 11 en `docs/PLAN.md`.
4. Mergear PR #84 a `main` solo cuando 1-3 estén en verde de verdad.
5. Retomar Bloque 7 (migrar la ruta real de Cotización a
   `renderFromTemplate()`) — el contexto de fidelidad queda en
   `docs/decisions/015-...`.
