import { z } from 'zod'

// ==================== SERVICE TEMPLATES ====================

export const ServiceTemplateItemSchema = z.object({
  categoria: z.string().min(1, 'La categoría es requerida'),
  descripcion: z.string().min(1, 'La descripción es requerida'),
  cantidad: z.coerce.number().min(0.01, 'La cantidad debe ser mayor a 0').default(1),
  precio_unitario: z.union([z.coerce.number().min(0), z.literal('')]).transform(v => v === '' ? 0 : Number(v)).default(0),
  x_pagar: z.union([z.coerce.number().min(0), z.literal('')]).transform(v => v === '' ? 0 : Number(v)).default(0),
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
  x_pagar: z.union([z.coerce.number().min(0), z.literal('')]).default(0),
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
  fecha_entrega: z.string().nullable().optional(),
  locacion: z.string().nullable().optional(),
  estado: z.enum(['BORRADOR', 'EMITIDA', 'APROBADA', 'CANCELADA']).optional(),
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
})

export const ClienteUpdateSchema = z.object({
  nombre: z.string().min(1, 'El nombre es requerido').optional(),
  tipo: z.string().nullable().optional(),
  contacto: z.string().nullable().optional(),
  telefono: z.string().nullable().optional(),
  correo: z.string().email('Correo inválido').nullable().optional(),
  notas: z.string().nullable().optional(),
  activo: z.boolean().optional(),
})

// ==================== PROYECTOS ====================

export const ProyectoUpdateSchema = z.object({
  fecha_entrega: z.string().nullable().optional(),
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
        tipo: z.enum(['grupo', 'cuenta']),
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

// Rediseño de Cuentas B7 (D5, D6): reabrir y corregir, solo admin. El motivo
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
