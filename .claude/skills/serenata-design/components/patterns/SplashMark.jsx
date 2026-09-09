import React from 'react';
import { logoMarkAlpha } from '../core/brand-assets.js';

/* Loader de marca: el isotipo real (la silueta blanca de la "S", sin el
   cuadrado naranja — ver components/core/brand-assets.js) sale en blanco y una
   franja con los colores de la textura de marca la recorre de punta a punta
   en diagonal, siguiendo el eje de la forma (de la punta inferior a la
   superior), dejándola en blanco entre cada pasada. Para esperas largas —
   inicio de sesión, cambio de sección con mucha información — nunca para
   micro-interacciones inline (esas usan el icono "loader" de Icon). */
export function SplashMark({ size = 176, style, ...rest }) {
  const maskLayer = {
    position: 'absolute', inset: 0,
    WebkitMaskImage: `url("${logoMarkAlpha}")`, maskImage: `url("${logoMarkAlpha}")`,
    WebkitMaskSize: 'contain', maskSize: 'contain',
    WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat',
    WebkitMaskPosition: 'center', maskPosition: 'center',
  };
  return (
    <div style={{ position: 'relative', width: size, height: size, flex: 'none', ...style }} {...rest}>
      <style>{'@keyframes sn-splash-snake{0%,8%{background-position:50% 210%}92%,100%{background-position:50% -210%}}'}</style>
      <div style={{ ...maskLayer, background: 'var(--text-primary)' }} />
      <div style={{
        ...maskLayer,
        backgroundImage: 'linear-gradient(165deg,transparent 12%,var(--sn-texture-orange) 28%,var(--sn-texture-red) 42%,var(--sn-texture-teal) 56%,var(--sn-texture-blue) 70%,transparent 88%)',
        backgroundSize: '100% 260%', backgroundPosition: '50% 210%',
        animation: 'sn-splash-snake 2.2s ease-in-out infinite',
      }} />
    </div>
  );
}
