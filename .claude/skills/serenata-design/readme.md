# Serenata — Design System

Design system for **Serenata**, the internal production/quoting ERP of **Serenata House Entertainment**, a film & motion production house. Visual language: an Apple/macOS idiom — light by default with a dark toggle, frosted-glass sidebar and topbar, one neutral system font, a contained brand orange, and iOS-style filled icon chips in navigation.

## Sources

No Figma file, repository, logo files or font binaries were ever provided. The wordmark is set in plain type, the brand texture is a CSS stand-in, and the fonts and icons are flagged substitutions (see "Iconography" and "Logo & brand assets" below). **If you have the original Figma/code/assets, attach them.**

## Products & surfaces

| Surface | Status | Where |
|---|---|---|
| Serenata (11 secciones del producto) | Designed | `ui_kits/serenata-app/` |
| Marketing site, docs, mobile | Not provided | — |

`ui_kits/serenata-app/` is the only product recreation in this system, covering all eleven sections of the ERP per the product owner's brief.

## Content fundamentals

**Language.** All product copy is Spanish (Mexico). Currency is MXN formatted `$412,000`; dates are `02 sep 2026` (lowercase three-letter month, no period).

**Voice.** Operational and matter-of-fact — this is a tool colleagues use all day, not a marketing surface. Copy names the object and the action, nothing else.

**Casing.**
- Display headings: sentence case — `Cotizaciones`, `Clientes`. Never forced uppercase.
- Eyebrow/kicker (where one appears, e.g. panel eyebrows): ALL CAPS, wide tracking, orange.
- Column headers and micro-labels: ALL CAPS, 11px, wide tracking — `FOLIO`, `CLIENTE`, `ESTATUS`, `TOTAL`.
- Buttons, nav, table cells, badges: sentence case — `Nueva cotización`, `Aprobada`, `Mostrando 10 de 128`.

**Person.** Impersonal or imperative — the UI never says "yo" and rarely says "tú". Actions are infinitives or nouns (`Exportar`, `Nueva cotización`); descriptions are third person. Ownership is shown as a name + role (`Mariana Reyes · Productora`), not as "your".

**Length.** Labels are one or two words. No help text, no exclamation marks, no questions.

**Numbers.** Counts are spelled into a short phrase — `Mostrando 10 de 128`, `Resultados por página`. Status is a single adjective in the feminine (agreeing with *cotización*): `Aprobada`, `Emitida`, `Borrador`, `Cancelada`.

**Emoji.** None, anywhere.

Examples: `Cotizaciones` · `Nueva cotización` · `Mostrando 10 de 128` · `Resultados por página` · `Aprobada` · `Sin items`

---

## Visual foundations

### Color
**Light by default, with a dark toggle.** `data-theme="dark"` on any ancestor (`<html>`/`<body>`) switches to dark; omit it and the system is light. See the "Theme toggle" card under Colors.

Surfaces, light: page `--bg-app` `#F5F5F7`, sidebar/topbar glass `rgba(237,237,240,.78)` / `rgba(245,245,247,.72)` over blur, card `--surface-card` `#FFFFFF`, row alt `--surface-row-alt` `#FAFAFB`. Dark: page `#1C1C1E`, card `#2C2C2E`, row alt `#262628`.

One accent hue: `--accent` `#FE7B01` (sampled from the isotipo's background — CTA, active nav chip, avatars, eyebrow text, active tab), `--accent-pressed` `#E06D00` (hover/press), `--accent-quiet` `#B85800` (focus hairline). Text on orange is white. Four text tones: `--text-primary` `#1D1D1F`, `--text-body` `#3A3A3C`, `--text-muted` `#6E6E73`, `--text-faint` `#98989D` (dark theme swaps to the equivalent light-on-dark ramp).

Status pills are soft tints with saturated-color labels: aprobada tint/`#218C3E`, emitida tint/`#1C63B7`, borrador tint/`#6E6E73`, cancelada tint/`#C13A20`. Every pill has the same minimum width (80px). Do not add tones; map new states onto these four.

Sidebar nav icons sit in a small filled color chip — gray/blue/purple/red/teal/green/indigo — and turn solid accent-orange when the item is active.

### Type
One neutral family everywhere. `--font-ui` and `--font-display` both resolve to the OS system font (`-apple-system`/SF Pro) with **Inter** as the cross-platform fallback. `sn-display` is a plain 700-weight, -0.01em-tracked heading style — no uppercase, no condensed stretch. Scale: 10, 11, 12.5, 13.5, 14, 17, 22, 27, 34px. Line-height 1.15 display, 1.3 leads, 1.5 body.

### Spacing, layout, radii
Spacing scale: 4 / 6 / 13 / 19 / 26 / 32 / 45. Layout constants: sidebar 250px (padding 13px), topbar 56px, content padding 26px top / 30px sides, control height 32px (36px large), nav item height 32px with a 14px gap between rows, table row/header min-height 46px/36px with 18px horizontal padding and a 12px column gap. The content column is fluid and left-aligned.

Radii: inputs 9px, buttons/nav/cards-small 7–8px, cards 12px, status badges and pills 999px, avatars circular.

### Backgrounds & texture
No photography, no illustration, no repeating pattern in the product UI. The **brand texture** (`--sn-texture`, an abstract blurred gradient mixing orange/red/teal/blue) exists as a token for occasional use, but the one place a real photographic texture appears is the **login intro animation** — see below.

### Login intro animation
`ui_kits/serenata-app/LoginScreen.jsx` opens on the real brand-texture photograph (`assets/login-bg.jpg`), distorted by an animated SVG filter (`feTurbulence` + `feDisplacementMap`, `id="sn-warp"`) so it moves like liquid rather than a static image. The white wordmark (`assets/wordmark-white.png`) wipes in at the center at a contained size, a grain layer flickers on top, then the whole intro fades and blurs out over ~2.4s to reveal the login card. The same background + warp filter + grain reappear behind the post-submit "Bienvenido" loading state, with `SplashMark` (the isotipo filling with the texture gradient) centered on top.

### Borders & shadows
Depth comes mostly from glass blur and hairlines, not drop shadows. Hairlines are 1px `--border-subtle`. Cards get a barely-there shadow (`--shadow-card`); floating layers use more (`--shadow-raised` for dropdowns, `--shadow-overlay` for modals, `--shadow-segment` for the active pill in a segmented control). No colored left-border cards.

### Transparency & blur
The sidebar and topbar are frosted glass (`--blur-strong` / `--blur-soft`, i.e. `backdrop-filter: blur()+saturate()`) over the app background — the system's one signature material effect. Everything else (cards, tables, modals) stays opaque.

### Animation
Quiet and functional: 120ms control hover, 180ms tabs/nav, 260ms panels, all on `cubic-bezier(.2,.8,.2,1)`. Transitions animate colour, opacity and the search field's width only. No bounce, no spring, no scale-in, no entrance animation on page load.

### States
- **Hover** — controls step *up* one surface; nav items go from transparent to a soft overlay and muted text to body text; the primary button darkens to `--accent-pressed`.
- **Press** — colour only. Nothing shrinks or lifts.
- **Focus** — the input hairline tints to `--accent-quiet`; keyboard focus rings use 2px `--focus-ring` (orange at 45%) with 2px offset.
- **Active/selected** — the nav row gets an accent-tint background and its chip turns solid accent-orange; the selected segmented-control tab gets a raised card-colored pill.
- **Disabled** — 45% opacity, no colour change.

### Imagery
None in the source. If imagery is ever needed, follow the texture's palette: warm oranges and reds against teal/blue — not bright, not cool-neutral.

---

## Iconography

*Substitution (flagged):* **Lucide** (outline, 2px stroke, round caps, 24px grid) loaded from CDN as the UMD global — `<script src="https://unpkg.com/lucide@latest/dist/umd/lucide.js"></script>` — and wrapped by the `Icon` component, the only supported way to render a glyph in this system.

Usage rules: 16px in table rows, 18px in buttons and inputs, 13px inside sidebar chips. Everywhere except the sidebar, icons inherit `currentColor` and carry no background. Emoji are never used, and unicode characters are never used as icons.

## Logo & brand assets

`assets/` holds the real brand artwork, supplied by the user: `logo-mark.png` (the orange square isotipo with the white "S") and `logo-mark-alpha.png` (its transparent white-silhouette derivative, used to mask/recolor the shape — `SplashMark`, the login header). `wordmark-white.png` is the real "SERENATA" lockup in white, used in the login intro. `login-bg.jpg` is the real liquid-texture photograph used as the login background (see "Login intro animation" below). All are embedded as data URIs in `components/core/brand-assets.js` except the login-specific ones, which `LoginScreen.jsx` references directly by path to keep the bundle light.

---

## Index

Root files:

- `styles.css` — the single entry point consumers link. `@import` list only.
- `readme.md` — this document.
- `SKILL.md` — Agent Skills front-matter so this folder works as a Claude Code skill.
- `thumbnail.html` — homepage tile for the system.
- `tokens/` — `fonts.css`, `colors.css`, `theme-dark.css`, `typography.css`, `spacing.css`, `radius.css`, `elevation.css`, `motion.css`, `base.css`.
- `guidelines/` — foundation specimen cards (Colors, Type, Spacing, Brand groups).
- `components/` — the reusable primitives, below.
- `ui_kits/serenata-app/` — el kit de UI: las once secciones del producto (Cotizador, Proyectos, Cuentas, Portal, Dashboard, Responsables, Planeación, Plantillas, Admin y Login); ver su `README.md`.
- `templates/` — copyable page starters (see "Templates").
- `assets/` — the real isotipo; see "Logo & brand assets".

### Components

Grouped by concern. Each has `<Name>.jsx`, `<Name>.d.ts` and `<Name>.prompt.md` in its directory, plus one preview card per directory.

**components/core/** — `Button`, `Card`, `Avatar`, `Icon`, `Wordmark`
**components/forms/** — `SearchInput`, `TextField`, `Select`
**components/navigation/** — `Sidebar`, `NavItem`, `Topbar`, `UserMenu`, `FilterTabs`
**components/data/** — `DataTable`, `StatusBadge`, `TableFooter`
**components/layout/** — `AppShell`
**components/patterns/** — `Panel`, `Metric`, `Field`, `Folio`, `StateBadge`, `ProgressBar`, `BarChart` (con `ChartLegend`), `Modal`, `SplashMark`

- `Icon` — wrapper for the substituted Lucide glyph set, so the substitution lives in one file.
- `Sidebar` + `NavItem` — grouped, glass nav rail with tone-chip icons.
- `Topbar` — glass bar: optional left slot (breadcrumb), right slot, then `UserMenu`.
- `FilterTabs` — segmented control for status/view filters, with optional counts.
- `SearchInput` — can be always-open or `expandable` (an icon-only button that opens into a field on click, macOS-Finder style).
- `AppShell` — the sidebar + topbar + content-column frame every screen uses.
- `components/patterns/` — compositions every new screen needs: `Panel` (section card with header/actions), `Metric` (KPI card), `Field` (label + value pair), `Folio` (code-like identifier), `StateBadge` (maps project/account/validation states onto the four existing tones — never invent a new one), `ProgressBar`, `BarChart` + `ChartLegend` (grouped bars, no axes, brand orange + texture teal), `Modal` (the system has no side panel; all detail/confirmation is a centered modal), `SplashMark` (brand loader — the isotipo filling with the texture gradient in a clip-path loop).

### Templates

Tres arquetipos listos para copiar. Cada carpeta trae su `ds-base.js`: en un proyecto consumidor solo se edita la línea `base` para apuntar al design system.

- `templates/vista-de-seccion/` — vista de lista: rail agrupado con vidrio esmerilado, topbar, título con acción, filtro segmentado + buscador expandible, y tabla con footer. Es el patrón que siguen Cotizaciones, Proyectos y Responsables.
- `templates/vista-de-detalle/` — detalle de un registro: barra de contexto con folio, estatus y acciones por estado; datos generales en una sola fila; tabla de partidas a ancho completo; totales debajo con el desglose subtotal / fee / general / IVA / total final.
- `templates/dashboard-ejecutivo/` — vista de resumen: fila de KPIs, balance por periodo en barras agrupadas con leyenda, cruce del periodo y actividad.

## Open questions for the brand owner

1. Real logo files for the typeset wordmark, and the brand-texture artwork.
2. Serenata's own icon set, if one exists.
3. The OS-system-font substitution (Inter) is fine for prototyping; confirm before shipping if there's a licensed alternative.
