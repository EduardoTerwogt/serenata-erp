/* 1.2 · Detalle de Cotización. Datos generales, partidas editables, totales en
   vivo y acciones que cambian según el estado. Reglas: "X Pagar" es neto al
   proveedor; el fee de agencia es 15% por default; el cliente paga 16% de IVA
   sobre subtotal+fee. */
const { Button, Card, Icon, Select, TextField, StatusBadge, SearchInput, DataTable } = window.SerenataDesignSystem_993393;

const SN5_CATEGORIAS = ['Dirección', 'Producción', 'Post', 'Talento', 'Arte', 'Equipo', 'Viáticos'];
const SN5_CATALOGO = ['Dirección y guion', 'Equipo de cámara (3 días)', 'Locaciones y permisos', 'Postproducción y color', 'Música original', 'Casting principal (2 perfiles)', 'Diseño de arte y utilería', 'Drone y aéreas', 'Maquillaje y peinado'];
const SN5_RESPONSABLES = ['Julián López', 'Ana Vidal', 'Marta Quiroz', 'Hugo Peña', 'Paula Iriarte', 'Distrito Sonoro'];

function Cell({ children, align, style }) {
  return <div style={{ minWidth: 0, textAlign: align, ...style }}>{children}</div>;
}

function InlineInput({ value, onChange, align = 'left', suggestions, placeholder, width }) {
  const [focus, setFocus] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const matches = suggestions && open && value
    ? suggestions.filter((s) => s.toLowerCase().includes(String(value).toLowerCase()) && s !== value).slice(0, 5)
    : [];
  return (
    <div style={{ position: 'relative', width: width || '100%' }}>
      <input
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setFocus(true)}
        onBlur={() => { setFocus(false); setTimeout(() => setOpen(false), 120); }}
        placeholder={placeholder}
        style={{
          width: '100%', height: 31, padding: '0 9px', textAlign: align,
          background: focus ? 'var(--surface-input)' : 'transparent',
          border: '1px solid ' + (focus ? 'var(--accent-quiet)' : 'transparent'),
          borderRadius: 'var(--radius-sm)', outline: 'none',
          fontFamily: 'var(--font-ui)', fontSize: 'var(--text-base)', color: 'var(--text-body)',
          transition: 'var(--transition-control)',
        }}
      />
      {matches.length ? (
        <div style={{ position: 'absolute', top: 'calc(100% + 3px)', left: 0, right: 0, zIndex: 15, background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', boxShadow: 'var(--shadow-raised)', overflow: 'hidden' }}>
          {matches.map((m) => (
            <div
              key={m} onMouseDown={() => { onChange(m); setOpen(false); }}
              style={{ padding: '8px 11px', fontSize: 'var(--text-md)', color: 'var(--text-muted)', cursor: 'pointer' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-row-alt)'; e.currentTarget.style.color = 'var(--text-body)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}
            >{m}</div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CotizacionDetalleScreen({ cotizacion, onBack, onGo }) {
  const base = window.SN5.cotizacion;
  const seed = cotizacion || base;
  const [estatus, setEstatus] = React.useState(seed.estatus || 'borrador');
  const [gen, setGen] = React.useState({
    cliente: seed.cliente || base.cliente, proyecto: seed.proyecto || base.proyecto,
    entrega: seed.entrega || base.entrega, locacion: base.locacion, notas: base.notas,
  });
  const [partidas, setPartidas] = React.useState(base.partidas.map((p) => ({ ...p })));
  const [fee, setFee] = React.useState(base.fee);
  const [iva, setIva] = React.useState(base.iva);
  const [descTipo, setDescTipo] = React.useState('monto');
  const [desc, setDesc] = React.useState(0);
  const [confirm, setConfirm] = React.useState(false);
  const [copiar, setCopiar] = React.useState(false);
  const [toast, setToast] = React.useState(null);

  const editable = estatus === 'borrador' || estatus === 'emitida';

  const num = (v) => (isNaN(parseFloat(v)) ? 0 : parseFloat(v));
  const subtotal = partidas.reduce((a, p) => a + num(p.cantidad) * num(p.precio), 0);
  const feeMonto = subtotal * num(fee) / 100;
  const preDesc = subtotal + feeMonto;
  const descMonto = descTipo === 'pct' ? preDesc * num(desc) / 100 : num(desc);
  const baseIva = Math.max(0, preDesc - descMonto);
  const ivaMonto = iva ? baseIva * 0.16 : 0;
  const total = baseIva + ivaMonto;
  const xPagarTotal = partidas.reduce((a, p) => a + num(p.xPagar), 0);

  const set = (i, k, v) => setPartidas((ps) => ps.map((p, j) => (j === i ? { ...p, [k]: v } : p)));
  const addRow = () => setPartidas((ps) => [...ps, { categoria: 'Producción', descripcion: '', cantidad: 1, precio: 0, responsable: '', xPagar: 0 }]);
  const delRow = (i) => setPartidas((ps) => ps.filter((_, j) => j !== i));
  const aplicarPlantilla = (nombre) => {
    if (!nombre) return;
    const t = window.SN5.plantillas.find((x) => x.nombre === nombre);
    if (!t) return;
    setPartidas((ps) => [...ps, ...t.items.map((x) => ({ ...x }))]);
    setToast({ msg: 'Se precargaron ' + t.items.length + ' partidas de la plantilla "' + nombre + '".' });
  };
  const copiarDe = (cot) => {
    const i = window.SN5.cotizaciones.findIndex((x) => x.folio === cot.folio);
    const t = window.SN5.plantillas[Math.abs(i) % window.SN5.plantillas.length];
    setPartidas((ps) => [...ps, ...t.items.map((x) => ({ ...x }))]);
    setCopiar(false);
    setToast({ msg: 'Se copiaron ' + t.items.length + ' partidas desde ' + cot.folio + ' · ' + cot.proyecto + '.' });
  };

  const GRID = '112px minmax(0,1.7fr) 62px 118px minmax(0,1fr) 118px 34px';

  return (
    <React.Fragment>
      {/* Barra de contexto: reemplaza al hero en las vistas de detalle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-lg)', flexWrap: 'wrap' }}>
        <Button variant="ghost" size="md" iconLeft="arrow-left" onClick={onBack}>Cotizaciones</Button>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-md)', minWidth: 0 }}>
          <h1 className="sn-display" style={{ margin: 0, fontSize: 'var(--text-h2)' }}>{seed.folio}</h1>
          <span style={{ fontSize: 'var(--text-md)', color: 'var(--text-muted)' }}>Cotizada el {base.fecha}</span>
          <StatusBadge status={estatus} />
          {seed.complementariaDe ? (
            <span style={{ fontSize: 'var(--text-md)', color: 'var(--accent)' }}>Complementaria de {seed.complementariaDe}</span>
          ) : null}
        </div>
        <div style={{ flex: 1, minWidth: 12 }} />
        <window.Presence people={base.presencia} />
        <div style={{ display: 'flex', gap: 'var(--space-md)' }}>
          {estatus === 'borrador' ? (
            <React.Fragment>
              <Button variant="secondary" size="lg">Guardar</Button>
              <Button variant="primary" size="lg" iconLeft="send" onClick={() => { setEstatus('emitida'); setToast({ msg: 'Cotización emitida y PDF generado.', link: 'Ver en Drive' }); }}>Generar cotización</Button>
            </React.Fragment>
          ) : null}
          {estatus === 'emitida' ? (
            <React.Fragment>
              <Button variant="ghost" size="lg" onClick={() => setConfirm(true)}>Cancelar</Button>
              <Button variant="secondary" size="lg" iconLeft="printer" onClick={() => setToast({ msg: 'PDF generado y guardado en Drive.', link: 'Abrir PDF' })}>Generar PDF</Button>
              <Button variant="primary" size="lg" iconLeft="check" onClick={() => { setEstatus('aprobada'); setToast({ msg: 'Cotización aprobada. Se creó el proyecto y sus cuentas por cobrar y por pagar.', link: 'Ir al proyecto' }); }}>Aprobar cotización</Button>
            </React.Fragment>
          ) : null}
          {estatus === 'aprobada' ? (
            <React.Fragment>
              <Button variant="ghost" size="lg" onClick={() => setConfirm(true)}>Cancelar</Button>
              <Button variant="secondary" size="lg" iconLeft="printer" onClick={() => setToast({ msg: 'PDF generado y guardado en Drive.', link: 'Abrir PDF' })}>Generar PDF</Button>
              <Button variant="primary" size="lg" iconLeft="git-branch" onClick={() => setToast({ msg: 'Se creó la complementaria SH015, ligada a ' + seed.folio + '.', link: 'Abrir SH015' })}>Crear complementaria</Button>
            </React.Fragment>
          ) : null}
          {estatus === 'cancelada' ? <Button variant="secondary" size="lg" iconLeft="printer">Generar PDF</Button> : null}
        </div>
      </div>

      {!editable ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px var(--space-lg)', borderRadius: 'var(--radius-sm)', background: 'var(--surface-row)', border: '1px solid var(--border-subtle)', fontSize: 'var(--text-md)', color: 'var(--text-muted)' }}>
          <Icon name="lock" size={14} />
          Los datos generales y las partidas sólo se editan en Borrador o Emitida.
        </div>
      ) : null}

      <window.Panel title="Datos generales">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(130px,200px)) 1fr auto', gap: 'var(--space-lg)', alignItems: 'start', minWidth: 0, overflowX: 'auto' }}>
          <window.Field label="Cliente" nowrapLabel>
            {editable
              ? <InlineInput value={gen.cliente} onChange={(v) => setGen({ ...gen, cliente: v })} suggestions={['Solura', 'Canal Norte', 'Vista Media', 'Grupo Alba', 'Nimbo', 'Lúmina', 'Terranova', 'Distrito']} placeholder="Buscar o escribir nuevo…" />
              : <span>{gen.cliente}</span>}
          </window.Field>
          <window.Field label="Proyecto" nowrapLabel>
            {editable
              ? <InlineInput value={gen.proyecto} onChange={(v) => setGen({ ...gen, proyecto: v })} suggestions={['Campaña Verano 2025', 'Campaña Invierno 2024', 'Institucional Solura 2024']} placeholder="Sugiere proyectos del cliente…" />
              : <span>{gen.proyecto}</span>}
          </window.Field>
          <window.Field label="Fecha de entrega" nowrapLabel>
            {editable ? <InlineInput value={gen.entrega} onChange={(v) => setGen({ ...gen, entrega: v })} /> : <span>{gen.entrega}</span>}
          </window.Field>
          <window.Field label="Locación" nowrapLabel>
            {editable ? <InlineInput value={gen.locacion} onChange={(v) => setGen({ ...gen, locacion: v })} /> : <span>{gen.locacion}</span>}
          </window.Field>
          <div />
          <div style={{ textAlign: 'right', minWidth: 0 }}>
            <window.Field label="Fecha de cotización" value={base.fecha} nowrapLabel />
          </div>
        </div>
        <div style={{ marginTop: 'var(--space-lg)' }}>
          <window.Field label="Notas del evento · uso interno, no sale en el PDF">
            <textarea
              value={gen.notas} onChange={(e) => setGen({ ...gen, notas: e.target.value })} disabled={!editable} rows={2}
              style={{ width: '100%', padding: '10px 12px', background: 'var(--surface-input)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', outline: 'none', resize: 'vertical', fontFamily: 'var(--font-ui)', fontSize: 'var(--text-base)', color: 'var(--text-body)', lineHeight: 'var(--lh-body)' }}
            />
          </window.Field>
        </div>
      </window.Panel>

      <React.Fragment>
        <window.Panel
          title="Partidas" padding="0"
          action={editable ? (
            <div style={{ display: 'flex', gap: 'var(--space-md)' }}>
              <Select size="md" value="" onChange={(e) => aplicarPlantilla(e.target.value)} options={[{ value: '', label: 'Plantilla de servicios…' }, ...window.SN5.plantillasServicios.map((p) => ({ value: p, label: p }))]} />
              <Button variant="secondary" size="md" iconLeft="copy" onClick={() => setCopiar(true)}>Copiar de otra cotización</Button>
            </div>
          ) : null}
        >
          <div style={{ overflowX: 'auto' }}>
            <div style={{ minWidth: 880 }}>
              <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: 'var(--space-md)', padding: '13px var(--row-pad-x)', borderBottom: '1px solid var(--border-subtle)', fontSize: 'var(--text-table-head)', fontWeight: 'var(--weight-semibold)', letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase', color: 'var(--text-faint)' }}>
                <Cell>Categoría</Cell><Cell>Descripción</Cell><Cell align="right">Cant.</Cell>
                <Cell align="right">P. unitario</Cell><Cell>Responsable</Cell><Cell align="right">X pagar</Cell><Cell />
              </div>
              {partidas.map((p, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: GRID, gap: 'var(--space-md)', alignItems: 'center', padding: '7px var(--row-pad-x)', borderBottom: '1px solid var(--border-subtle)' }}>
                  <Cell>
                    {editable
                      ? <Select size="sm" value={p.categoria} onChange={(e) => set(i, 'categoria', e.target.value)} options={SN5_CATEGORIAS} style={{ width: '100%' }} />
                      : <span style={{ fontSize: 'var(--text-md)', color: 'var(--text-muted)' }}>{p.categoria}</span>}
                  </Cell>
                  <Cell>{editable ? <InlineInput value={p.descripcion} onChange={(v) => set(i, 'descripcion', v)} suggestions={SN5_CATALOGO} placeholder="Buscar en catálogo…" /> : <span>{p.descripcion}</span>}</Cell>
                  <Cell align="right">{editable ? <InlineInput value={p.cantidad} onChange={(v) => set(i, 'cantidad', v)} align="right" /> : <span>{p.cantidad}</span>}</Cell>
                  <Cell align="right">{editable ? <InlineInput value={p.precio} onChange={(v) => set(i, 'precio', v)} align="right" /> : <span>{window.SN5_MXN(p.precio)}</span>}</Cell>
                  <Cell>{editable ? <InlineInput value={p.responsable} onChange={(v) => set(i, 'responsable', v)} suggestions={SN5_RESPONSABLES} placeholder="Asignar…" /> : <span>{p.responsable}</span>}</Cell>
                  <Cell align="right">{editable ? <InlineInput value={p.xPagar} onChange={(v) => set(i, 'xPagar', v)} align="right" /> : <span>{window.SN5_MXN(p.xPagar)}</span>}</Cell>
                  <Cell align="right">
                    {editable ? (
                      <button type="button" onClick={() => delRow(i)} aria-label="Eliminar fila" style={{ background: 'transparent', border: 0, cursor: 'pointer', color: 'var(--text-faint)', padding: 5 }}><Icon name="trash-2" size={15} /></button>
                    ) : null}
                  </Cell>
                </div>
              ))}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-md)', padding: '13px var(--row-pad-x)' }}>
                {editable ? <Button variant="ghost" size="md" iconLeft="plus" onClick={addRow}>Agregar fila</Button> : <span />}
                <span style={{ fontSize: 'var(--text-md)', color: 'var(--text-muted)' }}>
                  Total X pagar a responsables <span style={{ color: 'var(--text-primary)', fontWeight: 'var(--weight-semibold)' }}>{window.SN5_MXN(xPagarTotal)}</span> · neto, sin impuestos del proveedor
                </span>
              </div>
            </div>
          </div>
        </window.Panel>

        <window.Panel title="Totales">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px,1fr))', gap: 'var(--space-xl)', alignItems: 'start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px,1fr))', gap: 'var(--space-md)' }}>
                <window.Field label="Fee / margen de agencia">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      value={fee} onChange={(e) => setFee(e.target.value)} disabled={!editable}
                      style={{ width: 64, height: 'var(--control-height)', padding: '0 11px', textAlign: 'right', background: 'var(--surface-input)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', outline: 'none', fontFamily: 'var(--font-ui)', fontSize: 'var(--text-base)', color: 'var(--text-body)' }}
                    />
                    <span style={{ color: 'var(--text-muted)' }}>%</span>
                  </div>
                </window.Field>
                <window.Field label="Descuento">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      value={desc} onChange={(e) => setDesc(e.target.value)} disabled={!editable}
                      style={{ flex: 1, minWidth: 0, height: 'var(--control-height)', padding: '0 11px', textAlign: 'right', background: 'var(--surface-input)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', outline: 'none', fontFamily: 'var(--font-ui)', fontSize: 'var(--text-base)', color: 'var(--text-body)' }}
                    />
                    <Select size="md" value={descTipo} onChange={(e) => setDescTipo(e.target.value)} options={[{ value: 'monto', label: '$' }, { value: 'pct', label: '%' }]} />
                  </div>
                </window.Field>
              </div>
              <window.Checkbox checked={iva} onChange={editable ? setIva : () => {}} label="IVA 16% sobre subtotal + fee" />
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', fontSize: 'var(--text-md)' }}>
                <span style={{ flex: 1, minWidth: 0, color: 'var(--text-faint)' }}>Margen Serenata estimado</span>
                <span style={{ color: 'var(--text-muted)' }}>{window.SN5_MXN(subtotal + feeMonto - xPagarTotal)}</span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              {[
                ['Subtotal', subtotal],
                ['Fee de agencia · ' + num(fee) + '%', feeMonto],
                descMonto ? ['Descuento', -descMonto] : null,
                ['General', baseIva],
                ['IVA 16%', ivaMonto],
              ].filter(Boolean).map(([l, v]) => (
                <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', fontSize: 'var(--text-base)' }}>
                  <span style={{ flex: 1, minWidth: 0, color: l === 'General' ? 'var(--text-body)' : 'var(--text-muted)', fontWeight: l === 'General' ? 'var(--weight-semibold)' : 'var(--weight-regular)' }}>{l}</span>
                  <span style={{ color: l === 'General' ? 'var(--text-primary)' : 'var(--text-body)', fontWeight: l === 'General' ? 'var(--weight-semibold)' : 'var(--weight-regular)' }}>{window.SN5_MXN(v)}</span>
                </div>
              ))}
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-md)', paddingTop: 'var(--space-md)', borderTop: '1px solid var(--border-subtle)' }}>
                <span className="sn-label" style={{ flex: 1, minWidth: 0 }}>Total final</span>
                <span className="sn-display" style={{ fontSize: 'var(--text-h2)', color: 'var(--accent)' }}>{window.SN5_MXN_L(total)}</span>
              </div>
            </div>
          </div>
        </window.Panel>
      </React.Fragment>

      {copiar ? (
        <window.Modal
          title="Copiar desde otra cotización" eyebrow="Partidas" width={860} onClose={() => setCopiar(false)}
        >
          <p style={{ margin: '0 0 var(--space-lg)', fontSize: 'var(--text-base)', color: 'var(--text-muted)' }}>
            Elige una cotización y sus partidas se agregan a esta. Los datos generales no se copian.
          </p>
          <Card padding="0" tone="row">
            <DataTable
              minWidth={0}
              onRowClick={copiarDe}
              columns={[
                { key: 'folio', label: 'Folio', width: '90px', render: (r) => <window.Folio>{r.folio}</window.Folio> },
                { key: 'proyecto', label: 'Proyecto', width: '1.5fr', strong: true },
                { key: 'cliente', label: 'Cliente', width: '1fr' },
                { key: 'total', label: 'Total', width: '1fr', align: 'right', render: (r) => window.SN5_MXN(r.total) },
                { key: 'estatus', label: 'Estatus', width: '120px', align: 'right', render: (r) => <StatusBadge status={r.estatus} /> },
              ]}
              rows={window.SN5.cotizaciones.filter((r) => r.folio !== seed.folio && !r.sinItems)}
              emptyLabel="No hay otra cotización con partidas"
            />
          </Card>
        </window.Modal>
      ) : null}

      {confirm ? (
        <window.Modal
          title="Cancelar cotización" eyebrow={seed.folio} width={520} onClose={() => setConfirm(false)}
          footer={(
            <React.Fragment>
              <div style={{ flex: 1 }} />
              <Button variant="ghost" size="lg" onClick={() => setConfirm(false)}>Mantener</Button>
              <Button variant="primary" size="lg" onClick={() => { setEstatus('cancelada'); setConfirm(false); setToast({ msg: 'Cotización cancelada. Se revirtió el proyecto y sus cuentas.' }); }}>Sí, cancelar</Button>
            </React.Fragment>
          )}
        >
          <p style={{ margin: 0, fontSize: 'var(--text-base)', color: 'var(--text-body)', lineHeight: 'var(--lh-body)' }}>
            Al cancelar esta cotización se borra el proyecto <strong style={{ color: 'var(--text-primary)' }}>{gen.proyecto}</strong> y todas las cuentas por cobrar y por pagar ligadas a él. La acción no se puede deshacer desde esta pantalla.
          </p>
        </window.Modal>
      ) : null}

      <window.Toast onClose={() => setToast(null)} link={toast && toast.link}>{toast && toast.msg}</window.Toast>
    </React.Fragment>
  );
}

Object.assign(window, { CotizacionDetalleScreen, InlineInput: InlineInput, SN5_CATEGORIAS, SN5_CATALOGO, SN5_RESPONSABLES });
