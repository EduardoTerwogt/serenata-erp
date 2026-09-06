import React from 'react';

/* Thin wrapper over the Lucide icon set, loaded from CDN as the UMD global
   `window.lucide` (see readme.md > Iconography). No original icon assets were
   supplied with the brief; Lucide is the flagged substitution — 2px stroke,
   round caps, 24px grid, which matches the outline chevrons/magnifier in the
   source mock. */

const pascal = (n) => String(n).split(/[-_ ]/).map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join('');

function iconNode(name) {
  const L = typeof window !== 'undefined' ? window.lucide : null;
  if (!L) return null;
  const set = L.icons || L;
  const node = set[pascal(name)] || set[name];
  return Array.isArray(node) ? node : null;
}

function reactAttrs(attrs) {
  const out = {};
  for (const k in attrs) {
    const key = k.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    out[key] = attrs[k];
  }
  return out;
}

export function Icon({ name, size = 18, strokeWidth = 2, color = 'currentColor', style, ...rest }) {
  const [, bump] = React.useReducer((x) => x + 1, 0);
  React.useEffect(() => {
    if (iconNode(name)) return undefined;
    let tries = 0;
    const id = setInterval(() => {
      if (iconNode(name) || ++tries > 60) { clearInterval(id); bump(); }
    }, 50);
    return () => clearInterval(id);
  }, [name]);

  const node = iconNode(name) || [];
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" focusable="false"
      style={{ display: 'block', flex: 'none', ...style }} {...rest}
    >
      {node.map((child, i) => React.createElement(child[0], { key: i, ...reactAttrs(child[1] || {}) }))}
    </svg>
  );
}
