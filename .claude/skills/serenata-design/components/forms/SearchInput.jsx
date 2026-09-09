import React from 'react';
import { Icon } from '../core/Icon.jsx';

export function SearchInput({
  value, defaultValue, onChange, placeholder = 'Buscar…',
  size = 'md', pill = false, fullWidth = false, expandable = false, style, ...rest
}) {
  const [focus, setFocus] = React.useState(false);
  const [expanded, setExpanded] = React.useState(!expandable);
  const height = size === 'lg' ? 'var(--control-height-lg)' : 'var(--control-height)';
  const ref = React.useRef(null);

  React.useEffect(() => {
    if (!expandable) return undefined;
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target) && !(value || defaultValue)) setExpanded(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [expandable, value, defaultValue]);

  return (
    <div
      ref={ref}
      onClick={() => { if (expandable && !expanded) setExpanded(true); }}
      style={{
        display: 'flex', alignItems: 'center', gap: expanded ? 'var(--space-md)' : 0,
        height, width: expandable ? (expanded ? (fullWidth ? '100%' : 320) : height) : (fullWidth ? '100%' : undefined),
        padding: expanded ? '0 16px' : 0, justifyContent: expandable && !expanded ? 'center' : undefined,
        background: 'var(--surface-input)',
        border: '1px solid ' + (focus ? 'var(--accent-quiet)' : 'var(--border-subtle)'),
        borderRadius: pill ? 'var(--radius-pill)' : 'var(--radius-input)',
        cursor: expandable && !expanded ? 'pointer' : 'default', overflow: 'hidden',
        transition: 'width .25s ease, padding .25s ease, background-color var(--dur-fast) var(--ease-standard), border-color var(--dur-fast) var(--ease-standard)',
        ...style,
      }}
    >
      <Icon name="search" size={15} color="var(--text-muted)" />
      {expanded ? (
        <input
          type="text" value={value} defaultValue={defaultValue} onChange={onChange} placeholder={placeholder}
          onFocus={() => setFocus(true)} onBlur={() => setFocus(false)} autoFocus={expandable}
          style={{
            flex: 1, minWidth: 0, background: 'transparent', border: 0, outline: 'none',
            fontFamily: 'var(--font-ui)', fontSize: 'var(--text-md)', color: 'var(--text-body)',
          }}
          {...rest}
        />
      ) : null}
    </div>
  );
}
