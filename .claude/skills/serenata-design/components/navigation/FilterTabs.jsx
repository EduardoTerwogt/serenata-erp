import React from 'react';

export function FilterTabs({ tabs = [], value, onChange, contained = true, style, ...rest }) {
  const [hover, setHover] = React.useState(null);
  return (
    <div
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 'var(--space-xs)',
        padding: contained ? 5 : 0,
        background: contained ? 'var(--surface-card)' : 'transparent',
        border: contained ? '1px solid var(--border-subtle)' : 0,
        borderRadius: contained ? 'var(--radius-input)' : 0,
        ...style,
      }}
      {...rest}
    >
      {tabs.map((t) => {
        const tab = typeof t === 'object' ? t : { id: t, label: String(t) };
        const active = tab.id === value;
        return (
          <button
            key={tab.id} type="button" onClick={() => onChange && onChange(tab.id)}
            onMouseEnter={() => setHover(tab.id)} onMouseLeave={() => setHover(null)}
            style={{
              height: 32, padding: '0 21px', border: 0, cursor: 'pointer',
              borderRadius: 'var(--radius-sm)',
              background: active ? 'var(--accent)' : 'transparent',
              color: active ? 'var(--sn-orange-ink)' : hover === tab.id ? 'var(--text-body)' : 'var(--text-muted)',
              fontFamily: 'var(--font-ui)', fontSize: 'var(--text-md)',
              fontWeight: active ? 'var(--weight-semibold)' : 'var(--weight-medium)',
              transition: 'var(--transition-control)',
            }}
          >
            {tab.label}
            {tab.count != null ? (
              <span style={{ marginLeft: 8, opacity: 0.75, fontWeight: 'var(--weight-medium)' }}>{tab.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
