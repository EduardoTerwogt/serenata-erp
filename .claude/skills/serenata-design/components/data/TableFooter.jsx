import React from 'react';
import { Select } from '../forms/Select.jsx';

export function TableFooter({
  shown, total, unit = '', perPage = 10, perPageOptions = [10, 25, 50],
  onPerPageChange, label = 'Mostrando', style, ...rest
}) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 'var(--space-md)', padding: '0 var(--row-pad-x)', height: 44,
        borderTop: '1px solid var(--border-subtle)', ...style,
      }}
      {...rest}
    >
      <span style={{ fontSize: 'var(--text-caption)', color: 'var(--text-faint)' }}>
        {label} {shown} de {total}{unit ? ' ' + unit : ''}
      </span>
      <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', fontSize: 'var(--text-caption)', color: 'var(--text-faint)' }}>
        Resultados por página
        <Select size="md" options={perPageOptions} value={perPage} onChange={(e) => onPerPageChange && onPerPageChange(Number(e.target.value))} />
      </label>
    </div>
  );
}
