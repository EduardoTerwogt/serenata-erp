import React from 'react';
import { NavItem } from './NavItem.jsx';
import { Wordmark } from '../core/Wordmark.jsx';

export function Sidebar({ items = [], activeId, onSelect, footer = null, style, ...rest }) {
  const mainItems = items.filter((it) => it.group !== 'Sistema');
  const bottomItems = items.filter((it) => it.group === 'Sistema');
  const renderGroup = (list) => {
    let lastGroup = null;
    return list.map((it) => {
      const showGroup = it.group && it.group !== lastGroup;
      lastGroup = it.group || lastGroup;
      return (
        <React.Fragment key={it.id}>
          {showGroup ? (
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.03em', padding: '10px 8px 2px' }}>{it.group}</div>
          ) : null}
          <NavItem icon={it.icon} label={it.label} tone={it.tone} active={it.id === activeId}
            onClick={() => onSelect && onSelect(it.id)} />
        </React.Fragment>
      );
    });
  };
  return (
    <aside
      style={{
        position: 'relative', width: 'var(--sidebar-width)', flex: 'none', minHeight: '100%',
        background: 'var(--surface-sidebar)', backdropFilter: 'var(--blur-strong)', WebkitBackdropFilter: 'var(--blur-strong)',
        borderRight: '1px solid var(--border-subtle)',
        display: 'flex', flexDirection: 'column', ...style,
      }}
      {...rest}
    >
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: 'var(--space-md) var(--sidebar-pad)' }}>
        <div style={{ height: 40, display: 'flex', alignItems: 'center', padding: '0 8px 6px' }}>
          <Wordmark variant="mark" size={17} />
        </div>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nav-gap)' }}>
          {renderGroup(mainItems)}
        </nav>
        <div style={{ flex: 1, minHeight: 20 }} />
        {bottomItems.length ? (
          <nav style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nav-gap)', paddingBottom: 12 }}>
            {renderGroup(bottomItems)}
          </nav>
        ) : null}
        {footer ? <div style={{ padding: '0 11px' }}>{footer}</div> : null}
      </div>
    </aside>
  );
}
