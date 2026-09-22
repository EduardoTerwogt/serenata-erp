# 015 — Fidelidad del schema estático del Editor de PDFs vs. el PDF dinámico real

## Contexto

El Editor de PDFs (`docs/PLAN.md` → "Editor de PDFs") representa cada
documento como un `PdfTemplate`: una lista de elementos con `x`/`y`/`w`/`h`
fijos (más `flowAfter`/`flowGap` para los que dependen del alto real de un
elemento anterior). El PDF real (`cotizacion-pdf.ts` y equivalentes) se
genera con `jsPDF`/`jspdf-autotable` de forma completamente dinámica: la
tabla de encabezado y la de partidas calculan su propio alto según el
contenido, el banner de totales según cuántas filas queden visibles, y los
bloques de texto legal según cuántas líneas ocupe el wrap real.

Durante la verificación manual del Bloque 11 (rediseño de interacción del
lienzo) se encontró que el `active_schema` de Cotización, aunque
estructuralmente válido, tenía posiciones que no correspondían al PDF real:
la columna de valor del encabezado invadía el logo ISO, el logo Serenata
quedaba encimado con "Subtotal" dentro del banner de totales, y los
`flowGap` de NOTAS/GENERALES/COSTOS/CANCELACIÓN no coincidían con el
`currentY` real de `cotizacion-pdf.ts`. Se recalcularon instrumentando
`jsPDF`/`autoTable` reales con datos de muestra (no a ojo) — ver migración
`20260922_fix_cotizacion_active_schema_visual_fidelity.sql`.

## Decisión

El schema estático se calibra para el **caso típico** de una cotización
(ej. banner de totales con Subtotal/Fee/General/IVA/TOTAL — 5 filas, sin
descuento), no para reproducir exactamente cualquier combinación posible de
datos. Donde un mismo campo `y` debe servir dos propósitos que el generador
real separa (ej. el borde superior de un rectángulo de fondo vs. el
baseline del texto que va encima), se prioriza la posición **visualmente
dominante** — el rectángulo de fondo en las filas del encabezado (bloques
grandes, muy notorios si están mal); el baseline del texto en las etiquetas
NOTAS/COSTOS/CANCELACIÓN (la legibilidad del texto importa más que el
rectángulo de 6-8mm detrás).

No se resuelven en el schema (quedan como limitación conocida, requieren
cambio de código):

1. **Columna "Total categoría"** de la tabla de partidas real (subtotal por
   categoría, solo en la primera fila del grupo) — `TableElement`/
   `renderGroupedTable` no soportan una columna derivada así hoy. Se omite
   en vez de fingirla con datos falsos; los anchos de columna se
   redistribuyeron proporcionalmente a las 5 columnas reales para no dejar
   un hueco vacío a la derecha.
2. **Centrado exacto del logo Serenata** dentro del banner de totales: el
   alto del banner es dinámico (según filas visibles), pero `flowGap` es un
   valor fijo en el schema — no hay forma de expresar "centrado dentro de
   un hermano de alto dinámico" con el modelo de flujo actual. Se calibró
   para el caso de 5 filas; con 4 o 6 filas el logo queda cerca del centro
   pero no exacto.
3. **Colapso de posición cuando un elemento con `visibleIf` es falso**:
   `resolveTemplateLayout()` (`pdf-template-layout.ts`) no salta el
   elemento invisible en la cadena de `flowAfter` — sigue sumando su propio
   `flowGap` aunque no dibuje nada. Para NOTAS (condicional) esto significa
   que cuando `notas` está vacío, GENERALES queda con más espacio en blanco
   arriba del que tiene el PDF real (donde simplemente no hay bloque de
   NOTAS). Es un bug de `pdf-template-layout.ts`, no de datos — pendiente
   de decidir si se corrige (cambiar el colapso para que un elemento
   invisible pase el `bottom` de su propio `flowAfter` sin sumar su
   `flowGap`) o se acepta como límite conocido del MVP.

## Razón

Corregir 1-3 requiere cambios de código (nuevo tipo de columna derivada,
expresar "centrado dentro de altura dinámica" en el modelo de flujo,
arreglar el colapso de invisibles) que están fuera del alcance de una
migración de datos y no fueron pedidos explícitamente — el pedido del
usuario fue que el schema existente **se pareciera al PDF real**, no una
reescritura del motor de layout. Se prioriza cerrar la brecha visible más
grande (posiciones objetivamente erróneas, verificables contra el
generador real) sobre perseguir fidelidad pixel-perfect en casos límite de
datos poco comunes.

## Alternativas descartadas

- **Reescribir `pdf-template-layout.ts` para soportar posiciones relativas
  arbitrarias** (ej. `centerWithin: { of: string; ownHeight: number }`) —
  resolvería 2 de raíz, pero es un cambio de arquitectura no aprobado
  todavía; se deja como mejora futura, no bloqueante para este fix.
- **Agregar la columna "Total categoría" con un campo `groupTotalOf` en
  `PdfTableColumnSchema`** — viable, pero requiere calcular el subtotal por
  grupo en el data-adapter que alimenta el renderer (`items[]` no lo trae
  hoy) — cambio de código real, no de datos.

## Consecuencias

- El editor visual y el PDF final de Cotización ahora coinciden en la
  gran mayoría de posiciones para el caso típico de uso.
- Quien retome el Bloque 7 (migrar la ruta real de generación de PDF de
  Cotización a `renderFromTemplate()`) debe saber que la fidelidad no es
  pixel-perfect en todos los casos de datos — los 3 puntos de arriba son
  el punto de partida conocido, no sorpresas nuevas a descubrir.
- Si se decide invertir en la columna "Total categoría" o en posiciones
  relativas dinámicas, este documento es el contexto de por qué no se hizo
  ya (falta de alcance aprobado, no falta de detección).
