# Trabajo activo

**Última actualización:** 2026-09-22 (sesión 3)

## Estado

**`docs/PLAN.md` — Aprobado, en ejecución, "Editor de PDFs".** Módulo de
sidebar para editar visualmente los 4 PDFs que genera Serenata (tablas,
posición libre, texto y color acotado a la paleta del design system), con
un flujo diseño-activo/borrador explícito y elementos obligatorios/legales
protegidos. Arquitectura decidida: schema JSON + renderer sobre jsPDF
(sin dependencia nueva). **Bloques 0-6 cerrados** (spike, schema+Zod,
persistencia+API+permisos, catálogo `/editor-pdfs`, editor visual/canvas,
preview real — PR #81 mergeado a `main` en sesión 2). **Bloque 7 (piloto
Cotización): parcial** — layout de flujo real implementado (ver abajo),
falta migrar de verdad la ruta que genera el PDF final para que use el
renderer nuevo en vez de `cotizacion-pdf.ts` hardcodeado, y la fidelidad
visual completa contra el PDF real. Esta corrección de estado reemplaza la
anterior de esta misma sección (sesión 2 quedó desactualizada tras el
merge de PR #81 — no se corrigió al abrir sesión 3, causó confusión real:
ver "Completado en esta sesión" abajo).

**Nota de proceso importante:** al auditar el estado real (sesión 3), se
encontró que `pdf_plantillas.active_schema` de `cotizacion` en
**producción** tenía datos (`flowAfter`, `gap`, un tipo de elemento
`totals-banner`) que **nunca existieron en ningún código de este repo**
(confirmado con `git grep` sobre todo el historial) — llegaron por una
escritura directa a la base de datos que se saltó la validación Zod de la
API (`/api/editor-pdfs/[tipo]/draft` y `.../aplicar` la habrían rechazado).
Ver detalle completo abajo.

**Bloque 11 (rediseño de interacción del lienzo, estilo Canva) aprobado
en esta sesión, ejecución no iniciada.** El primer pase visual de PR #83
(`Toolbar.tsx`, capas con íconos) no fue suficiente para el usuario —
pidió selección explícita, toolbar contextual, manipulación directa
transaccional y undo/redo real. Plan completo (decisiones de producto,
especificación de interacción gesto por gesto, arquitectura técnica,
Definition of Done) en `docs/PLAN.md` → "Bloque 11". Primer paso de
ejecución: mergear PR #83 a `main` (Housekeeping, Bloque 0 de esa
sección) — todavía no ejecutado, ver "Siguiente paso" abajo.

## Completado en esta sesión (3) — Layout de flujo real + fix de datos corruptos

El usuario pidió rediseñar la UX/UI del lienzo del editor (estilo Canva).
Al revisar el estado real antes de diseñar, se encontró que Bloques 3-6 ya
estaban cerrados y mergeados (esta sección de arriba estaba desactualizada)
y, sobre todo, que el `active_schema` de Cotización en **producción** tenía
`flowAfter`/`gap`/un tipo `totals-banner` sin ningún código que los
interpretara — causaba que el lienzo mostrara todo apilado/ilegible (lo que
el usuario reportó como problema de UX/UI). Causa raíz real: layout de
flujo nunca implementado, no un problema de diseño visual. Se decidió
implementarlo antes de tocar la UX/UI del lienzo.

- **`lib/server/pdf/pdf-template-schema.ts`:** `PdfElementBaseSchema` +=
  `flowAfter`/`flowGap` (posición derivada del borde inferior real de otro
  elemento) y `visibleIf` (oculta el elemento y no aporta alto si la
  variable es falsy). `TextElementSchema` += `wrap`, `format`
  (`date`/`currency`), `align: 'justify'`. `PdfTableColumnSchema` +=
  `format: 'currency'`. Nuevo tipo de elemento `totals-banner` (rows[] +
  `bgColorToken`, alto dinámico). `superRefine` nuevo: `flowAfter` debe
  apuntar a un id existente, no a sí mismo, sin ciclos; tokens de color y
  `{{variable}}`/`visibleIf` validados también en los campos nuevos.
- **`lib/server/pdf/pdf-template-layout.ts` (nuevo):** `resolveTemplateLayout()`
  — topo-sort por `flowAfter`, resuelve `y` real por tipo (texto envuelto
  vía `splitTextToSize`, tabla vía `autoTable` descartable + `finalY` real,
  imagen/línea/totals-banner con fórmulas), respeta `visibleIf`. Módulo
  autocontenido a propósito (sin importar `template-renderer.ts`) para que
  tanto el renderer de servidor como `EditorCanvas.tsx` (cliente) lo usen
  sin import circular — jsPDF es isomórfico, corre igual en el navegador.
- **`template-renderer.ts`:** `renderFromTemplate()` resuelve el layout antes
  de dibujar (usa la `y` real, no `el.y`), agrega el render de
  `totals-banner`, soporta texto envuelto/justificado/formateado.
- **`EditorCanvas.tsx`:** usa el layout resuelto en vez de `el.y` crudo;
  corregido un bug real (cualquier tipo de elemento desconocido, incluido
  `totals-banner`, caía en el branch de tabla por el `else` final — ahora
  tiene su propio render). Arrastrar un elemento con `flowAfter` solo mueve
  `x` (la `y` es derivada, moverla no tendría efecto visible).
- **`Inspector.tsx`:** campos `flowAfter`/`flowGap`/`visibleIf` genéricos,
  `wrap`/`format`/`justify` para texto, panel de propiedades y `+ Banner de
  totales` para el tipo nuevo, capas con etiqueta legible en vez de solo
  el tipo.
- **`pdf-template-variables.ts`:** `sampleType: 'boolean'` nuevo; agregado
  `iva_activo`, `descuento_monto` e `id` (folio) al catálogo de
  `cotizacion` — faltaban y bloqueaban construir un schema real válido.
- Tests nuevos: `pdf-template-layout.test.ts` (6), `pdf-template-schema.flow.test.ts`
  (13), `template-renderer.flow.test.ts` (2) — 21 tests nuevos, cubren
  encadenamiento de flujo, alto real de tabla/banner, `visibleIf`,
  detección de ciclos, y un render de punta a punta con datos reales.
  `tsc --noEmit`, `lint` (0 errores) y `npm test` completos (137 archivos /
  1062 tests) en verde. `npm run build`: falla en este checkout por falta
  de `SUPABASE_URL`/env vars (esperado, no hay `.env.local` — limitación de
  entorno documentada en `CLAUDE.md`, no del código: compilación TS y
  bundling sí terminaron en verde antes de ese punto).
- **Migración `20260922_fix_cotizacion_active_schema_flow_layout.sql`:**
  reemplaza el `active_schema` corrupto de `cotizacion` por uno válido
  contra el schema nuevo, reconstruyendo el contenido real del PDF
  (encabezado, RESUMEN, tabla agrupada, banner de totales, notas
  condicionales, GENERALES/COSTOS/CANCELACIÓN) — aplicada a
  `serenata-erp-test` y a producción, verificada (39 elementos, `draft_schema`
  en null en ambas).
- **Decisión menor, sin token real:** no existe ningún `--sn-*` amarillo en
  `app/globals.css` (el amarillo del renglón de descuento en
  `cotizacion-pdf-helpers.ts`, `#F5D042`, es un hex suelto sin token — deuda
  ya existente, no introducida aquí). Se usó `orange-soft` como sustituto en
  vez de inventar un token nuevo sin aprobación. Pendiente decidir si vale
  la pena agregar un token amarillo real al design system.
- **Fuera de alcance a propósito, notado para quien retome Bloque 7:**
  columna "Total categoría" (subtotal por grupo, `groupTotalOf` en los
  datos corruptos originales) no se reprodujo — es una feature de tabla
  separada del layout de flujo, no implementada en el schema. Fidelidad
  visual pixel-a-pixel contra el PDF real de `cotizacion-pdf.ts` no se
  verificó (la migración de datos es funcionalmente válida, no
  necesariamente idéntica al PDF de producción). El rediseño UX/UI del
  lienzo (estilo Canva, pedido original del usuario) sigue pendiente —
  era justamente el siguiente paso cuando se encontró este bug.

## Completado en sesión anterior (2) — Bloque 1: spike del renderer

- Rama de la sesión (`claude/zen-cray-4lre07`) ya alineada con `origin/main`;
  sin trabajo pendiente de otra sesión.
- `npm ci` para tener `node_modules` real (no estaba instalado en el
  checkout) — permitió verificar contra el paquete real, no solo contra
  los `.d.ts`, los 2 riesgos P1 marcados como "no verificado" en el plan.
- Datos reales vía MCP `supabase-test` (`items_cotizacion`, cotización
  `SH2402`): 2 partidas reales (categoría "Equipo") usadas como semilla y
  repetidas (120 filas, 4 categorías) para forzar overflow a 3+ páginas —
  el volumen real de partidas de cotización no llega hoy a necesitar
  multipágina, pero el mecanismo debe sostenerlo.
- `lib/server/pdf/template-renderer.ts` (nuevo): `renderText`/`renderLine`/
  `renderImage`, `renderGroupedTable` (agrupa igual que `buildItemsBody` de
  `cotizacion-pdf-helpers.ts` — etiqueta en la primera fila del grupo, fila
  espaciadora entre grupos, sin API nativa de agrupado en autoTable),
  `redrawSticky` y `contentHeight`.
- **`sticky` header/footer:** resuelto con `doc.getNumberOfPages()` +
  `doc.setPage(n)` corrido después de renderizar el resto, no con el hook
  `didDrawPage` de `jspdf-autotable` que proponía el plan como primera
  opción — ese hook solo dispara para tablas, y una página nueva la puede
  generar cualquier elemento, no solo la tabla. `docs/PLAN.md` actualizado
  con la decisión.
- **`spacing`/tracking:** confirmado soporte nativo en jsPDF real vía
  `doc.setCharSpace(mm)`/`getCharSpace()` — no hace falta simular tracking
  insertando espacios.
- `lib/server/pdf/template-renderer.spike.test.ts` (nuevo, 4 tests, verdes):
  cubre los 4 riesgos de arriba. Reusa `getIsoLogoBase64()` de
  `cotizacion-pdf-helpers.ts` para el elemento imagen — no se creó ningún
  asset nuevo.
- `tsc --noEmit`, `lint` (0 errores, solo warnings preexistentes ajenos a
  este cambio) y `npm test` completos (125 archivos / 969 tests) en verde.
- `docs/PLAN.md` actualizado: Bloque 1 → Cerrado en el tracker, 2 riesgos
  P1 resueltos con su justificación técnica.

## Completado en esta sesión — Bloque 2 (completo) + Bloque 3 (parcial), en paralelo

El usuario pidió revisar qué bloques se pueden paralelizar y ejecutar así,
serializando solo lo que desbloquea trabajo futuro. Grafo de dependencias
documentado en `docs/PLAN.md` → "Dependencias reales entre bloques y
ejecución en paralelo". Resultado: 5 piezas sin archivos en común
corrieron en 5 subagentes en paralelo (background), cada uno validando
`tsc`/`lint`/tests de sus propios archivos y sin hacer `git commit` — la
integración y cada commit los hizo esta sesión después de verificar en
verde:

- **Track A** (`lib/server/pdf/pdf-template-schema.ts`, nuevo +
  `renderFromTemplate()` en `template-renderer.ts`): tipos + Zod de
  `PdfTemplate`/`PdfElement` exactos a la sección "Schema" del plan;
  `renderFromTemplate()` interpola `{{variable}}`, resuelve colores vía un
  `resolveColor` inyectado por parámetro (desacoplado a propósito de
  Track B) y arma tablas desde `rowsBinding`.
- **Track B** (`lib/server/pdf/pdf-color-tokens.ts`, nuevo): mapa
  `--sn-*` → RGB (ink, naranja, superficies, 7 chips), confirmando
  `--sn-orange: #FE7B01` leyendo `app/globals.css` directo (no el valor
  desactualizado de `.claude/rules/ui.md`). `resolveColorToken()` lanza
  explícito ante un token inexistente.
- **Track C** (`lib/server/pdf/pdf-template-variables.ts`, nuevo):
  catálogo de variables por `tipo_documento`, leyendo los 4 shapes de
  datos reales fragmentados (incluida la estructura anidada
  responsable→evento→items de Orden de pago).
- **Track D** (`db/migrations/20260921_add_pdf_plantillas_table.sql`,
  nuevo): tabla del modelo de 3 capas (`active_schema`/`draft_schema`),
  RLS `service_role`-only, aplicada y verificada en `serenata-erp-test`
  (sin hallazgos nuevos de seguridad).
- **Track E**: sección de permisos `editor-pdfs` en los 4 archivos de auth
  (heredada por `admin`) + ícono `layout-template` — sin tocar
  `SidebarLayout.tsx` (eso es Bloque 4).
- **Integración** (secuencial, hecha por esta sesión después de los 5
  tracks): cableó B y C dentro de A vía un segundo `superRefine` en
  `PdfTemplateSchema` — bloquea un `colorToken` o una `{{variable}}`
  inexistentes, mismo pipeline que van a usar preview y "Aplicar diseño".
  4 tests de integración nuevos.
- 5 commits separados (uno por track + uno de integración + un fix de
  manifest que quedó fuera por error del primer commit) — cada uno
  verificado en verde antes de pushear, no un commit único al final.
- `tsc`/`lint`/`npm test` completos: 129 archivos / **999 tests** en
  verde. `docs/PLAN.md` actualizado: Bloque 2 → Cerrado, Bloque 3 → Parcial.
- PR #81 recibió un `live` E2E rojo en un commit intermedio
  (`canceling statement due to statement timeout` en Postgres) — no
  relacionado al código de esta sesión, consistente con la contención ya
  documentada en `e2e.yml` sobre `serenata-erp-test` compartido (probable
  candidato: la migración del Track D corriendo contra esa misma base
  mientras el E2E vivía). Commits posteriores dispararon un run nuevo.

## Completado en sesión anterior — Editor de PDFs pasa de Borrador a Aprobado

- Investigación exhaustiva del código real (3 subagentes en paralelo +
  lectura directa): los 4 generadores PDF completos (`lib/server/pdf/*.ts`),
  sistema de permisos (`AppSection`/`SECTION_DEPENDENCIES`/`ALL_SECTIONS`/UI
  de admin), nav (`SidebarLayout.tsx`), catálogo completo de tokens
  `--sn-*` (`app/globals.css`), y el mockup validado en sesión previa
  (leído como HTML real para extraer el schema de elementos implícito).
- Decisión de arquitectura: schema JSON + renderer sobre **jsPDF** (no
  `pdf-lib` como proponía el primer borrador — jsPDF ya es el motor de los
  4 generadores actuales, evita un segundo motor de PDF en paralelo).
- El usuario intervino el plan técnico con una definición de producto
  mucho más completa (workflow diseño-activo/borrador, elementos
  obligatorios/legales, multipágina, seguridad del schema, criterios de
  aceptación) y pidió auditarla contra el repo real antes de aprobar.
- Auditoría 1 (Claude): confirmó la mayoría de las decisiones, corrigió 3
  puntos técnicos (`sticky` en vez de `page: number` para header/footer —
  ningún generador actual repite header/footer entre páginas hoy; modelo
  de persistencia de 3 capas baseline/activo/borrador; corrección del
  valor real del acento naranja `--sn-orange: #FE7B01` vs. el
  desactualizado `#FF5A1A` de `.claude/rules/ui.md`) y 2 decisiones
  resueltas con el usuario (undo/redo fuera del MVP; clasificación
  required/legal/opcional por documento).
- Auditoría 2 (usuario sobre la auditoría 1): encontró un error real en el
  modelo activo/borrador que la primera corrección introdujo — confundía
  "descartar cambios" (volver a lo aplicado) con "restaurar plantilla"
  (volver al original), y dejaba una vía silenciosa para que el PDF de
  producción cambiara si se editaba el baseline de código sin pasar por
  "Aplicar diseño". Corregido: `active_schema` nunca es `null`, el
  baseline de código solo se lee para copiarlo a una fila concreta (al
  migrar un documento o al restaurar explícitamente), nunca como
  referencia viva. Más 2 puntos de schema agregados: `page.margins` a
  nivel de template (no simulado moviendo elementos), y pipeline único de
  validación Zod compartido entre preview y `Aplicar diseño`.
- `docs/PLAN.md` reescrito con el plan final: arquitectura, schema completo
  (`PdfTemplate`/`PdfElement`), tabla de elementos obligatorios/legales por
  documento, modelo de activo/borrador de 3 capas, 11 bloques (0-10) con
  tracker de estado, riesgos y validación actualizados.
- Diff completo de la sesión es 100% `.md` → commit + push directo a
  `main` (excepción doc-only de `.claude/rules/git.md`, sin rama ni PR).
- Al cerrar sesión: corregida una imprecisión real en `ARCHITECTURE.md`
  §5 "PDFs" — documentaba el reuso de `drive_file_id` como si aplicara a
  los 4 generadores; solo es cierto para Cotización (confirmado leyendo
  cada ruta). Agregado un gotcha nuevo sobre las inconsistencias reales
  entre los 4 generadores (unidades mezcladas mm/pt, helpers de
  `pdf-base-config.ts` sin usar, sin repetición de header/footer en
  páginas adicionales) — relevante para el Bloque 1 que arranca la
  próxima sesión.

## Tests ejecutados y resultado real

- `npx tsc --noEmit` → verde en cada commit (Bloque 1, cada track por
  separado, e integración final).
- `npm run lint` → 0 errores en todo momento (8 warnings preexistentes,
  ninguno en archivos tocados esta sesión).
- `npm test` → progresó de 969 (Bloque 1) a **999 tests / 129 archivos**
  tras Bloque 2 completo, siempre en verde.
- No se corrieron e2e locales: los cambios son módulos nuevos sin UI ni
  ruta todavía (Bloque 4/5), no hay flujo de usuario que los ejercite aún.
  El E2E de CI (PR #81) sí corrió por cada push — ver "Problemas
  encontrados" por el `live` rojo en un commit intermedio, ya no vigente
  en el HEAD actual.

## Problemas encontrados que siguen abiertos

- **Fuera de alcance, solo nota:** el advisor de Supabase (`supabase-test`)
  reporta RLS deshabilitado en `public.cliente_id_backfill_clasificacion`
  (severidad crítica). No es parte de esta iniciativa ni de este plan —
  no se tocó. Señalarlo al usuario para decidir si amerita una tarea aparte.
- Warning benigno preexistente de `jspdf-autotable` ("Of the table content,
  N units width could not fit page") aparece también en el spike nuevo —
  ya estaba presente en `cotizacion-pdf.test.ts` antes de esta sesión, no
  es una regresión introducida por `template-renderer.ts`.
- Nota de entorno (sesión anterior, sigue abierta como nota): un
  subagente reportó ver bloques `system-reminder` inyectados que no
  correspondían a ninguna herramienta invocada — los ignoró correctamente
  como contenido, sin cambiar su comportamiento. No bloqueó nada.

## Deuda técnica (arrastrada, sin cambios esta sesión)

Presence sin verificar en Preview, `SUPABASE_JWT_SECRET` distinto entre
Production/Preview en Vercel, `AUTH_SECRET`/`NEXTAUTH_SECRET` coexistiendo
en producción, `tracker-lint` de `test.yml` sin generalizar fuera de EF-3,
verificación completa de Google OAuth pendiente, ramas remotas ya mergeadas
sin borrar por policy del proxy de egress. Nueva de esta sesión: el acento
naranja documentado en `.claude/rules/ui.md` (`#FF5A1A`) está desactualizado
respecto al token real en runtime (`--sn-orange: #FE7B01` en
`app/globals.css`) — no se corrigió `ui.md` en esta sesión por no ser parte
del alcance, queda pendiente de un ajuste puntual. Detalle histórico del
resto en `docs/archive/` y sesiones previas.

## Siguiente paso

1. **Bloque 11 (rediseño de interacción del lienzo, estilo Canva) —
   plan aprobado, ejecución no iniciada.** Empieza por el Housekeeping:
   marcar PR #83 listo y mergearlo a `main`, abrir rama y PR nuevos, y
   ejecutar 11.0-11.4 en orden. Detalle completo en `docs/PLAN.md` →
   "Bloque 11".
2. Terminar el Bloque 7 de verdad: la ruta que genera el PDF final de
   Cotización todavía usa `cotizacion-pdf.ts` hardcodeado, no
   `renderFromTemplate()` — falta el data-adapter real (mapear
   `CotizacionPDFData` a las variables del catálogo, incluido calcular
   `descuento_monto` con `calculateDiscount()`), verificar fidelidad visual
   contra el PDF real con datos de `serenata-erp-test`, y decidir si vale
   la pena la columna "Total categoría" (`groupTotalOf`, no implementada).
3. Considerar corregir el valor de acento en `.claude/rules/ui.md`
   (`#FF5A1A` → `#FE7B01`) como ajuste puntual, fuera de la iniciativa del
   Editor de PDFs.
4. Considerar si el RLS deshabilitado en
   `cliente_id_backfill_clasificacion` amerita una tarea aparte (ver
   "Problemas encontrados").
5. Considerar si vale la pena un token `--sn-*` amarillo real (hoy no
   existe; el renglón de descuento del banner de totales usa `orange-soft`
   como sustituto — ver "Completado en esta sesión (3)").
