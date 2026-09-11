---
name: serenata-design
description: Use this skill to generate well-branded interfaces and assets for Serenata, either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for protoyping.
user-invocable: true
---

Read the `readme.md` file within this skill, and explore the other available files.

Start here:

- `readme.md` — brand context, content fundamentals, visual foundations, iconography, and an index of everything else.
- `styles.css` — the single stylesheet to link. It `@import`s every token file in `tokens/`.
- `components/` — the reusable primitives (`core/`, `forms/`, `navigation/`, `data/`, `layout/`). Each has a `.jsx`, a `.d.ts` props contract, and a `.prompt.md` with a one-line "what & when" plus a usage example.
- `ui_kits/serenata-app/` — **the product design: all eleven sections of the ERP.** Read its `README.md` first; it maps every file to its section of the product brief and records the design decisions and open questions.
- `guidelines/` — foundation specimen cards.

When building production code from `ui_kits/serenata-app/`, treat the JSX as a visual and interaction specification, not as production source: it cuts corners on functionality on purpose. Lift the exact values (hex codes, paddings, radii, font sizes) from `tokens/` rather than re-deriving them.

For anything touching money, the authoritative source is the repo, not this kit: `docs/decisions/006-reglas-de-negocio-invariables.md` (formulas, fiscal model, glossary) and `DESIGN_SYSTEM.md` (the tokens actually shipped in `app/globals.css`). Where the kit and the repo disagree, the repo wins.

If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out and create static HTML files for the user to view. If working on production code, you can copy assets and read the rules here to become an expert in designing with this brand.
If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions, and act as an expert designer who outputs HTML artifacts _or_ production code, depending on the need.

Known gaps, all flagged in `readme.md`: the UI font is a substitution (Inter, standing in for the OS system font stack) and the icon set is Lucide from CDN. The isotipo, the white wordmark lockup, and the login background photo were all supplied by the user and live in `assets/`.

Note on fonts: production ships **Inter for everything** via `next/font`. Variable names in the codebase (`--font-inter`, `--font-poppins`, and the `archivo`/`manrope` exports in `app/fonts.ts`) are historical labels that all resolve to Inter — see the chain documented in `DESIGN_SYSTEM.md`. Don't infer a typeface from a variable name.
