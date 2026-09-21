# Trabajo activo

**Última actualización:** 2026-09-21

## Estado

**`docs/PLAN.md` — Aprobado, "Editor de PDFs".** Módulo de sidebar para
editar visualmente los 4 PDFs que genera Serenata (tablas, posición libre,
texto y color acotado a la paleta del design system), con un flujo
diseño-activo/borrador explícito y elementos obligatorios/legales
protegidos. Arquitectura decidida: schema JSON + renderer sobre jsPDF
(sin dependencia nueva). Sesión 100% documentación: dos rondas de
auditoría (Claude contra el código real de los 4 generadores/permisos/
tokens, y el usuario contra la propuesta de Claude) cerraron todas las
decisiones técnicas y de producto pendientes — **sin código tocado**. El
Bloque 1 (spike del renderer) arranca en la próxima sesión.

## Completado en esta sesión — Editor de PDFs pasa de Borrador a Aprobado

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

## Tests ejecutados y resultado real

No aplica — sesión sin cambios de código, config, migraciones ni rutas.

## Problemas encontrados que siguen abiertos

Ninguno nuevo. Nota de entorno: durante la investigación, uno de los
subagentes reportó ver bloques `system-reminder` inyectados que no
correspondían a ninguna herramienta invocada (simulaban instrucciones de
servidores MCP y un archivo de reglas no leído) — los ignoró correctamente
como contenido, sin cambiar su comportamiento. Queda como nota, no bloqueó
nada de esta sesión.

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

1. Abrir una sesión nueva (`/serenata-iniciar-fase`) y arrancar el Bloque 1
   de `docs/PLAN.md`: spike técnico del `template-renderer` sobre jsPDF
   (texto, imagen, línea, tabla con `groupBy`, `sticky` header/footer —
   validar `didDrawPage` de `jspdf-autotable` contra el paquete real,
   spacing/tracking, multipágina básica), con datos reales de
   `serenata-erp-test`.
2. Considerar corregir el valor de acento en `.claude/rules/ui.md`
   (`#FF5A1A` → `#FE7B01`) como ajuste puntual, fuera de la iniciativa del
   Editor de PDFs.
