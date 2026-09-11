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
pares `--sn-status-*-bg` / `-fg`; ver `components/ui/StatusBadge.tsx`.

También hay tokens de espaciado y de layout del shell (`--sidebar-width`,
`--topbar-height`, `--control-height`, la escala `--space-*`). Usarlos en vez de
inventar números.

## Tipografía

**Una sola familia en toda la app: Inter**, auto-hospedada con `next/font` en
`app/fonts.ts`. Sin familia display aparte y sin tratamiento en mayúsculas — el kit
pide la fuente de sistema (`-apple-system`/SF Pro) con Inter como fallback
multiplataforma.

La cadena de variables es legado y conviene conocerla antes de tocarla:

```
app/fonts.ts   →  --font-display  y  --font-ui   (ambas = Inter)
app/globals.css →  --font-inter    ← --font-ui
                   --font-poppins  ← --font-display
tailwind.config.ts → font-sans     ← --font-inter
                     font-display  ← --font-poppins
```

Los nombres `inter`/`poppins`/`archivo`/`manrope` que aparecen en el código son
**etiquetas históricas**; el valor real es Inter en todos los casos. Se conservan
para no tocar cada consumidor de `font-sans`/`font-display`. Al escribir UI nueva,
usar `font-sans` y `font-display` y no asumir nada por el nombre de la variable.

## Cómo escribir UI nueva

Con las clases que consumen los tokens (`bg-app`, `bg-surface`, `bg-row`,
`text-content`, `text-body`, `border-hairline`, `rounded-panel`,
`text-accent-quiet`, `sn-label`…), como en `app/cotizaciones/[id]/page.tsx`,
`app/dashboard/page.tsx` o `app/portal/page.tsx`. **No** usar `gray-*`, `#f97316`
ni el azul secundario: son del estilo anterior.

## Migración de Fase 5.7

El rediseño se aplicó por bloques. Las pantallas y primitivos que este documento
marcaba como pendientes (`app/login/page.tsx`, `app/admin/components/AdminSheets.tsx`
— la ruta vieja `app/admin/sheets/page.tsx` no existe, `components/ui/Button.tsx`,
`components/ResponsiveTableCard.tsx`, `app/components/ui/Skeleton*.tsx`) **ya usan
los tokens nuevos** — verificado el 2026-09-11, cero clases `gray-*`/`f97316`/azul
secundario en ninguno. Los primitivos viejos `Alert`/`AppCard`/`Badge`/`Input`/
`MetricCard` ya no existen bajo esos nombres (renombrados o reemplazados, ver la
lista real en `components/ui/`).

Esto cubre los archivos que se habían identificado como pendientes; no implica una
auditoría exhaustiva de todo el árbol de `app/` y `components/` en busca de otros
consumidores sueltos de la escala vieja de Tailwind que `app/globals.css` todavía
conserva por compatibilidad.
