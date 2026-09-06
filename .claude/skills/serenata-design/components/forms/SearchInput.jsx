import React from 'react';
import { Icon } from '../core/Icon.jsx';

export function SearchInput({
  value, defaultValue, onChange, placeholder = 'Buscar…',
  size = 'md', pill = false, fullWidth = false, style, ...rest
}) {
  const [focus, setFocus] = React.useState(false);
  const height = size === 'lg' ? 'var(--control-height-lg)' : 'var(--control-height)';
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 'var(--space-md)',
      height, padding: '0 16px', width: fullWidth ? '100%' : undefined,
      background: 'var(--surface-input)',
      border: '1px solid ' + (focus ? 'var(--accent-quiet)' : 'var(--border-subtle)'),
      borderRadius: pill ? 'var(--radius-pill)' : 'var(--radius-input)',
      transition: 'var(--transition-control)', ...style,
    }}>
      <Icon name="search" size={15} color="var(--text-muted)" />
      <input
        type="text" value={value} defaultValue={defaultValue} onChange={onChange} placeholder={placeholder}
        onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
        style={{
          flex: 1, minWidth: 0, background: 'transparent', border: 0, outline: 'none',
          fontFamily: 'var(--font-ui)', fontSize: 'var(--text-md)', color: 'var(--text-body)',
        }}
        {...rest}
      />
    </div>
  );
}
