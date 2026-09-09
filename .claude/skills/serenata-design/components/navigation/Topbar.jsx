import React from 'react';
import { UserMenu } from './UserMenu.jsx';

export function Topbar({ user = { name: 'Usuario' }, left, right, style, ...rest }) {
  return (
    <header
      style={{
        display: 'flex', alignItems: 'center', gap: 'var(--space-lg)',
        height: 'var(--topbar-height)', flex: 'none', padding: '0 var(--content-pad)',
        background: 'var(--surface-topbar)', backdropFilter: 'var(--blur-soft)', WebkitBackdropFilter: 'var(--blur-soft)',
        borderBottom: '1px solid var(--border-subtle)', ...style,
      }}
      {...rest}
    >
      {left}
      <div style={{ flex: 1, minWidth: 0 }} />
      {right}
      <UserMenu name={user.name} nickname={user.nickname} initials={user.initials} />
    </header>
  );
}
