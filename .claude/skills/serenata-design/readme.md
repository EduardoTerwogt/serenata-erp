# Serenata — Design System

Design system for **Serenata**, the internal production/quoting ERP of **Serenata House Entertainment**, a film & motion production house.

The product is a Spanish-language, dark-themed internal tool: an app shell with a fixed left rail and a content column that opens each section with a large brand-texture header, then a filterable list table. The one view documented in the source is **Cotizaciones** (quotes).

## Sources

This project was ported from a mounted local folder, `Serenata Design System/`, which was itself an earlier build of this same system. Everything in it — tokens, components, guideline cards, and the section template — was carried over verbatim; only the component namespace was rewired to this project's.

The folder's own upstream sources were a Spanish design brief plus a mockup and hand sketch of the **Cotizaciones** view. Their content is fully absorbed into this readme and into `ui_kits/serenata-app/`, which now covers all eleven sections of the product per a later brief from the product owner; the source files themselves have been removed to avoid confusion with the final design.

No Figma file, repository, logo files or font binaries were ever provided. Nothing in this system was reconstructed from memory of a real brand: the wordmark is set in plain type, the brand texture is a CSS stand-in, and the fonts and icons are flagged substitutions (below). **If you have the original Figma/code/assets, attach them — several sections below are marked as inferred and should be replaced with real values.**

## Products & surfaces

| Surface | Status | Where |
|---|---|---|
| Serenata · Fase 5 (11 secciones del producto) | Designed | `ui_kits/serenata-app/` |
| Marketing site, docs, mobile | Not provided | — |

El kit `serenata-app/` es el diseño de Fase 5 sobre el brief de secciones del dueño del producto y es la única recreación de producto vigente en este sistema.

---

## Content fundamentals

**Language.** All product copy is Spanish (Mexico). Currency is MXN formatted `$412,000`; dates are `02 sep 2026` (lowercase three-letter month, no period).

**Voice.** Operational and matter-of-fact — this is a tool colleagues use all day, not a marketing surface. Copy names the object and the action, nothing else. The brand's expressive register (the tagline, the texture, the giant display type) carries the personality; the words stay plain.

**Casing.**
- Display headings: **ALL CAPS**, one or two words — `COTIZACIONES`, `CLIENTES`.
- Eyebrow/kicker above a heading: ALL CAPS, wide tracking, orange, usually repeating the section or showing a folio — `COTIZACIONES`, `COT-2451`.
- Column headers and micro-labels: ALL CAPS, 11px, wide tracking — `FOLIO`, `CLIENTE`, `ESTATUS`, `TOTAL`.
- Buttons, nav, table cells, badges: sentence case — `Nueva cotización`, `Filtrar`, `Aprobada`, `Mostrando 10 de 128`.

**Person.** Section heroes carry only the section name in display caps — no eyebrow, no descriptive sentence. Impersonal or imperative — the UI never says "yo" and rarely says "tú". Actions are infinitives or nouns (`Filtrar`, `Exportar`, `Nueva cotización`); descriptions are third person (`Administra, emite y da seguimiento a las cotizaciones de producción.`). Ownership is shown as a name + role (`Mariana Reyes · Productora`), not as "your".

**Length.** Section subtitles are a single sentence under ~90 characters. Labels are one or two words. No help text, no exclamation marks, no questions.

**Numbers.** Counts are spelled into a short phrase — `Mostrando 10 de 128`, `Resultados por página`. Status is a single adjective in the feminine (agreeing with *cotización*): `Aprobada`, `Emitida`, `Borrador`, `Cancelada`.

**Emoji.** None, anywhere. Not in labels, not in empty states, not in status.

**Vibe.** Cinematic but disciplined: a very dark room, one warm orange light, big confident type, and then very quiet, legible plumbing underneath.

Examples verbatim from / consistent with the source:

> `COTIZACIONES` · `Administra, emite y da seguimiento a las cotizaciones de producción.` · `Nueva cotización` · `Filtrar` · `Mostrando 10 de 128` · `Resultados por página`

---

## Visual foundations

### Color
**The product is dark-only.** An earlier mock showed a Light/Dark switch in the topbar; it has been removed at the brand owner's instruction — there is no light theme and no theme control anywhere in the UI.

Corrections taken from the mockup and from review (they override §5/§7 of the written brief): the brand texture also glows behind the **sidebar rail**; the sidebar shows the **square "S" mark only**, label-only nav at 16px, and an **empty bottom area** (reserved for a settings action — the old tagline/version lockup is gone); the topbar is **transparent, right-aligned, user block only** — no global search, no theme switch, and the second line under the name is the person's **nickname**, not their job title; the section hero is a **compact band with the title and its CTA only** (no eyebrow, no subtitle); the filter tabs, contextual search and "Filtrar" stay on **one line**; table rows are **flush with 1px divider lines** inside one card at 14px.

The layout is deliberately **horizontal and dense**, authored for a **1920px viewport**: hero ~106px, topbar 84px, 19px gaps, so a full table fits on screen without vertical scrolling. Every value in the system was scaled to 0.8× at the brand owner's request — treat these numbers as the 100% sizes, not as a zoomed-out view.

Surfaces are a tight six-step ramp between `#0F1318` and `#1A2027`: page/sidebar `--bg-app` `#0F1318`, topbar `--bg-topbar` `#161D26`, card `--surface-card` `#151B22`, table row `--surface-row` `#191E25`, row hover `--surface-row-alt` `#1A2027`, input `--surface-input` `#10161C`. Because the steps are so close, **hierarchy comes from tone, not from lines or shadows**.

One accent hue: `--accent` `#FF5A1A` (CTA, active tab, avatars, eyebrow text), `--accent-pressed` `#EE4B02` (hover/active nav block), `--accent-quiet` `#C65008` (toggle knob, focus hairline). Text on orange is warm white `#FEFCF9`. Four text tones only: `#FEFCF9` primary, `#E8EAED` body, `#9AA2AA` muted, `#6B7280` faint.

Status pills are saturated fills with near-white labels: aprobada `#1F6B54`/`#DCF2E7`, emitida `#2A5C9C`/`#E1ECFA`, borrador `#4B535E`/`#E6EAEE`, cancelada `#8B2B2B`/`#F7DEDE`. Every pill has the same minimum width (80px) so the column reads as one stack. Do not add tones; map new states onto these four.

### Type
Two families. **Display**: condensed, geometric, very heavy, always uppercase, slightly negative tracking — the same face as the wordmark; used for section H1s at 56–72px and for big numbers. **UI/body**: a neutral grotesque at 400/500/600 for nav, tables, inputs, badges, buttons. Scale in use: 10, 11, 12, 13.5, 14, 14.5, 19, 27, 51px (nav 14.5, table cells 13.5, table headers 12, other micro-labels 10, section title up to 51). Line-height 1.02 for display, 1.25 for leads, 1.5 for body.

*Font substitution (flagged):* no font binaries were supplied. Display → **Archivo** (variable, `font-stretch: 88%`, weight 800); UI → **Manrope**. Both load from Google Fonts in `tokens/fonts.css`; because they load via `@import` rather than local `@font-face`, the system ships no font files. **Send the real Serenata display face (and the intended UI sans) and I will replace both and add proper `@font-face` rules.**

### Spacing, layout, radii
Scale: 4 / 6 / 13 / 19 / 26 / 32 / 45. Layout constants: sidebar 256px, sidebar padding 19px, content padding 29px (6px at the top) with 19px between blocks, topbar 84px, section hero min-height 106px, nav item height 38px at 14.5px type, nav gap 5px, table row padding 12px/19px at 13.5px type, control height 35px (42px for search fields, CTAs and the "Filtrar" button). The content column is fluid and left-aligned — never centred or max-width capped.

Radii are large and consistent: search fields, tab containers and large buttons 11px, small controls and nav items 8–10px, cards 18–19px, status badges 999px, avatars circular.

### Backgrounds & texture
No photography, no illustration, no repeating pattern. The only decorative element is the **brand texture**: an abstract, heavily blurred organic gradient mixing orange, red, teal and blue. It appears in exactly two places — bleeding down the left sidebar rail (`--sn-texture-rail`, warm at the bottom, cool in the middle) and inside the section hero (`--sn-texture`) — always under a dark scrim + blur so copy stays legible. The main content area is flat `#0F1318`. *The original artwork was not supplied* — `--sn-texture` is a CSS radial-gradient stand-in plus a `backdrop-filter: blur(38px)` scrim. Replace it with the real asset when available.

### Borders & shadows
The sidebar is the one place with real depth: a 1px hairline plus `--shadow-rail` (14px 0 34px, 45% black) separates it from the content column. Elsewhere, hairlines are 1px `#1F252D` — nearly invisible against the surfaces they bound. Shadows are effectively absent in-product: cards get none. Only floating layers use them (`--shadow-raised` for dropdowns, `--shadow-overlay` for modals). No inner shadows, no glow around the orange CTA (`--shadow-accent` exists but is a rare exception). No colored left-border cards.

### Transparency & blur
Used in exactly one place: the scrim over the brand texture (dark gradient + blur). Everything else is opaque. Do not introduce frosted panels, translucent cards or glassy overlays elsewhere.

### Animation
Quiet and functional: 120ms for control hover, 180ms for tabs and nav, 260ms for panels, all on `cubic-bezier(.2,.8,.2,1)`. Transitions animate colour and opacity only. No bounce, no spring, no scale-in, no entrance animation on page load.

### States
- **Hover** — controls step *up* one surface (`--surface-row` → `--surface-row-alt`); nav items go from transparent to the row surface and muted text to body text; the primary button darkens to `--accent-pressed`. Text never changes size or weight on hover.
- **Press** — colour only (the button holds `--accent-pressed`). Nothing shrinks or lifts.
- **Focus** — the input hairline tints to `--accent-quiet`; keyboard focus rings use 2px `--focus-ring` (orange at 55%) with 2px offset. *(Focus styling is inferred — §7 of the source calls it out as not visible in the mock.)*
- **Active/selected** — solid orange block for the nav row, solid orange pill for the selected tab. Selection is filled, never underlined or outlined.
- **Disabled** — 45% opacity, no colour change.

### Cards
Surface `#151B22`, 1px `#1F252D` hairline, 22–24px radius, no shadow. A table card has **zero padding**: the header row, the data rows and the footer each bring their own 24px horizontal padding and are separated by 1px hairlines that run the full card width. Rows have no background of their own; hover lifts them to `#1A2027`.

### Imagery
None in the source. If imagery is ever needed, follow the texture's palette: warm oranges and reds against deep teal/blue, dark and slightly cinematic — not bright, not cool-neutral, no visible grain.

---

## Iconography

**No icon assets were supplied** (no icon font, no sprite, no SVG set). The source mock shows outline glyphs at a uniform light stroke — a magnifier in the search fields, chevrons on the dropdown/filter/user controls, optional glyphs beside nav labels.

*Substitution (flagged):* **Lucide** (outline, 2px stroke, round caps, 24px grid) loaded from CDN as the UMD global — `<script src="https://unpkg.com/lucide@latest/dist/umd/lucide.js"></script>` — and wrapped by the `Icon` component, which is the only supported way to render a glyph in this system. **If Serenata has its own icon set, send it and I will swap the wrapper's source.**

Usage rules: 16px in table rows, 18px in buttons and inputs, 20px in the sidebar. Icons always inherit `currentColor`, so they take the muted/body/orange text tone of their context. Icons never carry their own colour, background or container. Emoji are never used, and unicode characters are never used as icons — the only non-Lucide glyph in the UI is the letter "S" placeholder standing in for the isotipo.

Sidebar navigation uses **no icons at all** — labels only, under the square brand mark. `NavItem` still accepts an `icon` prop for future use.

Names in use: `search`, `chevron-down`, `plus`, `sliders-horizontal`, `download`, `arrow-left`, `printer`, `send`, `circle-dot`, `layout-dashboard`, `file-text`, `users`, `clapperboard`, `calendar`, `settings`, `bell`, `more-horizontal`, `log-out`.

## Logo & brand assets

`assets/` is **empty by design**. The source describes an orange square isotipo with a stylised white "S" and a "SERENATA" wordmark in the display face, but no artwork was provided, and a real brand mark must never be redrawn from a description. Wherever a mark belongs, the `Wordmark` component sets the identity in plain display type: `variant="mark"` (the orange rounded square with a plain letter "S") is what the app sidebar uses, `variant="wordmark"` sets the full name. **Send the SVG/PNG logo files and I will drop them in and rewire `Wordmark`.**

---

## Index

Root files:

- `styles.css` — the single entry point consumers link. `@import` list only.
- `readme.md` — this document.
- `SKILL.md` — Agent Skills front-matter so this folder works as a Claude Code skill.
- `thumbnail.html` — homepage tile for the system.
- `tokens/` — `fonts.css`, `colors.css`, `typography.css`, `spacing.css`, `radius.css`, `elevation.css`, `motion.css`, `base.css`.
- `guidelines/` — foundation specimen cards (Colors, Type, Spacing, Brand groups).
- `components/` — the reusable primitives, below.
- `ui_kits/serenata-app/` — el kit de Fase 5: las once secciones del producto (Cotizador, Proyectos, Cuentas, Portal, Dashboard, Responsables, Planeación, Plantillas, Admin y Login); ver su `README.md`.
- `templates/vista-de-seccion/` — copyable section-view starter (see "Templates").
- `assets/` — empty; see "Logo & brand assets".

### Components

Grouped by concern. Each has `<Name>.jsx`, `<Name>.d.ts` and `<Name>.prompt.md` in its directory, plus one preview card per directory.

**components/core/** — `Button`, `Card`, `Avatar`, `Icon`, `Wordmark`
**components/forms/** — `SearchInput`, `TextField`, `Select`, `FilterButton`
**components/navigation/** — `Sidebar`, `NavItem`, `Topbar`, `UserMenu`, `FilterTabs`
**components/data/** — `DataTable`, `StatusBadge`, `TableFooter`
**components/layout/** — `AppShell`, `SectionHero`
**components/patterns/** — `Panel`, `Metric`, `Field`, `Folio`, `StateBadge`, `ProgressBar`, `BarChart` (con `ChartLegend`), `Modal`

The source document's §5 inventory maps to these directly: sidebar/nav → `Sidebar` + `NavItem`; topbar → `Topbar` + `SearchInput` + `UserMenu` + `Avatar`; section hero → `SectionHero`; filter tabs → `FilterTabs`; secondary filter bar → `SearchInput` + `FilterButton`; table → `DataTable` + `StatusBadge` + `TableFooter` + `Select`; buttons → `Button`.

**Intentional additions** (not in the source, added because the system needs them):
- `Icon` — wrapper for the substituted Lucide glyph set, so the substitution lives in one file.
- `Card` — the generic surface behind tables and panels, abstracted from the hero/table containers.
- `AppShell` — the two-column frame the source describes as a layout rule rather than a component.
- `TextField` — a labelled input; the source only shows search/filter inputs, but any create/edit flow needs one. Styled identically to `SearchInput`.
- `Wordmark` — type-only placeholder standing in for the missing logo files.
- `components/patterns/` — las composiciones que el diseño de Fase 5 estableció y que toda pantalla nueva necesita: `Panel` (tarjeta de sección con encabezado y acciones), `Metric` (tarjeta de KPI), `Field` (par etiqueta + valor), `Folio` (identificador tipo código en la display face), `StateBadge` (mapea los estados de proyecto, cuentas y validación sobre los cuatro tonos existentes), `ProgressBar`, `BarChart` + `ChartLegend` (el lenguaje de gráficas: barras agrupadas sin ejes, naranja de marca y teal de la textura) y `Modal` (el sistema no tiene panel lateral). Ninguna inventa estilo nuevo: todas se apoyan en los tokens y en los primitivos de arriba.

### Templates

Tres arquetipos listos para copiar. Cada carpeta trae su `ds-base.js`: en un proyecto consumidor solo se edita la línea `base` para apuntar al design system.

- `templates/vista-de-seccion/` — vista de lista: rail, topbar, hero con textura, tabs de filtro, buscador y tabla con footer. Es el patrón que siguen Cotizaciones, Proyectos y Responsables.
- `templates/vista-de-detalle/` — detalle de un registro: barra de contexto con folio, estatus y acciones por estado; datos generales en una sola fila; tabla de partidas a ancho completo; totales debajo con el desglose subtotal / fee / general / IVA / total final.
- `templates/dashboard-ejecutivo/` — vista de resumen: fila de KPIs, balance por periodo en barras agrupadas con leyenda, cruce del periodo y actividad.

## Open questions for the brand owner

1. Real logo files (isotipo + both wordmark versions) and the brand-texture artwork.
2. The real display font and intended UI sans — both are currently substituted.
3. Serenata's own icon set, if one exists.
5. Focus, error and empty states, none of which appear in the source mock.
