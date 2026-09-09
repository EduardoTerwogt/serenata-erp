import React from 'react';
import { Icon } from '../core/Icon.jsx';

const TONES = {
  gray: 'var(--sn-chip-gray)', blue: 'var(--sn-chip-blue)', purple: 'var(--sn-chip-purple)',
  red: 'var(--sn-chip-red)', teal: 'var(--sn-chip-teal)', green: 'var(--sn-chip-green)', indigo: 'var(--sn-chip-indigo)',
};

export function NavItem({ icon, label, active = false, tone = 'gray', onClick, style, ...rest }) {
  const [hover, setHover] = React.useState(false);
  const chipBg = active ? 'var(--accent)' : (TONES[tone] || TONES.gray);
  return (
    <button
      type="button" onClick={onClick}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 'var(--space-md)',
        width: '100%', height: 'var(--nav-item-height)', padding: '0 8px', border: 0, cursor: 'pointer',
        borderRadius: 'var(--radius-md)', textAlign: 'left',
        background: active ? 'var(--accent-tint)' : hover ? 'var(--hover-overlay)' : 'transparent',
        color: active ? 'var(--accent)' : hover ? 'var(--text-body)' : 'var(--text-muted)',
        fontFamily: 'var(--font-ui)', fontSize: 'var(--text-nav)',
        fontWeight: active ? 'var(--weight-semibold)' : 'var(--weight-medium)',
        transition: 'var(--transition-control)', ...style,
      }}
      {...rest}
    >
      {icon ? (
        <span style={{ width: 22, height: 22, borderRadius: 6, background: chipBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
          <Icon name={icon} size={13} color="#fff" />
        </span>
      ) : null}
      <span>{label}</span>
    </button>
  );
}
