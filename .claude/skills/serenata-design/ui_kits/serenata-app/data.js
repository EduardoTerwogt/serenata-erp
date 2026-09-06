/* Datos de muestra para el kit Fase 5. Todo es ficticio pero respeta las reglas
   de negocio del brief: "X Pagar" es neto al proveedor, el fee de agencia es
   15% por default, y el IVA del cliente es 16% sobre subtotal+fee. */
window.SN5 = {
  user: { name: 'Carla Mendoza', nickname: '@carlam', initials: 'CM' },

  nav: [
    { id: 'inicio', label: 'Inicio' },
    { id: 'cotizaciones', label: 'Cotizaciones' },
    { id: 'proyectos', label: 'Proyectos' },
    { id: 'cuentas', label: 'Cuentas' },
    { id: 'portal', label: 'Portal' },
    { id: 'responsables', label: 'Responsables' },
    { id: 'planeacion', label: 'Planeación' },
    { id: 'plantillas', label: 'Plantillas' },
    { id: 'admin', label: 'Admin' },
  ],

  pendientes: {
    responsables: 'Responsables · Fase 5 no prevé cambios de fondo. La pantalla actual se conserva: grilla de tarjetas con inicial como avatar, roles como etiquetas y datos bancarios, más historial de proyectos con total acumulado.',
    planeacion: 'Planeación · Fase 5 no prevé cambios de fondo. Se conserva el wizard de 4 pasos que convierte mensajes informales en cotizaciones con extracción por IA.',
    plantillas: 'Plantillas de Servicios · Fase 5 no prevé cambios de fondo. Se conserva la grilla con preview de los primeros 3 items y la tabla editable de partidas. Pendiente confirmar cómo integra con cotizaciones complementarias.',
    admin: 'Admin · Usuarios y Sincronización con Google Sheets. Fase 5 no prevé cambios de fondo.',
  },

  cotizaciones: [
    { folio: 'SH014', proyecto: 'Campaña Verano 2025', cliente: 'Solura', total: 1093250, entrega: '25 abr 2025', estatus: 'aprobada' },
    { folio: 'SH013', proyecto: 'Campaña Verano 2025', cliente: 'Solura', total: 214600, entrega: '25 abr 2025', estatus: 'emitida', complementariaDe: 'SH014' },
    { folio: 'SH012', proyecto: 'Documental Raíces', cliente: 'Canal Norte', total: 483000, entrega: '23 abr 2025', estatus: 'emitida' },
    { folio: 'SH011', proyecto: 'Serie Digital / Episodio 1', cliente: 'Vista Media', total: 0, entrega: '20 abr 2025', estatus: 'borrador', sinItems: true },
    { folio: 'SH010', proyecto: 'Video Institucional', cliente: 'Grupo Alba', total: 356500, entrega: '18 abr 2025', estatus: 'emitida' },
    { folio: 'SH009', proyecto: 'Campaña Lanzamiento', cliente: 'Nimbo', total: 770500, entrega: '15 abr 2025', estatus: 'aprobada' },
    { folio: 'SH008', proyecto: 'Contenido Redes Q2', cliente: 'Lúmina', total: 264500, entrega: '12 abr 2025', estatus: 'cancelada' },
    { folio: 'SH007', proyecto: 'Spot TV 30"', cliente: 'Terranova', total: 1127000, entrega: '08 abr 2025', estatus: 'emitida' },
    { folio: 'SH006', proyecto: 'Aftermovie Festival', cliente: 'Distrito', total: 184000, entrega: '05 abr 2025', estatus: 'borrador' },
  ],

  cotizacion: {
    folio: 'SH014',
    fecha: '02 abr 2025',
    cliente: 'Solura',
    proyecto: 'Campaña Verano 2025',
    entrega: '25 abr 2025',
    locacion: 'Hacienda El Carmen, Jalisco',
    notas: 'El cliente pidió dos versiones del corte final (60" y 30"). No incluir el costo de la segunda versión hasta que confirmen presupuesto.',
    estatus: 'aprobada',
    fee: 15,
    iva: true,
    descuentoTipo: 'monto',
    descuento: 0,
    partidas: [
      { categoria: 'Dirección', descripcion: 'Dirección y guion', cantidad: 1, precio: 84000, responsable: 'Julián López', xPagar: 60000 },
      { categoria: 'Producción', descripcion: 'Equipo de cámara (3 días)', cantidad: 3, precio: 42000, responsable: 'Ana Vidal', xPagar: 96000 },
      { categoria: 'Producción', descripcion: 'Locaciones y permisos', cantidad: 1, precio: 56000, responsable: 'Marta Quiroz', xPagar: 41000 },
      { categoria: 'Post', descripcion: 'Postproducción y color', cantidad: 1, precio: 78000, responsable: 'Hugo Peña', xPagar: 55000 },
      { categoria: 'Post', descripcion: 'Música original', cantidad: 2, precio: 28000, responsable: 'Distrito Sonoro', xPagar: 38000 },
      { categoria: 'Talento', descripcion: 'Casting principal (2 perfiles)', cantidad: 2, precio: 45000, responsable: 'Paula Iriarte', xPagar: 66000 },
      { categoria: 'Arte', descripcion: 'Diseño de arte y utilería', cantidad: 1, precio: 63000, responsable: 'Ana Vidal', xPagar: 44000 },
    ],
    presencia: [
      { initials: 'JL', name: 'Julián López', seccion: 'Partidas' },
      { initials: 'AV', name: 'Ana Vidal', seccion: 'Totales' },
    ],
  },

  plantillasServicios: ['Rodaje 1 día · básico', 'Rodaje 3 días · completo', 'Solo post', 'Fotografía de producto'],

  proyectos: [
    { folio: 'SH014', nombre: 'Campaña Verano 2025', cliente: 'Solura', entrega: '25 abr 2025', locacion: 'Hacienda El Carmen, Jalisco', estado: 'RODAJE', progreso: 62, equipo: ['JL', 'AV', 'HP'], horarios: 'Llamado 06:30 · Wrap estimado 20:00', punto: 'Av. Vallarta 1500, estacionamiento norte' },
    { folio: 'SH012', nombre: 'Documental Raíces', cliente: 'Canal Norte', entrega: '23 abr 2025', locacion: 'Oaxaca centro', estado: 'PREPRODUCCIÓN', progreso: 18, equipo: ['MQ', 'AV'], horarios: 'Scouting 09:00', punto: 'Hotel Quinta Real, lobby' },
    { folio: 'SH010', nombre: 'Video Institucional', cliente: 'Grupo Alba', entrega: '18 abr 2025', locacion: 'Corporativo Alba, CDMX', estado: 'POSTPRODUCCIÓN', progreso: 84, equipo: ['HP'], horarios: 'Revisión de corte 11:00', punto: 'Sala 4, piso 12' },
    { folio: 'SH009', nombre: 'Campaña Lanzamiento', cliente: 'Nimbo', entrega: '15 abr 2025', locacion: 'Foro Nimbo, Monterrey', estado: 'RODAJE', progreso: 45, equipo: ['JL', 'PI'], horarios: 'Llamado 07:00', punto: 'Foro 2, acceso de carga' },
    { folio: 'SH007', nombre: 'Spot TV 30"', cliente: 'Terranova', entrega: '08 abr 2025', locacion: 'Puebla, casco antiguo', estado: 'FINALIZADO', progreso: 100, equipo: ['AV', 'HP', 'MQ'], horarios: 'Entregado', punto: '—' },
    { folio: 'SH006', nombre: 'Aftermovie Festival', cliente: 'Distrito', entrega: '05 abr 2025', locacion: 'Explanada Distrito', estado: 'FINALIZADO', progreso: 100, equipo: ['JL'], horarios: 'Entregado', punto: '—' },
  ],

  estadosProyecto: ['PREPRODUCCIÓN', 'RODAJE', 'POSTPRODUCCIÓN', 'FINALIZADO'],

  cuentasCobrar: [
    { folio: 'SH014', cliente: 'Solura', proyecto: 'Campaña Verano 2025', pagado: 546625, total: 1093250, vencimiento: '10 may 2025', estado: 'PARCIALMENTE_PAGADO' },
    { folio: 'SH012', cliente: 'Canal Norte', proyecto: 'Documental Raíces', pagado: 0, total: 483000, vencimiento: '05 may 2025', estado: 'FACTURADO' },
    { folio: 'SH010', cliente: 'Grupo Alba', proyecto: 'Video Institucional', pagado: 0, total: 356500, vencimiento: '28 abr 2025', estado: 'VENCIDO' },
    { folio: 'SH009', cliente: 'Nimbo', proyecto: 'Campaña Lanzamiento', pagado: 770500, total: 770500, vencimiento: '20 abr 2025', estado: 'PAGADO' },
    { folio: 'SH007', cliente: 'Terranova', proyecto: 'Spot TV 30"', pagado: 0, total: 1127000, vencimiento: '15 may 2025', estado: 'FACTURA_PENDIENTE' },
  ],

  cuentasPagar: [
    { folio: 'SH014', proyecto: 'Campaña Verano 2025', responsable: 'Julián López', regimen: 'fisica', descripcion: 'Dirección y guion', pagado: 0, total: 60000, estado: 'PENDIENTE' },
    { folio: 'SH014', proyecto: 'Campaña Verano 2025', responsable: 'Ana Vidal', regimen: 'fisica', descripcion: 'Equipo de cámara (3 días)', pagado: 0, total: 96000, estado: 'PENDIENTE' },
    { folio: 'SH014', proyecto: 'Campaña Verano 2025', responsable: 'Distrito Sonoro', regimen: 'moral', descripcion: 'Música original', pagado: 38000, total: 38000, estado: 'PAGADO' },
    { folio: 'SH012', proyecto: 'Documental Raíces', responsable: 'Marta Quiroz', regimen: 'fisica', descripcion: 'Locaciones y permisos', pagado: 0, total: 41000, estado: 'EN_PROCESO_PAGO' },
    { folio: 'SH010', proyecto: 'Video Institucional', responsable: 'Hugo Peña', regimen: 'fisica', descripcion: 'Postproducción y color', pagado: 0, total: 55000, estado: 'PENDIENTE' },
    { folio: 'SH007', proyecto: 'Spot TV 30"', responsable: 'Distrito Sonoro', regimen: 'moral', descripcion: 'Mezcla y master', pagado: 24000, total: 24000, estado: 'PAGADO' },
  ],

  colaborador: {
    nombre: 'Ana Vidal', initials: 'AV', telefono: '33 1842 0071', correo: 'ana@vidalfoto.mx',
    banco: 'BBVA', clabe: '012320004512378901', regimen: 'fisica',
    roles: ['Directora de Fotografía', 'Operadora de cámara'],
    documentos: [
      { nombre: 'Constancia de situación fiscal', estado: 'validado', fecha: '12 mar 2025' },
      { nombre: 'INE (frente y vuelta)', estado: 'validado', fecha: '12 mar 2025' },
      { nombre: 'Contrato marco firmado', estado: 'pendiente', fecha: '—' },
    ],
    facturas: [
      { id: 'F-2291', proyecto: 'Campaña Verano 2025', cuenta: 'SH014', monto: 96000, estado: 'validado', fecha: '26 abr 2025' },
      { id: 'F-2264', proyecto: 'Documental Raíces', cuenta: 'SH012', monto: 41000, estado: 'revision', fecha: '24 abr 2025' },
      { id: 'F-2210', proyecto: 'Spot TV 30"', cuenta: 'SH007', monto: 52000, estado: 'rechazado', fecha: '09 abr 2025' },
    ],
  },

  dashboard: {
    periodo: 'Abril 2025',
    kpis: [
      { id: 'cobrar', label: 'Por cobrar', valor: 1966500, nota: '4 cuentas abiertas' },
      { id: 'pagar', label: 'Por pagar', valor: 252000, nota: '4 responsables' },
      { id: 'aprobadas', label: 'Cotizaciones aprobadas', valor: 2, nota: 'de 9 emitidas', moneda: false },
      { id: 'borrador', label: 'En borrador', valor: 2, nota: '1 sin items', moneda: false },
    ],
    balance: [
      { mes: 'Nov', ingresos: 980, egresos: 640 },
      { mes: 'Dic', ingresos: 1420, egresos: 910 },
      { mes: 'Ene', ingresos: 760, egresos: 700 },
      { mes: 'Feb', ingresos: 1180, egresos: 820 },
      { mes: 'Mar', ingresos: 1640, egresos: 1050 },
      { mes: 'Abr', ingresos: 1966, egresos: 1240 },
    ],
    fiscal: { ingresos: 1966500, egresos: 1240000, impuestos: 217950, deudas: 252000 },
    actividad: [
      { label: 'Proyectos ejecutados', valor: '6' },
      { label: 'Cotizaciones aprobadas', valor: '2 de 9' },
      { label: 'Proyectos que cruzan de mes', valor: '2' },
      { label: 'Ticket promedio', valor: '$ 572,317' },
    ],
    gastosFijos: [
      { label: 'Nómina', monto: 420000 },
      { label: 'Renta y servicios', monto: 96000 },
      { label: 'Software y licencias', monto: 38000 },
      { label: 'Contabilidad', monto: 24000 },
    ],
    facturadoMes: 1093250,
  },

  responsables: [
    { nombre: 'Ana Vidal', initials: 'AV', activo: true, roles: ['Directora de Fotografía', 'Operadora de cámara'], telefono: '33 1842 0071', correo: 'ana@vidalfoto.mx', banco: 'BBVA', clabe: '012320004512378901', notas: 'Trae su propio kit de lentes. Cobra viáticos aparte.', historial: [
      { proyecto: 'Campaña Verano 2025', cliente: 'Solura', fecha: '25 abr 2025', rol: 'Directora de Fotografía', monto: 96000 },
      { proyecto: 'Documental Raíces', cliente: 'Canal Norte', fecha: '23 abr 2025', rol: 'Operadora de cámara', monto: 41000 },
      { proyecto: 'Spot TV 30"', cliente: 'Terranova', fecha: '08 abr 2025', rol: 'Directora de Fotografía', monto: 52000 },
    ] },
    { nombre: 'Julián López', initials: 'JL', activo: true, roles: ['Director'], telefono: '55 2201 8834', correo: 'julian@lopezfilms.mx', banco: 'Santander', clabe: '014180005598234412', notas: '', historial: [
      { proyecto: 'Campaña Verano 2025', cliente: 'Solura', fecha: '25 abr 2025', rol: 'Director', monto: 60000 },
      { proyecto: 'Aftermovie Festival', cliente: 'Distrito', fecha: '05 abr 2025', rol: 'Director', monto: 34000 },
    ] },
    { nombre: 'Marta Quiroz', initials: 'MQ', activo: true, roles: ['Productora de locaciones', 'Permisos'], telefono: '99 3310 2245', correo: 'marta@quiroz.mx', banco: 'Banorte', clabe: '072580001122334455', notas: 'Gestiona permisos de Oaxaca y Jalisco.', historial: [
      { proyecto: 'Documental Raíces', cliente: 'Canal Norte', fecha: '23 abr 2025', rol: 'Permisos', monto: 41000 },
    ] },
    { nombre: 'Hugo Peña', initials: 'HP', activo: true, roles: ['Editor', 'Colorista'], telefono: '22 4471 9008', correo: 'hugo@penapost.mx', banco: 'BBVA', clabe: '012650007788990011', notas: '', historial: [
      { proyecto: 'Video Institucional', cliente: 'Grupo Alba', fecha: '18 abr 2025', rol: 'Colorista', monto: 55000 },
      { proyecto: 'Spot TV 30"', cliente: 'Terranova', fecha: '08 abr 2025', rol: 'Editor', monto: 28000 },
    ] },
    { nombre: 'Paula Iriarte', initials: 'PI', activo: true, roles: ['Directora de casting'], telefono: '55 8890 3312', correo: 'paula@casting.mx', banco: 'HSBC', clabe: '021180004455667788', notas: '', historial: [
      { proyecto: 'Campaña Verano 2025', cliente: 'Solura', fecha: '25 abr 2025', rol: 'Directora de casting', monto: 66000 },
    ] },
    { nombre: 'Distrito Sonoro', initials: 'DS', activo: false, roles: ['Diseño sonoro', 'Música original'], telefono: '55 6612 0091', correo: 'hola@distritosonoro.mx', banco: 'Banregio', clabe: '058320009900112233', notas: 'Persona moral. Factura con IVA acreditable.', historial: [
      { proyecto: 'Campaña Verano 2025', cliente: 'Solura', fecha: '25 abr 2025', rol: 'Música original', monto: 38000 },
      { proyecto: 'Spot TV 30"', cliente: 'Terranova', fecha: '08 abr 2025', rol: 'Mezcla y master', monto: 24000 },
    ] },
  ],

  planeacion: {
    mensaje: 'Hola! Oye para el evento del 12 de junio en el Foro Nimbo de Monterrey necesitamos cobertura de video, son 2 días de rodaje (12 y 13). Es para la campaña de lanzamiento del producto nuevo. El punto de encuentro sería el estacionamiento del foro a las 7am. Nos urge la cotización esta semana. Gracias!',
    extraidos: [
      { proyecto: 'Campaña Lanzamiento Producto', cliente: 'Nimbo', fecha: '12 jun 2025', fin: '13 jun 2025', locacion: 'Foro Nimbo, Monterrey', notaIA: 'El mensaje menciona 2 días de rodaje consecutivos. Se asume un solo evento con dos jornadas, no dos eventos separados.' },
    ],
    pendientes: [
      { id: 'EV-041', asunto: 'Aftermovie Expo Guadalajara', origen: 'WhatsApp · Rodrigo Salas', recibido: '02 may 2025', falta: 'Sin fecha confirmada' },
      { id: 'EV-039', asunto: 'Video corporativo Q3', origen: 'Email · Paula Iriarte', recibido: '28 abr 2025', falta: 'Sin locación' },
      { id: 'EV-036', asunto: 'Contenido para redes · Lúmina', origen: 'WhatsApp · Marta Quiroz', recibido: '24 abr 2025', falta: 'Sin cliente en catálogo' },
    ],
  },

  plantillas: [
    { nombre: 'Rodaje 1 día · básico', descripcion: 'Equipo mínimo para una jornada de rodaje con un solo set.', items: [
      { categoria: 'Dirección', descripcion: 'Dirección', cantidad: 1, precio: 28000, responsable: 'Julián López', xPagar: 20000 },
      { categoria: 'Producción', descripcion: 'Equipo de cámara (1 día)', cantidad: 1, precio: 42000, responsable: 'Ana Vidal', xPagar: 32000 },
      { categoria: 'Producción', descripcion: 'Iluminación básica', cantidad: 1, precio: 18000, responsable: 'Ana Vidal', xPagar: 13000 },
      { categoria: 'Post', descripcion: 'Edición y color', cantidad: 1, precio: 34000, responsable: 'Hugo Peña', xPagar: 24000 },
    ] },
    { nombre: 'Rodaje 3 días · completo', descripcion: 'Producción completa con casting, arte y postproducción.', items: [
      { categoria: 'Dirección', descripcion: 'Dirección y guion', cantidad: 1, precio: 84000, responsable: 'Julián López', xPagar: 60000 },
      { categoria: 'Producción', descripcion: 'Equipo de cámara (3 días)', cantidad: 3, precio: 42000, responsable: 'Ana Vidal', xPagar: 96000 },
      { categoria: 'Talento', descripcion: 'Casting principal (2 perfiles)', cantidad: 2, precio: 45000, responsable: 'Paula Iriarte', xPagar: 66000 },
      { categoria: 'Arte', descripcion: 'Diseño de arte y utilería', cantidad: 1, precio: 63000, responsable: 'Ana Vidal', xPagar: 44000 },
      { categoria: 'Post', descripcion: 'Postproducción y color', cantidad: 1, precio: 78000, responsable: 'Hugo Peña', xPagar: 55000 },
      { categoria: 'Post', descripcion: 'Música original', cantidad: 1, precio: 28000, responsable: 'Distrito Sonoro', xPagar: 19000 },
    ] },
    { nombre: 'Solo post', descripcion: 'Cuando el cliente entrega material grabado.', items: [
      { categoria: 'Post', descripcion: 'Edición offline', cantidad: 1, precio: 32000, responsable: 'Hugo Peña', xPagar: 23000 },
      { categoria: 'Post', descripcion: 'Corrección de color', cantidad: 1, precio: 26000, responsable: 'Hugo Peña', xPagar: 18000 },
      { categoria: 'Post', descripcion: 'Mezcla de audio', cantidad: 1, precio: 21000, responsable: 'Distrito Sonoro', xPagar: 15000 },
    ] },
    { nombre: 'Fotografía de producto', descripcion: 'Sesión de estudio, entregable en 5 días.', items: [
      { categoria: 'Producción', descripcion: 'Sesión de estudio (1 día)', cantidad: 1, precio: 38000, responsable: 'Ana Vidal', xPagar: 28000 },
      { categoria: 'Arte', descripcion: 'Styling y utilería', cantidad: 1, precio: 22000, responsable: 'Ana Vidal', xPagar: 15000 },
      { categoria: 'Post', descripcion: 'Retoque (20 imágenes)', cantidad: 20, precio: 900, responsable: 'Hugo Peña', xPagar: 12000 },
    ] },
  ],

  secciones: ['Admin', 'Dashboard', 'Cotizaciones', 'Proyectos', 'Cuentas', 'Responsables', 'Planeación'],

  usuarios: [
    { nombre: 'Carla Mendoza', correo: 'carla@serenata.mx', secciones: ['Admin', 'Dashboard', 'Cotizaciones', 'Proyectos', 'Cuentas', 'Responsables', 'Planeación'], activo: true, yo: true },
    { nombre: 'Diego Ferrer', correo: 'diego@serenata.mx', secciones: ['Dashboard', 'Cotizaciones', 'Proyectos'], activo: true },
    { nombre: 'Renata Ochoa', correo: 'renata@serenata.mx', secciones: ['Cuentas', 'Dashboard'], activo: true },
    { nombre: 'Contabilidad externa', correo: 'contabilidad@despacho.mx', secciones: ['Cuentas'], activo: true },
    { nombre: 'Sofía Barrera', correo: 'sofia@serenata.mx', secciones: ['Cotizaciones', 'Planeación'], activo: false },
  ],

  sheets: {
    spreadsheetId: '1aZ8kQ2mNfP7rT4xY9bV3cL6hJ0dS5wE',
    pestanas: [
      { nombre: 'cotizaciones', ok: true, insertadas: 2, actualizadas: 7, borradas: 0, errores: 0 },
      { nombre: 'partidas', ok: true, insertadas: 14, actualizadas: 31, borradas: 2, errores: 0 },
      { nombre: 'proyectos', ok: true, insertadas: 1, actualizadas: 5, borradas: 0, errores: 0 },
      { nombre: 'cuentas_cobrar', ok: true, insertadas: 0, actualizadas: 5, borradas: 0, errores: 0 },
      { nombre: 'cuentas_pagar', ok: false, insertadas: 0, actualizadas: 0, borradas: 0, errores: 3 },
      { nombre: 'responsables', ok: true, insertadas: 0, actualizadas: 6, borradas: 0, errores: 0 },
    ],
  },
};

window.SN5_MXN = (n) => '$ ' + Math.round(n).toLocaleString('es-MX');
window.SN5_MXN_L = (n) => '$ ' + Math.round(n).toLocaleString('es-MX') + ' MXN';
