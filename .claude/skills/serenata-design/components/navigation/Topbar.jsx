import React from 'react';
import { UserMenu } from './UserMenu.jsx';

export function Topbar({ user = { name: 'Usuario' }, left, right, style, ...rest }) {
  return (
    <header
      style={{
        display: 'flex', alignItems: 'center', gap: 'var(--space-lg)',
        minHeight: 'var(--topbar-height)', padding: 'var(--space-lg) var(--content-pad)',
        background: 'transparent', ...style,
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
