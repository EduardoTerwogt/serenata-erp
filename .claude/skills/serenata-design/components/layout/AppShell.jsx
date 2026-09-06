import React from 'react';

export function AppShell({ sidebar, topbar, children, style, ...rest }) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-app)', ...style }} {...rest}>
      {sidebar}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {topbar}
        <main style={{
          flex: 1, minWidth: 0, padding: 'var(--space-sm) var(--content-pad) var(--space-lg)',
          display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)',
        }}>{children}</main>
      </div>
    </div>
  );
}
