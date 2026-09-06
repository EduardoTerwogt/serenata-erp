/* Piezas compartidas del kit Fase 5.

   Panel, Metric, Field, Folio, StateBadge, ProgressBar, BarChart, ChartLegend y
   Modal también existen ahora como componentes del design system, en
   components/patterns/ — esa es la versión canónica para pantallas nuevas y para
   los templates. Este archivo mantiene su propia copia a propósito: el kit es
   una recreación que debe abrir sin depender del bundle compilado. Si cambias
   una de estas piezas, cámbiala en components/patterns/ también. */
const { Card, Button, Icon, Avatar, StatusBadge } = window.SerenataDesignSystem_993393;

const SN5_STATES = {
  PREPRODUCCIÓN: { tone: 'borrador', label: 'Preproducción' },
  RODAJE: { tone: 'emitida', label: 'Rodaje' },
  POSTPRODUCCIÓN: { tone: 'emitida', label: 'Postproducción' },
  FINALIZADO: { tone: 'aprobada', label: 'Finalizado' },
  FACTURA_PENDIENTE: { tone: 'borrador', label: 'Factura pendiente' },
  FACTURADO: { tone: 'emitida', label: 'Facturado' },
  PARCIALMENTE_PAGADO: { tone: 'emitida', label: 'Parcial' },
  PAGADO: { tone: 'aprobada', label: 'Pagado' },
  VENCIDO: { tone: 'cancelada', label: 'Vencido' },
  PENDIENTE: { tone: 'borrador', label: 'Pendiente' },
  EN_PROCESO_PAGO: { tone: 'emitida', label: 'En proceso' },
  validado: { tone: 'aprobada', label: 'Validado' },
  revision: { tone: 'emitida', label: 'En revisión' },
  pendiente: { tone: 'borrador', label: 'Pendiente' },
  rechazado: { tone: 'cancelada', label: 'Rechazado' },
};

/* Badge para estados que no son de cotización. El design system prohíbe añadir
   tonos nuevos, así que cada estado se mapea a uno de los cuatro existentes. */
function SNBadge({ state, style }) {
  const s = SN5_STATES[state] || { tone: 'borrador', label: String(state) };
  return <StatusBadge status={s.tone} style={style}>{s.label}</StatusBadge>;
}

/* Folio tipo código: el brief pide que se lea distinto al resto del texto.
   Se resuelve con la display face en tamaño pequeño y tracking abierto. */
function Folio({ children, size = 13, color = 'var(--text-body)' }) {
  return (
    <span className="sn-display" style={{ fontSize: size, letterSpacing: '0.06em', color, display: 'inline-block' }}>{children}</span>
  );
}

function Panel({ title, eyebrow, action, children, padding = 'var(--space-lg)', style, bodyStyle }) {
  return (
    <Card padding="0" style={style}>
      {title || action ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', padding: '15px var(--space-lg)', borderBottom: '1px solid var(--border-subtle)', flexWrap: 'wrap', minWidth: 0 }}>
          <div style={{ minWidth: 0 }}>
            {eyebrow ? <div className="sn-eyebrow" style={{ marginBottom: 4 }}>{eyebrow}</div> : null}
            {title ? <div style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--weight-semibold)', color: 'var(--text-primary)' }}>{title}</div> : null}
          </div>
          <div style={{ flex: 1, minWidth: 0 }} />
          <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 'var(--space-md)', flexWrap: 'wrap' }}>{action}</div>
        </div>
      ) : null}
      <div style={{ padding, ...bodyStyle }}>{children}</div>
    </Card>
  );
}

function Metric({ label, value, nota, accent = false, onClick }) {
  const [hover, setHover] = React.useState(false);
  return (
    <Card
      onClick={onClick}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      padding="var(--space-lg)"
      style={{ cursor: onClick ? 'pointer' : 'default', minWidth: 0, background: hover && onClick ? 'var(--surface-row-alt)' : 'var(--surface-card)', transition: 'var(--transition-control)' }}
    >
      <div className="sn-label">{label}</div>
      <div className="sn-display" style={{ fontSize: 'var(--text-h2)', marginTop: 10, color: accent ? 'var(--accent)' : 'var(--text-primary)' }}>{value}</div>
      {nota ? <div style={{ marginTop: 6, fontSize: 'var(--text-md)', color: 'var(--text-muted)' }}>{nota}</div> : null}
    </Card>
  );
}

function Field({ label, value, children, span, nowrapLabel }) {
  return (
    <div style={{ minWidth: 0, gridColumn: span ? 'span ' + span : undefined }}>
      <div className="sn-label" style={{ marginBottom: 7, whiteSpace: nowrapLabel ? 'nowrap' : undefined }}>{label}</div>
      {children || <div style={{ fontSize: 'var(--text-base)', color: 'var(--text-body)' }}>{value}</div>}
    </div>
  );
}

function ProgressBar({ value, height = 5, tone = 'var(--accent)' }) {
  return (
    <div style={{ height, borderRadius: 'var(--radius-pill)', background: 'var(--surface-input)', overflow: 'hidden' }}>
      <div style={{ width: Math.max(0, Math.min(100, value)) + '%', height: '100%', background: tone, transition: 'width var(--dur-slow) var(--ease-standard)' }} />
    </div>
  );
}

/* Barras agrupadas. Sin librería: alturas en % dentro de un contenedor flex. */
function BarChart({ data, series, height = 168, onBarClick, format = (v) => v }) {
  const [hover, setHover] = React.useState(null);
  const max = Math.max(...data.flatMap((d) => series.map((s) => d[s.key]))) * 1.08;
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 'var(--space-md)', height, borderBottom: '1px solid var(--border-subtle)' }}>
        {data.map((d, i) => (
          <div
            key={d.mes || i}
            onClick={() => onBarClick && onBarClick(d)}
            onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
            style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 4, height: '100%', position: 'relative', cursor: onBarClick ? 'pointer' : 'default' }}
          >
            {hover === i ? (
              <div style={{ position: 'absolute', top: -4, left: '50%', transform: 'translate(-50%,-100%)', background: 'var(--surface-row-alt)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '7px 11px', whiteSpace: 'nowrap', boxShadow: 'var(--shadow-raised)', zIndex: 2 }}>
                {series.map((s) => (
                  <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 'var(--text-md)', color: 'var(--text-body)' }}>
                    <span style={{ width: 7, height: 7, borderRadius: 2, background: s.color, flex: 'none' }} />
                    {s.label} {format(d[s.key])}
                  </div>
                ))}
              </div>
            ) : null}
            {series.map((s) => (
              <div key={s.key} style={{ flex: 1, maxWidth: 22, height: (d[s.key] / max * 100) + '%', background: s.color, borderRadius: '4px 4px 0 0', opacity: hover === null || hover === i ? 1 : 0.45, transition: 'opacity var(--dur-fast) var(--ease-standard)' }} />
            ))}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 'var(--space-md)', marginTop: 9 }}>
        {data.map((d, i) => (
          <div key={d.mes || i} style={{ flex: 1, textAlign: 'center', fontSize: 'var(--text-xs)', color: hover === i ? 'var(--text-body)' : 'var(--text-faint)', letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase' }}>{d.mes}</div>
        ))}
      </div>
    </div>
  );
}

function Legend({ series }) {
  return (
    <div style={{ display: 'flex', gap: 'var(--space-lg)', flexWrap: 'wrap', minWidth: 0 }}>
      {series.map((s) => (
        <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 'var(--text-md)', color: 'var(--text-muted)' }}>
          <span style={{ width: 9, height: 9, borderRadius: 3, background: s.color, flex: 'none' }} />{s.label}
        </div>
      ))}
    </div>
  );
}

function Modal({ title, eyebrow, onClose, children, footer, width = 720 }) {
  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(8,10,13,.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-2xl)' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: width, maxHeight: '88vh', display: 'flex', flexDirection: 'column', background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-overlay)', overflow: 'hidden' }}
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
        {footer ? <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', padding: 'var(--space-lg)', borderTop: '1px solid var(--border-subtle)' }}>{footer}</div> : null}
      </div>
    </div>
  );
}

/* Indicador de colaboración: quién más está en el documento y en qué sección. */
function Presence({ people }) {
  const [open, setOpen] = React.useState(false);
  if (!people || !people.length) return null;
  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button" onClick={() => setOpen(!open)}
        style={{ display: 'flex', alignItems: 'center', gap: 8, height: 'var(--control-height)', padding: '0 13px 0 9px', background: 'var(--surface-input)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-pill)', cursor: 'pointer' }}
      >
        <div style={{ display: 'flex' }}>
          {people.map((p, i) => (
            <Avatar key={p.initials} initials={p.initials} size={22} style={{ marginLeft: i ? -7 : 0, border: '2px solid var(--surface-input)' }} />
          ))}
        </div>
        <span style={{ fontSize: 'var(--text-md)', color: 'var(--text-muted)' }}>{people.length} viendo</span>
      </button>
      {open ? (
        <div style={{ position: 'absolute', top: 'calc(100% + 7px)', right: 0, zIndex: 20, width: 250, background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-input)', boxShadow: 'var(--shadow-raised)', padding: 7 }}>
          {people.map((p) => (
            <div key={p.initials} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 11px' }}>
              <Avatar initials={p.initials} size={26} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 'var(--text-md)', color: 'var(--text-body)', fontWeight: 'var(--weight-medium)' }}>{p.name}</div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Editando · {p.seccion}</div>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Toast({ children, onClose, link }) {
  if (!children) return null;
  return (
    <div style={{ position: 'fixed', bottom: 'var(--space-xl)', left: '50%', transform: 'translateX(-50%)', zIndex: 60, display: 'flex', alignItems: 'center', gap: 'var(--space-md)', maxWidth: 620, padding: '13px 15px 13px var(--space-lg)', background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-input)', boxShadow: 'var(--shadow-overlay)' }}>
      <Icon name="check" size={16} color="var(--sn-status-approved-fg)" />
      <span style={{ fontSize: 'var(--text-base)', color: 'var(--text-body)' }}>{children}</span>
      {link ? <a href="#" onClick={(e) => e.preventDefault()} style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--weight-semibold)', whiteSpace: 'nowrap' }}>{link}</a> : null}
      <button type="button" onClick={onClose} aria-label="Cerrar" style={{ background: 'transparent', border: 0, cursor: 'pointer', color: 'var(--text-muted)', padding: 2 }}><Icon name="x" size={15} /></button>
    </div>
  );
}

function Checkbox({ checked, onChange, label }) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 'var(--text-base)', color: 'var(--text-body)' }}>
      <span
        onClick={() => onChange(!checked)}
        style={{ width: 18, height: 18, flex: 'none', borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', background: checked ? 'var(--accent)' : 'var(--surface-input)', border: '1px solid ' + (checked ? 'var(--accent)' : 'var(--border-subtle)'), transition: 'var(--transition-control)' }}
      >
        {checked ? <Icon name="check" size={12} color="var(--sn-orange-ink)" strokeWidth={3} /> : null}
      </span>
      {label}
    </label>
  );
}

function Placeholder({ text }) {
  return (
    <Card padding="var(--space-3xl)" style={{ display: 'flex', gap: 'var(--space-lg)', alignItems: 'flex-start' }}>
      <Icon name="circle-dot" size={20} color="var(--text-faint)" />
      <p className="sn-lead" style={{ margin: 0, maxWidth: 620 }}>{text}</p>
    </Card>
  );
}

const SN5_SERIES = [
  { key: 'ingresos', label: 'Ingresos', color: 'var(--accent)' },
  { key: 'egresos', label: 'Egresos', color: 'var(--sn-texture-teal)' },
];

Object.assign(window, { SNBadge, Folio, Panel, Metric, Field, ProgressBar, BarChart, Legend, Modal, Presence, Toast, Checkbox, Placeholder, SN5_SERIES, SN5_STATES });
