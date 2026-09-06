import React from 'react';

export function TextField({ label, hint, value, defaultValue, onChange, placeholder, disabled, fullWidth = true, style, ...rest }) {
  const [focus, setFocus] = React.useState(false);
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)', width: fullWidth ? '100%' : undefined, ...style }}>
      {label ? <span className="sn-label">{label}</span> : null}
      <input
        type="text" value={value} defaultValue={defaultValue} onChange={onChange}
        placeholder={placeholder} disabled={disabled}
        onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
        style={{
          height: 'var(--control-height)', padding: '0 14px',
          background: 'var(--surface-input)',
          border: '1px solid ' + (focus ? 'var(--accent-quiet)' : 'var(--border-subtle)'),
          borderRadius: 'var(--radius-sm)', outline: 'none',
          fontFamily: 'var(--font-ui)', fontSize: 'var(--text-base)', color: 'var(--text-body)',
          opacity: disabled ? 0.5 : 1, transition: 'var(--transition-control)',
        }}
        {...rest}
      />
      {hint ? <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>{hint}</span> : null}
    </label>
  );
}
