/* Piezas compartidas del kit de UI.

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
function Folio({ children, size = 12.5, color = 'var(--text-primary)' }) {
  return (
    <span style={{ fontFamily: 'var(--font-ui)', fontSize: size, fontWeight: 'var(--weight-semibold)', color, display: 'inline-block' }}>{children}</span>
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
      {children || <div style={{ fontSize: 'var(--text-md)', color: 'var(--text-primary)' }}>{value}</div>}
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

/* Loader de marca: el isotipo "S" se llena con el degradado de textura en un
   loop de clip-path. Copia local de components/patterns/SplashMark.jsx — ver
   la nota al inicio de este archivo sobre por qué el kit no importa del bundle. */
function SplashMark({ size = 176, style }) {
  const maskLayer = {
    position: 'absolute', inset: 0,
    WebkitMaskImage: 'url("data:image/png;base64,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")', maskImage: 'url("data:image/png;base64,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")',
    WebkitMaskSize: 'contain', maskSize: 'contain',
    WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat',
    WebkitMaskPosition: 'center', maskPosition: 'center',
  };
  return (
    <div style={{ position: 'relative', width: size, height: size, flex: 'none', ...style }}>
      <style>{'@keyframes sn-splash-snake{0%,8%{background-position:50% -210%}92%,100%{background-position:50% 210%}}'}</style>
      <div style={{ ...maskLayer, background: 'var(--text-primary)' }} />
      <div style={{
        ...maskLayer,
        backgroundImage: 'linear-gradient(165deg,transparent 12%,var(--sn-texture-orange) 28%,var(--sn-texture-red) 42%,var(--sn-texture-teal) 56%,var(--sn-texture-blue) 70%,transparent 88%)',
        backgroundSize: '100% 260%', backgroundPosition: '50% -210%',
        animation: 'sn-splash-snake 2.2s ease-in-out infinite',
      }} />
    </div>
  );
}


Object.assign(window, { SNBadge, Folio, Panel, Metric, Field, ProgressBar, BarChart, Legend, Modal, Presence, Toast, Checkbox, Placeholder, SplashMark, SN5_SERIES, SN5_STATES });
