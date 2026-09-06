import React from 'react';

export function DataTable({ columns = [], rows = [], onRowClick, emptyLabel = 'Sin resultados', minWidth = 820, style, ...rest }) {
  const [hover, setHover] = React.useState(null);
  const template = columns
    .map((c) => {
      const w = c.width || '1fr';
      return /px|%|em|rem|ch/.test(w) ? w : 'minmax(0, ' + w + ')';
    })
    .join(' ');
  const padX = 'var(--row-pad-x)';

  return (
    <div style={{ overflowX: 'auto', ...style }}>
    <div style={{ display: 'flex', flexDirection: 'column', minWidth }} {...rest}>
      <div style={{
        display: 'grid', gridTemplateColumns: template, gap: 'var(--space-md)',
        padding: '14px ' + padX, borderBottom: '1px solid var(--border-subtle)',
        fontSize: 'var(--text-table-head)', fontWeight: 'var(--weight-semibold)',
        letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase', color: 'var(--text-faint)',
      }}>
        {columns.map((c) => <div key={c.key} style={{ textAlign: c.align || 'left', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.label}</div>)}
      </div>

      {rows.length === 0 ? (
        <div style={{ padding: '32px ' + padX, textAlign: 'center', color: 'var(--text-muted)' }}>{emptyLabel}</div>
      ) : rows.map((row, i) => (
        <div
          key={row.id || i}
          onClick={() => onRowClick && onRowClick(row)}
          onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
          style={{
            display: 'grid', gridTemplateColumns: template, gap: 'var(--space-md)', alignItems: 'center',
            padding: 'var(--row-pad-y) ' + padX,
            borderBottom: i === rows.length - 1 ? '1px solid transparent' : '1px solid var(--border-subtle)',
            background: hover === i ? 'var(--surface-row-alt)' : 'transparent',
            cursor: onRowClick ? 'pointer' : 'default',
            fontSize: 'var(--text-base)', color: 'var(--text-body)',
            transition: 'background-color var(--dur-fast) var(--ease-standard)',
          }}
        >
          {columns.map((c) => (
            <div key={c.key} style={{
              textAlign: c.align || 'left', minWidth: 0,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              fontWeight: c.strong ? 'var(--weight-medium)' : 'var(--weight-regular)',
            }}>
              {c.render ? c.render(row) : row[c.key]}
            </div>
          ))}
        </div>
      ))}
    </div>
    </div>
  );
}
