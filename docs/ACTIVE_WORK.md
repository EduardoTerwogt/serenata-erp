# Trabajo activo

**Última actualización:** 2026-09-23 (sesión 5)

## Estado

**`docs/PLAN.md` — Aprobado, en ejecución: "Actualización de formatos PDF vía
Claude Design".** Bloques 1 (Cotización, PR #86) y 2 (Orden de pago, PR #88)
cerrados. El "Editor de
PDFs" se canceló y se eliminó por completo (PR #87, `bc371fc`, y tabla
`pdf_plantillas` borrada en test y producción).
Historia del editor: `docs/archive/editor-pdfs-cancelado.md`. Motivo:
`docs/decisions/015-pdfs-disenados-en-claude-design.md`.

## Completado en esta sesión (5)

- **Decisión de producto:** en lugar de terminar el editor visual dentro de
  la app, los PDFs se diseñan en Claude Design (design system Apple-style) y
  el HTML se implementa directo en jsPDF. Documentado en la decisión 015.
- **Rediseño del PDF de Cotización** (PR
  [#86](https://github.com/EduardoTerwogt/serenata-erp/pull/86), mergeado,
  `bcfaa08`): `lib/server/pdf/cotizacion-pdf.ts` reescrito sin autotable;
  Inter embebida (`lib/server/pdf/fonts/inter.ts`, subset Latin, OFL);
  banda de encabezado con isotipo, tabla con hairlines, banda de totales,
  Notas y Generales justificados; paginación con encabezado compacto,
  columnas repetidas, "cont." en grupos partidos y pie "Página N de M";
  acento `#FE7B01`. Se quitaron los helpers de autotable que quedaron sin
  uso.
- **Eliminación del Editor de PDFs** (PR
  [#87](https://github.com/EduardoTerwogt/serenata-erp/pull/87), mergeado,
  `bc371fc`): `app/editor-pdfs/`, `app/api/editor-pdfs/`, sus tests,
  `template-renderer`, `pdf-template-*`, `pdf-sample-data`,
  `pdf-color-tokens`, `repositories/pdf-plantillas`, la sección de permisos
  `editor-pdfs` (`lib/auth-callbacks.ts`, `lib/authz.ts`, `lib/api-auth.ts`,
  `AdminUsuarios.tsx`), la entrada del sidebar y los íconos solo usados por
  el editor (`components/ui/Icon.tsx`).
- **Base de datos:** migración
  `db/migrations/20260923_drop_pdf_plantillas_editor_pdfs.sql` (borra
  `pdf_plantillas` y quita `'editor-pdfs'` de `usuarios.sections`),
  autorizada por el usuario y **aplicada en `serenata-erp-test` y en
  producción** después del merge. Verificado en ambas: la tabla no existe y
  ningún usuario conserva la sección.
- **Rediseño del PDF de Orden de pago** (PR
  [#88](https://github.com/EduardoTerwogt/serenata-erp/pull/88), mergeado,
  `9088e7e`): `lib/server/pdf/orden-pago-pdf.ts` reescrito (resumen en
  encabezado, banda por proveedor con CLABE/banco/correo, evento con fecha
  de entrega, totales por evento/proveedor/general, paginación con banda
  "cont."); `fecha_entrega` agregado a `OrdenPagoPreviewResult`; helpers
  extraídos a `lib/server/pdf/pdf-draw.ts` (Cotización verificada idéntica
  pixel a pixel). CI verde y visto bueno del usuario.
- **Documentación:** `docs/PLAN.md` nuevo (flujo + tracker de los 4 PDFs);
  plan viejo archivado con banner de cancelado; decisión 015; `ROADMAP.md`
  (Siguiente + Cerrado); `ARCHITECTURE.md` (capa 5 y gotcha de PDFs);
  `.claude/rules/pdf.md`; `docs/PROMPTS.md` (prompt "Rediseñar un PDF en
  Claude Design"); `.claude/rules/ui.md` (acento corregido a `#FE7B01`,
  deuda arrastrada de la sesión 4).

## Tests ejecutados y resultado real

- PR #86: `tsc`, lint (0 errores, 8 warnings preexistentes), `npm test`
  (1065 verdes), `npm run build` verde local; en CI `test`,
  `smoke-and-critical`, `live`, `tracker-lint` y `fresh-db` verdes
  (`fresh-db` falló una vez antes de correr nada por rate limit de GitHub al
  bajar la CLI de Supabase; el re-run pasó).
- Revisión visual: los 3 escenarios del diseño (corto, largo de 3 páginas,
  casos límite) renderizados a PNG y aprobados por el usuario.
- Eliminación del editor: `tsc` verde, lint 0 errores, `npm test` 968 verdes
  (baja de 1065 por los tests del editor eliminados), `npm run build` verde;
  en CI de PR #87 `test`, `smoke-and-critical`, `live`, `fresh-db` y
  `tracker-lint` verdes.
- Orden de pago: `tsc`, lint 0 errores, `npm test` 972 verdes, build verde;
  CI de PR #88 todo verde; 3 escenarios del diseño renderizados a PNG.

## Problemas encontrados que siguen abiertos

- **Fuera de alcance, solo nota:** el advisor de Supabase (`supabase-test`)
  reporta RLS deshabilitado en `public.cliente_id_backfill_clasificacion`
  (crítico). No se tocó.
- Desde una sesión en la nube no se puede leer un proyecto de Claude Design
  por link (`/design-login` es interactivo). Solución: subir el `.zip`
  exportado (así se hizo con Cotización).

## Deuda técnica

- PDF de Cotización pesa ~780 KB, casi todo por los PNG de los logos (ya
  pasaba antes del rediseño).
- Arrastrada: Presence sin verificar en Preview, `SUPABASE_JWT_SECRET`
  distinto entre Production/Preview en Vercel, `AUTH_SECRET`/`NEXTAUTH_SECRET`
  coexistiendo en producción, `tracker-lint` de `test.yml` sin generalizar
  fuera de EF-3, verificación completa de Google OAuth pendiente, ramas
  remotas ya mergeadas sin borrar por policy del proxy de egress.

## Siguiente paso

1. **Hoja de llamado (bloque 3) en PR** — `lib/server/pdf/hoja-llamado-pdf.ts`
   reescrito según el diseño. Pendiente: visto bueno del usuario y merge con
   CI verde.
2. Reporte de cierre (bloque 4): **diferido** hasta definir el módulo de
   Proyectos (decisión del usuario). Al mergear el bloque 3 se cierra la
   iniciativa y `docs/PLAN.md` se archiva.
