import React from 'react';

const TONES = {
  aprobada: { bg: 'var(--sn-status-approved-bg)', fg: 'var(--sn-status-approved-fg)' },
  emitida: { bg: 'var(--sn-status-issued-bg)', fg: 'var(--sn-status-issued-fg)' },
  borrador: { bg: 'var(--sn-status-draft-bg)', fg: 'var(--sn-status-draft-fg)' },
  cancelada: { bg: 'var(--sn-status-cancelled-bg)', fg: 'var(--sn-status-cancelled-fg)' },
};

export function StatusBadge({ status = 'borrador', children, style, ...rest }) {
  const key = String(status).toLowerCase();
  const tone = TONES[key] || TONES.borrador;
  const label = children || String(status).charAt(0).toUpperCase() + String(status).slice(1);
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        minWidth: 80, height: 22, padding: '0 11px',
        borderRadius: 'var(--radius-pill)', background: tone.bg, color: tone.fg,
        fontFamily: 'var(--font-ui)', fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-medium)',
        whiteSpace: 'nowrap', ...style,
      }}
      {...rest}
    >{label}</span>
  );
}
