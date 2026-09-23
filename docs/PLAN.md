# Plan de la iniciativa activa

**Estado:** Aprobado, en ejecución (2026-09-23) — **Actualización de formatos
PDF vía Claude Design.** Bloque 1 (Cotización) cerrado en PR #86. Siguiente:
elegir el próximo documento con el usuario.

Este archivo es el tracker de trabajo de **una sola iniciativa multi-sesión a
la vez** — nace como borrador desde la primera idea, se refina en vivo (crear
→ revisar → mejorar) hasta quedar aprobado, y guía la ejecución bloque por
bloque. Nombre fijo a propósito: así ninguna skill ni doc queda apuntando a
un nombre que caduca cuando la iniciativa cierra.

Ver también `docs/ACTIVE_WORK.md` (estado de la sesión) y `docs/ROADMAP.md`
(dirección de producto, sección "Cómo se mantiene").

## Contexto

Sustituye a la iniciativa "Editor de PDFs", cancelada y eliminada del código
el 2026-09-23 (historia: `docs/archive/editor-pdfs-cancelado.md`; motivo:
`docs/decisions/015-pdfs-disenados-en-claude-design.md`). El objetivo es el
mismo —que los 4 PDFs queden con el diseño que quiere el usuario—, pero sin
editor dentro de la app: cada formato se diseña una vez en Claude Design y se
implementa directo en su generador jsPDF.

## Flujo por documento

1. **Diseño (usuario, en Claude Design).** Con el design system Apple-style
   de Serenata activo y un PDF real del formato actual adjunto. Prompt base:
   `docs/PROMPTS.md` → "Rediseñar un PDF en Claude Design". Entregables: HTML
   a tamaño real (A4, mm), tabla de especificación (mm/pt/hex, reglas de
   salto de página) y varios estados (corto, largo multipágina, casos
   límite).
2. **Entrega a Claude Code.** Exportar el proyecto de Claude Design como
   `.zip` y subirlo al chat (desde una sesión en la nube no se puede leer el
   link directo). Alternativa: "Send to Claude Code Web".
3. **Implementación (Claude Code, rama + PR).** Reescribir el generador en
   `lib/server/pdf/` siguiendo el HTML (si la especificación y el HTML no
   coinciden, manda el HTML y se anota en el PR). Sin tocar datos, cálculos
   ni rutas API.
4. **Validación.** `tsc` + lint + `npm test` (con tests nuevos de
   paginación y fuente embebida) + `npm run build`; renderizar los mismos
   escenarios del diseño a PNG (`pymupdf`) y compararlos contra el HTML;
   mandar las capturas al usuario antes del merge.
5. **Merge** con CI en verde y visto bueno del usuario sobre el PDF real.

## Infraestructura reutilizable

- `lib/server/pdf/fonts/inter.ts` — Inter Regular/SemiBold/Bold para jsPDF
  (subset Latin, ~18 KB c/u, OFL en `Inter-OFL.txt`).
- `lib/server/pdf/cotizacion-pdf.ts` — helpers de dibujo: `trackedText`
  (mayúsculas con tracking, alineación correcta), `drawJustified`
  (justificado palabra por palabra; `Tw` no funciona con fuentes
  Identity-H), `hline`, `ellipsize`, paginación en dos fases con pie
  "Página N de M". **Al implementar el segundo documento, extraerlos a un
  módulo compartido** (p. ej. `lib/server/pdf/pdf-draw.ts`) en vez de
  copiarlos.
- Logos: `public/logo iso.png`, `public/serenata naranja.png` (vía
  `cotizacion-pdf-helpers.ts`).
- Paleta del diseño de Cotización (tinta `#1D1D1F`, acento `#FE7B01`, grises
  del design system) — reutilizar para que los 4 PDFs se vean como familia.

## Bloques y tracker de estado

| # | Bloque | Estado |
|---|---|---|
| 1 | Cotización | **Cerrado** — PR [#86](https://github.com/EduardoTerwogt/serenata-erp/pull/86), `bcfaa08` |
| 2 | Orden de pago | Pendiente — generador en `pt`, no `mm` (ver gotcha en `ARCHITECTURE.md`); estructura responsable→evento→tabla |
| 3 | Hoja de llamado | Pendiente |
| 4 | Reporte de cierre | Pendiente — tiene su propio `fmtMoney()` distinto de `formatCurrencyPdf()` |

El orden de 2-4 lo decide el usuario. Cada bloque es independiente (rama +
PR propios).

## Riesgos

- **Fidelidad jsPDF vs. HTML:** corte de líneas y kerning pueden variar
  ligeramente. Mitigación: revisión visual con PNG antes del merge.
- **Especificación atrasada respecto al HTML** (pasó en Cotización: la spec
  ponía el isotipo arriba de la banda, el HTML dentro). Manda el HTML.
- **Peso del PDF (~780 KB)** dominado por los PNG de los logos, no por las
  fuentes. Optimizar los logos es una mejora aparte, no bloquea.

## Criterios de aceptación (por bloque)

- El PDF real reproduce el diseño en los estados entregados por Claude Design.
- Datos, cálculos y rutas sin cambios; tests existentes en verde.
- Paginación: filas indivisibles, encabezado de columnas repetido, pie con
  página en todas las hojas.
- Visto bueno del usuario sobre capturas del PDF real.

## Ciclo de vida

1. **Vacío** — no hay iniciativa multi-sesión en curso ni en definición.
2. **Borrador** — una idea se confirma con alcance de iniciativa.
3. **En refinamiento** — el loop crear → revisar → mejorar ocurre editando
   este archivo directamente.
4. **Aprobado** (este estado) — cualquier sesión o cuenta puede tomarlo
   desde aquí y ejecutar bloque por bloque, actualizando el tracker de
   estado conforme avanza.
5. **Cerrado** — al terminar la iniciativa completa: `git mv docs/PLAN.md
   docs/archive/<slug-descriptivo>.md`, resumen en `docs/ROADMAP.md` →
   sección "Cerrado", y este archivo se recrea vacío (estado 1).
