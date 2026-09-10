# Design System

La fuente de verdad son los **tokens CSS en `app/globals.css`** (Fase 5.7/5.8), no
este documento. Aquí solo está el mapa para saber qué usar y qué queda pendiente.

El diseño completo — especímenes, componentes de referencia y el UI kit de las once
secciones — vive en el skill `.claude/skills/serenata-design/`. Ese kit es
**especificación visual, no código de producción**: se copian los valores, no los
componentes.

## Tema

Oscuro, cinematográfico. Naranja de marca sobre superficies casi negras.

| Rol | Token semántico | Valor |
|---|---|---|
| Fondo de app | `--bg-app` | `#0F1318` |
| Topbar | `--bg-topbar` | `#161D26` |
| Tarjeta | `--surface-card` | `#151B22` |
| Fila / fila alterna | `--surface-row` / `--surface-row-alt` | `#191E25` / `#1A2027` |
| Input | `--surface-input` | `#10161C` |
| Hairline (bordes) | `--border-subtle` | `#1F252D` |
| Acento de marca | `--accent` | `#FF5A1A` |
| Acento presionado / discreto | `--accent-pressed` / `--accent-quiet` | `#EE4B02` / `#C65008` |
| Tinta: título / cuerpo / apagado / tenue | `--text-primary` / `--text-body` / `--text-muted` / `--text-faint` | `#FEFCF9` · `#E8EAED` · `#9AA2AA` · `#6B7280` |

Los estados de badge (aprobado, emitido, borrador, cancelado) tienen sus propios
pares `--sn-status-*-bg` / `-fg`; ver `components/ui/Badge.tsx`.

También hay tokens de espaciado y de layout del shell (`--sidebar-width`,
`--topbar-height`, `--control-height`, la escala `--space-*`). Usarlos en vez de
inventar números.

## Tipografía

Cargadas con `next/font` en `app/fonts.ts`:

- **Archivo** → display, condensada, títulos y eyebrows (`font-display`).
- **Manrope** → UI y cuerpo (`font-sans`).

Son sustitutos de las fuentes de marca originales, que nunca se entregaron. Las
variables `--font-inter` / `--font-poppins` siguen existiendo por compatibilidad,
pero **apuntan a Manrope y Archivo**: los nombres son legado, los valores no.

## Cómo escribir UI nueva

Con las clases que consumen los tokens (`bg-app`, `bg-surface`, `bg-row`,
`text-content`, `text-body`, `border-hairline`, `rounded-panel`,
`text-accent-quiet`, `sn-label`…), como en `app/cotizaciones/[id]/page.tsx`,
`app/dashboard/page.tsx` o `app/portal/page.tsx`. **No** usar `gray-*`, `#f97316`
ni el azul secundario: son del estilo anterior.

## Migración pendiente

El rediseño se aplicó por bloques y no terminó. Siguen en el estilo viejo:

- `app/login/page.tsx`
- `app/admin/sheets/page.tsx`
- Los primitivos `components/ui/{Alert,AppCard,Badge,Button,Input,MetricCard}.tsx`,
  `components/ResponsiveTableCard.tsx` y `app/components/ui/Skeleton*.tsx`

`app/globals.css` conserva a propósito la escala de Tailwind (`text-xs/sm/base/lg`,
`rounded-sm/md/lg/xl`) sin sobreescribir, justo para que esas pantallas no se rompan
mientras se migran. No tocar eso sin migrar antes a sus consumidores.
