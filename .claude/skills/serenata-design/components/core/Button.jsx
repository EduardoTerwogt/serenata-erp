import React from 'react';
import { Icon } from './Icon.jsx';

const SIZES = {
  md: { height: 'var(--control-height)', padding: '0 16px', font: 'var(--text-base)', radius: 'var(--radius-md)' },
  lg: { height: 'var(--control-height-lg)', padding: '0 26px', font: 'var(--text-md)', radius: 'var(--radius-input)' },
};

export function Button({
  children, variant = 'primary', size = 'lg', iconLeft, iconRight,
  disabled = false, fullWidth = false, onClick, style, ...rest
}) {
  const [hover, setHover] = React.useState(false);
  const [down, setDown] = React.useState(false);
  const s = SIZES[size] || SIZES.lg;

  const skins = {
    primary: {
      background: down || hover ? 'var(--accent-pressed)' : 'var(--accent)',
      color: 'var(--sn-orange-ink)',
      border: '1px solid transparent',
      fontWeight: 'var(--weight-bold)',
    },
    secondary: {
      background: hover ? 'var(--surface-row-alt)' : 'var(--surface-input)',
      color: 'var(--text-body)',
      border: '1px solid var(--border-subtle)',
      fontWeight: 'var(--weight-medium)',
    },
    ghost: {
      background: hover ? 'rgba(255,255,255,.05)' : 'transparent',
      color: hover ? 'var(--text-body)' : 'var(--text-muted)',
      border: '1px solid transparent',
      fontWeight: 'var(--weight-medium)',
    },
  };

  return (
    <button
      type="button" disabled={disabled} onClick={onClick}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => { setHover(false); setDown(false); }}
      onMouseDown={() => setDown(true)} onMouseUp={() => setDown(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-sm)',
        height: s.height, padding: s.padding, borderRadius: s.radius, width: fullWidth ? '100%' : undefined,
        fontFamily: 'var(--font-ui)', fontSize: s.font, letterSpacing: '0.01em', whiteSpace: 'nowrap',
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.45 : 1,
        transition: 'var(--transition-control)', ...skins[variant], ...style,
      }}
      {...rest}
    >
      {iconLeft ? <Icon name={iconLeft} size={15} /> : null}
      {children}
      {iconRight ? <Icon name={iconRight} size={14} /> : null}
    </button>
  );
}
