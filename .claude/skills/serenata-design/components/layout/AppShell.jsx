import React from 'react';

export function AppShell({ sidebar, topbar, children, style, ...rest }) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-app)', ...style }} {...rest}>
      {sidebar}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {topbar}
        <main style={{
          flex: 1, minWidth: 0, padding: '26px var(--content-pad)',
          display: 'flex', flexDirection: 'column', gap: '16px',
        }}>{children}</main>
      </div>
    </div>
  );
}
