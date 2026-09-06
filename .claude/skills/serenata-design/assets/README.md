# assets/

Intentionally empty.

No logo files, brand-texture artwork, icon set, imagery or font binaries were supplied with the source brief (`uploads/design.md`), and a real brand mark must never be redrawn from a written description. Until the real files arrive:

- the wordmark and isotipo are rendered as plain display type by `components/core/Wordmark.jsx`;
- the brand gradient is a CSS stand-in (`--sn-texture` in `tokens/colors.css`);
- icons come from Lucide via CDN (`components/core/Icon.jsx`);
- fonts load from Google Fonts (`tokens/fonts.css`).

Drop the real SVG/PNG/woff2 files here and update those four places.
