# Trabajo activo

**Última actualización:** 2026-09-22 (sesión 3)

## Estado

**`docs/PLAN.md` — Aprobado, en ejecución, "Editor de PDFs".** Módulo de
sidebar para editar visualmente los 4 PDFs que genera Serenata (tablas,
posición libre, texto y color acotado a la paleta del design system), con
un flujo diseño-activo/borrador explícito y elementos obligatorios/legales
protegidos. Arquitectura: schema JSON + renderer sobre jsPDF (sin
dependencia nueva). **Bloques 1-9 cerrados** — ver tracker completo en
`docs/PLAN.md`. El editor ya migra y renderiza los 4 documentos con su
plantilla real. Cotización/Hoja de llamado/Reporte de cierre reconstruyen
el PDF de producción 1:1; Orden de pago (Bloque 9) es un **rediseño**
aplicando el design system (`repeating-group`, decisión de arquitectura
aprobada por el usuario), y a pedido del usuario ese mismo criterio de
diseño (`format:'date'`, cerrando el gap de fechas crudas) se extendió
también a los otros 3. Queda **Bloque 10** (extensibilidad). El usuario
pidió ser avisado solo cuando el plan completo (los 10 bloques) esté
implementado y el editor listo para pruebas de uso reales — todavía no es
el caso.

## Completado en esta sesión (sesión 3) — Bloque 9: Orden de pago (rediseño)

Continuación tras el cierre del Bloque 8. El usuario, al aprobar la opción
recomendada del artefacto de comparación para la arquitectura de
repetición, pidió además rediseñar Orden de pago aplicando el design
system (no clonar el generador viejo 1:1 como los otros 3), y extender ese
mismo criterio a Cotización/Hoja de llamado/Reporte de cierre.

- **Decisión de arquitectura (aprobada por el usuario vía artefacto visual
  con 3 opciones)**: `RepeatingGroupElement` (`type: 'repeating-group'`,
  `rowsBinding`/`itemGap`/`itemHeight`/`children: PdfElement[]` recursivo)
  — nuevo tipo de `PdfElement`, en vez de un loop híbrido fuera del
  renderer o aplanar a un `groupBy` de 2 niveles (habría perdido las cajas
  de color propias de cada nivel).
- **`template-renderer.ts` reescrito para recursión**: el loop plano de
  Bloques 1-8 (`renderFromTemplate`) pasó a `renderFlowElements()`,
  llamado recursivamente por cada fila de un `repeating-group` con un
  `translateY` que traduce las coordenadas "de diseño" (autoradas como si
  fuera la única instancia) a la posición real de cada fila. `flowAfter`
  se resuelve por NIVEL (un hijo solo encadena con un hermano de su mismo
  array); los ids, en cambio, deben ser únicos en TODA la plantilla
  (`pdf-template-schema.ts`, los 3 `superRefine` ahora recorren
  `children` recursivo).
- **Bug real encontrado y corregido**: `itemGap` de un grupo repetido debe
  ser ≥ el `h` del primer hijo si tiene `bgToken` (la caja se dibuja hacia
  ARRIBA desde su propia `y`) — con un `itemGap` menor, la fila siguiente
  pintaba encima del texto de la anterior. Encontrado en el chequeo visual
  del render con datos reales.
- **Bug real preexistente encontrado y corregido**: `x` en un
  `TextElement` es el punto de ANCLA de jsPDF según `align` (borde derecho
  si `'right'`, centro si `'center'`), no el borde izquierdo de una caja
  `[x, x+w]` — nuevo helper `textAnchorX()` calcula el ancla real. Esto ya
  afectaba a Hoja de llamado (Bloque 8, `footer-fecha`) sin que nadie lo
  hubiera notado — corregido también.
- **`TextElement.format?: 'currency' | 'date'`** (nueva extensión de
  schema): formatea cada `{{variable}}` interpolada dentro del texto (no
  el string completo — un texto puede mezclar literal + variable). También
  agregado a `PdfTableColumn.format` para `'date'` (columnas
  `planeado`/`real` de la tabla de hitos, Reporte de cierre).
- **`lib/server/pdf/default-templates/orden-pago.ts`** (nuevo, rediseño no
  1:1): jerarquía de datos idéntica al generador real (responsable→
  evento→ítems, 3 niveles de total) pero colores/tipografía/espaciado de
  `--sn-*` (`orange`/`ink`/`surface-alt`/`surface-alt-2` en vez de los RGB
  sueltos de `orden-pago-pdf.ts`, que además usa unidades `pt` — otro
  motivo para no clonar geometría). `contacto_texto`/`fecha_generacion`
  agregados al catálogo de variables (mismo patrón que `descuento_monto`).
- **Reskin extendido a los otros 3 documentos** (a pedido explícito del
  usuario): `format:'date'` aplicado a `fecha_entrega`/`fecha_cotizacion`
  (Cotización), `fecha_entrega` (Hoja de llamado), `fecha_cierre` +
  columnas de hitos (Reporte de cierre) — cierra el gap de fidelidad de
  fechas crudas sin formato que los 3 archivos documentaban desde sus
  bloques originales, con el fallback "—" de `formatDateDisplay` incluido
  gratis para campos vacíos.
- **Verificado**: render sin excepción con 0, 2 y 10 responsables
  (multipágina real, sin solapamientos); PDF leído visualmente en cada
  paso del debugging (bugs de arriba encontrados así); editor visual en
  navegador real (`repeating-group` aparece como capa "requerido",
  editable como caja única — editar visualmente **una instancia
  representativa** de los `children` queda fuera de este bloque,
  documentado en `EditorCanvas.tsx`); `tsc`/lint/`vitest` completos en
  verde (1092 tests) antes de cada push.
- `PdfPlantillasRepository.migrar()`/`restaurar()` ahora soportan los 4
  tipos de documento.
- `docs/PLAN.md` actualizado: Bloque 9 → Cerrado en el tracker, con el
  detalle de la extensión de schema en la sección "Schema".

## Completado en esta sesión (sesión 3) — Bloque 8: Hoja de llamado + Reporte de cierre

Continuación directa tras el cierre del Bloque 7 (mismo día, misma sesión).
Ambos documentos, clasificados "menor riesgo" en el plan (sin tabla
agrupada ni banner de totales), reusan los mecanismos del Bloque 7 sin
necesitar otra decisión de arquitectura.

- **`TableElement.emptyText?: string`** (extensión mecánica de schema):
  CREW (Hoja de llamado) e hitos (Reporte de cierre) muestran un texto fijo
  en vez de una tabla vacía cuando el array de datos no tiene filas —
  patrón que Bloques 1-7 no necesitaban (Cotización siempre asume ítems).
- **Campos precalculados agregados al catálogo** (mismo patrón que
  `descuento_monto` de Cotización — el motor de templates no hace joins ni
  filtra arrays, esa lógica vive en la capa de datos): `crew_items`/
  `equipo_items` (`items.filter()` por categoría), `items[].telefono`
  (join contra `responsables`), `fecha_generacion` (fecha de hoy, no un
  dato del documento), `financiero_fila` (`[data.financiero]`, envuelto
  porque `rowsBinding` necesita un array), `equipo_texto`/
  `incidencias_texto` (join y fallback ya resueltos).
- **`lib/server/pdf/default-templates/hoja-llamado.ts`** y
  **`reporte-cierre.ts`**: baseline completo de cada generador real
  (header, bloque de info sin fondo negro — más simple que el header de
  Cotización, sin el problema de orden de pintado que sí tuvo esa
  plantilla —, NOTAS/EQUIPO/CRONOGRAMA/INCIDENCIAS con `flowAfter`,
  footer). Comparados visualmente contra `generateHojaDeLlamadoPdf()` y
  `generateReporteCierrePdf()` con datos equivalentes: paridad alta, sin
  bugs de solapamiento nuevos — el único defecto visual notado (texto de
  NOTAS pegado a su barra en Hoja de llamado) se confirmó preexistente en
  el PDF de producción actual, no una regresión.
- **Verificado en navegador real** (mismo mecanismo que Cotización: cookie
  `e2e-bypass`, APIs interceptadas con Playwright devolviendo cada
  baseline real): flujo "no migrado" → "Migrar este documento" → editor
  visual cargado, sin errores de consola nuevos, para ambos documentos.
- `PdfPlantillasRepository.migrar()`/`restaurar()` ahora soportan 3 de los
  4 tipos de documento (cotizacion, hoja_llamado, reporte_cierre) — solo
  orden_pago sigue pendiente (Bloque 9).
- `docs/PLAN.md` actualizado: Bloque 8 → Cerrado en el tracker.
- Commits separados por pieza (emptyText, catálogo de variables x2, ambos
  baselines), cada uno validado (`tsc`/`lint`/`vitest`, 1085 tests en verde
  al cierre) antes de pushear a `claude/zen-cray-4lre07` (PR #82, en
  borrador, bajo seguimiento).

## Completado en esta sesión (sesión 3) — Bloque 7: piloto Cotización

Continuación autónoma tras el cierre de Bloques 1-6 (sesión 2, PR #81 ya
mergeado a `main`). El usuario pidió revisar y paralelizar bloques donde no
hubiera dependencia real (ver sesión 2 abajo) y avisar solo al terminar el
plan completo.

- **Extensión de schema (aprobada por el usuario vía 3 opciones
  presentadas)**: el banner de totales real de Cotización (filas
  condicionales Descuento/IVA, color por fila, fondo relleno) no entraba en
  `TableElement`/`TextElement` sin perder fidelidad. Se agregó
  `visibleIf?: string` (elemento condicional a los datos) y un elemento
  nuevo `TotalsBannerElement`, más wrap real de texto largo (`maxWidth`).
- **3 extensiones mecánicas** (continuación directa, sin nueva decisión):
  `cotizacion.id` al catálogo de variables (excluido por error como "id
  interno" — se muestra al cliente como "# Cotización"),
  `format:'currency'` por columna de tabla, `groupTotalOf`/columna
  reservada `'__groupTotal'` (total por categoría).
- **Decisión de arquitectura (aprobada por el usuario, 3 opciones
  presentadas)**: el generador real posiciona banner/NOTAS/bloques legales
  con `currentY = lastAutoTable.finalY + gap` — depende de cuántos ítems
  tenga la tabla, no es una `y` fija. Se agregó `flowAfter`/`gap` a
  `PdfElementBase`: la `y` efectiva de un elemento encadenado es el borde
  inferior REAL (post-render) del elemento referenciado + `gap`, saltando
  ancestros ocultos por `visibleIf` (ej. GENERALES sin NOTAS). Reutilizable
  en Bloques 8/9 (mismo problema: tabla dinámica seguida de bloques fijos).
  En el camino se corrigieron 2 bugs reales del mecanismo (no específicos
  de Cotización): un elemento con `bgToken+h` encadenado justo después de
  otro con `bgToken+h` podía pintar encima del anterior si el gap no
  compensaba el alto de la caja; y un gap pensado para la baseline cruda de
  un texto plano no compensaba el alto ya sumado en el borde calculado.
- **`align:'justify'`** agregado a `TextElement` (jsPDF ya lo soporta
  nativo) — los bloques GENERALES/CANCELACIÓN lo usan en el generador real.
- **Token `--sn-yellow`** agregado al design system (aprobado por el
  usuario, aditivo): la fila "Descuento" del banner usa un amarillo sin
  equivalente entre los tokens `--sn-*` existentes.
- **`lib/server/pdf/default-templates/cotizacion.ts`**: baseline real
  reconstruyendo `cotizacion-pdf.ts` + helpers completo (header de 6 filas,
  logo ISO, tabla de partidas agrupada con total por categoría y moneda
  formateada, banner de 6 filas, NOTAS condicional, GENERALES/COSTOS/
  CANCELACIÓN encadenados con `flowAfter`). Validado visualmente
  comparando contra `generateCotizacionPdf()` con los mismos datos
  (cliente/proyecto/ítems equivalentes a SH2402): banner con valores
  idénticos, misma estructura, mismo artefacto preexistente de
  `align:'justify'` en la última línea corta de CANCELACIÓN (confirmado NO
  es una regresión — ya existe en el PDF de producción actual).
- **Acción "migrar"** agregada (`PdfPlantillasRepository.migrar`, `POST
  /api/editor-pdfs/[tipo]/migrar`, botón "Migrar este documento"): antes
  solo existía "restaurar", que requiere una fila `pdf_plantillas` ya
  existente — no había forma de crear la primera fila de un documento
  desde la UI.
- **Verificado en navegador real** (Chromium headless, cookie
  `e2e-bypass` + `PLAYWRIGHT_E2E_BYPASS=true` en dev — sin Supabase real en
  este sandbox, APIs interceptadas con `page.route()` devolviendo el
  baseline real): pantalla "no migrado" → clic en "Migrar este documento" →
  editor visual carga el baseline real, legible y editable. En el camino se
  encontró y arregló un gap real de `EditorCanvas.tsx` (Bloque 5, sin
  ejercitar hasta este piloto): `bgToken` nunca se pintaba como fondo en el
  canvas — las 6 etiquetas del header (texto blanco pensado para fondo
  negro) quedaban invisibles sobre el lienzo blanco.
- Gaps de fidelidad conocidos y aceptados (documentados en
  `cotizacion.ts`): fechas sin formatear (`formatDateDisplay` no existe en
  el motor de templates, limitación del Bloque 2 no específica de este
  documento), sin fallback "—" en locación vacía, sin bold-italic por celda
  en la tabla, header modelado como 12 `TextElement` en vez de una tabla
  real (`TableElement` asume filas homogéneas, no pares label/valor
  heterogéneos).
- `docs/PLAN.md` actualizado: Bloque 7 → Cerrado en el tracker, con el
  detalle de las 3 extensiones de schema/arquitectura de esta sesión.
- Commits separados por pieza (schema, renderer, color token, baseline,
  migrar, fixes de canvas), cada uno validado (`tsc`/`lint`/`vitest`) antes
  de pushear a `claude/zen-cray-4lre07` (PR #82, en borrador, bajo
  seguimiento).

## Completado en sesión anterior (sesión 2) — Bloque 1: spike del renderer

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

## Completado en sesión anterior (sesión 2) — Bloque 2 (completo) + Bloque 3 (parcial), en paralelo

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

## Completado en sesión 1 — Editor de PDFs pasa de Borrador a Aprobado

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

- `npx tsc --noEmit` → verde en cada commit de las 3 sesiones (Bloque 1,
  cada track por separado, integración, y cada pieza del Bloque 7).
- `npm run lint` → 0 errores en todo momento (8 warnings preexistentes,
  ninguno en archivos tocados por esta iniciativa).
- `npm test` → progresó de 969 (Bloque 1, sesión 2) a 1074 (cierre Bloque 7)
  y **1085 tests / 137 archivos** al cierre del Bloque 8, siempre en verde
  antes de cada push.
- **Bloque 7 (sesión 3), verificado en navegador real** (no solo
  suites): Chromium headless vía Playwright, cookie `e2e-bypass` +
  `PLAYWRIGHT_E2E_BYPASS=true` (sin Supabase real en este sandbox — APIs
  interceptadas devolviendo el baseline real generado por
  `buildCotizacionBaseline()`, no un mock inventado). Flujo completo "no
  migrado" → "Migrar este documento" → editor visual con el baseline
  cargado, legible y sin errores de consola reales (el único mensaje es un
  warning benigno de React en modo dev por `eval()`, no relacionado).
  Comparación visual pixel-por-bloque contra `generateCotizacionPdf()` con
  datos equivalentes a SH2402 (leyendo ambos PDFs con el lector de
  documentos) — ver detalle de gaps aceptados arriba.
- Bloques 1-6 (sesiones 1-2): sin e2e locales corridos entonces (módulos
  sin UI ni ruta todavía); el E2E de CI (PR #81) sí corrió por cada push y
  ya está en `main`.

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

El usuario pidió que se le avise recién cuando **el plan completo (10
bloques)** esté implementado y el editor listo para pruebas de uso reales
— no antes. Queda:

1. **Bloque 10** — Extensibilidad: dar de alta un 5º tipo de documento
   real, probando que el motor generaliza más allá de los 4 actuales.
2. PR #82 (`claude/zen-cray-4lre07` → `main`) sigue en borrador, bajo
   seguimiento (`subscribe_pr_activity`) — mergear solo cuando todo el plan
   esté cerrado y CI en verde, no bloque por bloque.
3. Pendientes antiguos, sin acción aún (fuera del alcance de esta
   iniciativa): corregir el acento desactualizado en `.claude/rules/ui.md`
   (`#FF5A1A` → `#FE7B01`); decidir si el RLS deshabilitado en
   `cliente_id_backfill_clasificacion` amerita una tarea aparte (ver
   "Problemas encontrados").
