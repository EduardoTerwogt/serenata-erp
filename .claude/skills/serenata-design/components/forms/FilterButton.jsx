import React from 'react';
import { Button } from '../core/Button.jsx';

export function FilterButton({ children = 'Filtrar', count, size = 'lg', onClick, style, ...rest }) {
  return (
    <Button variant="secondary" size={size} iconRight="chevron-down" onClick={onClick} style={style} {...rest}>
      {children}
      {count ? (
        <span style={{
          marginLeft: 2, minWidth: 20, height: 20, padding: '0 6px', borderRadius: 'var(--radius-pill)',
          background: 'var(--accent)', color: 'var(--sn-orange-ink)',
          fontSize: 'var(--text-xs)', fontWeight: 'var(--weight-bold)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}>{count}</span>
      ) : null}
    </Button>
  );
}
