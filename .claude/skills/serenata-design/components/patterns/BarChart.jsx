import React from 'react';

/* Barras agrupadas, sin librería ni ejes: el lenguaje de gráficas del sistema
   es monocromo con el naranja de marca para la serie principal y el teal de la
   textura (--sn-texture-teal) como única segunda serie. Sin cuadrícula, sin
   eje Y; el detalle vive en el tooltip al hover. */
export const SERIES_DEFAULT = [
  { key: 'ingresos', label: 'Ingresos', color: 'var(--accent)' },
  { key: 'egresos', label: 'Egresos', color: 'var(--sn-texture-teal)' },
];

export function BarChart({
  data = [], series = SERIES_DEFAULT, labelKey = 'mes', height = 168,
  onBarClick, format = (v) => v, style, ...rest
}) {
  const [hover, setHover] = React.useState(null);
  const max = Math.max(...data.flatMap((d) => series.map((s) => d[s.key])), 1) * 1.08;
  return (
    <div style={style} {...rest}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 'var(--space-md)', height, borderBottom: '1px solid var(--border-subtle)' }}>
        {data.map((d, i) => (
          <div
            key={d[labelKey] || i}
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
          <div key={d[labelKey] || i} style={{ flex: 1, textAlign: 'center', fontSize: 'var(--text-xs)', color: hover === i ? 'var(--text-body)' : 'var(--text-faint)', letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase' }}>{d[labelKey]}</div>
        ))}
      </div>
    </div>
  );
}

export function ChartLegend({ series = SERIES_DEFAULT, style, ...rest }) {
  return (
    <div style={{ display: 'flex', gap: 'var(--space-lg)', flexWrap: 'wrap', minWidth: 0, ...style }} {...rest}>
      {series.map((s) => (
        <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 'var(--text-md)', color: 'var(--text-muted)' }}>
          <span style={{ width: 9, height: 9, borderRadius: 3, background: s.color, flex: 'none' }} />{s.label}
        </div>
      ))}
    </div>
  );
}
