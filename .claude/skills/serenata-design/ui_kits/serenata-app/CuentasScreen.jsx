/* 3 · Cuentas por Cobrar y por Pagar (Fase 5.3). Vista agrupada por proyecto
   como navegación principal, lista plana como alternativa, cruce fiscal
   proyectado vs. real con los dos escenarios de proveedor, y la ficha semanal
   de órdenes de pago para contabilidad.

   Escenario A · persona moral: IVA 16% acreditable.
   Escenario B · persona física con honorarios: IVA 16%, retención de IVA de
   2/3 (10.6667%) y retención de ISR de 10%, ambas sobre el subtotal.
   La base siempre es "X Pagar" (neto); el proveedor agrega sus impuestos. */
const { Button, Card, Icon, Avatar, Select, SearchInput, FilterButton, FilterTabs, DataTable, TableFooter, TextField, SectionHero } = window.SerenataDesignSystem_993393;

function sn5Fiscal(neto, regimen) {
  const iva = neto * 0.16;
  if (regimen === 'moral') return { neto, iva, retIva: 0, retIsr: 0, pago: neto + iva };
  const retIva = neto * (2 / 3) * 0.16;
  const retIsr = neto * 0.10;
  return { neto, iva, retIva, retIsr, pago: neto + iva - retIva - retIsr };
}

function DocSection({ docs }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
      {docs.map((d) => (
        <div key={d.nombre} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', padding: '13px var(--space-lg)', background: 'var(--surface-row)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)' }}>
          <Icon name={d.tipo === 'xml' ? 'file-code' : 'file-text'} size={16} color="var(--text-muted)" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 'var(--text-base)', color: 'var(--text-body)' }}>{d.nombre}</div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)', marginTop: 2 }}>{d.rol} · {d.fecha}</div>
          </div>
          <window.SNBadge state={d.estado} />
          <Button variant="ghost" size="md" iconLeft={d.estado === 'pendiente' ? 'upload' : 'download'}>{d.estado === 'pendiente' ? 'Subir' : 'Ver'}</Button>
        </div>
      ))}
    </div>
  );
}

function CuentaModal({ cuenta, tipo, onClose }) {
  const [tab, setTab] = React.useState('info');
  const [responsable, setResponsable] = React.useState(cuenta.responsable);
  const [monto, setMonto] = React.useState('');
  const f = tipo === 'pagar' ? sn5Fiscal(cuenta.total, cuenta.regimen) : null;

  const docs = tipo === 'cobrar'
    ? [
      { nombre: 'Factura ' + cuenta.folio + '.xml', rol: 'Factura al cliente', tipo: 'xml', estado: 'validado', fecha: '26 abr 2025' },
      { nombre: 'Factura ' + cuenta.folio + '.pdf', rol: 'Factura al cliente', estado: 'validado', fecha: '26 abr 2025' },
      { nombre: 'Complemento de pago', rol: 'Emitido tras el cobro', estado: cuenta.pagado ? 'validado' : 'pendiente', fecha: cuenta.pagado ? '30 abr 2025' : '—' },
      { nombre: 'Comprobante de transferencia', rol: 'Soporte del pago recibido', estado: cuenta.pagado ? 'validado' : 'pendiente', fecha: cuenta.pagado ? '30 abr 2025' : '—' },
    ]
    : [
      { nombre: 'Factura del proveedor.xml', rol: 'Emitida por ' + cuenta.responsable, tipo: 'xml', estado: cuenta.pagado ? 'validado' : 'revision', fecha: '24 abr 2025' },
      { nombre: 'Factura del proveedor.pdf', rol: 'Emitida por ' + cuenta.responsable, estado: cuenta.pagado ? 'validado' : 'revision', fecha: '24 abr 2025' },
      { nombre: 'Comprobante de pago', rol: 'Soporte del pago emitido', estado: cuenta.pagado ? 'validado' : 'pendiente', fecha: cuenta.pagado ? '28 abr 2025' : '—' },
    ];

  return (
    <window.Modal
      title={cuenta.proyecto} eyebrow={cuenta.folio + ' · ' + (tipo === 'cobrar' ? cuenta.cliente : cuenta.responsable)} width={860} onClose={onClose}
      footer={(
        <React.Fragment>
          <window.SNBadge state={cuenta.estado} />
          <div style={{ flex: 1 }} />
          {tipo === 'pagar' ? <Button variant="ghost" size="lg" iconLeft="file-text">Ver orden de pago</Button> : null}
          <Button variant="primary" size="lg" onClick={onClose}>Cerrar</Button>
        </React.Fragment>
      )}
    >
      <FilterTabs
        tabs={[{ id: 'info', label: 'Información' }, { id: 'docs', label: 'Documentos' }, { id: 'pago', label: 'Registrar pago' }]}
        value={tab} onChange={setTab} style={{ marginBottom: 'var(--space-lg)' }}
      />

      {tab === 'info' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px,1fr))', gap: 'var(--space-lg)' }}>
            <window.Field label="Folio"><window.Folio size={15}>{cuenta.folio}</window.Folio></window.Field>
            <window.Field label="Proyecto" value={cuenta.proyecto} />
            {tipo === 'cobrar'
              ? <window.Field label="Cliente" value={cuenta.cliente} />
              : (
                <window.Field label="Responsable / proveedor">
                  <Select size="md" value={responsable} onChange={(e) => setResponsable(e.target.value)} options={['Julián López', 'Ana Vidal', 'Marta Quiroz', 'Hugo Peña', 'Paula Iriarte', 'Distrito Sonoro']} style={{ width: '100%' }} />
                </window.Field>
              )}
            <window.Field label="Total" value={window.SN5_MXN_L(cuenta.total)} />
            <window.Field label="Pagado" value={window.SN5_MXN_L(cuenta.pagado)} />
            <window.Field label={tipo === 'cobrar' ? 'Vencimiento' : 'Concepto'} value={tipo === 'cobrar' ? cuenta.vencimiento : cuenta.descripcion} />
          </div>

          {tipo === 'pagar' ? (
            <React.Fragment>
              <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px var(--space-lg)', borderRadius: 'var(--radius-sm)', background: 'var(--surface-row)', border: '1px solid var(--border-subtle)', fontSize: 'var(--text-md)', color: 'var(--text-muted)' }}>
                <Icon name="link" size={14} />
                Cambiar el responsable aquí también lo actualiza en la partida del proyecto. Nunca quedan desincronizados.
              </div>
              <div>
                <div className="sn-label" style={{ marginBottom: 11 }}>
                  Cruce fiscal · escenario {cuenta.regimen === 'moral' ? 'A · persona moral' : 'B · persona física con honorarios'}
                </div>
                <Card tone="row" padding="var(--space-lg)">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                    {[
                      ['X pagar · neto al proveedor', f.neto],
                      ['IVA 16% que agrega el proveedor', f.iva],
                      cuenta.regimen === 'fisica' ? ['Retención de IVA · 2/3 (10.6667%)', -f.retIva] : null,
                      cuenta.regimen === 'fisica' ? ['Retención de ISR · 10%', -f.retIsr] : null,
                    ].filter(Boolean).map(([l, v]) => (
                      <div key={l} style={{ display: 'flex', gap: 'var(--space-md)', fontSize: 'var(--text-base)' }}>
                        <span style={{ flex: 1, minWidth: 0, color: 'var(--text-muted)' }}>{l}</span>
                        <span style={{ color: 'var(--text-body)' }}>{window.SN5_MXN(v)}</span>
                      </div>
                    ))}
                    <div style={{ display: 'flex', gap: 'var(--space-md)', alignItems: 'baseline', paddingTop: 'var(--space-md)', borderTop: '1px solid var(--border-subtle)' }}>
                      <span style={{ flex: 1, minWidth: 0, fontSize: 'var(--text-base)', color: 'var(--text-body)', fontWeight: 'var(--weight-semibold)' }}>Total a transferir</span>
                      <span className="sn-display" style={{ fontSize: 'var(--text-h3)', color: 'var(--text-primary)' }}>{window.SN5_MXN(f.pago)}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 'var(--text-md)', color: 'var(--sn-status-approved-fg)' }}>
                      <Icon name="check" size={14} />La factura recibida coincide con el monto esperado y el impuesto corresponde al régimen.
                    </div>
                  </div>
                </Card>
              </div>
            </React.Fragment>
          ) : null}
        </div>
      ) : null}

      {tab === 'docs' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
          <p style={{ margin: 0, fontSize: 'var(--text-md)', color: 'var(--text-faint)', lineHeight: 'var(--lh-snug)' }}>
            Cada documento dice a qué corresponde, su estado de validación y su fecha.
          </p>
          <DocSection docs={docs} />
        </div>
      ) : null}

      {tab === 'pago' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px,1fr))', gap: 'var(--space-lg)' }}>
          <TextField label="Monto" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder={String(cuenta.total - cuenta.pagado)} hint={'Saldo pendiente ' + window.SN5_MXN(cuenta.total - cuenta.pagado)} />
          <window.Field label="Tipo de pago">
            <Select size="md" options={['Transferencia', 'Cheque', 'Efectivo', 'Tarjeta']} style={{ width: '100%' }} />
          </window.Field>
          <TextField label="Fecha del pago" defaultValue="30 abr 2025" />
          <window.Field label="Comprobante">
            <Button variant="secondary" size="md" iconLeft="upload" fullWidth>Adjuntar archivo</Button>
          </window.Field>
          <window.Field label="Notas" span={2}>
            <textarea rows={3} placeholder="Referencia bancaria, acuerdos, etc." style={{ width: '100%', padding: '10px 12px', background: 'var(--surface-input)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', outline: 'none', resize: 'vertical', fontFamily: 'var(--font-ui)', fontSize: 'var(--text-base)', color: 'var(--text-body)' }} />
          </window.Field>
          <div style={{ gridColumn: 'span 2', display: 'flex', gap: 'var(--space-md)' }}>
            <Button variant="primary" size="lg" iconLeft="check">Registrar pago</Button>
            <Button variant="ghost" size="lg">Marcar como pagada por contabilidad</Button>
          </div>
        </div>
      ) : null}
    </window.Modal>
  );
}

function FichaOrdenes({ onClose }) {
  const pendientes = window.SN5.cuentasPagar.filter((c) => c.estado !== 'PAGADO');
  const porResp = {};
  pendientes.forEach((c) => { porResp[c.responsable] = porResp[c.responsable] || []; porResp[c.responsable].push(c); });
  const granTotal = pendientes.reduce((a, c) => a + sn5Fiscal(c.total, c.regimen).pago, 0);

  return (
    <window.Modal
      title="Ficha de órdenes de pago" eyebrow="Semana del 28 abr — 04 may 2025" width={880} onClose={onClose}
      footer={(
        <React.Fragment>
          <div style={{ minWidth: 0 }}>
            <div className="sn-label">Total de la semana</div>
            <div className="sn-display" style={{ fontSize: 'var(--text-h3)', color: 'var(--accent)' }}>{window.SN5_MXN_L(granTotal)}</div>
          </div>
          <div style={{ flex: 1 }} />
          <Button variant="secondary" size="lg" iconLeft="send">Enviar a contabilidad</Button>
          <Button variant="primary" size="lg" iconLeft="printer">Generar PDF</Button>
        </React.Fragment>
      )}
    >
      <p style={{ margin: '0 0 var(--space-lg)', fontSize: 'var(--text-md)', color: 'var(--text-faint)', lineHeight: 'var(--lh-snug)' }}>
        Agrupa las cuentas pendientes de proyectos ya cerrados. Un proyecto se cierra el día siguiente a su fecha de entrega.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
        {Object.keys(porResp).map((resp) => {
          const items = porResp[resp];
          const sub = items.reduce((a, c) => a + sn5Fiscal(c.total, c.regimen).pago, 0);
          const regimen = items[0].regimen;
          return (
            <Card key={resp} padding="0" tone="row">
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', padding: '13px var(--space-lg)', borderBottom: '1px solid var(--border-subtle)' }}>
                <Avatar initials={resp.split(' ').map((w) => w[0]).join('')} size={30} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--weight-semibold)', color: 'var(--text-primary)' }}>{resp}</div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)' }}>BBVA · CLABE 0123 2000 4512 3789 01 · {regimen === 'moral' ? 'Persona moral' : 'Persona física, honorarios'}</div>
                </div>
                <div style={{ flex: 1 }} />
                <div style={{ textAlign: 'right' }}>
                  <div className="sn-label">Subtotal</div>
                  <div className="sn-display" style={{ fontSize: 'var(--text-h3)' }}>{window.SN5_MXN(sub)}</div>
                </div>
              </div>
              {items.map((c, i) => {
                const fi = sn5Fiscal(c.total, c.regimen);
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', padding: '11px var(--space-lg)', borderBottom: i === items.length - 1 ? 0 : '1px solid var(--border-subtle)', fontSize: 'var(--text-base)' }}>
                    <window.Folio size={12} color="var(--text-faint)">{c.folio}</window.Folio>
                    <span style={{ flex: 1, minWidth: 0, color: 'var(--text-body)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.proyecto} · {c.descripcion}</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-md)' }}>neto {window.SN5_MXN(c.total)}</span>
                    <span style={{ color: 'var(--text-primary)', fontWeight: 'var(--weight-medium)', minWidth: 96, textAlign: 'right' }}>{window.SN5_MXN(fi.pago)}</span>
                  </div>
                );
              })}
            </Card>
          );
        })}
      </div>
    </window.Modal>
  );
}

function PorProyecto({ onOpen }) {
  const proyectos = window.SN5.proyectos;
  const [abierto, setAbierto] = React.useState(proyectos[0].folio);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
      {proyectos.map((p) => {
        const cobrar = window.SN5.cuentasCobrar.filter((c) => c.folio === p.folio);
        const pagar = window.SN5.cuentasPagar.filter((c) => c.folio === p.folio);
        if (!cobrar.length && !pagar.length) return null;
        const abrir = abierto === p.folio;
        const totalCobrar = cobrar.reduce((a, c) => a + (c.total - c.pagado), 0);
        const totalPagar = pagar.reduce((a, c) => a + (c.total - c.pagado), 0);
        return (
          <Card key={p.folio} padding="0">
            <button
              type="button" onClick={() => setAbierto(abrir ? null : p.folio)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 'var(--space-lg)', padding: '15px var(--space-lg)', background: 'transparent', border: 0, cursor: 'pointer', textAlign: 'left' }}
            >
              <Icon name={abrir ? 'chevron-down' : 'chevron-right'} size={16} color="var(--text-muted)" />
              <window.Folio>{p.folio}</window.Folio>
              <span style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--weight-semibold)', color: 'var(--text-primary)' }}>{p.nombre}</span>
              <span style={{ fontSize: 'var(--text-md)', color: 'var(--text-muted)' }}>{p.cliente}</span>
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: 'var(--text-md)', color: 'var(--text-muted)' }}>Por cobrar <span style={{ color: 'var(--accent)', fontWeight: 'var(--weight-semibold)' }}>{window.SN5_MXN(totalCobrar)}</span></span>
              <span style={{ fontSize: 'var(--text-md)', color: 'var(--text-muted)' }}>Por pagar <span style={{ color: 'var(--text-primary)', fontWeight: 'var(--weight-semibold)' }}>{window.SN5_MXN(totalPagar)}</span></span>
              <window.SNBadge state={p.estado} />
            </button>
            {abrir ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px,1fr))', gap: 'var(--space-lg)', padding: 'var(--space-lg)', borderTop: '1px solid var(--border-subtle)' }}>
                <div>
                  <div className="sn-label" style={{ marginBottom: 11 }}>Por cobrar</div>
                  <Card tone="row" padding="0">
                    <DataTable
                      minWidth={0}
                      columns={[
                        { key: 'cliente', label: 'Cliente', width: '1fr', strong: true },
                        { key: 'pagado', label: 'Pagado / total', width: '1.1fr', align: 'right', render: (r) => window.SN5_MXN(r.pagado) + ' / ' + window.SN5_MXN(r.total) },
                        { key: 'estado', label: 'Estado', width: '132px', align: 'right', render: (r) => <window.SNBadge state={r.estado} /> },
                      ]}
                      rows={cobrar} onRowClick={(r) => onOpen(r, 'cobrar')} emptyLabel="Sin cuentas por cobrar"
                    />
                  </Card>
                </div>
                <div>
                  <div className="sn-label" style={{ marginBottom: 11 }}>Por pagar</div>
                  <Card tone="row" padding="0">
                    <DataTable
                      minWidth={0}
                      columns={[
                        { key: 'responsable', label: 'Responsable', width: '1fr', strong: true },
                        { key: 'total', label: 'X pagar', width: '1fr', align: 'right', render: (r) => window.SN5_MXN(r.total) },
                        { key: 'estado', label: 'Estado', width: '132px', align: 'right', render: (r) => <window.SNBadge state={r.estado} /> },
                      ]}
                      rows={pagar} onRowClick={(r) => onOpen(r, 'pagar')} emptyLabel="Sin cuentas por pagar"
                    />
                  </Card>
                </div>
              </div>
            ) : null}
          </Card>
        );
      })}
    </div>
  );
}

function CuentasScreen() {
  const [tab, setTab] = React.useState('cobrar');
  const [vista, setVista] = React.useState('proyecto');
  const [q, setQ] = React.useState('');
  const [modal, setModal] = React.useState(null);
  const [ficha, setFicha] = React.useState(false);

  const cobrar = window.SN5.cuentasCobrar;
  const pagar = window.SN5.cuentasPagar;
  const openCuenta = (c, t) => setModal({ cuenta: c, tipo: t });

  const pendCobrar = cobrar.filter((c) => c.estado !== 'PAGADO').length;
  const pendPagar = pagar.filter((c) => c.estado !== 'PAGADO').length;

  const metricasCobrar = [
    { label: 'Pendiente', valor: window.SN5_MXN(cobrar.reduce((a, c) => a + (c.total - c.pagado), 0)), nota: pendCobrar + ' cuentas', accent: true },
    { label: 'Cobrado', valor: window.SN5_MXN(cobrar.reduce((a, c) => a + c.pagado, 0)), nota: 'En el periodo' },
    { label: 'Alertas', valor: String(cobrar.filter((c) => c.estado === 'VENCIDO').length), nota: 'Cuentas vencidas' },
  ];
  const metricasPagar = [
    { label: 'Pendiente', valor: window.SN5_MXN(pagar.reduce((a, c) => a + (c.total - c.pagado), 0)), nota: pendPagar + ' cuentas', accent: true },
    { label: 'Pagado', valor: window.SN5_MXN(pagar.reduce((a, c) => a + c.pagado, 0)), nota: 'En el periodo' },
  ];

  const colsCobrar = [
    { key: 'folio', label: 'Folio', width: '90px', render: (r) => <window.Folio>{r.folio}</window.Folio> },
    { key: 'cliente', label: 'Cliente', width: '1fr', strong: true },
    { key: 'proyecto', label: 'Proyecto', width: '1.4fr' },
    { key: 'pagado', label: 'Pagado / total', width: '1.2fr', align: 'right', render: (r) => (
      <span><span style={{ color: 'var(--text-primary)' }}>{window.SN5_MXN(r.pagado)}</span> <span style={{ color: 'var(--text-faint)' }}>/ {window.SN5_MXN(r.total)}</span></span>
    ) },
    { key: 'vencimiento', label: 'Vencimiento', width: '1fr' },
    { key: 'estado', label: 'Estado', width: '140px', align: 'right', render: (r) => <window.SNBadge state={r.estado} /> },
  ];
  const colsPagar = [
    { key: 'folio', label: 'Folio', width: '90px', render: (r) => <window.Folio>{r.folio}</window.Folio> },
    { key: 'proyecto', label: 'Proyecto', width: '1.3fr', strong: true },
    { key: 'responsable', label: 'Responsable', width: '1fr' },
    { key: 'descripcion', label: 'Descripción', width: '1.3fr' },
    { key: 'pagado', label: 'Pagado / total', width: '1.2fr', align: 'right', render: (r) => (
      <span><span style={{ color: 'var(--text-primary)' }}>{window.SN5_MXN(r.pagado)}</span> <span style={{ color: 'var(--text-faint)' }}>/ {window.SN5_MXN(r.total)}</span></span>
    ) },
    { key: 'estado', label: 'Estado', width: '132px', align: 'right', render: (r) => <window.SNBadge state={r.estado} /> },
  ];

  const rows = (tab === 'cobrar' ? cobrar : pagar).filter((c) => {
    const t = q.trim().toLowerCase();
    return !t || JSON.stringify(c).toLowerCase().includes(t);
  });

  return (
    <React.Fragment>
      <SectionHero
        title="Cuentas"
        action={<Button variant="primary" size="lg" iconLeft="file-text" onClick={() => setFicha(true)}>Ficha de órdenes de pago</Button>}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', flexWrap: 'wrap', minWidth: 0 }}>
        <SearchInput size="lg" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por folio, proyecto o responsable…" style={{ flex: '0 1 420px', minWidth: 240 }} />
        <div style={{ flex: 1, minWidth: 12 }} />
        <FilterButton style={{ flex: 'none' }} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', flexWrap: 'nowrap', minWidth: 0, overflowX: 'auto', paddingBottom: 2 }}>
        <FilterTabs
          tabs={[{ id: 'cobrar', label: 'Cobrar', count: pendCobrar }, { id: 'pagar', label: 'Pagar', count: pendPagar }]}
          value={tab} onChange={setTab} style={{ flex: 'none' }}
        />
        <div style={{ flex: 1, minWidth: 12 }} />
        <FilterTabs
          tabs={[{ id: 'proyecto', label: 'Por proyecto' }, { id: 'lista', label: 'Lista' }]}
          value={vista} onChange={setVista} style={{ flex: 'none' }}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px,1fr))', gap: 'var(--space-lg)' }}>
        {(tab === 'cobrar' ? metricasCobrar : metricasPagar).map((m) => (
          <window.Metric key={m.label} label={m.label} value={m.valor} nota={m.nota} accent={m.accent} />
        ))}
      </div>

      {vista === 'proyecto' ? <PorProyecto onOpen={openCuenta} /> : (
        <Card padding="0">
          <DataTable
            columns={tab === 'cobrar' ? colsCobrar : colsPagar} rows={rows}
            onRowClick={(r) => openCuenta(r, tab)} emptyLabel="Ninguna cuenta coincide"
          />
          <TableFooter shown={rows.length} total={(tab === 'cobrar' ? cobrar : pagar).length} unit="cuentas" />
        </Card>
      )}

      {tab === 'cobrar' ? (
        <window.Panel title="Alertas de cobro">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
            {cobrar.filter((c) => c.estado === 'VENCIDO' || c.estado === 'FACTURA_PENDIENTE').map((c) => (
              <div key={c.folio} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', padding: '13px var(--space-lg)', borderRadius: 'var(--radius-sm)', background: c.estado === 'VENCIDO' ? 'var(--sn-status-cancelled-bg)' : 'var(--surface-row)', border: '1px solid var(--border-subtle)', color: c.estado === 'VENCIDO' ? 'var(--sn-status-cancelled-fg)' : 'var(--text-body)' }}>
                <Icon name={c.estado === 'VENCIDO' ? 'alert-triangle' : 'clock'} size={16} />
                <span style={{ flex: 1, minWidth: 0, fontSize: 'var(--text-base)' }}>
                  {c.estado === 'VENCIDO'
                    ? c.cliente + ' · ' + c.proyecto + ' venció el ' + c.vencimiento
                    : c.cliente + ' · ' + c.proyecto + ' sigue sin factura emitida'}
                </span>
                <span style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--weight-semibold)' }}>{window.SN5_MXN(c.total - c.pagado)}</span>
                <Button variant="secondary" size="md" onClick={() => openCuenta(c, 'cobrar')}>Abrir</Button>
              </div>
            ))}
          </div>
        </window.Panel>
      ) : (
        <window.Panel title="Historial de órdenes" action={<Button variant="ghost" size="md" onClick={() => setFicha(true)} iconRight="arrow-right">Nueva ficha</Button>}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
            {[
              { semana: 'Semana del 21 — 27 abr 2025', total: 186000, resp: 3 },
              { semana: 'Semana del 14 — 20 abr 2025', total: 244000, resp: 4 },
              { semana: 'Semana del 07 — 13 abr 2025', total: 98000, resp: 2 },
            ].map((o) => (
              <div key={o.semana} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', padding: '13px var(--space-lg)', background: 'var(--surface-row)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)' }}>
                <Icon name="file-text" size={16} color="var(--text-muted)" />
                <span style={{ flex: 1, minWidth: 0, fontSize: 'var(--text-base)', color: 'var(--text-body)' }}>{o.semana}</span>
                <span style={{ fontSize: 'var(--text-md)', color: 'var(--text-muted)' }}>{o.resp} responsables</span>
                <span style={{ fontSize: 'var(--text-base)', color: 'var(--text-primary)', fontWeight: 'var(--weight-semibold)' }}>{window.SN5_MXN(o.total)}</span>
                <Button variant="ghost" size="md" iconLeft="download">PDF</Button>
              </div>
            ))}
          </div>
        </window.Panel>
      )}

      {modal ? <CuentaModal cuenta={modal.cuenta} tipo={modal.tipo} onClose={() => setModal(null)} /> : null}
      {ficha ? <FichaOrdenes onClose={() => setFicha(false)} /> : null}
    </React.Fragment>
  );
}

Object.assign(window, { CuentasScreen, sn5Fiscal });
