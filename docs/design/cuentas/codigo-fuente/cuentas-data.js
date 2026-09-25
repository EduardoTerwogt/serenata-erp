(function () {
  const HOY = '2026-09-24';
  const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const MESL = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const M = n => (n < 0 ? '-' : '') + '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const F = iso => { if (!iso) return '—'; const [y, m, d] = iso.split('-'); return `${d} ${MES[+m - 1]} ${y}`; };
  const days = (a, b) => Math.round((new Date(a) - new Date(b)) / 86400000);

  const ESTADOS = {
    sin_factura: { label: 'Sin factura', tone: 'draft', paso: 'emitir' },
    facturado: { label: 'Facturado', tone: 'issued', paso: 'cobrar' },
    parcial: { label: 'Parcial', tone: 'issued', paso: 'cobrar' },
    vencido: { label: 'Vencido', tone: 'cancelled', paso: 'cobrar' },
    sin_complemento: { label: 'Sin complemento', tone: 'draft', paso: 'complemento' },
    cobrado: { label: 'Cobrado', tone: 'approved', paso: null },
    sin_factura_prov: { label: 'Sin factura', tone: 'draft', paso: 'factura_prov' },
    facturado_prov: { label: 'Facturado', tone: 'issued', paso: 'pagar' },
    en_orden: { label: 'En orden', tone: 'issued', paso: 'orden' },
    pagado: { label: 'Pagado', tone: 'approved', paso: null },
  };
  const PASOS = [
    { id: 'emitir', label: 'Emitir factura al cliente', short: 'Emitir factura', tipo: 'cobro' },
    { id: 'cobrar', label: 'Cobrar al cliente', short: 'Cobrar', tipo: 'cobro' },
    { id: 'complemento', label: 'Subir complemento de pago', short: 'Subir complemento', tipo: 'cobro' },
    { id: 'factura_prov', label: 'Subir factura de proveedor', short: 'Subir factura', tipo: 'pago' },
    { id: 'pagar', label: 'Pagar a proveedor', short: 'Pagar', tipo: 'pago' },
    { id: 'orden', label: 'En orden de pago', short: 'En orden de pago', tipo: 'pago' },
  ];
  const PASO = Object.fromEntries(PASOS.map(p => [p.id, p]));
  const badge = (label, tone) => ({ label, bg: `var(--sn-status-${tone}-bg)`, fg: `var(--sn-status-${tone}-fg)` });

  const c = (contraparte, concepto, total, pagado, estado, venc) => ({ tipo: 'cobro', contraparte, concepto, total, pagado, estado, venc });
  const p = (contraparte, concepto, total, pagado, estado) => ({ tipo: 'pago', contraparte, concepto, total, pagado, estado });

  const PROYECTOS = [
    { folio: 'SH012', nombre: 'Spot Día del Padre', cliente: 'Liverpool', evento: '2024-06-08', cierre: '2024-07-22', conceptos: [c('Liverpool', 'Producción spot 30s', 164000, 164000, 'cobrado'), p('Mario Hernández', 'Director de fotografía', 36000, 36000, 'pagado'), p('Foros Churubusco', 'Renta Foro 2', 41000, 41000, 'pagado')] },
    { folio: 'SH018', nombre: 'Convención Anual', cliente: 'BBVA México', evento: '2024-11-14', cierre: '2024-12-19', conceptos: [c('BBVA México', 'Producción de evento', 298000, 298000, 'cobrado'), p('Iluminación Pro CDMX', 'Iluminación escénica', 64000, 64000, 'pagado'), p('Catering La Mesa', 'Catering 120 personas', 38000, 38000, 'pagado')] },
    { folio: 'SH024', nombre: 'Documental Sierra', cliente: 'Coca-Cola FEMSA', evento: '2025-08-19', cierre: '2025-09-30', conceptos: [c('Coca-Cola FEMSA', 'Documental 12 min', 246000, 246000, 'cobrado'), p('Mario Hernández', 'Director de fotografía (6 jornadas)', 75000, 75000, 'pagado'), p('Transportes Ágiles', 'Traslado de equipo', 19800, 19800, 'pagado')] },
    { folio: 'SH031', nombre: 'Spot Buen Fin', cliente: 'Liverpool', evento: '2025-11-06', cierre: '2025-12-10', conceptos: [c('Liverpool', 'Producción spot 20s', 132000, 132000, 'cobrado'), p('Ana Lucía Rivas', 'Dirección de arte', 24000, 24000, 'pagado')] },
    { folio: 'SH036', nombre: 'Posada corporativa', cliente: 'Grupo Modelo', evento: '2025-12-12', cierre: '2026-01-20', conceptos: [c('Grupo Modelo', 'Producción de evento', 186000, 186000, 'cobrado'), p('Catering La Mesa', 'Catering 90 personas', 29700, 29700, 'pagado'), p('José García', 'Backline y audio', 14500, 14500, 'pagado')] },
    { folio: 'SH042', nombre: 'Concierto Año Nuevo', cliente: 'OCESA', evento: '2025-12-31', conceptos: [c('OCESA', 'Producción audiovisual', 220400, 220400, 'sin_complemento'), p('Iluminación Pro CDMX', 'Paquete de iluminación', 58000, 58000, 'pagado'), p('José García', 'Backline', 12800, 12800, 'pagado')] },
    { folio: 'SH050', nombre: 'Documental Oaxaca', cliente: 'Coca-Cola FEMSA', evento: '2026-06-12', cierre: '2026-07-19', conceptos: [c('Coca-Cola FEMSA', 'Documental 15 min', 281880, 281880, 'cobrado'), p('Mario Hernández', 'Director de fotografía (8 jornadas)', 100000, 100000, 'pagado'), p('Transportes Ágiles', 'Traslado equipo CDMX–Oaxaca', 24800, 24800, 'pagado')] },
    { folio: 'SH052', nombre: 'Escenario Festival Norte', cliente: 'OCESA', evento: '2026-06-27', cierre: '2026-08-03', conceptos: [c('OCESA', 'Cobertura multicámara', 185600, 185600, 'cobrado'), p('Audio Vivo', 'Sistema de audio', 42000, 42000, 'pagado'), p('Catering La Mesa', 'Catering 40 personas', 18400, 18400, 'pagado')] },
    { folio: 'SH054', nombre: 'Show Monterrey', cliente: 'Walmart México', evento: '2026-07-18', cierre: '2026-08-06', conceptos: [c('Walmart México', 'Producción de show', 104400, 104400, 'cobrado'), p('José García', 'Backline', 7500, 7500, 'pagado'), p('Catering La Mesa', 'Catering 20 personas', 9200, 9200, 'pagado')] },
    { folio: 'SH055', nombre: 'Aniversario Palacio', cliente: 'El Palacio de Hierro', evento: '2026-07-30', conceptos: [c('El Palacio de Hierro', 'Producción de evento', 139200, 139200, 'sin_complemento'), p('Ana Lucía Rivas', 'Dirección de arte y utilería', 31000, 31000, 'pagado'), p('Transportes Ágiles', 'Van de producción', 12600, 12600, 'pagado')] },
    { folio: 'SH058', nombre: 'Campaña Día de Muertos', cliente: 'Liverpool', evento: '2026-08-21', conceptos: [c('Liverpool', 'Producción campaña', 211700, 0, 'vencido', '2026-09-09'), p('Ana Lucía Rivas', 'Dirección de arte y utilería', 28500, 28500, 'pagado'), p('José García', 'Backline y audio en locación', 16400, 0, 'en_orden'), p('Transportes Ágiles', 'Van de producción con chofer', 15600, 0, 'sin_factura_prov')] },
    { folio: 'SH059', nombre: 'Sesiones en vivo', cliente: 'Spotify México', evento: '2026-08-28', conceptos: [c('Spotify México', 'Serie de 4 sesiones', 92800, 46400, 'parcial', '2026-09-30'), p('Mario Hernández', 'Director de fotografía', 18000, 0, 'facturado_prov')] },
    { folio: 'SH062', nombre: 'Sesión de fotos Otoño', cliente: 'Zara México', evento: '2026-09-10', cierre: '2026-09-22', conceptos: [c('Zara México', 'Sesión editorial', 64960, 64960, 'cobrado'), p('Estudio Luz Norte', 'Renta de estudio', 18500, 18500, 'pagado')] },
    { folio: 'SH061', nombre: 'Lanzamiento Aurora 2026', cliente: 'Grupo Modelo', evento: '2026-09-18', conceptos: [c('Grupo Modelo', 'Producción · anticipo y finiquito', 348000, 174000, 'parcial', '2026-10-02'), c('Grupo Modelo', 'Cambio de alcance', 52200, 0, 'facturado', '2026-10-15'), p('Iluminación Pro CDMX', 'Iluminación · 3 conceptos', 68400, 0, 'facturado_prov'), p('Mario Hernández', 'Director de fotografía', 42000, 0, 'sin_factura_prov'), p('Foros Churubusco', 'Renta Foro 4 (2 días)', 76000, 0, 'en_orden'), p('Catering La Mesa', 'Catering 45 personas × 3 días', 37800, 37800, 'pagado')] },
    { folio: 'SH063', nombre: 'Spot Navidad Bimbo', cliente: 'Grupo Bimbo', evento: '2026-10-08', conceptos: [c('Grupo Bimbo', 'Producción spot 30s', 156600, 0, 'sin_factura', '2026-10-26')] },
    { folio: 'SH065', nombre: 'Gala Fin de Año', cliente: 'BBVA México', evento: '2026-11-20', conceptos: [c('BBVA México', 'Producción de gala', 240000, 0, 'sin_factura'), p('Foros Churubusco', 'Renta Foro 1', 58000, 0, 'sin_factura_prov')] },
  ];

  const OT = { Generada: 'issued', Parcial: 'issued', Completada: 'approved', Cancelada: 'cancelled', Vencida: 'cancelled' };
  const ORDENES = [
    ['2026-09-19', 'Generada', [['José García', 'SH058', 16400], ['Foros Churubusco', 'SH061', 76000]]],
    ['2026-09-15', 'Completada', [['Estudio Luz Norte', 'SH062', 18500]]],
    ['2026-09-12', 'Vencida', [['Mario Hernández', 'SH059', 18000]]],
    ['2026-09-05', 'Completada', [['José García', 'SH054', 7500], ['Catering La Mesa', 'SH054', 9200], ['Mario Hernández', 'SH050', 100000], ['Transportes Ágiles', 'SH050', 24800]]],
    ['2026-08-29', 'Completada', [['Ana Lucía Rivas', 'SH055', 31000], ['Transportes Ágiles', 'SH055', 12600]]],
    ['2026-08-22', 'Parcial', [['Ana Lucía Rivas', 'SH058', 28500], ['Transportes Ágiles', 'SH058', 15600]]],
    ['2026-08-08', 'Completada', [['Audio Vivo', 'SH052', 42000], ['Catering La Mesa', 'SH052', 18400]]],
    ['2026-07-10', 'Cancelada', [['Catering La Mesa', 'SH052', 18400]]],
    ['2026-01-15', 'Completada', [['Catering La Mesa', 'SH036', 29700], ['José García', 'SH036', 14500], ['Iluminación Pro CDMX', 'SH042', 58000], ['José García', 'SH042', 12800]]],
  ].map(([iso, estado, items]) => {
    const folios = [...new Set(items.map(i => i[1]))];
    const [y, m, dd] = iso.split('-');
    const n = items.length;
    return { name: `O.P ${dd}-${MES[+m - 1].charAt(0).toUpperCase() + MES[+m - 1].slice(1)} ${folios.join(' ')}`, iso, mes: iso.slice(0, 7), estado, tone: OT[estado], fecha: F(iso), folios,
      proveedores: [...new Set(items.map(i => i[0]))], items: items.map(([prov, folio, monto]) => ({ prov, folio, monto: M(monto) })),
      monto: M(items.reduce((s, i) => s + i[2], 0)), n, cuentas: n + (n === 1 ? ' cuenta' : ' cuentas') };
  });

  const yearOf = pr => +pr.evento.slice(0, 4);
  const monthOf = pr => +pr.evento.slice(5, 7) - 1;

  function enrichConcept(pr, x, k) {
    const e = ESTADOS[x.estado];
    const paso = e.paso ? PASO[e.paso] : null;
    let vence = '';
    if (x.venc && e.paso === 'cobrar') { const d = days(x.venc, HOY); vence = d < 0 ? `Vencido hace ${-d} días` : `Vence en ${d} días`; }
    return {
      key: pr.folio + '-' + k, folio: pr.folio, proyecto: pr.nombre, tipo: x.tipo,
      tipoLabel: x.tipo === 'cobro' ? 'Cliente' : 'Proveedor',
      icon: x.tipo === 'cobro' ? 'arrow-down-left' : 'arrow-up-right',
      iconColor: x.tipo === 'cobro' ? 'var(--sn-status-approved-fg)' : 'var(--text-muted)',
      contraparte: x.contraparte, concepto: x.concepto,
      pagadoTotal: `${M(x.pagado)} / ${M(x.total)}`, total: M(x.total), pendienteN: x.total - x.pagado, pendiente: M(x.total - x.pagado),
      b: badge(e.label, e.tone), done: !paso, pending: !!paso, paso: paso ? paso.id : null,
      pasoLabel: paso ? paso.short : '—', pasoColor: paso ? (x.estado === 'vencido' ? 'var(--sn-status-cancelled-fg)' : 'var(--text-primary)') : 'var(--text-faint)',
      vence, hasVence: !!vence, venceColor: vence.startsWith('Vencido') ? 'var(--sn-status-cancelled-fg)' : 'var(--text-muted)',
      raw: x,
    };
  }

  const REGIMEN = { 'Mario Hernández': 'fisica', 'Ana Lucía Rivas': 'fisica', 'José García': 'resico' };
  const REG_LABEL = { moral: 'Persona moral', fisica: 'Persona física', resico: 'RESICO' };
  function fiscal(pr) {
    const provs = {};
    pr.conceptos.filter(x => x.tipo === 'pago').forEach(x => { provs[x.contraparte] = (provs[x.contraparte] || 0) + x.total; });
    let ret = 0;
    const cierre = Object.entries(provs).map(([quien, base], k) => {
      const reg = REGIMEN[quien] || 'moral';
      const r = reg === 'moral' ? 0 : Math.round(base * (0.16 * 2 / 3 + (reg === 'fisica' ? 0.10 : 0.0125)) * 100) / 100;
      ret += r;
      return { quien, regimen: REG_LABEL[reg], cuanto: M(Math.round((base * 1.16 - r) * 100) / 100), bg: k % 2 === 0 ? 'var(--surface-card)' : 'var(--surface-row-alt)' };
    });
    const cob = pr.conceptos.filter(x => x.tipo === 'cobro').reduce((s, x) => s + x.total, 0);
    const pag = pr.conceptos.filter(x => x.tipo === 'pago').reduce((s, x) => s + x.total, 0);
    const bruta = cob - pag;
    const [ey, em] = pr.evento.split('-').map(Number);
    const due = '17 ' + MES[em % 12] + ' ' + (em === 12 ? ey + 1 : ey);
    const provTotal = Object.values(provs).reduce((s, b) => s + b * 1.16, 0) - ret;
    const nProv = Object.keys(provs).length;
    const sat = [
      { quien: 'Proveedores', sub: nProv + (nProv === 1 ? ' proveedor' : ' proveedores') + ' · IVA incluido, menos retenciones', cuanto: M(Math.round(provTotal * 100) / 100) },
      { quien: 'IVA a enterar', sub: 'SAT · a más tardar el ' + due, cuanto: M((cob - pag) * 0.16) },
      { quien: 'Retenciones a enterar', sub: 'SAT · a más tardar el ' + due, cuanto: M(Math.round(ret * 100) / 100) },
      { quien: 'ISR estimado (30%)', sub: 'SAT · pago provisional el ' + due, cuanto: M(bruta * 0.3) },
    ].filter((r, i) => i !== 0 || nProv > 0).map((r, k) => ({ ...r, bg: k % 2 === 0 ? 'var(--surface-card)' : 'var(--surface-row-alt)' }));
    return { cierre, cierreRows: sat, hasCierre: true, noCierre: false,
      ivaN: (cob - pag) * 0.16, retN: Math.round(ret * 100) / 100, isrN: bruta * 0.3,
      bruta: M(bruta), isr: M(-bruta * 0.3), neta: M(bruta * 0.7), iva: M((cob - pag) * 0.16), ret: M(Math.round(ret * 100) / 100) };
  }

  function enrichProject(pr, reopened) {
    const all = pr.conceptos.map((x, k) => enrichConcept(pr, x, k));
    const pend = all.filter(x => x.pending).length;
    const isReopened = !!reopened[pr.folio];
    const closed = pend === 0 && !isReopened;
    const sum = (t, f) => pr.conceptos.filter(x => x.tipo === t).reduce((a, x) => a + f(x), 0);
    const cobT = sum('cobro', x => x.total), pagT = sum('pago', x => x.total);
    const status = closed ? badge('Cerrada', 'approved') : isReopened && pend === 0 ? badge('Reabierta', 'issued') : badge(`${pend} pendiente${pend === 1 ? '' : 's'}`, all.some(x => x.raw.estado === 'vencido') ? 'cancelled' : 'issued');
    return {
      folio: pr.folio, nombre: pr.nombre, cliente: pr.cliente, year: yearOf(pr), month: monthOf(pr),
      evento: F(pr.evento), eventoLabel: 'Evento ' + F(pr.evento),
      closed, open: !closed, reopened: isReopened, canReopen: closed, canReclose: isReopened && pend === 0,
      pendCount: pend, status, all,
      cobradoN: sum('cobro', x => x.pagado), cobT, pagT,
      porCobrarN: sum('cobro', x => x.total - x.pagado), porPagarN: sum('pago', x => x.total - x.pagado),
      porCobrar: M(sum('cobro', x => x.total - x.pagado)), porPagar: M(sum('pago', x => x.total - x.pagado)),
      entra: M(cobT), sale: M(pagT), utilidad: M(cobT - pagT),
      ...fiscal(pr),
      cierreLabel: closed ? `Cerrada automáticamente el ${F(pr.cierre || HOY)}` : isReopened ? 'Reabierta manualmente' : `${pend} concepto${pend === 1 ? '' : 's'} por resolver`,
    };
  }

  function compute(st) {
    const reopened = st.reopened || {};
    const q = (st.q || '').trim().toLowerCase();
    const all = PROYECTOS.map(pr => enrichProject(pr, reopened));
    const years = [...new Set(all.map(p => p.year))].sort((a, b) => b - a);
    const inYear = all.filter(p => p.year === st.year);

    const conceptOk = x => (st.tipo === 'todo' || x.tipo === st.tipo)
      && (!st.cliente || (x.tipo === 'cobro' && x.contraparte === st.cliente))
      && (!st.proveedor || (x.tipo === 'pago' && x.contraparte === st.proveedor));
    const qOk = (p, x) => !q || [p.folio, p.nombre, p.cliente, x.contraparte, x.concepto].some(s => s.toLowerCase().includes(q));
    const projMatch = p => p.all.some(x => conceptOk(x) && qOk(p, x));
    const estadoOk = p => st.estado === 'todas' || (st.estado === 'pendientes' ? p.open : p.closed);

    const base = inYear.filter(projMatch);
    const monthProjects = m => base.filter(p => p.month === m);
    const months = MES.map((lab, i) => {
      const ps = monthProjects(i);
      const shown = ps.filter(estadoOk);
      return { id: i, label: lab.charAt(0).toUpperCase() + lab.slice(1), n: ps.length, pend: ps.filter(p => p.open).length, empty: shown.length === 0, active: st.month === i };
    });
    const scope = st.month === 'all' ? base : monthProjects(st.month);
    const visible = scope.filter(estadoOk).sort((a, b) => (a.month - b.month) || (a.open === b.open ? 0 : a.open ? -1 : 1));
    const grouped = st.month === 'all' && st.agrupar;

    const decorate = p => {
      const conceptos = p.all.filter(x => conceptOk(x) && qOk(p, x));
      return { ...p, conceptos, cobros: conceptos.filter(x => x.tipo === 'cobro'), pagos: conceptos.filter(x => x.tipo === 'pago') };
    };
    const vis = visible.map(decorate);
    const groupsOf = list => {
      if (!grouped) return [{ key: 'all', label: st.month === 'all' ? `Todo ${st.year}` : `${MESL[st.month]} ${st.year}`, showHead: false, items: list }];
      const out = [];
      list.forEach(it => { const k = it.month; let g = out.find(o => o.key === k); if (!g) out.push(g = { key: k, label: `${MESL[k]} ${st.year}`, showHead: true, items: [] }); g.items.push(it); });
      return out;
    };
    const groups = groupsOf(vis).map(g => ({ ...g, sub: `${g.items.length} proyecto${g.items.length === 1 ? '' : 's'}`, projects: g.items }));

    const rowOk = x => st.estado === 'todas' || (st.estado === 'pendientes' ? x.pending : true);
    const rowsAll = [];
    vis.forEach(p => p.conceptos.filter(rowOk).forEach(x => rowsAll.push({ ...x, month: p.month })));
    const listGroups = groupsOf(rowsAll).map(g => ({ ...g, rows: g.items.map((r, i) => ({ ...r, bg: i % 2 === 0 ? 'var(--surface-card)' : 'var(--surface-row-alt)' })), sub: `${g.items.length} concepto${g.items.length === 1 ? '' : 's'}` }));

    const pasos = PASOS.map(ps => {
      const rows = [];
      vis.forEach(p => p.conceptos.filter(x => x.paso === ps.id).forEach(x => rows.push(x)));
      return { ...ps, rows, n: rows.length, monto: M(rows.reduce((a, r) => a + r.pendienteN, 0)), has: rows.length > 0 };
    }).filter(ps => st.tipo === 'todo' || ps.tipo === st.tipo);

    const scopeAll = scope.map(decorate);
    const kpis = {
      porCobrar: M(scopeAll.reduce((a, p) => a + p.cobros.reduce((b, x) => b + x.pendienteN, 0), 0)),
      porPagar: M(scopeAll.reduce((a, p) => a + p.pagos.reduce((b, x) => b + x.pendienteN, 0), 0)),
      utilidad: M(scopeAll.reduce((a, p) => a + p.cobros.reduce((b, x) => b + x.raw.total, 0) - p.pagos.reduce((b, x) => b + x.raw.total, 0), 0)),
      scopeLabel: st.month === 'all' ? `Todo ${st.year}` : `${MESL[st.month]} ${st.year}`,
    };

    const clientes = [...new Set(all.flatMap(p => p.all.filter(x => x.tipo === 'cobro').map(x => x.contraparte)))].sort();
    const proveedores = [...new Set(all.flatMap(p => p.all.filter(x => x.tipo === 'pago').map(x => x.contraparte)))].sort();

    const av = { vencidos: [], porVencer: [], facturasProv: [], complementos: [], emitir: [] };
    all.forEach(p => p.all.forEach(x => {
      const it = { key: x.key, folio: p.folio, year: p.year, month: p.month, title: `${x.contraparte} · ${p.nombre}`, monto: x.pendiente, detail: '' };
      if (x.raw.estado === 'vencido') av.vencidos.push({ ...it, detail: x.vence });
      else if (x.paso === 'cobrar' && x.raw.venc && days(x.raw.venc, HOY) <= 10) av.porVencer.push({ ...it, detail: x.vence });
      else if (x.paso === 'factura_prov') av.facturasProv.push({ ...it, detail: x.concepto });
      else if (x.paso === 'complemento') av.complementos.push({ ...it, detail: `Evento ${p.evento}`, monto: x.total });
      else if (x.paso === 'emitir' && p.all[0] && days(PROYECTOS.find(z => z.folio === p.folio).evento, HOY) <= 30) av.emitir.push({ ...it, detail: `Evento ${p.evento}` });
    }));
    const avisos = [
      { id: 'vencidos', label: 'Cobros vencidos', items: av.vencidos, b: badge('Vencido', 'cancelled') },
      { id: 'porVencer', label: 'Cobros por vencer', items: av.porVencer, b: badge('Por vencer', 'issued') },
      { id: 'facturasProv', label: 'Facturas de proveedor faltantes', items: av.facturasProv, b: badge('Sin factura', 'draft') },
      { id: 'complementos', label: 'Complementos de pago faltantes', items: av.complementos, b: badge('Sin complemento', 'draft') },
      { id: 'emitir', label: 'Facturas por emitir', items: av.emitir, b: badge('Sin factura', 'draft') },
    ].filter(s => s.items.length).map(s => ({ ...s, n: s.items.length }));
    const avisosN = avisos.reduce((a, s) => a + s.n, 0);

    const counts = {
      pendientes: scope.filter(p => p.open).length,
      cerradas: scope.filter(p => p.closed).length,
      todas: scope.length,
    };
    return {
      years: years.map(y => ({ value: String(y), label: `${y}${all.some(p => p.year === y && p.open) ? (n => ` · ${n} pendiente${n === 1 ? '' : 's'}`)(all.filter(p => p.year === y && p.open).length) : ''}` })),
      months, groups, listGroups, pasos, kpis, clientes, proveedores, avisos, avisosN, counts, grouped,
      ordenes: ORDENES.map(o => ({ ...o, b: badge(o.estado, o.tone) })),
      empty: vis.length === 0, rowsEmpty: rowsAll.length === 0, nProjects: vis.length, nRows: rowsAll.length,
      closedProjects: vis.filter(p => p.closed), openProjects: vis.filter(p => p.open),
    };
  }

  const CONTACTO = {
    'Iluminación Pro CDMX': ['facturas@iluminacionpro.mx', '55 1037 2053', 'BBVA', '012180001234567891'],
    'Mario Hernández': ['mario.dop@gmail.com', '55 1148 2212', 'BBVA', '012180015554443332'],
    'Foros Churubusco': ['cobranza@foroschurubusco.mx', '55 5549 3060', 'Santander', '014180655012345678'],
    'Catering La Mesa': ['administracion@lamesa.mx', '55 2210 4455', 'Banorte', '072180011223344556'],
    'Ana Lucía Rivas': ['analu.rivas@outlook.com', '55 3902 7781', 'BBVA', '012180019988776655'],
    'José García': ['jose.garcia@gmail.com', '55 6120 3345', 'HSBC', '021180040011223344'],
    'Transportes Ágiles': ['pagos@transagiles.mx', '55 1333 2477', 'Scotiabank', '044180001112223334'],
    'Audio Vivo': ['facturacion@audiovivo.mx', '55 4471 8820', 'BBVA', '012180007766554433'],
    'Estudio Luz Norte': ['hola@estudioluznorte.mx', '81 2204 1190', 'Banorte', '072580009988112233'],
  };
  const GRUPOS = { 'SH061|Iluminación Pro CDMX': [['Paquete de iluminación ARRI SkyPanel', 37000, '×2'], ['Generador 100 kVA', 9800, ''], ['Gaffer + 2 eléctricos (3 jornadas)', 21600, '×3']] };
  const NOTAS = { 'SH061-0': 'Anticipo 50% recibido; resto contra entrega de master.' };
  const addDays = (iso, n) => { const t = new Date(iso + 'T12:00:00'); t.setDate(t.getDate() + n); return t.toISOString().slice(0, 10); };
  const slug = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]/g, '');

  function conceptDetail(key) {
    const i = key.lastIndexOf('-');
    const folio = key.slice(0, i), k = +key.slice(i + 1);
    const pr = PROYECTOS.find(p => p.folio === folio); if (!pr) return null;
    const x = pr.conceptos[k]; if (!x) return null;
    const e = enrichConcept(pr, x, k);
    const cobro = x.tipo === 'cobro';
    const hasFactura = !['sin_factura', 'sin_factura_prov'].includes(x.estado);
    const facturaIso = addDays(pr.evento, cobro ? -10 : 4);
    const pct = x.total ? Math.round(x.pagado / x.total * 100) : 0;
    const base = { key, folio, cobro, pago: !cobro, title: x.contraparte, eyebrow: (cobro ? 'Cuenta por cobrar · ' : 'Cuenta por pagar · ') + folio,
      concepto: x.concepto, proyecto: pr.nombre, b: e.b, pagadoTotal: e.pagadoTotal, pct, tone: pct >= 100 ? 'var(--sn-status-approved-fg)' : 'var(--accent)',
      pctLabel: pct + '% ' + (cobro ? 'cobrado' : 'pagado'), saldoLabel: x.total - x.pagado > 0 ? 'Saldo ' + M(x.total - x.pagado) : 'Sin saldo pendiente',
      pasoLabel: e.pending ? 'Siguiente paso: ' + e.pasoLabel : 'Cuenta saldada', done: e.done };
    const fld = (k2, v, o = {}) => ({ k: k2, v, w: 500, color: 'var(--text-primary)', hasSub: false, sub: '', ...o });
    const file = (ext, tag) => `${tag}-${folio}${k ? '-' + k : ''}_${slug(x.contraparte)}.${ext}`;
    if (cobro) {
      const pagos = x.pagado > 0 ? [{ fecha: F(addDays(facturaIso, 14)), tipo: 'Transferencia', monto: M(x.pagado), nota: pct < 100 ? 'Anticipo' : 'Liquidación' }] : [];
      const comp = x.estado === 'cobrado';
      const doc = (name, req, loaded, f, date, na) => ({ name, req, loaded, missing: !loaded && !na, na, file: f, date, sub: loaded ? f + ' · ' + date : na ? 'Se habilita al registrar un pago' : 'Pendiente de subir', valid: false,
        icon: loaded ? 'circle-check' : 'circle-dashed', iconColor: loaded ? 'var(--sn-status-approved-fg)' : na ? 'var(--text-faint)' : 'var(--accent)', op: na ? 0.55 : 1 });
      const docs = [
        doc('Factura XML', 'Requerido', hasFactura, file('xml', 'F'), F(facturaIso)),
        doc('Factura PDF', 'Opcional', hasFactura, file('pdf', 'F'), F(facturaIso)),
        doc('Complemento de pago XML', 'Requerido', comp, file('xml', 'CP'), pagos[0] ? pagos[0].fecha : '', x.pagado === 0),
        doc('Complemento de pago PDF', 'Requerido', comp, file('pdf', 'CP'), pagos[0] ? pagos[0].fecha : '', x.pagado === 0),
      ];
      return { ...base, docs, grupoWarn: false, pagos, hasPagos: !!pagos.length, noPagos: !pagos.length,
        fields: [fld('Proyecto', pr.nombre), fld('Evento', F(pr.evento)), fld('Fecha factura', hasFactura ? F(facturaIso) : 'Sin factura', { color: hasFactura ? 'var(--text-primary)' : 'var(--text-faint)' }),
          fld('Vencimiento', x.venc ? F(x.venc) : '—', { hasSub: !!e.vence, sub: e.vence, color: x.estado === 'vencido' ? 'var(--sn-status-cancelled-fg)' : 'var(--text-primary)' }),
          fld('Monto total', M(x.total), { w: 600 }), fld('Pagado', M(x.pagado), { w: 600 }), fld('Saldo pendiente', M(x.total - x.pagado), { w: 700, color: x.total - x.pagado > 0 ? 'var(--accent)' : 'var(--text-primary)' })],
        hasNotas: !!NOTAS[key], notas: NOTAS[key] || '',
        blocked: x.estado === 'sin_factura', blockedMsg: 'Primero emite y sube la factura al cliente en Documentos.',
        saldada: x.total - x.pagado <= 0, canPay: x.estado !== 'sin_factura' && x.total - x.pagado > 0,
        montoDefault: (x.total - x.pagado).toFixed(2), montoHint: 'Saldo pendiente ' + M(x.total - x.pagado) };
    }
    const reg = REGIMEN[x.contraparte] || 'moral';
    const ret = reg === 'moral' ? [] : [['Retención de IVA · 2/3 (10.6667%)', -Math.round(x.total * 0.16 * 2 / 3 * 100) / 100], [`Retención de ISR · ${reg === 'fisica' ? '10%' : '1.25%'}`, -Math.round(x.total * (reg === 'fisica' ? 0.10 : 0.0125) * 100) / 100]];
    const transferN = Math.round((x.total * 1.16 + ret.reduce((s, r) => s + r[1], 0)) * 100) / 100;
    const items = GRUPOS[folio + '|' + x.contraparte];
    const c = CONTACTO[x.contraparte] || ['—', '—', '—', '—'];
    const orden = x.estado === 'en_orden' ? ORDENES.find(o => o.items.some(it => it.prov === x.contraparte && it.folio === folio)) : null;
    const docP = (name) => ({ name, req: 'Requerido', loaded: hasFactura, missing: !hasFactura, na: false, file: file(name.endsWith('XML') ? 'xml' : 'pdf', 'FP'), date: F(facturaIso),
      sub: hasFactura ? file(name.endsWith('XML') ? 'xml' : 'pdf', 'FP') + ' · ' + F(facturaIso) : 'Pendiente de subir', valid: hasFactura,
      icon: hasFactura ? 'circle-check' : 'circle-dashed', iconColor: hasFactura ? 'var(--sn-status-approved-fg)' : 'var(--accent)', op: 1 });
    const pagos = x.pagado > 0 ? [{ fecha: F(addDays(facturaIso, 10)), tipo: 'Transferencia', monto: M(transferN), nota: '' }] : [];
    return { ...base, docs: [docP('Factura de proveedor XML'), docP('Factura de proveedor PDF')],
      grupoWarn: !!items, grupoWarnMsg: items ? `${x.contraparte} factura agrupado en este proyecto: sube una sola factura por el total del grupo (${M(x.total)}), no por cada concepto.` : '',
      pagos, hasPagos: !!pagos.length, noPagos: !pagos.length,
      responsable: x.contraparte, proveedores: Object.keys(CONTACTO).map(v => ({ value: v, label: v })),
      fields: [fld('Proyecto', pr.nombre), fld('Evento', F(pr.evento)), fld('Fecha factura', hasFactura ? F(facturaIso) : 'Sin factura', { color: hasFactura ? 'var(--text-primary)' : 'var(--text-faint)' }), fld('Régimen fiscal', REG_LABEL[reg])],
      isGrupo: !!items, grupoItems: (items || []).map(([n, m, q]) => ({ name: n, qty: q, monto: M(m) })), grupoLabel: items ? items.length + ' conceptos · una factura · un pago' : '', grupoTotal: M(x.total),
      cruce: [{ k: 'X pagar · neto al proveedor', v: M(x.total) }, { k: 'IVA 16% que agrega el proveedor', v: M(x.total * 0.16) }, ...ret.map(([k2, v]) => ({ k: k2, v: M(v) }))],
      transfer: M(transferN),
      contacto: [{ k: 'Correo', v: c[0] }, { k: 'Teléfono', v: c[1] }, { k: 'Banco', v: c[2] }, { k: 'CLABE', v: c[3] }],
      hasOrden: !!orden, orden: orden ? orden.name + '.pdf' : '', ordenSub: orden ? orden.estado + ' · ' + orden.fecha : '',
      hasReasig: folio === 'SH061' && x.contraparte === 'Iluminación Pro CDMX', reasigFrom: 'Luz y Sombra Renta', reasigTo: x.contraparte, reasigFecha: '08 sep 2026',
      hasNotas: false, notas: '',
      blocked: x.estado === 'sin_factura_prov', blockedMsg: items ? 'El grupo aún no está facturado. Sube la factura del proveedor en Documentos para poder registrar el pago.' : 'Sube la factura del proveedor en Documentos para poder registrar el pago.',
      saldada: x.total - x.pagado <= 0, canPay: x.estado !== 'sin_factura_prov' && x.total - x.pagado > 0,
      payNotice: items ? `Un solo pago cierra los ${items.length} conceptos del grupo. Total a transferir: ${M(transferN)}.` : `Total a transferir: ${M(transferN)} (neto con IVA y retenciones).`,
      montoDefault: transferN.toFixed(2), montoHint: 'Total a transferir ' + M(transferN) };
  }

  const NAV = [
    { id: 'inicio', label: 'Inicio', icon: 'house', tone: 'gray', group: 'Principal' },
    { id: 'cotizaciones', label: 'Cotizaciones', icon: 'file-text', tone: 'gray', group: 'Principal' },
    { id: 'proyectos', label: 'Proyectos', icon: 'image', tone: 'blue', group: 'Principal' },
    { id: 'cuentas', label: 'Cuentas', icon: 'wallet', tone: 'gray', group: 'Negocio' },
    { id: 'proveedores', label: 'Proveedores', icon: 'user-cog', tone: 'indigo', group: 'Operación' },
    { id: 'clientes', label: 'Clientes', icon: 'users', tone: 'indigo', group: 'Operación' },
    { id: 'planeacion', label: 'Planeación', icon: 'calendar', tone: 'red', group: 'Operación' },
    { id: 'plantillas', label: 'Plantillas', icon: 'layout-template', tone: 'teal', group: 'Operación' },
    { id: 'admin', label: 'Admin', icon: 'settings', tone: 'gray', group: 'Sistema' },
  ];

  const initialState = () => ({ year: 2026, month: 8, estado: 'todas', tipo: 'todo', cliente: '', proveedor: '', agrupar: true, q: '', reopened: {}, view: 'proyecto', tray: false, trayTab: 'avisos', expanded: { SH061: true } });

  function controls(self) {
    const st = self.state;
    const set = o => self.setState(o);
    return {
      nav: NAV,
      yearValue: String(st.year),
      setYear: e => { const y = +e.target.value; const ms = PROYECTOS.filter(p => yearOf(p) === y).map(monthOf); set({ year: y, month: y === +HOY.slice(0, 4) ? +HOY.slice(5, 7) - 1 : Math.max(...ms) }); },
      setMonth: m => () => set({ month: m }),
      setAll: () => set({ month: 'all' }),
      allActive: st.month === 'all',
      estadoTabs: null,
      setEstado: v => set(v === 'pendientes' ? { estado: v, month: 'all' } : { estado: v }),
      estado: st.estado,
      tipoTabs: [{ id: 'todo', label: 'Todo' }, { id: 'cobro', label: 'Por cobrar' }, { id: 'pago', label: 'Por pagar' }],
      tipo: st.tipo, setTipo: v => set({ tipo: v, cliente: v === 'pago' ? '' : st.cliente, proveedor: v === 'cobro' ? '' : st.proveedor }),
      setCliente: e => set({ cliente: e.target.value }), setProveedor: e => set({ proveedor: e.target.value }),
      cliente: st.cliente, proveedor: st.proveedor,
      showAgrupar: st.month === 'all',
      agrupar: st.agrupar, toggleAgrupar: () => set({ agrupar: !st.agrupar }),
      agruparBg: st.agrupar ? 'var(--accent)' : 'var(--control-track)', agruparX: st.agrupar ? '14px' : '2px',
      q: st.q, onQuery: e => set({ q: e.target.value }),
      view: st.view, setView: v => set({ view: v }),
      tray: st.tray, trayTab: st.trayTab,
      openTray: () => set({ tray: true, trayTab: 'avisos' }), openOrdenes: () => set({ tray: true, trayTab: 'ordenes' }),
      closeTray: () => set({ tray: false }), setTrayTab: v => set({ trayTab: v }),
      trayAvisos: st.trayTab === 'avisos', trayOrdenes: st.trayTab === 'ordenes',
      reopen: f => () => set({ reopened: { ...st.reopened, [f]: true } }),
      reclose: f => () => { const r = { ...st.reopened }; delete r[f]; set({ reopened: r }); },
      stop: e => e.stopPropagation(),
      hasFilters: st.tipo !== 'todo' || !!st.cliente || !!st.proveedor || !!st.q,
      clearFilters: () => set({ tipo: 'todo', cliente: '', proveedor: '', q: '' }),
    };
  }

  function monthPills(self, d) {
    const st = self.state;
    return d.months.map(m => ({
      ...m, onClick: () => self.setState({ month: m.id }),
      bg: m.active ? 'var(--accent)' : 'transparent',
      fg: m.active ? '#fff' : m.empty ? 'var(--text-faint)' : 'var(--text-body)',
      dotBg: m.active ? '#fff' : 'var(--accent)', dotFg: m.active ? 'var(--accent)' : '#fff',
      hasPend: m.pend > 0, weight: m.active ? 600 : 500,
      border: m.active ? 'var(--accent)' : 'var(--border-subtle)',
      opacity: m.empty && !m.active ? 0.55 : 1,
    }));
  }

  function ordenPreview(excl, used) {
    excl = excl || {}; used = used || {};
    const by = {}, skipped = [];
    const r2 = n => Math.round(n * 100) / 100;
    PROYECTOS.forEach(pr => pr.conceptos.forEach(x => {
      if (x.tipo !== 'pago' || x.pagado >= x.total || x.estado === 'en_orden' || used[x.contraparte + '|' + pr.folio]) return;
      const past = pr.evento <= HOY;
      if (x.estado === 'sin_factura_prov' || !past) { skipped.push({ prov: x.contraparte, folio: pr.folio, concepto: x.concepto, motivo: !past ? 'Evento el ' + F(pr.evento) : 'Falta factura del proveedor', monto: M(x.total - x.pagado) }); return; }
      (by[x.contraparte] = by[x.contraparte] || []).push({ pr, x });
    }));
    const resps = Object.entries(by).map(([name, list]) => {
      const reg = REGIMEN[name] || 'moral';
      const neto = list.reduce((s, a) => s + a.x.total - a.x.pagado, 0);
      const retLines = reg === 'moral' ? [] : [{ k: 'Retención IVA 2/3', n: -r2(neto * 0.16 * 2 / 3) }, { k: 'Retención ISR ' + (reg === 'fisica' ? '10%' : '1.25%'), n: -r2(neto * (reg === 'fisica' ? 0.10 : 0.0125)) }];
      const iva = r2(neto * 0.16), ret = retLines.reduce((s, l) => s + l.n, 0), transfer = r2(neto + iva + ret);
      const projs = {};
      list.forEach(({ pr, x }) => {
        const g = projs[pr.folio] = projs[pr.folio] || { folio: pr.folio, nombre: pr.nombre, evento: 'Evento ' + F(pr.evento), fecha: F(pr.evento), lines: [], n: 0 };
        const gi = GRUPOS[pr.folio + '|' + name];
        (gi ? gi.map(([n, m, q]) => ({ name: n, qty: q, n: m })) : [{ name: x.concepto, qty: '', n: x.total - x.pagado }]).forEach(l => g.lines.push({ name: l.name, qty: l.qty, monto: M(l.n) }));
        g.n += x.total - x.pagado;
      });
      const c = CONTACTO[name] || ['—', '—', '—', '—'];
      const n = list.length;
      return { name, on: !excl[name], regimen: REG_LABEL[reg], sub: REG_LABEL[reg] + ' · ' + n + (n === 1 ? ' cuenta' : ' cuentas'), correo: c[0], banco: c[2], clabe: c[3], nCuentas: n,
        accts: list.map(a => ({ prov: name, folio: a.pr.folio, monto: M(a.x.total - a.x.pagado) })),
        proyectos: Object.values(projs).map(g => ({ ...g, subtotal: M(g.n) })),
        neto, iva, ret, transfer, transferM: M(transfer),
        cruce: [{ k: 'Subtotal', v: M(neto) }, { k: 'IVA 16%', v: M(iva) }, ...retLines.map(l => ({ k: l.k, v: M(l.n) }))] };
    });
    const inc = resps.filter(r => r.on);
    const s = f => inc.reduce((a, r) => a + f(r), 0);
    const items = inc.flatMap(r => r.accts);
    return { resps, skipped, hasSkipped: !!skipped.length, nCuentas: items.length, nResp: inc.length, items, folios: [...new Set(items.map(i => i.folio))].sort(),
      netoN: s(r => r.neto), neto: M(s(r => r.neto)), iva: M(s(r => r.iva)), ret: M(s(r => r.ret)), transfer: M(r2(s(r => r.transfer))), nTotal: resps.length };
  }

  window.CuentasData = { ordenPreview, ORDENES_RAW: () => ORDENES, conceptDetail, compute, controls, monthPills, initialState, M, F, badge, MESL };
})();
