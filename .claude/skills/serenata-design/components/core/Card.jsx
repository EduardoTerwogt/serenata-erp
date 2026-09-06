import React from 'react';

export function Card({ children, padding = 'var(--space-lg)', radius = 'var(--radius-lg)', tone = 'surface', style, ...rest }) {
  const backgrounds = {
    surface: 'var(--surface-card)',
    row: 'var(--surface-row)',
    app: 'var(--bg-app)',
  };
  return (
    <div
      style={{
        background: backgrounds[tone] || backgrounds.surface,
        border: '1px solid var(--border-subtle)',
        borderRadius: radius, padding, boxShadow: 'var(--shadow-card)',
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}
