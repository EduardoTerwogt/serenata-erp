# Plan de la iniciativa activa

**Estado:** Borrador (2026-09-21) — alcance y herramientas del editor
validadas con el usuario (incluido un mockup interactivo); arquitectura del
motor de plantillas (opción A/B/C) pendiente de decidir antes de pasar a
"Aprobado".

Este archivo es el tracker de trabajo de **una sola iniciativa multi-sesión a
la vez** — nace como borrador desde la primera idea, se refina en vivo (crear
→ revisar → mejorar) hasta quedar aprobado, y guía la ejecución bloque por
bloque. Nombre fijo a propósito: así ninguna skill ni doc queda apuntando a
un nombre que caduca cuando la iniciativa cierra.

Ver también `docs/ACTIVE_WORK.md` (estado de la sesión) y `docs/ROADMAP.md`
(dirección de producto, sección "Cómo se mantiene").

## Contexto

`docs/ROADMAP.md` → "Después" marcaba "editor de PDFs tipo Canva" como
**fuera de alcance, sin cambios** desde el cierre de PR #76. El usuario pidió
retomarlo en sesión de `/serenata-iniciar-fase` (2026-09-21), en vez de
continuar con el Bloque 4 pendiente (filtro de estado en Cuentas) de la
iniciativa que ocupaba este archivo — ese Bloque 4 se diferió por decisión
explícita del usuario y se movió a `docs/ROADMAP.md` → "Después" como
pendiente suelto; historia completa de los bloques 1-3 (cerrados) y la nota
de cierre:
[`docs/archive/sueltos-portal-utilidad-cliente-id-fk.md`](archive/sueltos-portal-utilidad-cliente-id-fk.md).

**Estado actual del código** (confirmado leyendo `lib/server/pdf/` y
`.claude/rules/pdf.md`): los 4 PDFs del sistema (cotización, orden de pago,
hoja de llamado, reporte de cierre) se generan 100% programáticamente con
`jsPDF`+`jspdf-autotable` (`lib/server/pdf/pdf-base-config.ts` centraliza
colores/fuentes/márgenes). Cualquier ajuste visual hoy requiere tocar
código.

## El editor: alcance según el usuario

Precisado en dos rondas de intercambio durante la sesión:

- **Módulo nuevo del sidebar**, "Editor PDFs" — no un panel dentro de otro
  módulo existente.
- **Catálogo**: lista de los PDFs que existen hoy por nombre (cotización,
  orden de pago, hoja de llamado, reporte de cierre) + cualquier PDF nuevo
  que se agregue a futuro. Click sobre uno → entra a esa plantilla en modo
  editor.
- **Herramientas de edición acotadas a propósito** — no se busca paridad con
  Canva:
  - Personalizar **tablas** (hoy generadas con `jspdf-autotable`).
  - Posicionar/alinear elementos **libremente** (no solo parámetros fijos).
  - **Tipografía:** se mantiene la fuente actual (Helvetica) — el usuario no
    pide cambiar la familia tipográfica todavía (la traerá explícitamente
    cuando quiera cambiarla). Sí pide editar sobre esa misma fuente:
    **negrita, tamaño, alineación, espaciado**.
  - **Color:** editable por elemento (texto, fondo de tabla/etiqueta), pero
    **acotado a la paleta ya establecida** — swatches de los tokens `--sn-*`
    de `app/globals.css` (mismo catálogo que usa el resto del producto:
    tintas de ink/texto, acento naranja y sus variantes, superficies, los 7
    tonos de chip de navegación), nunca un selector de color libre. Mismo
    principio que ya aplica en el resto de la UI (`CLAUDE.md`: "Nunca
    `gray-*` ni `#f97316`").
- Empieza en una plantilla **propuesta por defecto** (calcada del PDF actual)
  y a partir de ahí se rediseña libremente.

**Mockup interactivo validado con el usuario en sesión**
(https://claude.ai/artifact/71nqoQ31msihVcE3tr1Bde): catálogo + editor sobre
las 4 plantillas reales, rediseñadas con la paleta del design system —
acento naranja en un solo lugar por documento (nunca repetido en cada
banda), bandas de sección con tinte suave en vez de negro sólido, tablas con
encabezado claro y tracking (como `DataTable`), logo real de Serenata como
elemento de imagen editable. Valida el patrón de props por elemento
(texto/tabla/imagen/línea + posición libre) antes de comprometerse a una
arquitectura de schema. Pendiente de reflejar ahí: panel de color por
swatches (pedido después de la última actualización del mockup) — no
bloquea este borrador, se ilustra en una iteración futura del mockup si
hace falta.

## Infraestructura reutilizable

- **Nav:** `app/components/SidebarLayout.tsx:22-32` — array `NAV_LINKS`
  (`href`, `label`, `section`, `icon`, `tone`, `group`). Agregar el módulo
  nuevo es una entrada más ahí, mismo patrón que `Plantillas`/`Planeación`.
- **Permisos:** `AppSection` (tipo en `auth.ts`) + `ALL_SECTIONS` en
  `lib/api-auth.ts:12` — hoy
  `['admin','dashboard','cotizaciones','proyectos','cuentas','responsables','planeacion']`.
  Un módulo nuevo necesita su propia sección (ej. `'editor-pdfs'`) agregada
  ahí y en el catálogo de permisos de usuario (falta ubicar dónde se asignan
  secciones a usuarios — a confirmar al abrir el bloque de scaffold).
- **Rutas API:** patrón `requireSection('<sección>')` primero, copiando una
  ruta hermana (regla obligatoria de `CLAUDE.md`).
- `lib/server/pdf/pdf-base-config.ts` — colores/fuentes/márgenes hoy
  hardcodeados; es la fuente de la plantilla default de partida.
- Cada generador actual (`cotizacion-pdf.ts`, `orden-pago-pdf.ts`,
  `hoja-llamado-pdf.ts`, `reporte-cierre-pdf.ts`) ya define qué campos/tablas
  necesita cada documento — son la fuente de verdad de las variables de
  datos que el editor debe poder bindear.
- Flujo de subida a Drive (`drive_file_id`, reusa archivo si ya existe) no
  se toca — el editor solo cambia cómo se genera el PDF, no el guardado.

## Opciones de arquitectura del motor de plantillas

- **A (recomendada) — Schema JSON + motor tipo `pdfme`:** editor visual
  React que produce un schema declarativo por elemento (texto, tabla,
  imagen, línea) con posición/tamaño/estilo + placeholders de datos;
  generador server-side vía `pdf-lib` (sin navegador headless). El set de
  props que pide el usuario (bold/tamaño/alineación/espaciado/color de
  texto, tablas como tipo de elemento propio, posición libre) es
  prácticamente el modelo nativo de este tipo de librería. Encaja con
  Vercel serverless.
  - Riesgo: tablas de filas dinámicas (partidas de cotización, líneas de
    orden de pago) necesitan mapearse bien dentro del schema — cantidad de
    filas variable con estilo por columna consistente.
- **B — Editor HTML/CSS (tipo grapesjs) + Puppeteer/Playwright a PDF:**
  máxima fidelidad visual pero Puppeteer en funciones serverless de Vercel
  es pesado (cold starts, tamaño de función) — mal encaje con la
  arquitectura actual. Se descarta salvo que A resulte insuficiente para
  reproducir las tablas actuales.
- **C — Parametrizar jsPDF actual (formulario de config, sin canvas):**
  mínimo esfuerzo pero no permite posicionamiento libre — no cumple lo
  pedido. Se descarta.

## Bloques propuestos (borrador, se refina con el usuario antes de aprobar)

1. Spike técnico: validar el motor de schema+render elegido reproduciendo
   una tabla real de cotización (filas variables) + los controles de texto
   pedidos (bold/tamaño/alineación/espaciado/color), sobre datos reales de
   test.
2. Scaffold del módulo: nueva sección de permisos (`AppSection`/
   `ALL_SECTIONS`), entrada en `NAV_LINKS` (`SidebarLayout.tsx`), ruta nueva
   con `requireSection` en cada endpoint.
3. Modelo de datos: tabla `pdf_plantillas` (tipo de documento, schema JSON,
   versión, autor/fecha) + migración numerada.
4. Catálogo: vista de lista de plantillas por nombre → entra al editor.
5. Editor visual: canvas de posicionamiento libre + panel de tablas + panel
   de texto (bold/tamaño/alineación/espaciado) + panel de color por
   swatches (tokens `--sn-*` vigentes en `app/globals.css`, no hex libre) +
   variables de datos disponibles por tipo de documento.
6. Piloto: migrar un documento real del generador jsPDF actual al nuevo
   motor, con plantilla default idéntica al PDF de hoy (mismo look).
7. Migrar los 3 documentos restantes.
8. Extensibilidad: cómo se da de alta un tipo de documento PDF nuevo a
   futuro como editable en el catálogo.

## Bloques y tracker de estado

| # | Bloque | Estado |
|---|---|---|
| 1 | Spike técnico: motor de schema+render | Pendiente — arranca al aprobar el plan |
| 2 | Scaffold del módulo (permisos, nav, rutas) | Pendiente |
| 3 | Modelo de datos: `pdf_plantillas` | Pendiente |
| 4 | Catálogo de plantillas | Pendiente |
| 5 | Editor visual (canvas, tablas, texto, color) | Pendiente |
| 6 | Piloto: migrar el primer documento real | Pendiente |
| 7 | Migrar los 3 documentos restantes | Pendiente |
| 8 | Extensibilidad para PDFs nuevos | Pendiente |

## Riesgos

- **P1 — Fidelidad visual:** la plantilla default debe verse igual que el
  PDF actual antes de considerar migrado cada documento.
- **P1 — Tablas dinámicas:** filas variables (partidas de cotización,
  líneas de orden de pago) dentro de un schema de posiciones fijas —
  resolver en el spike técnico (bloque 1).
- **P2 — Permisos del módulo nuevo** mal alcanzados (cualquier sección
  existente vs. una dedicada) — a decidir en el bloque 2.
- **P2 — Validación de schema:** un editor mal restringido podría romper el
  documento (texto que se sale de la página, campo de datos inexistente) —
  validar antes de guardar.
- **P2 — Paleta de color hardcodeada:** si el schema guarda el hex resuelto
  en vez del nombre del token, un cambio futuro en el design system
  (`--sn-orange`, etc.) dejaría el PDF desincronizado en silencio.
  Mitigación: el schema guarda el **nombre del token**, no el hex, y el
  renderer lo resuelve contra `app/globals.css` al generar.

## Validación

- Cada documento migrado se compara contra el PDF actual con datos reales
  de test antes de reemplazar el generador viejo.
- Flujo de subida a Drive (`drive_file_id`) probado sin cambios.
- El catálogo respeta `requireSection` igual que el resto de los módulos.
- Los swatches de color del editor son exactamente los tokens `--sn-*`
  vigentes en `app/globals.css` — ninguno inventado ni desactualizado.
- Cada bloque cierra con `tsc`/`lint`/`vitest` en verde + el e2e crítico que
  toque antes de pasar al siguiente.

## Artefactos de referencia

- **Editor PDFs — catálogo + editor, 4 plantillas rediseñadas:**
  https://claude.ai/artifact/71nqoQ31msihVcE3tr1Bde

## Ciclo de vida

1. **Vacío** — no hay iniciativa multi-sesión en curso ni en definición.
2. **Borrador** (este estado) — una idea se confirma con alcance de
   iniciativa.
3. **En refinamiento** — el loop crear → revisar → mejorar ocurre editando
   este archivo directamente. Próximo paso: decidir la opción de
   arquitectura (A/B/C) con el usuario.
4. **Aprobado** — cualquier sesión o cuenta puede tomarlo desde aquí y
   ejecutar bloque por bloque, actualizando el tracker de estado conforme
   avanza.
5. **Cerrado** — al terminar la iniciativa completa: `git mv docs/PLAN.md
   docs/archive/<slug-descriptivo>.md`, resumen en `docs/ROADMAP.md` →
   sección "Cerrado", y este archivo se recrea vacío (estado 1).
