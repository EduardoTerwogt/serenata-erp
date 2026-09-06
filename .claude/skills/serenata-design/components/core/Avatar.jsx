import React from 'react';

export function Avatar({ initials = 'S', size = 32, tone = 'accent', style, ...rest }) {
  return (
    <div
      style={{
        width: size, height: size, flex: 'none', borderRadius: 'var(--radius-circle)',
        background: tone === 'accent' ? 'var(--accent)' : 'var(--surface-row-alt)',
        color: tone === 'accent' ? 'var(--sn-orange-ink)' : 'var(--text-body)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'var(--font-ui)', fontWeight: 'var(--weight-bold)',
        fontSize: Math.round(size * 0.38), letterSpacing: '0.02em', ...style,
      }}
      {...rest}
    >
      {String(initials).slice(0, 2).toUpperCase()}
    </div>
  );
}
