# 015 — Los PDFs se diseñan en Claude Design y se implementan en código

## Contexto

Serenata genera 4 PDFs en servidor con jsPDF (cotización, orden de pago, hoja
de llamado, reporte de cierre). Para poder dejarlos "a gusto del usuario" se
abrió la iniciativa **Editor de PDFs** (PR #81, #83): un editor visual dentro
de la app con motor de plantillas (`renderFromTemplate()`), schema Zod, tabla
`pdf_plantillas` (activo/borrador) y ruta `/editor-pdfs`. Tras 7 bloques y
una reestructura, una auditoría encontró que **ningún PDF real de producción
usaba el motor**: los generadores hardcodeados seguían siendo la única fuente
de lo que se descargaba, y el editor tenía gaps de paridad canvas↔PDF.

El objetivo real del usuario nunca fue editar PDFs seguido: era definir el
diseño de cada PDF **una sola vez**. Una vez terminadas las plantillas, el
editor no se iba a usar.

## Decisión

1. Los formatos PDF se diseñan en **Claude Design**, sobre el design system
   Apple-style de Serenata, como HTML a tamaño real (A4 en mm) con una
   especificación en mm/pt/hex y los estados de paginación.
2. El HTML se pasa a **Claude Code**, que lo implementa directo en el
   generador jsPDF correspondiente de `lib/server/pdf/`, con tests y revisión
   visual (PDF → PNG) antes del PR.
3. El Editor de PDFs se **elimina por completo** (código, rutas, API,
   sección de permisos) y la tabla `pdf_plantillas` se borra con la migración
   `20260923_drop_pdf_plantillas_editor_pdfs.sql`, autorizada por el usuario.

Probado con Cotización: PR #86 (`bcfaa08`).

## Razón

- El diseño visual lo resuelve mejor una herramienta de diseño con el design
  system ya cargado que un editor construido a mano dentro del ERP.
- Mantener un motor de plantillas + editor + persistencia para un uso casi
  nulo era costo sin retorno (~3,500 líneas y una tabla con datos que ya se
  habían corrompido una vez por escrituras directas).
- La implementación directa en jsPDF es determinista y queda cubierta por los
  mismos tests y CI que el resto del código.

## Alternativas descartadas

- **Terminar el editor (P0-P4 del plan original).** Mucho trabajo pendiente
  para una herramienta que dejaría de usarse al cerrar las plantillas.
- **HTML→PDF con Chromium headless** para usar el HTML de Claude Design tal
  cual. Binario grande y arranques en frío en Vercel; no justificado mientras
  jsPDF reproduzca el diseño con buena fidelidad.

## Consecuencias

- Cada cambio de formato pasa por código (rama + PR). Ajustes pequeños se
  piden en texto a Claude Code; cambios grandes vuelven a Claude Design.
- El HTML de Claude Design es especificación, no código de producción. La
  especificación puede quedar atrasada respecto al HTML: cuando no coinciden,
  manda el HTML (es la última versión que vio el usuario) y la diferencia se
  anota en el PR.
- Desde una sesión en la nube de Claude Code no se puede leer un proyecto de
  Claude Design por link (requiere `/design-login`, que es interactivo): el
  usuario exporta el proyecto como `.zip` y lo sube al chat, o usa
  "Send to Claude Code Web".
- Infraestructura reutilizable ya creada: Inter embebida para jsPDF
  (`lib/server/pdf/fonts/inter.ts`, subset Latin, OFL) y los helpers de
  dibujo de `cotizacion-pdf.ts` (texto con tracking, justificado palabra por
  palabra, hairlines). Al migrar el segundo PDF, extraerlos a un módulo
  compartido en vez de copiarlos.
