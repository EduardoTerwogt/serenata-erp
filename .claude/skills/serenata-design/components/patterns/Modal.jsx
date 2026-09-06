import React from 'react';
import { Icon } from '../core/Icon.jsx';

/* El sistema no tiene panel lateral: todo detalle y toda confirmación se abren
   como modal centrado sobre un scrim opaco. Es el único lugar del producto que
   usa --shadow-overlay. */
export function Modal({ title, eyebrow, onClose, children, footer, width = 720, style, ...rest }) {
  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(8,10,13,.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-2xl)' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: width, maxHeight: '88vh', display: 'flex', flexDirection: 'column', background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-overlay)', overflow: 'hidden', ...style }}
        {...rest}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-md)', padding: 'var(--space-lg)', borderBottom: '1px solid var(--border-subtle)' }}>
          <div style={{ minWidth: 0 }}>
            {eyebrow ? <div className="sn-eyebrow" style={{ marginBottom: 5 }}>{eyebrow}</div> : null}
            <div className="sn-display" style={{ fontSize: 'var(--text-h3)' }}>{title}</div>
          </div>
          <div style={{ flex: 1 }} />
          <button type="button" onClick={onClose} aria-label="Cerrar" style={{ background: 'transparent', border: 0, cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
            <Icon name="x" size={18} />
          </button>
        </div>
        <div style={{ padding: 'var(--space-lg)', overflowY: 'auto' }}>{children}</div>
        {footer ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', padding: 'var(--space-lg)', borderTop: '1px solid var(--border-subtle)' }}>{footer}</div>
        ) : null}
      </div>
    </div>
  );
}
