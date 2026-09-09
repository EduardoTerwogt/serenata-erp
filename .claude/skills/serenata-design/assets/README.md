# assets/

- `logo-mark.png` — el isotipo real: cuadrado naranja con la "S" blanca, tal como lo proporcionó el usuario. Lo usa `Wordmark` (`variant="mark"`, embebido como data URI vía `components/core/brand-assets.js`).
- `logo-mark-alpha.png` — derivado del anterior: sólo la silueta blanca de la "S", con transparencia generada por interpolación de distancia de color contra el naranja de fondo muestreado. Lo usa `SplashMark` como máscara CSS para recolorear/animar la forma.

El naranja de marca (`--accent` / `--sn-orange` en `tokens/colors.css`, `#FE7B01`) está muestreado directamente del fondo de `logo-mark.png` — es la fuente de verdad del color, no al revés.

Lo que sigue sin archivos reales:

- el wordmark tipografiado "SERENATA" — no se proporcionó por separado, así que `Wordmark` sigue componiéndolo en la display face;
- la textura de marca — `--sn-texture` en `tokens/colors.css` es un stand-in en CSS con los matices que describe el brief (naranja, rojo, teal, azul);
- el set de iconos — Lucide vía CDN (`components/core/Icon.jsx`);
- las fuentes — el sistema usa la fuente del sistema operativo (SF Pro en Apple) con **Inter** como fallback multiplataforma, vía Google Fonts (`tokens/fonts.css`); sustituye eso si Serenata tiene binarios de marca propios.

Envía esos archivos cuando estén disponibles y los integro de la misma forma.
