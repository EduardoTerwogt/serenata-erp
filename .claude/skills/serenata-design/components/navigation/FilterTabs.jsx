import React from 'react';

export function FilterTabs({ tabs = [], value, onChange, style, ...rest }) {
  return (
    <div
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 2, padding: 2,
        background: 'var(--control-track)', borderRadius: 'var(--radius-input)', ...style,
      }}
      {...rest}
    >
      {tabs.map((t) => {
        const tab = typeof t === 'object' ? t : { id: t, label: String(t) };
        const active = tab.id === value;
        return (
          <button
            key={tab.id} type="button" onClick={() => onChange && onChange(tab.id)}
            style={{
              height: 30, padding: '0 15px', border: 0, cursor: 'pointer',
              borderRadius: 'var(--radius-sm)',
              background: active ? 'var(--surface-card)' : 'transparent',
              color: active ? 'var(--text-primary)' : 'var(--text-muted)',
              fontFamily: 'var(--font-ui)', fontSize: 'var(--text-md)',
              fontWeight: active ? 'var(--weight-semibold)' : 'var(--weight-medium)',
              boxShadow: active ? 'var(--shadow-segment)' : 'none',
              transition: 'var(--transition-control)',
            }}
          >
            {tab.label}
            {tab.count != null ? (
              <span style={{ marginLeft: 8, opacity: 0.7, fontWeight: 'var(--weight-medium)' }}>{tab.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
