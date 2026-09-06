import React from 'react';

/* PLACEHOLDER LOCKUP — the real Serenata wordmark and isotipo were not supplied
   as files, so both are rendered in plain display type. Swap for the real
   artwork when it lands; see readme.md > Logo & brand assets. */

export function Wordmark({ variant = 'wordmark', tone = 'orange', size = 30, style, ...rest }) {
  const color = tone === 'orange' ? 'var(--accent)' : 'var(--sn-ink)';
  const mark = (
    <div style={{
      width: size * 1.5, height: size * 1.5, borderRadius: Math.round(size * 0.36),
      background: 'var(--accent)', color: 'var(--sn-orange-ink)', flex: 'none',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'var(--font-display)', fontStretch: 'var(--display-stretch)',
      fontWeight: 900, fontSize: size, letterSpacing: '-0.02em',
    }}>S</div>
  );
  const word = (
    <span style={{
      fontFamily: 'var(--font-display)', fontStretch: 'var(--display-stretch)',
      fontWeight: 900, fontSize: size, letterSpacing: '-0.02em',
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
