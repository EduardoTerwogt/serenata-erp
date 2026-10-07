import { z } from 'zod'

// ==================== SERVICE TEMPLATES ====================

export const ServiceTemplateItemSchema = z.object({
  categoria: z.string().min(1, 'La categoría es requerida'),
  descripcion: z.string().min(1, 'La descripción es requerida'),
  cantidad: z.coerce.number().min(0.01, 'La cantidad debe ser mayor a 0').default(1),
  precio_unitario: z.union([z.coerce.number().min(0), z.literal('')]).transform(v => v === '' ? 0 : Number(v)).default(0),
  costo_unitario: z.union([z.coerce.number().min(0), z.literal('')]).transform(v => v === '' ? 0 : Number(v)).default(0),
  responsable_nombre: z.string().nullable().optional(),
  responsable_id: z.string().nullable().optional(),
  producto_id: z.string().nullable().optional(),
})

export const ServiceTemplateCreateSchema = z.object({
  nombre: z.string().min(1, 'El nombre de la plantilla es requerido'),
  descripcion: z.string().nullable().optional(),
  items: z.array(ServiceTemplateItemSchema).min(1, 'Al menos un item es requerido'),
})

export const ServiceTemplateUpdateSchema = ServiceTemplateCreateSchema.partial()

// ==================== ITEMS ====================

export const ItemCotizacionSchema = z.object({
  id: z.string().optional(),
  categoria: z.string().default(''),
  descripcion: z.string().min(1, 'La descripción del item es requerida'),
  cantidad: z.coerce.number().min(0).default(0),
  precio_unitario: z.union([z.coerce.number().min(0), z.literal('')]).default(0),
  costo_unitario: z.union([z.coerce.number().min(0), z.literal('')]).default(0),
  responsable_id: z.string().nullable().optional().transform(v => v ?? ''),
  responsable_nombre: z.string().nullable().optional().transform(v => v ?? ''),
  notas: z.string().nullable().optional(),
  orden: z.coerce.number().int().optional(),
})

// ==================== COTIZACIONES ====================

const CotizacionBaseSchema = z.object({
  cliente: z.string().min(1, 'El cliente es requerido'),
  cliente_id: z.string().uuid().nullable().optional(),
  proyecto: z.string().min(1, 'El proyecto es requerido'),
  // G5: AAAA-MM-DD o vacío (el servidor normaliza '' a NULL).
  fecha_entrega: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/, 'La fecha de entrega debe ser AAAA-MM-DD').nullable().optional(),
  locacion: z.string().nullable().optional(),
  tipo: z.enum(['PRINCIPAL', 'COMPLEMENTARIA']).optional(),
  es_complementaria_de: z.string().nullable().optional(),
  porcentaje_fee: z.coerce.number().min(0).max(1).optional().default(0.15),
  iva_activo: z.boolean().optional().default(true),
  descuento_tipo: z.enum(['monto', 'porcentaje']).optional().default('monto'),
  descuento_valor: z.coerce.number().min(0).optional().default(0),
  items: z.array(ItemCotizacionSchema).optional().default([]),
  notas_internas: z.string().nullable().optional(),
  notas_pdf: z.string().nullable().optional(),
})

export const CotizacionCreateSchema = CotizacionBaseSchema.extend({
  id: z.string().optional(),
})

export const CotizacionUpdateSchema = CotizacionBaseSchema.partial().extend({
  items: z.array(ItemCotizacionSchema).optional(),
})

// #123 (P24): RFC como columna en clientes y proveedores. Se normaliza igual que el CHECK de la base
// (`rfc = upper(btrim(rfc))`, no vacío); vacío o solo espacios = sin RFC (null). 12 posiciones (moral) o 13 (física).
export const RFC_REGEX = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/
export const RfcSchema = z
  .string()
  .nullable()
  .optional()
  .transform((v) => {
    if (v == null) return v === null ? null : undefined
    const limpio = v.trim().toUpperCase()
    return limpio === '' ? null : limpio
  })
  .refine((v) => v == null || RFC_REGEX.test(v), 'RFC inválido: 12 o 13 caracteres (3-4 letras, 6 dígitos de fecha y 3 de homoclave)')

// ==================== PROVEEDORES (antes "responsables") ====================

export const ProveedorCreateSchema = z.object({
  nombre: z.string().min(1, 'El nombre es requerido'),
  alias: z.string().nullable().optional(),
  telefono: z.string().nullable().optional(),
  correo: z.string().email('Correo inválido').nullable().optional(),
  banco: z.string().nullable().optional(),
  clabe: z.string().nullable().optional(),
  roles: z.array(z.string()).optional().default([]),
  notas: z.string().nullable().optional(),
  regimen_fiscal: z.enum(['moral', 'fisica', 'resico']).nullable().optional(),
  rfc: RfcSchema,
})

export const ProveedorUpdateSchema = z.object({
  nombre: z.string().min(1, 'El nombre es requerido').optional(),
  alias: z.string().nullable().optional(),
  telefono: z.string().nullable().optional(),
  correo: z.string().email('Correo inválido').nullable().optional(),
  banco: z.string().nullable().optional(),
  clabe: z.string().nullable().optional(),
  roles: z.array(z.string()).optional(),
  notas: z.string().nullable().optional(),
  activo: z.boolean().optional(),
  regimen_fiscal: z.enum(['moral', 'fisica', 'resico']).nullable().optional(),
  rfc: RfcSchema,
})

// ==================== CLIENTES ====================
// Bloque 5 (docs/PLAN.md): catálogo administrativo -- mismo patrón de
// Proveedores (PUT + soft-delete vía `activo`), sin roles/banco/clabe/
// regimen_fiscal ni historial (conceptos que Clientes no tiene).

export const ClienteCreateSchema = z.object({
  nombre: z.string().min(1, 'El nombre es requerido'),
  tipo: z.string().nullable().optional(),
  contacto: z.string().nullable().optional(),
  telefono: z.string().nullable().optional(),
  correo: z.string().email('Correo inválido').nullable().optional(),
  notas: z.string().nullable().optional(),
  rfc: RfcSchema,
})

export const ClienteUpdateSchema = z.object({
  nombre: z.string().min(1, 'El nombre es requerido').optional(),
  tipo: z.string().nullable().optional(),
  contacto: z.string().nullable().optional(),
  telefono: z.string().nullable().optional(),
  correo: z.string().email('Correo inválido').nullable().optional(),
  notas: z.string().nullable().optional(),
  activo: z.boolean().optional(),
  rfc: RfcSchema,
})

// ==================== PROYECTOS ====================

export const ProyectoUpdateSchema = z.object({
  fecha_entrega: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/, 'La fecha de entrega debe ser AAAA-MM-DD').nullable().optional(),
  locacion: z.string().nullable().optional(),
  horarios: z.string().nullable().optional(),
  punto_encuentro: z.string().nullable().optional(),
  notas: z.string().nullable().optional(),
  estado: z.enum(['PREPRODUCCION', 'RODAJE', 'POSTPRODUCCION', 'FINALIZADO']).optional(),
  notas_por_item: z.record(z.string(), z.string()).optional().default({}),
})

// ==================== ITEMS (PATCH) ====================

export const ItemPatchSchema = z.object({
  responsable_id: z.string().nullable().optional(),
  responsable_nombre: z.string().nullable().optional(),
  notas: z.string().nullable().optional(),
}).refine(
  data => 'responsable_id' in data || 'responsable_nombre' in data || 'notas' in data,
  { message: 'Al menos un campo debe enviarse: responsable_id, responsable_nombre o notas' }
)

// ==================== FASE 5.2 -- TIPOS DE PROYECTO ====================

export const TipoProyectoCreateSchema = z.object({
  nombre: z.string().min(1, 'El nombre del tipo de proyecto es requerido'),
})

export const TipoProyectoUpdateSchema = z.object({
  nombre: z.string().min(1, 'El nombre del tipo de proyecto es requerido').optional(),
  activo: z.boolean().optional(),
})

export const TipoProyectoEtapaCreateSchema = z.object({
  nombre: z.string().min(1, 'El nombre de la etapa es requerido'),
  orden: z.coerce.number().int().min(1),
  es_etapa_final: z.boolean().optional().default(false),
})

export const TipoProyectoEtapaUpdateSchema = z.object({
  nombre: z.string().min(1, 'El nombre de la etapa es requerido').optional(),
  orden: z.coerce.number().int().min(1).optional(),
  es_etapa_final: z.boolean().optional(),
})

export const TipoProyectoTareaDefaultCreateSchema = z.object({
  titulo: z.string().min(1, 'El título de la tarea es requerido'),
  descripcion: z.string().nullable().optional(),
  es_hito: z.boolean().optional().default(false),
  dias_antes_entrega: z.coerce.number().int().nullable().optional(),
  orden: z.coerce.number().int().min(1),
})

export const TipoProyectoTareaDefaultUpdateSchema = TipoProyectoTareaDefaultCreateSchema.partial()

// ==================== FASE 5.2 -- TAREAS DE PROYECTO ====================

export const ProyectoTareaCreateSchema = z.object({
  titulo: z.string().min(1, 'El título de la tarea es requerido'),
  descripcion: z.string().nullable().optional(),
  asignado_a: z.string().nullable().optional(),
  es_hito: z.boolean().optional().default(false),
  fecha_limite: z.string().nullable().optional(),
})

export const ProyectoTareaUpdateSchema = z.object({
  titulo: z.string().min(1, 'El título de la tarea es requerido').optional(),
  descripcion: z.string().nullable().optional(),
  estado: z.enum(['PENDIENTE', 'EN_PROGRESO', 'COMPLETADA', 'BLOQUEADA']).optional(),
  asignado_a: z.string().nullable().optional(),
  es_hito: z.boolean().optional(),
  fecha_limite: z.string().nullable().optional(),
})

export const ProyectoTareaChecklistItemCreateSchema = z.object({
  texto: z.string().min(1, 'El texto del ítem es requerido'),
  orden: z.coerce.number().int().optional().default(0),
})

export const ProyectoTareaChecklistItemUpdateSchema = z.object({
  texto: z.string().min(1, 'El texto del ítem es requerido').optional(),
  completado: z.boolean().optional(),
  orden: z.coerce.number().int().optional(),
})

// ==================== FASE 5.2 -- ASIGNACIÓN DE TIPO / ETAPA ====================

export const ProyectoAsignarTipoSchema = z.object({
  tipo_proyecto_id: z.string().min(1, 'El tipo de proyecto es requerido'),
})

export const ProyectoCambiarEtapaSchema = z.object({
  etapa_id: z.string().min(1, 'La etapa es requerida'),
})

// ==================== FASE 5.2 -- DOCUMENTOS DE PROYECTO ====================

export const ProyectoDocumentoCreateSchema = z.object({
  tipo: z.enum([
    'BRIEF', 'STAKEHOLDERS_RACI', 'RUTA_CRITICA', 'ROADMAP', 'CHARTER',
    'RIESGOS', 'PLAN_COMUNICACION', 'STATUS_REPORT', 'REPORTE_CIERRE',
  ]),
  titulo: z.string().nullable().optional(),
  contenido: z.record(z.string(), z.unknown()).optional().default({}),
})

export const ProyectoDocumentoUpdateSchema = z.object({
  titulo: z.string().nullable().optional(),
  contenido: z.record(z.string(), z.unknown()).optional(),
})

export const ProyectoDocumentoRegenerarSchema = z.object({
  force: z.boolean().optional().default(false),
})

// ==================== DOCUMENTOS DE CUENTAS (estado_validacion manual) ====================

export const DocumentoEstadoValidacionSchema = z.object({
  estado_validacion: z.enum(['pendiente', 'validado', 'revision']),
  detalle_validacion: z.string().nullable().optional(),
})

// Rediseño de Cuentas B5 (supuesto 4): en un cobro, además de marcar la
// validación, se indica a mano el método (PUE/PPD) de una factura cuyo XML
// no lo trae. Al menos uno de los dos.
export const DocumentoCobroPatchSchema = z
  .object({
    estado_validacion: z.enum(['pendiente', 'validado', 'revision']).optional(),
    detalle_validacion: z.string().nullable().optional(),
    metodo_pago_cfdi: z.enum(['PUE', 'PPD']).optional(),
  })
  .refine((v) => v.estado_validacion !== undefined || v.metodo_pago_cfdi !== undefined, { message: 'Indica estado_validacion o metodo_pago_cfdi' })

// Rediseño de Cuentas B5 (supuesto 15): archivo no fiscal subido en su propia
// petición (el PDF de la factura).
export const SubirArchivoCuentaSchema = z.object({
  tipo: z.enum(['FACTURA_PDF', 'FACTURA_PROVEEDOR']),
})

// ==================== PORTAL DE PROVEEDORES (Fase 5.5) ====================

export const PortalSignupSchema = z.object({
  nombre: z.string().trim().min(1).nullable().optional(),
  alias: z.string().trim().min(1).nullable().optional(),
  correo: z.string().email('Correo inválido'),
  password: z.string().min(8, 'El password debe tener al menos 8 caracteres'),
})

export const PortalLoginSchema = z.object({
  correo: z.string().email('Correo inválido'),
  password: z.string().min(1, 'El password es requerido'),
})

// candidato_id NO se acepta del cliente -- el servidor lo deriva de
// proveedores.match_candidato_id dentro de la RPC confirmar_match_proveedor.
// Ver db/migrations/20260909_confirmar_match_proveedor_rpc.sql.
export const PortalConfirmarMatchSchema = z.object({
  confirmar: z.boolean(),
})

export const PortalPerfilSchema = z.object({
  nombre: z.string().trim().min(1).optional(),
  alias: z.string().nullable().optional(),
  telefono: z.string().nullable().optional(),
  banco: z.string().nullable().optional(),
  clabe: z.string().nullable().optional(),
})

// ==================== DASHBOARD EJECUTIVO (Fase 5.6) ====================

export const GastoFijoCreateSchema = z.object({
  nombre: z.string().trim().min(1, 'El nombre es requerido'),
  monto_mensual: z.number().nonnegative('El monto no puede ser negativo'),
})

export const GastoFijoUpdateSchema = z.object({
  nombre: z.string().trim().min(1).optional(),
  monto_mensual: z.number().nonnegative().optional(),
  activo: z.boolean().optional(),
})

// ==================== EF-3A -- INFRAESTRUCTURA DE CARGA (LOADTEST) ====================
// Payloads de los endpoints internos `/api/internal/loadtest-*`, protegidos
// por el guard fail-closed LOADTEST_MODE+LOADTEST_ENV_SECRET -- validados
// igual que cualquier otro payload de la app, nunca confiados solo porque
// el guard ya pasó.

export const LoadtestPortalSessionSchema = z.object({
  proveedorId: z.string().uuid(),
  sessionVersion: z.number().int().positive(),
})

export const LoadtestDriveFolderSchema = z.object({
  runId: z.string().uuid(),
})

// ==================== PAGOS DE CLIENTE ====================

// POST /api/cuentas-cobrar/[id]/registrar-pago (multipart). Rediseño de
// Cuentas B1 (R4): CHEQUE se acepta aquí, en el CHECK de la tabla y dentro
// de la RPC registrar_pago_cuenta_cobrar.
export const TIPOS_PAGO = ['TRANSFERENCIA', 'EFECTIVO', 'CHEQUE'] as const

export const RegistrarPagoCobroSchema = z.object({
  monto: z.coerce.number().finite().positive('Monto debe ser mayor a 0'),
  tipo_pago: z.enum(TIPOS_PAGO, { message: 'Tipo de pago inválido (TRANSFERENCIA, EFECTIVO o CHEQUE)' }),
  fecha_pago: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha de pago requerida (YYYY-MM-DD)'),
  notas: z.string().max(2000).nullable().optional(),
  operation_id: z.string().uuid('operation_id requerido (uuid)'),
})

// POST /api/cuentas-pagar/[id]/registrar-pago y /grupos/[id]/registrar-pago
// (multipart). Rediseño de Cuentas B2 (D3): el monto es el TOTAL A
// TRANSFERIR. tipo_pago y fecha_pago son opcionales (contrato aditivo, R2):
// la UI actual solo manda monto; se asume transferencia con fecha de hoy CDMX.
export const RegistrarPagoProveedorSchema = z.object({
  monto: z.coerce.number().finite().positive('Monto debe ser mayor a 0'),
  tipo_pago: z.enum(TIPOS_PAGO, { message: 'Tipo de pago inválido (TRANSFERENCIA, EFECTIVO o CHEQUE)' }).optional(),
  fecha_pago: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha de pago inválida (YYYY-MM-DD)').optional(),
  notas: z.string().max(2000).nullable().optional(),
  operation_id: z.string().uuid('operation_id requerido (uuid)'),
})

// ── #123 (B3): estado de cuenta, facturas ligadas y pagos multi-línea ────────────────────────────────────────────

export const LADOS_CUENTAS = ['cobro', 'proveedor'] as const

// GET /api/cuentas/estado-cuenta?lado=&id=
export const EstadoCuentaQuerySchema = z.object({
  lado: z.enum(LADOS_CUENTAS, { message: 'lado inválido (cobro o proveedor)' }),
  id: z.string().uuid('id inválido (uuid de la contraparte)'),
  /** #130: ids de proyecto separados por coma; solo los conceptos de esos proyectos (pago por proyecto). */
  proyectos: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(',').map((x) => x.trim()).filter(Boolean) : undefined))
    .refine((v) => v === undefined || (v.length > 0 && v.length <= 50), 'proyectos: de 1 a 50 ids separados por coma'),
})

// GET /api/cuentas/proyectos-selector (#130): proyectos con renglones (Subir factura) o con saldo (Registrar pago).
export const ProyectosSelectorQuerySchema = z.object({
  modo: z.enum(['renglones', 'pago'], { message: 'modo inválido (renglones o pago)' }),
  lado: z.enum(LADOS_CUENTAS).optional(),
  q: z.string().trim().max(100).optional(),
  contraparte: z.string().uuid().optional(),
  solo_pendientes: z.enum(['true', 'false']).optional().transform((v) => v !== 'false'),
  page: z.coerce.number().int().min(1).max(10_000).optional().default(1),
  page_size: z.coerce.number().int().min(1).max(50).optional().default(25),
}).refine((v) => v.modo !== 'pago' || v.lado !== undefined, { message: 'El modo pago requiere lado' })

// GET /api/cuentas/contrapartes (#131): contrapartes con algo pendiente para el desplegable de Acciones.
export const PENDIENTES_CONTRAPARTE = ['factura', 'complemento', 'saldo', 'todos'] as const
export const CuentasContrapartesQuerySchema = z.object({
  lado: z.enum(LADOS_CUENTAS, { message: 'lado inválido (cobro o proveedor)' }),
  pendiente: z.enum(PENDIENTES_CONTRAPARTE, { message: 'pendiente inválido (factura, complemento, saldo o todos)' }),
  q: z.string().trim().max(100).optional(),
})

const centavos = z.coerce.number().finite().positive('El monto debe ser mayor a 0')

// POST /api/cuentas/facturas/preview — campo `datos` (JSON) del multipart junto al archivo `xml`.
export const FacturaPreviewSchema = z.object({
  /** Contraparte elegida a mano (si el RFC del XML no coincide con nadie, P24). */
  contraparte_id: z.string().uuid().nullable().optional(),
  /** Cuentas de cobro (cliente) o grupo de proveedor ya elegidos, para calcular el cuadre. */
  cuentas: z.array(z.string().uuid()).optional().default([]),
})

// POST /api/cuentas/facturas — campo `datos` (JSON) del multipart junto a `xml` (y `pdf` opcional).
// Sin tope de cotizaciones por factura (P6, P25).
export const FacturaCrearSchema = z.object({
  operation_id: z.string().uuid('operation_id requerido (uuid)'),
  contraparte_id: z.string().uuid().nullable().optional(),
  /** Ofrecido al elegir la contraparte a mano: guarda el RFC del XML en su ficha (P24). */
  guardar_rfc: z.boolean().optional().default(false),
  /** Cliente: las cuentas de cobro que cubre y el total que el usuario vio (la RPC lo revalida). */
  cuentas: z
    .array(z.object({ id: z.string().uuid(), monto_esperado: z.coerce.number().finite().nullable().optional() }))
    .optional()
    .default([])
    .refine((c) => new Set(c.map((x) => x.id)).size === c.length, 'Cada cotización aparece una sola vez en la factura'),
  /** Proveedor: el grupo al que corresponde (1:1, P10). */
  grupo_id: z.string().uuid().nullable().optional(),
  /** Complemento: desambigua el pago cuando varios coinciden con el monto (P9). */
  pago_id: z.string().uuid().nullable().optional(),
  /**
   * #130 (proveedor): alta del proveedor y/o asignación de renglones o gasto extra, en una transacción, ANTES de subir la
   * factura. El proveedor es `contraparte_id` (existente) o `preparar.proveedor` (nuevo); el destino es `renglones` o
   * `gasto` (uno solo). Sin `preparar`, la factura va a `grupo_id` como antes.
   */
  preparar: z
    .object({
      proveedor: z
        .object({
          nombre: z.string().trim().min(1, 'Falta el nombre').max(300),
          rfc: z.string().trim().toUpperCase().regex(RFC_REGEX, 'RFC inválido'),
          regimen_fiscal: z.enum(['moral', 'fisica', 'resico']),
          telefono: z.string().trim().min(1, 'Falta el teléfono').max(40),
          correo: z.string().trim().email('Correo inválido'),
          banco: z.string().trim().min(1, 'Falta el banco').max(100),
          clabe: z.string().trim().transform((v) => v.replace(/\s/g, '')).pipe(z.string().regex(/^\d{18}$/, 'La CLABE debe tener 18 dígitos')),
        })
        .optional(),
      renglones: z.array(z.string().uuid()).max(200).optional(),
      gasto: z
        .object({
          proyecto_id: z.string().trim().min(1).max(50),
          concepto: z.string().trim().min(1, 'Falta el concepto').max(300),
          costo_total: z.coerce.number().finite().positive('El costo debe ser mayor a 0'),
        })
        .optional(),
    })
    .optional()
    .refine((p) => !p || Boolean(p.renglones?.length) !== (p.gasto !== undefined), 'Elige renglones o registra un gasto extra, no ambos ni ninguno'),
})

const FechaIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha de pago requerida (YYYY-MM-DD)')

// POST /api/cuentas/pagos — campo `datos` (JSON) del multipart junto a `comprobante` (opcional, una sola vez, P16).
// El monto de cada línea es lo aplicado a esa cuenta (cobro) o el total a transferir de ese grupo (proveedor).
export const PagoCrearSchema = z.object({
  lado: z.enum(LADOS_CUENTAS, { message: 'lado inválido (cobro o proveedor)' }),
  lineas: z
    .array(z.object({ id: z.string().uuid(), monto: centavos, saldo_esperado: z.coerce.number().finite().nullable().optional() }))
    .min(1, 'El pago necesita al menos una línea')
    .refine((l) => new Set(l.map((x) => x.id)).size === l.length, 'Cada cuenta aparece una sola vez en el pago'),
  tipo_pago: z.enum(TIPOS_PAGO, { message: 'Tipo de pago inválido (TRANSFERENCIA, EFECTIVO o CHEQUE)' }),
  fecha_pago: FechaIso,
  notas: z.string().max(2000).nullable().optional(),
  operation_id: z.string().uuid('operation_id requerido (uuid)'),
})

// GET /api/cuentas/pagos/estado?lado=&operation_id=&destino=
export const PagoEstadoQuerySchema = z.object({
  lado: z.enum(LADOS_CUENTAS),
  operation_id: z.string().uuid('operation_id requerido (uuid)'),
  destino: z.string().uuid().optional(),
})

// POST /api/admin/datos-fiscales — campo `datos` (JSON) del multipart junto a `constancia`. #123 (B6a): lo leído de la
// constancia y CONFIRMADO por un administrador (`confirmado: true`); el servidor lo vuelve a validar.
export const DatosFiscalesGuardarSchema = z.object({
  rfc: z.string().trim().min(1, 'Falta el RFC').max(20),
  razon_social: z.string().trim().min(1, 'Falta la razón social').max(300),
  regimen_fiscal: z.string().trim().max(300).nullable().optional(),
  codigo_postal: z.string().trim().max(10).nullable().optional(),
  confirmado: z.literal(true, { message: 'Confirma los datos leídos antes de guardar' }),
})

// PATCH /api/admin/datos-fiscales — #130: tolerancia (en pesos) del match de una factura por su total.
export const DatosFiscalesToleranciaSchema = z.object({
  tolerancia_total: z.coerce.number().finite().min(0, 'La tolerancia no puede ser negativa').max(100, 'La tolerancia máxima es de $100'),
})

// PATCH /api/cuentas/clientes/[id] — #130: completar la ficha del cliente al facturarle por primera vez (datos del XML
// y de la constancia). Solo llena lo que falta; el RFC ya guardado no se cambia desde aquí.
export const ClienteCompletarSchema = z.object({
  rfc: RfcSchema,
  contacto: z.string().trim().max(200).nullable().optional(),
  telefono: z.string().trim().max(40).nullable().optional(),
  correo: z.string().trim().email('Correo inválido').nullable().optional(),
})

// GET /api/cuentas/periodo (Rediseño de Cuentas B3). Query string: todo
// llega como texto; año y mes vacíos toman el año y mes actuales en la ruta.
export const CuentasOpcionesQuerySchema = z.object({
  anio: z.coerce.number().int().min(2000).max(2100),
})

export const CuentasPeriodoQuerySchema = z.object({
  anio: z.coerce.number().int().min(2000).max(2100).optional(),
  mes: z.union([z.literal('todo'), z.coerce.number().int().min(1).max(12)]).optional(),
  estado: z.enum(['todas', 'pendientes', 'cerradas']).default('todas'),
  tipo: z.enum(['todo', 'cobro', 'pago']).default('todo'),
  cliente: z.string().max(300).optional(),
  proveedor: z.string().max(300).optional(),
  q: z.string().max(200).optional(),
  vista: z.enum(['proyectos', 'lista']).default('proyectos'),
  proyecto: z.string().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(200).default(60),
})

// POST /api/cuentas-cobrar/[id]/subir-complemento (multipart). Los archivos
// se validan aparte; pago_id es opcional hasta B8 (R2, S8).
export const SubirComplementoSchema = z.object({
  pago_id: z.string().uuid('pago_id debe ser un uuid').optional(),
  notas: z.string().max(2000).nullable().optional(),
})

// ==================== ÓRDENES DE PAGO ====================

// Rediseño de Cuentas B6: "Generar orden PDF" manda lo que el usuario dejó
// marcado, con el saldo neto que vio (la RPC lo revalida, S2), y una llave
// por apertura del modal (S9).
export const GenerarOrdenCuentasSchema = z.object({
  idempotency_key: z.string().uuid({ message: 'idempotency_key inválida' }),
  seleccion: z
    .array(
      z.object({
        tipo: z.literal('grupo'),
        id: z.string().uuid(),
        monto_esperado: z.number().positive(),
      })
    )
    .min(1, { message: 'Selecciona al menos un proveedor' })
    .max(500),
})

export const CancelarOrdenSchema = z.object({
  motivo: z.string().trim().min(3, { message: 'Escribe el motivo de la cancelación' }).max(500),
})

// Rediseño de Cuentas B7 (D5, D6): reabrir y corregir, cualquier usuario de Cuentas (#123, P14). El motivo
// es obligatorio donde queda en el registro (reabrir, anular, quitar,
// reasignar un concepto pagado).
const MotivoCorreccionSchema = z.string().trim().min(3, { message: 'Escribe el motivo' }).max(500)
const FechaCorreccionSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (YYYY-MM-DD)')
const DominioCorreccionSchema = z.enum(['cobro', 'proveedor'])

export const ReabrirCuentasSchema = z.object({ motivo: MotivoCorreccionSchema })

export const CorreccionCuentasSchema = z.discriminatedUnion('accion', [
  z.object({
    accion: z.literal('anular_pago'),
    dominio: DominioCorreccionSchema,
    pago_id: z.string().uuid('pago_id inválido'),
    motivo: MotivoCorreccionSchema,
  }),
  z.object({
    accion: z.literal('baja_documento'),
    dominio: DominioCorreccionSchema,
    documento_id: z.string().uuid('documento_id inválido'),
    motivo: MotivoCorreccionSchema,
    reemplazado_por: z.string().uuid('reemplazado_por inválido').optional(),
  }),
  z.object({
    accion: z.literal('datos_cobro'),
    cuenta_id: z.string().uuid('cuenta_id inválido'),
    fecha_factura: FechaCorreccionSchema.nullable(),
    fecha_vencimiento: FechaCorreccionSchema.nullable(),
    notas: z.string().max(2000).nullable(),
  }),
  z.object({
    accion: z.literal('datos_pago'),
    dominio: DominioCorreccionSchema,
    pago_id: z.string().uuid('pago_id inválido'),
    fecha_pago: FechaCorreccionSchema,
    notas: z.string().max(2000).nullable(),
  }),
  z.object({
    accion: z.literal('proveedor'),
    cuenta_pagar_id: z.string().uuid('cuenta_pagar_id inválido'),
    responsable_id: z.string().uuid('responsable_id inválido'),
    motivo: MotivoCorreccionSchema,
  }),
])
export type CorreccionCuentas = z.infer<typeof CorreccionCuentasSchema>

export const HistorialOrdenesQuerySchema = z.object({
  estado: z.enum(['GENERADA', 'PARCIALMENTE_PAGADA', 'COMPLETADA', 'VENCIDA', 'CANCELADA']).optional(),
  mes: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  proveedor: z.string().trim().max(200).optional(),
  proyecto: z.string().trim().max(50).optional(),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
})

// ==================== HELPER ====================

/**
 * Valida un payload contra un schema Zod.
 * Retorna { ok: true, data } o { ok: false, error, details }
 */
export function validate<T>(schema: z.ZodType<T>, payload: unknown):
  | { ok: true; data: T }
  | { ok: false; error: string; details: { path: string; message: string }[] } {
  const result = schema.safeParse(payload)
  if (result.success) return { ok: true, data: result.data }

  const details = result.error.issues.map(issue => ({
    path: issue.path.join('.'),
    message: issue.message,
  }))

  return {
    ok: false,
    error: `Payload inválido: ${details.map(d => d.path ? `${d.path}: ${d.message}` : d.message).join(', ')}`,
    details,
  }
}

// Re-exportar z para uso en rutas si se necesita
export { z }
