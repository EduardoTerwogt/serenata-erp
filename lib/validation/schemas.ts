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
})

export const CotizacionCreateSchema = CotizacionBaseSchema.extend({
  id: z.string().optional(),
})

export const CotizacionUpdateSchema = CotizacionBaseSchema.partial().extend({
  items: z.array(ItemCotizacionSchema).optional(),
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
