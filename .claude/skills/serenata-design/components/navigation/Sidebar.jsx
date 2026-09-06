import React from 'react';
import { NavItem } from './NavItem.jsx';
import { Wordmark } from '../core/Wordmark.jsx';

export function Sidebar({ items = [], activeId, onSelect, footer = null, style, ...rest }) {
  return (
    <aside
      style={{
        position: 'relative', width: 'var(--sidebar-width)', flex: 'none', minHeight: '100%',
        background: 'var(--sn-texture-rail)', overflow: 'hidden',
        borderRight: '1px solid var(--border-subtle)', boxShadow: 'var(--shadow-rail)',
        display: 'flex', flexDirection: 'column', ...style,
      }}
      {...rest}
    >
      <div style={{ position: 'absolute', inset: 0, backdropFilter: 'blur(80px)', background: 'rgba(12,15,20,.42)' }} />
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', flex: 1, padding: 'var(--space-lg) var(--sidebar-pad)' }}>
        <div style={{ height: 'var(--topbar-height)', display: 'flex', alignItems: 'center', padding: '0 14px', marginBottom: 'var(--space-sm)' }}>
          <Wordmark variant="mark" size={21} />
        </div>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nav-gap)' }}>
          {items.map((it) => (
            <NavItem key={it.id} icon={it.icon} label={it.label} active={it.id === activeId}
              onClick={() => onSelect && onSelect(it.id)} />
          ))}
        </nav>
        <div style={{ flex: 1, minHeight: 20 }} />
        {footer ? <div style={{ padding: '0 11px' }}>{footer}</div> : null}
      </div>
    </aside>
  );
}
