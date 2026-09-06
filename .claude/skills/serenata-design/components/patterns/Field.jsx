import React from 'react';

export function Field({ label, value, children, span, nowrapLabel = false, style, ...rest }) {
  return (
    <div style={{ minWidth: 0, gridColumn: span ? 'span ' + span : undefined, ...style }} {...rest}>
      <div className="sn-label" style={{ marginBottom: 7, whiteSpace: nowrapLabel ? 'nowrap' : undefined }}>{label}</div>
      {children || <div style={{ fontSize: 'var(--text-base)', color: 'var(--text-body)' }}>{value}</div>}
    </div>
  );
}
