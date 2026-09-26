# Entrega: chip de meses (Cuentas · escritorio)

## Resumen
Este chip reemplaza la fila de 12 pastillas de mes más "Todo el año" en el encabezado de **Cuentas (escritorio)**.
- **Cerrado:** muestra solo el periodo seleccionado (por omisión, el mes en curso), su contador de pendientes y una flecha hacia la derecha dentro del mismo chip.
- **Abierto:** al hacer clic se despliega en la misma fila la tira completa de meses y "Todo el año", con animación en cascada. Al elegir una opción, la tira se contrae y el chip muestra el nuevo periodo.

La versión móvil no cambia.

## Sobre los archivos
`chip-meses-referencia.html` es una **referencia de diseño en HTML/JS**: se abre con doble clic y muestra el aspecto y el comportamiento exactos. **No es código de producción.** Hay que recrearlo con los componentes y patrones de la app: botón, badge, tokens y el componente `Icon` (Lucide `chevron-right` / `chevron-left`).

## Fidelidad
**Alta fidelidad.** Las medidas, los colores, la tipografía y los tiempos de animación son finales.

---

## Ubicación y layout
- Va en la fila de periodo, debajo del título "Cuentas". Es el mismo lugar que ocupaba la fila de meses.
- Fila: `display:flex; align-items:center; gap:12px; flex-wrap:nowrap`.
  - Izquierda: contenedor del chip, con `min-width:0` para que pueda encogerse.
  - Derecha: el select de año actual ("2026 · 6 pendientes"), sin cambios, con `margin-left:auto; flex:none; white-space:nowrap`.
- **Regla clave:** al expandirse, la tira **nunca empuja el select de año a otra línea**. Si no cabe, hace scroll horizontal (`overflow-x:auto`, barra oculta).

## Estado cerrado: chip
| Propiedad | Valor |
|---|---|
| Alto | 30px |
| Padding | 0 10px 0 14px |
| Radio | 999px |
| Borde | 1px solid `#E3E3E8` (hover: `#FE7B01`) |
| Fondo / texto | `#FFFFFF` / `#1D1D1F` |
| Tipografía | 12.5px, peso 600, fuente UI del sistema |
| Gap interno | 8px |
| Contenido | `[Nombre completo del mes]` `[badge]` `[chevron-right 14px]` |
| Chevron | Lucide `chevron-right`, 14px, trazo 2.2, opacidad .85, `margin-left:-2px` (queda a 6px del badge) |
| Focus visible | borde `#FE7B01` + `box-shadow: 0 0 0 3px rgba(254,123,1,.18)` |

- **Texto:** el nombre completo del mes ("Septiembre"). Si está elegido "Todo el año", dice **"Todo el año"**.
- **Badge:** pendientes del mes elegido; con "Todo el año", total de pendientes del año. Si es 0, no se muestra.

**Variante alternativa "acento":** es opcional y la aprobada es la blanca. Fondo y borde `#FE7B01`, texto blanco; el badge se invierte (fondo blanco, número `#FE7B01`).

## Estado abierto: tira de meses
Contenedor: `display:flex; gap:4px; overflow-x:auto; scrollbar-width:none; padding:2px 0`.

**Pastilla de mes** (×12, Ene…Dic):
| Propiedad | Valor |
|---|---|
| Alto | 28px |
| Padding | 0 9px |
| Radio | 999px |
| Borde | 1px solid `#E3E3E8` (hover `#FE7B01`) |
| Fondo / texto | `#FFFFFF` / `#1D1D1F` |
| Tipografía | 12.5px, peso 500 (600 si es el mes en curso) |
| Contenido | abreviatura de 3 letras + badge de pendientes si > 0 (gap 6px) |
| `flex` | `none` (no se encoge) |

Estados de la pastilla:
- **Activa (seleccionada):** fondo y borde `#FE7B01`, texto `#FFFFFF`, peso 600. Badge invertido: fondo blanco, número `#FE7B01`.
- **Sin movimientos:** `opacity:.55`, sigue siendo clicable. En los datos de ejemplo son Ene–May y Dic.
- **Mes en curso:** peso 600.

**"Todo el año":** igual que la pastilla, pero con padding 0 11px, peso 600 y `white-space:nowrap`. Activa, usa el mismo estilo accent.

**Botón contraer** (al final de la tira): círculo de 28 × 28px, borde `#E3E3E8`, fondo blanco, icono `#3A3A3C`, Lucide `chevron-left` de 14px con trazo 2.2. Aria-label: "Contraer meses".

**Badge** (en todos los casos): 16px de alto, `min-width:16px`, padding 0 4px, radio 999px, fondo `#FE7B01`, texto blanco, 10px/700, centrado.

## Interacción
| Acción | Resultado |
|---|---|
| Clic en el chip | Se abre la tira (animación de entrada). |
| Clic en un mes o en "Todo el año" | Se selecciona de inmediato (la pastilla pasa a activa) y la tira se contrae con animación. El chip vuelve con el nuevo periodo. |
| Clic en "‹" | Se contrae sin cambiar el periodo. |
| Tecla Esc | Se contrae. |
| Clic fuera | **No** cierra: la tira está en la misma fila, no es un menú flotante. |

Al cambiar el periodo se actualizan los datos de la página (totales, proyectos, lista), igual que antes con las pastillas.

## Animación
Easing para todo: `cubic-bezier(.2,.8,.2,1)`. Solo se animan `opacity` y `transform`.

```css
@keyframes mesIn  { from{opacity:0;transform:translateX(-8px) scale(.94)} to{opacity:1;transform:none} }
@keyframes mesOut { from{opacity:1;transform:none} to{opacity:0;transform:translateX(-8px) scale(.94)} }
@keyframes trigIn { from{opacity:0;transform:scale(.94)} to{opacity:1;transform:none} }
```
| Elemento | Apertura (`mesIn`, 260ms) | Cierre (`mesOut`, 260ms) |
|---|---|---|
| Mes *i* (0–11) | delay `i × 18ms` (izquierda → derecha) | delay `(13 − i) × 12ms` (derecha → izquierda) |
| "Todo el año" | delay 220ms | delay 12ms |
| Botón "‹" | delay 240ms | delay 0ms |
| Chip cerrado | — | reaparece con `trigIn` 220ms al terminar el cierre |

- Usar `animation-fill-mode: both`.
- El chip se desmonta o se vuelve a montar **300ms** después de iniciar el cierre, para que termine la cascada.
- Respetar `prefers-reduced-motion`: sin cascada, cambio instantáneo.

## Estado
- `month`: número 0–11 o `'all'`. Valor inicial: el mes en curso, según la fecha del servidor en zona horaria de México.
- `open`: boolean.
- `closing`: boolean. Está en `true` solo durante los 300ms de la animación de cierre.
- Datos por mes que se necesitan: `pendientes[12]`, `sinMovimientos[12]` y `pendientesAño`. Salen del mismo cálculo que ya alimentaba las pastillas (`monthPills` en `cuentas-data.js` del prototipo original).
- Si el usuario cambia de año en el select, se mantiene el mes elegido.

## Accesibilidad
- Chip: `<button aria-expanded="false|true">`, con aria-label "Periodo: {mes}. Ver todos los meses".
- Tira: `role="listbox"`; cada pastilla lleva `role="option"` y `aria-selected`.
- Al abrir, mover el foco a la pastilla activa. Al cerrar, devolverlo al chip.

## Tokens
- Acento `#FE7B01` (presionado `#E06D00`).
- Texto `#1D1D1F` / `#3A3A3C` / `#6E6E73`.
- Tarjeta `#FFFFFF`, borde sutil `#E3E3E8`, app `#F5F5F7`.
- Radios: pastilla 999px.
- Movimiento: 120 / 180 / 260ms con `cubic-bezier(.2,.8,.2,1)`.

## Archivos
- `chip-meses-referencia.html`: referencia interactiva autocontenida, en JS puro. Incluye un interruptor para ver la variante "acento".
- `Cuentas Escritorio - Menu Meses.dc.html`: la maqueta de pantalla completa donde se revisó el chip en contexto. Depende del entorno del proyecto de diseño; úsala solo como referencia.
