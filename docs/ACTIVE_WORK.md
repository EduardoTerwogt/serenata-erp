# Trabajo activo

**Última actualización:** 2026-09-23 (sesión 5, cierre)

## Estado

**`docs/PLAN.md` — Vacío.** La iniciativa "Actualización de formatos PDF vía
Claude Design" cerró completa esta sesión: los 3 bloques en alcance
(Cotización, Orden de pago, Hoja de llamado) están en producción. Historia:
`docs/archive/actualizacion-formatos-pdf-claude-design.md`. Motivo del
enfoque: `docs/decisions/015-pdfs-disenados-en-claude-design.md`. No hay
ninguna iniciativa multi-sesión abierta ahora mismo.

## Completado en esta sesión (5)

- **Decisión de producto:** los PDFs se diseñan en Claude Design (design
  system Apple-style) y el HTML se implementa directo en jsPDF, en vez de
  terminar el editor visual dentro de la app. Documentado en la decisión 015.
- **Editor de PDFs cancelado y eliminado por completo** (PR
  [#87](https://github.com/EduardoTerwogt/serenata-erp/pull/87), mergeado,
  `bc371fc`): código (`app/editor-pdfs/`, `app/api/editor-pdfs/`,
  `template-renderer`, `pdf-template-*`, `pdf-sample-data`,
  `pdf-color-tokens`, repositorio, sección de permisos, entrada de sidebar)
  y tabla `pdf_plantillas` (migración
  `20260923_drop_pdf_plantillas_editor_pdfs.sql`, autorizada por el usuario,
  aplicada en `serenata-erp-test` y en producción).
- **Rediseño del PDF de Cotización** (PR
  [#86](https://github.com/EduardoTerwogt/serenata-erp/pull/86), mergeado,
  `bcfaa08`): dibujo manual sin autotable, Inter embebida
  (`lib/server/pdf/fonts/inter.ts`, subset Latin, OFL), banda de encabezado
  con isotipo, tabla con hairlines, banda de totales, Notas y Generales
  justificados, paginación con encabezado compacto y pie "Página N de M",
  acento `#FE7B01`.
- **Rediseño del PDF de Orden de pago** (PR
  [#88](https://github.com/EduardoTerwogt/serenata-erp/pull/88), mergeado,
  `9088e7e`): resumen en encabezado, banda por proveedor con
  CLABE/banco/correo, evento con fecha de entrega, totales por
  evento/proveedor/general, paginación con banda "cont.". Se agregó
  `fecha_entrega` a `OrdenPagoPreviewResult` (ya venía en la RPC). Los
  helpers de dibujo se extrajeron de `cotizacion-pdf.ts` a
  `lib/server/pdf/pdf-draw.ts` — Cotización se verificó idéntica pixel a
  pixel tras la extracción.
- **Rediseño del PDF de Hoja de llamado** (PR
  [#89](https://github.com/EduardoTerwogt/serenata-erp/pull/89), mergeado,
  `aca7184`): fecha/horarios/locación/punto de encuentro legibles de un
  vistazo con "Por definir" cuando faltan; horarios convertidos a 12 h con
  am/pm (`toTwelveHour`); notas generales en caja gris (corrige el texto
  encimado del formato anterior); equipo técnico agrupado por responsable;
  paginación con títulos "(cont.)" y encabezado de tabla repetido. Se agregó
  `clampLines` a `pdf-draw.ts`.
- **Reporte de cierre (bloque 4) diferido** por decisión del usuario: se
  rediseña junto con la definición del módulo de Proyectos, de la que
  depende su contenido. Movido a `docs/ROADMAP.md` → "Después".
- **Documentación:** `docs/PLAN.md` recreado vacío; iniciativa archivada en
  `docs/archive/actualizacion-formatos-pdf-claude-design.md`;
  `docs/ROADMAP.md` (Siguiente + Cerrado); `ARCHITECTURE.md` (capa 5 y
  gotcha de PDFs); `.claude/rules/pdf.md`; `docs/PROMPTS.md` (prompt
  "Rediseñar un PDF en Claude Design"); `.claude/rules/ui.md` (acento
  corregido a `#FE7B01`).

## Tests ejecutados y resultado real

- Los 3 PR (#86, #88, #89): `tsc`, lint (0 errores, 8 warnings preexistentes
  sin cambio), `npm test` en verde en cada uno (978 al cerrar), `npm run
  build` verde. CI de los 3 PR: `test`, `smoke-and-critical`, `live`,
  `fresh-db`, `tracker-lint` verdes.
- Revisión visual: los 3 escenarios de diseño (corto, largo multipágina,
  casos límite) de cada PDF renderizados a PNG y aprobados por el usuario
  antes de cada merge.
- **Flake confirmado en PR #89:** `smoke-and-critical` falló una vez en
  `tests/e2e/smoke/portal-documentos.spec.ts` (locator ambiguo de Playwright,
  `getByText('ine.jpg')` con dos coincidencias) — archivo no tocado por el
  diff. Re-run pasó limpio; no se investiga más a fondo por ahora, pero si
  se repite en otro PR conviene revisar ese test (afinar el locator a
  `getByRole('link', { name: 'ine.jpg' })` en vez de texto genérico).

## Problemas encontrados que siguen abiertos

- **Fuera de alcance, solo nota:** el advisor de Supabase (`supabase-test`)
  reporta RLS deshabilitado en `public.cliente_id_backfill_clasificacion`
  (crítico). No se tocó.
- Desde una sesión en la nube no se puede leer un proyecto de Claude Design
  por link (`/design-login` es interactivo). Solución usada las 3 veces:
  subir el `.zip` exportado del proyecto.

## Deuda técnica

- PDF de Cotización pesa ~780 KB, casi todo por los PNG de los logos (ya
  pasaba antes del rediseño); no se optimizó, no bloqueaba nada.
- Arrastrada, sin cambios esta sesión: Presence sin verificar en Preview,
  `SUPABASE_JWT_SECRET` distinto entre Production/Preview en Vercel,
  `AUTH_SECRET`/`NEXTAUTH_SECRET` coexistiendo en producción, `tracker-lint`
  de `test.yml` sin generalizar fuera de EF-3, verificación completa de
  Google OAuth pendiente, ramas remotas ya mergeadas sin borrar por policy
  del proxy de egress.

## Siguiente paso

No hay iniciativa multi-sesión activa. Para retomar PDFs: rediseñar Reporte
de cierre cuando se defina el módulo de Proyectos (`docs/ROADMAP.md` →
"Después"). Para cualquier otro trabajo, priorizar en Chat con el estado
real del sistema a la vista (`docs/ROADMAP.md` → "Siguiente"/"Después").
