import React from 'react';

export function SectionHero({ eyebrow, title, subtitle, action, minHeight = 106, style, ...rest }) {
  return (
    <section
      style={{
        position: 'relative', overflow: 'hidden', borderRadius: 'var(--radius-xl)',
        background: 'var(--sn-texture)', backgroundSize: 'cover', minHeight, ...style,
      }}
      {...rest}
    >
      <div style={{ position: 'absolute', inset: 0, background: 'var(--sn-texture-scrim)', backdropFilter: 'blur(48px)' }} />
      <div style={{
        position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 'var(--space-xl)', padding: 'var(--space-lg) var(--space-xl)', flexWrap: 'wrap', minHeight,
      }}>
        <div style={{ minWidth: 0 }}>
          {eyebrow ? <div className="sn-eyebrow" style={{ marginBottom: 8 }}>{eyebrow}</div> : null}
          <h1 className="sn-display" style={{ margin: 0, fontSize: 'clamp(28px, 3.5vw, var(--text-h1))', overflowWrap: 'anywhere' }}>{title}</h1>
          {subtitle ? <p className="sn-lead" style={{ margin: '10px 0 0', maxWidth: 520 }}>{subtitle}</p> : null}
        </div>
        {action ? <div style={{ flex: 'none' }}>{action}</div> : null}
      </div>
    </section>
  );
}
