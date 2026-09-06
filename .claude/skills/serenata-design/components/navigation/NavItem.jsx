import React from 'react';
import { Icon } from '../core/Icon.jsx';

export function NavItem({ icon, label, active = false, onClick, style, ...rest }) {
  const [hover, setHover] = React.useState(false);
  return (
    <button
      type="button" onClick={onClick}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 'var(--space-md)',
        width: '100%', height: 'var(--nav-item-height)', padding: '0 14px', border: 0, cursor: 'pointer',
        borderRadius: 'var(--radius-md)', textAlign: 'left',
        background: active ? 'var(--accent)' : hover ? 'rgba(255,255,255,.05)' : 'transparent',
        color: active ? 'var(--sn-orange-ink)' : hover ? 'var(--text-body)' : 'var(--text-muted)',
        fontFamily: 'var(--font-ui)', fontSize: 'var(--text-nav)',
        fontWeight: active ? 'var(--weight-semibold)' : 'var(--weight-medium)',
        transition: 'var(--transition-control)', ...style,
      }}
      {...rest}
    >
      {icon ? <Icon name={icon} size={15} /> : null}
      <span>{label}</span>
    </button>
  );
}
