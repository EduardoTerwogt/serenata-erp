import React from 'react';
import { Avatar } from '../core/Avatar.jsx';

export function UserMenu({ name = 'Usuario', nickname = '', initials, onClick, style, ...rest }) {
  const [hover, setHover] = React.useState(false);
  const auto = name.split(' ').map((w) => w[0]).join('').slice(0, 2);
  return (
    <button
      type="button" onClick={onClick}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 'var(--space-md)', border: 0, cursor: 'pointer',
        padding: '5px 12px 5px 5px', borderRadius: 'var(--radius-pill)', flex: 'none',
        background: hover ? 'rgba(255,255,255,.05)' : 'transparent',
        transition: 'var(--transition-control)', ...style,
      }}
      {...rest}
    >
      <Avatar initials={initials || auto} size={36} />
      <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', textAlign: 'right', lineHeight: 1.3 }}>
        <span style={{ fontSize: 'var(--text-md)', fontWeight: 'var(--weight-semibold)', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{name}</span>
        {nickname ? <span style={{ fontSize: 'var(--text-base)', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{nickname}</span> : null}
      </span>
    </button>
  );
}
