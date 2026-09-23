# Plan de la iniciativa activa

**Estado:** Aprobado, en ejecución (2026-09-23) — **Actualización de formatos
PDF vía Claude Design.** Bloques 1 (Cotización, PR #86) y 2 (Orden de pago,
PR #88) cerrados. Bloque 3 (Hoja de llamado) en curso, en PR.

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
- `lib/server/pdf/pdf-draw.ts` — helpers de dibujo compartidos (extraídos
  en el bloque 2): `registerFonts` (Inter con fallback a Helvetica),
  `centerBaseline` (línea base de texto centrado, equivalente a CSS),
  `trackedText` (mayúsculas con tracking, alineación correcta),
  `drawJustified` (justificado palabra por palabra; `Tw` no funciona con
  fuentes Identity-H), `hline`, `ellipsize`, `wrapLines`. El patrón de
  paginación (medir bloques → repartir en páginas → dibujar → pie
  "Página N de M" al final) está en `cotizacion-pdf.ts`,
  `orden-pago-pdf.ts` y `hoja-llamado-pdf.ts`. `clampLines` (máx. N líneas
  con "…") se agregó en el bloque 3.
- Logos: `public/logo iso.png`, `public/serenata naranja.png` (vía
  `cotizacion-pdf-helpers.ts`).
- Paleta del diseño de Cotización (tinta `#1D1D1F`, acento `#FE7B01`, grises
  del design system) — reutilizar para que los 4 PDFs se vean como familia.

## Bloques y tracker de estado

| # | Bloque | Estado |
|---|---|---|
| 1 | Cotización | **Cerrado** — PR [#86](https://github.com/EduardoTerwogt/serenata-erp/pull/86), `bcfaa08` |
| 2 | Orden de pago | **Cerrado** — PR [#88](https://github.com/EduardoTerwogt/serenata-erp/pull/88), `9088e7e`. Agrega `fecha_entrega` al evento del preview (`lib/server/ordenes-pago/build.ts`, ya venía en la RPC) y extrae `pdf-draw.ts` |
| 3 | Hoja de llamado | **En curso** — implementado en rama `claude/laughing-maxwell-qxscit`, PR abierto. Horarios convertidos a 12 h con am/pm (`toTwelveHour`), equipo técnico agrupado por responsable, cliente fuera del encabezado (decisión del diseño). Agrega `clampLines` a `pdf-draw.ts` |
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
