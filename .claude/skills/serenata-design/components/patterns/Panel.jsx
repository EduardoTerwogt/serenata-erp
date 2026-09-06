import React from 'react';
import { Card } from '../core/Card.jsx';

export function Panel({ title, eyebrow, action, children, padding = 'var(--space-lg)', style, bodyStyle, ...rest }) {
  return (
    <Card padding="0" style={style} {...rest}>
      {title || action ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', padding: '15px var(--space-lg)', borderBottom: '1px solid var(--border-subtle)', flexWrap: 'wrap', minWidth: 0 }}>
          <div style={{ minWidth: 0 }}>
            {eyebrow ? <div className="sn-eyebrow" style={{ marginBottom: 4 }}>{eyebrow}</div> : null}
            {title ? <div style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--weight-semibold)', color: 'var(--text-primary)' }}>{title}</div> : null}
          </div>
          <div style={{ flex: 1, minWidth: 0 }} />
          <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 'var(--space-md)', flexWrap: 'wrap' }}>{action}</div>
        </div>
      ) : null}
      <div style={{ padding, ...bodyStyle }}>{children}</div>
    </Card>
  );
}
