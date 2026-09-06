/* 4 · Portal de Colaboradores (Fase 5.5). Autoservicio: el colaborador captura
   sus propios datos, sube documentación legal/fiscal y sube facturas con
   validación automática visible al momento contra su cuenta por pagar. */
const { Button, Card, Icon, Avatar, Select, TextField, FilterTabs, DataTable, SectionHero } = window.SerenataDesignSystem_993393;

function DropZone({ label, hint, onDrop }) {
  const [over, setOver] = React.useState(false);
  return (
    <div
      onClick={onDrop}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); onDrop && onDrop(); }}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 9, padding: 'var(--space-xl)', cursor: 'pointer', borderRadius: 'var(--radius-lg)', border: '1px dashed ' + (over ? 'var(--accent)' : 'var(--border-subtle)'), background: over ? 'var(--surface-row-alt)' : 'var(--surface-input)', transition: 'var(--transition-control)' }}
    >
      <Icon name="upload" size={20} color={over ? 'var(--accent)' : 'var(--text-muted)'} />
      <div style={{ fontSize: 'var(--text-base)', color: 'var(--text-body)', fontWeight: 'var(--weight-medium)' }}>{label}</div>
      <div style={{ fontSize: 'var(--text-md)', color: 'var(--text-faint)', textAlign: 'center' }}>{hint}</div>
    </div>
  );
}

function ValidacionFactura({ resultado, onClose }) {
  const ok = resultado.every((r) => r.ok);
  return (
    <Card padding="0" style={{ borderColor: ok ? 'var(--sn-status-approved-bg)' : 'var(--sn-status-cancelled-bg)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', padding: '13px var(--space-lg)', borderBottom: '1px solid var(--border-subtle)' }}>
        <Icon name={ok ? 'check-circle' : 'alert-triangle'} size={18} color={ok ? 'var(--sn-status-approved-fg)' : 'var(--sn-status-cancelled-fg)'} />
        <span style={{ flex: 1, minWidth: 0, fontSize: 'var(--text-lg)', fontWeight: 'var(--weight-semibold)', color: 'var(--text-primary)' }}>
          {ok ? 'Factura aceptada' : 'La factura necesita corrección'}
        </span>
        <Button variant="ghost" size="md" onClick={onClose}>Subir otra</Button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {resultado.map((r, i) => (
          <div key={r.label} style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-md)', padding: '13px var(--space-lg)', borderBottom: i === resultado.length - 1 ? 0 : '1px solid var(--border-subtle)' }}>
            <Icon name={r.ok ? 'check' : 'x'} size={15} color={r.ok ? 'var(--sn-status-approved-fg)' : 'var(--sn-status-cancelled-fg)'} strokeWidth={2.5} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 'var(--text-base)', color: 'var(--text-body)' }}>{r.label}</div>
              <div style={{ fontSize: 'var(--text-md)', color: 'var(--text-faint)', marginTop: 2 }}>{r.detalle}</div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function PortalScreen() {
  const c = window.SN5.colaborador;
  const [tab, setTab] = React.useState('datos');
  const [regimen, setRegimen] = React.useState(c.regimen);
  const [roles, setRoles] = React.useState(c.roles);
  const [nuevoRol, setNuevoRol] = React.useState('');
  const [validacion, setValidacion] = React.useState(null);

  const cuenta = window.SN5.cuentasPagar.find((x) => x.responsable === 'Ana Vidal') || window.SN5.cuentasPagar[1];
  const f = window.sn5Fiscal(cuenta.total, regimen);

  const validar = () => setValidacion([
    { ok: true, label: 'La factura está bien elaborada', detalle: 'CFDI 4.0 válido · RFC receptor coincide con Serenata House Entertainment' },
    { ok: true, label: 'El monto coincide con lo esperado', detalle: 'Cuenta ' + cuenta.folio + ' · neto esperado ' + window.SN5_MXN(cuenta.total) },
    {
      ok: true,
      label: 'El impuesto corresponde a tu régimen',
      detalle: regimen === 'moral'
        ? 'Persona moral · IVA 16% acreditable, sin retenciones. Total a transferir ' + window.SN5_MXN(f.pago)
        : 'Persona física con honorarios · IVA 16%, retención de IVA 2/3 (10.6667%) y retención de ISR 10% sobre el subtotal. Total a transferir ' + window.SN5_MXN(f.pago),
    },
  ]);

  const facturaCols = [
    { key: 'id', label: 'Factura', width: '110px', render: (r) => <window.Folio>{r.id}</window.Folio> },
    { key: 'proyecto', label: 'Proyecto', width: '1.5fr', strong: true },
    { key: 'cuenta', label: 'Cuenta', width: '100px', render: (r) => <span style={{ color: 'var(--text-muted)' }}>{r.cuenta}</span> },
    { key: 'monto', label: 'Monto', width: '1fr', align: 'right', render: (r) => window.SN5_MXN(r.monto) },
    { key: 'fecha', label: 'Enviada', width: '1fr' },
    { key: 'estado', label: 'Validación', width: '140px', align: 'right', render: (r) => <window.SNBadge state={r.estado} /> },
  ];

  return (
    <React.Fragment>
      <SectionHero
        title="Portal"
        action={(
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
            <Avatar initials={c.initials} size={38} />
            <div>
              <div style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--weight-semibold)', color: 'var(--text-primary)' }}>{c.nombre}</div>
              <div style={{ fontSize: 'var(--text-md)', color: 'var(--text-muted)' }}>Colaboradora externa</div>
            </div>
          </div>
        )}
      />

      <FilterTabs
        tabs={[
          { id: 'datos', label: 'Mis datos' },
          { id: 'docs', label: 'Documentación' },
          { id: 'factura', label: 'Subir factura' },
          { id: 'historial', label: 'Historial', count: c.facturas.length },
        ]}
        value={tab} onChange={setTab} style={{ alignSelf: 'flex-start' }}
      />

      {tab === 'datos' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px,1fr))', gap: 'var(--space-lg)', alignItems: 'start' }}>
          <window.Panel title="Datos personales">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
              <TextField label="Nombre completo" defaultValue={c.nombre} />
              <TextField label="Teléfono" defaultValue={c.telefono} />
              <TextField label="Correo" defaultValue={c.correo} />
            </div>
          </window.Panel>

          <window.Panel title="Roles">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
              <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
                {roles.map((r) => (
                  <span key={r} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '6px 8px 6px 13px', borderRadius: 'var(--radius-pill)', background: 'var(--surface-row-alt)', border: '1px solid var(--border-subtle)', fontSize: 'var(--text-md)', color: 'var(--text-body)' }}>
                    {r}
                    <button type="button" onClick={() => setRoles(roles.filter((x) => x !== r))} aria-label={'Quitar ' + r} style={{ background: 'transparent', border: 0, cursor: 'pointer', color: 'var(--text-faint)', padding: 0, display: 'flex' }}><Icon name="x" size={13} /></button>
                  </span>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 'var(--space-md)', alignItems: 'flex-end' }}>
                <TextField label="Agregar rol" value={nuevoRol} onChange={(e) => setNuevoRol(e.target.value)} placeholder="Ej. Directora de Fotografía" />
                <Button variant="secondary" size="md" onClick={() => { if (nuevoRol.trim()) { setRoles([...roles, nuevoRol.trim()]); setNuevoRol(''); } }}>Agregar</Button>
              </div>
            </div>
          </window.Panel>

          <window.Panel title="Datos bancarios y fiscales">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
              <TextField label="Banco" defaultValue={c.banco} />
              <TextField label="CLABE · 18 dígitos" defaultValue={c.clabe} />
              <window.Field label="Régimen fiscal">
                <Select
                  size="md" value={regimen} onChange={(e) => setRegimen(e.target.value)} style={{ width: '100%' }}
                  options={[{ value: 'moral', label: 'Persona moral · IVA 16%' }, { value: 'fisica', label: 'Persona física con honorarios' }]}
                />
              </window.Field>
              <p style={{ margin: 0, fontSize: 'var(--text-md)', color: 'var(--text-faint)', lineHeight: 'var(--lh-snug)' }}>
                {regimen === 'moral'
                  ? 'Facturas con IVA 16% acreditable, sin retenciones.'
                  : 'Se te retiene IVA de 2/3 (10.6667%) e ISR de 10%, ambas sobre el subtotal.'}
              </p>
              <Button variant="primary" size="lg">Guardar cambios</Button>
            </div>
          </window.Panel>
        </div>
      ) : null}

      {tab === 'docs' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px,1fr))', gap: 'var(--space-lg)', alignItems: 'start' }}>
          <window.Panel title="Subir documentación">
            <DropZone label="Arrastra tus documentos aquí" hint="Constancia de situación fiscal, INE, contratos. PDF o imagen." />
          </window.Panel>
          <window.Panel title="Mis documentos" padding="0">
            {c.documentos.map((d, i) => (
              <div key={d.nombre} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', padding: '15px var(--space-lg)', borderBottom: i === c.documentos.length - 1 ? 0 : '1px solid var(--border-subtle)' }}>
                <Icon name="file-text" size={16} color="var(--text-muted)" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 'var(--text-base)', color: 'var(--text-body)' }}>{d.nombre}</div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)', marginTop: 2 }}>{d.fecha}</div>
                </div>
                <window.SNBadge state={d.estado} />
                <Button variant="ghost" size="md" iconLeft={d.estado === 'pendiente' ? 'upload' : 'download'}>{d.estado === 'pendiente' ? 'Subir' : 'Ver'}</Button>
              </div>
            ))}
          </window.Panel>
        </div>
      ) : null}

      {tab === 'factura' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px,1fr))', gap: 'var(--space-lg)', alignItems: 'start' }}>
          <window.Panel title="Subir factura">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
              <window.Field label="Cuenta a la que corresponde">
                <Select size="md" style={{ width: '100%' }} options={window.SN5.cuentasPagar.filter((x) => x.responsable === 'Ana Vidal' || x.estado !== 'PAGADO').map((x) => ({ value: x.folio + x.descripcion, label: x.folio + ' · ' + x.descripcion + ' · ' + window.SN5_MXN(x.total) }))} />
              </window.Field>
              <DropZone label="Arrastra el XML y el PDF" hint="Se validan al momento contra el monto de la cuenta y tu régimen fiscal." onDrop={validar} />
              <Button variant="primary" size="lg" iconLeft="check" onClick={validar}>Validar factura</Button>
            </div>
          </window.Panel>

          {validacion
            ? <ValidacionFactura resultado={validacion} onClose={() => setValidacion(null)} />
            : (
              <window.Panel title="Qué se revisa">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
                  {[
                    ['Elaboración', 'CFDI 4.0 válido, RFC receptor correcto, concepto legible.'],
                    ['Monto', 'Debe coincidir con el neto de la cuenta por pagar, sin tus impuestos encima.'],
                    ['Impuestos', 'IVA y retenciones según tu régimen fiscal registrado.'],
                  ].map(([t, d]) => (
                    <div key={t}>
                      <div className="sn-label" style={{ marginBottom: 5 }}>{t}</div>
                      <p style={{ margin: 0, fontSize: 'var(--text-base)', color: 'var(--text-muted)', lineHeight: 'var(--lh-body)' }}>{d}</p>
                    </div>
                  ))}
                </div>
              </window.Panel>
            )}
        </div>
      ) : null}

      {tab === 'historial' ? (
        <Card padding="0">
          <DataTable columns={facturaCols} rows={c.facturas} emptyLabel="Todavía no has subido facturas" />
        </Card>
      ) : null}
    </React.Fragment>
  );
}

Object.assign(window, { PortalScreen });
