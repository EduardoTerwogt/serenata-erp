# Trabajo activo

**Última actualización:** 2026-09-23 (sesión 5)

## Estado

**`docs/PLAN.md` — Aprobado, en ejecución: "Actualización de formatos PDF vía
Claude Design".** Bloque 1 (Cotización) cerrado en PR #86. El "Editor de
PDFs" se canceló y su código se eliminó (PR de esta sesión, ver abajo).
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
- **Eliminación del Editor de PDFs** (rama `claude/laughing-maxwell-qxscit`,
  PR nuevo): `app/editor-pdfs/`, `app/api/editor-pdfs/`, sus tests,
  `template-renderer`, `pdf-template-*`, `pdf-sample-data`,
  `pdf-color-tokens`, `repositories/pdf-plantillas`, la sección de permisos
  `editor-pdfs` (`lib/auth-callbacks.ts`, `lib/authz.ts`, `lib/api-auth.ts`,
  `AdminUsuarios.tsx`), la entrada del sidebar y los íconos solo usados por
  el editor (`components/ui/Icon.tsx`).
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
  (baja de 1065 por los tests del editor eliminados), `npm run build` verde.

## Problemas encontrados que siguen abiertos

- **Tabla `pdf_plantillas` sigue en la base (test y prod).** El código ya no
  la usa. La migración que la borra y quita `'editor-pdfs'` de
  `usuarios.sections` no se escribió: el clasificador de permisos de la
  sesión bloqueó el `DROP TABLE`. Pendiente de confirmación del usuario.
  SQL propuesto (como `db/migrations/20260923_drop_pdf_plantillas_editor_pdfs.sql`
  + `_manifest.json`):
  ```sql
  DROP TABLE IF EXISTS pdf_plantillas;
  UPDATE usuarios SET sections = array_remove(sections, 'editor-pdfs')
  WHERE 'editor-pdfs' = ANY(sections);
  ```
  Mientras tanto no rompe nada: `lib/authz.ts` ignora secciones
  desconocidas.
- **Fuera de alcance, solo nota:** el advisor de Supabase (`supabase-test`)
  reporta RLS deshabilitado en `public.cliente_id_backfill_clasificacion`
  (crítico). No se tocó.
- Desde una sesión en la nube no se puede leer un proyecto de Claude Design
  por link (`/design-login` es interactivo). Solución: subir el `.zip`
  exportado (así se hizo con Cotización).

## Deuda técnica

- Helpers de dibujo de `cotizacion-pdf.ts` viven en ese archivo; extraerlos
  a un módulo compartido al migrar el segundo PDF (ver `docs/PLAN.md`).
- PDF de Cotización pesa ~780 KB, casi todo por los PNG de los logos (ya
  pasaba antes del rediseño).
- Arrastrada: Presence sin verificar en Preview, `SUPABASE_JWT_SECRET`
  distinto entre Production/Preview en Vercel, `AUTH_SECRET`/`NEXTAUTH_SECRET`
  coexistiendo en producción, `tracker-lint` de `test.yml` sin generalizar
  fuera de EF-3, verificación completa de Google OAuth pendiente, ramas
  remotas ya mergeadas sin borrar por policy del proxy de egress.

## Siguiente paso

1. Mergear el PR de eliminación del editor cuando CI esté en verde.
2. Decidir la migración de `pdf_plantillas` (arriba).
3. Elegir el siguiente PDF (orden de pago, hoja de llamado o reporte de
   cierre), diseñarlo en Claude Design con el prompt de `docs/PROMPTS.md` y
   subir el `.zip` a Claude Code.
