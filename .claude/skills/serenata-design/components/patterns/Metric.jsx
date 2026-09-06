import React from 'react';
import { Card } from '../core/Card.jsx';

export function Metric({ label, value, nota, accent = false, onClick, style, ...rest }) {
  const [hover, setHover] = React.useState(false);
  return (
    <Card
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      padding="var(--space-lg)"
      style={{
        minWidth: 0, cursor: onClick ? 'pointer' : 'default',
        background: hover && onClick ? 'var(--surface-row-alt)' : 'var(--surface-card)',
        transition: 'var(--transition-control)', ...style,
      }}
      {...rest}
    >
      <div className="sn-label">{label}</div>
      <div className="sn-display" style={{ fontSize: 'var(--text-h2)', marginTop: 10, color: accent ? 'var(--accent)' : 'var(--text-primary)' }}>{value}</div>
      {nota ? <div style={{ marginTop: 6, fontSize: 'var(--text-md)', color: 'var(--text-muted)' }}>{nota}</div> : null}
    </Card>
  );
}
