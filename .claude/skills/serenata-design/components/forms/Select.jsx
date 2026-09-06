import React from 'react';
import { Icon } from '../core/Icon.jsx';

export function Select({ value, defaultValue, onChange, options = [], size = 'sm', style, ...rest }) {
  const [hover, setHover] = React.useState(false);
  const height = size === 'md' ? 'var(--control-height)' : '29px';
  return (
    <div
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative', display: 'inline-flex', alignItems: 'center', height, minWidth: 0,
        background: hover ? 'var(--surface-row-alt)' : 'var(--surface-input)',
        border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)',
        transition: 'var(--transition-control)', ...style,
      }}
    >
      <select
        value={value} defaultValue={defaultValue} onChange={onChange}
        style={{
          appearance: 'none', background: 'transparent', border: 0, outline: 'none',
          padding: '0 32px 0 13px', height: '100%', cursor: 'pointer', width: '100%', minWidth: 0,
          textOverflow: 'ellipsis',
          fontFamily: 'var(--font-ui)', fontSize: 'var(--text-base)', color: 'var(--text-body)',
        }}
        {...rest}
      >
        {options.map((o) => {
          const opt = typeof o === 'object' ? o : { value: o, label: String(o) };
          return <option key={opt.value} value={opt.value} style={{ background: 'var(--surface-card)' }}>{opt.label}</option>;
        })}
      </select>
      <span style={{ position: 'absolute', right: 10, pointerEvents: 'none' }}>
        <Icon name="chevron-down" size={14} color="var(--text-muted)" />
      </span>
    </div>
  );
}
