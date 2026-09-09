import React from 'react';
import { logoMarkSquare } from './brand-assets.js';

/* Isotipo real subido por el usuario (assets/logo-mark.png), un cuadrado
   naranja con una "S" blanca estilizada. El wordmark ("SERENATA") sigue en
   tipografía porque no se proporcionó ese archivo por separado. */

export function Wordmark({ variant = 'wordmark', tone = 'orange', size = 30, style, ...rest }) {
  const color = tone === 'orange' ? 'var(--accent)' : tone === 'white' ? '#FFFFFF' : 'var(--text-primary)';
  const mark = (
    <img
      src={logoMarkSquare} alt="Serenata"
      style={{ width: size * 1.5, height: size * 1.5, borderRadius: Math.round(size * 0.36), objectFit: 'cover', flex: 'none', display: 'block' }}
    />
  );
  const word = (
    <span style={{
      fontFamily: 'var(--font-display)', fontWeight: 'var(--weight-bold)', fontSize: size, letterSpacing: '-0.02em',
      textTransform: 'uppercase', color, lineHeight: 1,
    }}>Serenata</span>
  );
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', ...style }} {...rest}>
      {variant === 'wordmark' ? null : mark}
      {variant === 'mark' ? null : word}
    </div>
  );
}
