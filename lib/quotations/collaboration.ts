import { ItemCotizacion } from '@/lib/types'
import { QuotationFormValues } from '@/lib/quotations/types'
import { QuotationItemCellField } from '@/hooks/useQuotationPresence'

/**
 * EF-3 3D-2: extraído verbatim de `app/cotizaciones/[id]/page.tsx` -- tipos y
 * helpers puros compartidos por los hooks de autosave de General/Totales/
 * Notas/Partidas (3D-2..3D-5) y por `page.tsx` mismo. Movidos aquí (en vez de
 * quedar en `page.tsx` y que cada hook los reimporte desde ahí) para no crear
 * un ciclo de imports `page.tsx` <-> `hooks/useQuotationXAutosave.ts` --
 * ninguna lógica cambia, es la misma pieza en otro archivo.
 */

export const NOTAS_AUTOSAVE_DELAY_MS = 800
export const GENERAL_AUTOSAVE_DELAY_MS = 800
export const TOTALS_AUTOSAVE_DELAY_MS = 800
export const ITEM_CELL_AUTOSAVE_DELAY_MS = 800
export const ITEM_CELL_IDLE_RELEASE_MS = 5000
export const SECTION_IDLE_RELEASE_MS = 5000

export interface GeneralSnapshot {
  cliente: string
  proyecto: string
  fecha_entrega: string
  locacion: string
}

export interface TotalsSnapshot {
  porcentaje_fee: number
  iva_activo: boolean
  descuento_tipo: 'monto' | 'porcentaje'
  descuento_valor: number
}

export type QuotationGeneralField = keyof GeneralSnapshot
export type QuotationTotalsField = keyof TotalsSnapshot

export function buildGeneralSnapshot(values: Partial<GeneralSnapshot>): GeneralSnapshot {
  return {
    cliente: values.cliente || '',
    proyecto: values.proyecto || '',
    fecha_entrega: values.fecha_entrega || '',
    locacion: values.locacion || '',
  }
}

export function buildTotalsSnapshot(values: Partial<TotalsSnapshot>): TotalsSnapshot {
  return {
    porcentaje_fee: typeof values.porcentaje_fee === 'number' ? values.porcentaje_fee : 0.15,
    iva_activo: typeof values.iva_activo === 'boolean' ? values.iva_activo : true,
    descuento_tipo: values.descuento_tipo === 'porcentaje' ? 'porcentaje' : 'monto',
    descuento_valor: typeof values.descuento_valor === 'number' ? values.descuento_valor : 0,
  }
}

export function getItemCellKey(rowId: string, field: QuotationItemCellField) {
  return `${rowId}:${field}`
}

/**
 * Detalle de un campo en conflicto, tal como lo devuelven las RPCs
 * patch_item_cotizacion / patch_cotizacion_general / patch_cotizacion_totales.
 */
export interface FieldConflictDetail {
  base: unknown
  current: unknown
  attempted: unknown
}

/**
 * El PATCH (de una partida, de General o de Totales) rechazó el intento
 * porque el valor cambió en el servidor desde que se capturó el "base"
 * (alguien más lo editó primero). `fields` viene indexado por la clave del
 * patch (p. ej. "descripcion", "locacion", "descuento_valor").
 */
export class PatchConflictError extends Error {
  fields: Record<string, FieldConflictDetail>
  constructor(fields: Record<string, FieldConflictDetail>) {
    super('conflict')
    this.name = 'PatchConflictError'
    this.fields = fields
  }
}

/**
 * Construye el "base" a mandar en el próximo PATCH de este campo: el valor
 * confirmado por el servidor en el momento en que el usuario empezó a
 * editarlo. Sin esto (fila recién creada cuyo alta sigue en vuelo) no hay
 * base posible -- ese PATCH sobreescribe sin comparar, igual que siempre.
 */
export function buildItemFieldBase(server: ItemCotizacion | undefined, field: QuotationItemCellField): Record<string, unknown> | null {
  if (!server) return null
  switch (field) {
    case 'categoria': return { categoria: server.categoria ?? '' }
    case 'descripcion': return { descripcion: server.descripcion ?? '' }
    case 'cantidad': return { cantidad: server.cantidad ?? 0 }
    case 'precio_unitario': return { precio_unitario: server.precio_unitario ?? 0 }
    case 'x_pagar': return { x_pagar: server.x_pagar ?? 0 }
    case 'responsable_id': return { responsable_id: server.responsable_id ?? '', responsable_nombre: server.responsable_nombre ?? '' }
  }
}

/**
 * Igual que `buildItemFieldBase`, pero para una operación multi-campo (seleccionar
 * producto, cambiar responsable): junta la base de cada campo que la operación toca
 * en un solo objeto, para que la RPC evalúe conflicto de forma atómica sobre todos
 * a la vez -- si cualquiera está desactualizado, se rechaza la operación completa.
 */
export function buildItemFieldsBase(server: ItemCotizacion | undefined, fields: QuotationItemCellField[]): Record<string, unknown> | null {
  if (!server) return null
  return fields.reduce<Record<string, unknown>>((acc, field) => ({ ...acc, ...(buildItemFieldBase(server, field) ?? {}) }), {})
}

/**
 * `patch_item_cotizacion` es atómica por diseño (ver la migración): si
 * CUALQUIER campo del patch está en conflicto, la RPC rechaza la operación
 * COMPLETA sin aplicar nada -- ni siquiera los campos que sí coincidían con
 * su `base`. `saveError.fields` solo trae el detalle de los campos que la
 * RPC detectó en conflicto; un campo del grupo ausente ahí no significa que
 * sí se guardó -- significa que su valor en el servidor sigue siendo
 * exactamente su `base` (por eso no se marcó), y lo que este PATCH intentó
 * para ese campo nunca llegó a aplicarse. Sin esto, "Usar"/"Mantener" solo
 * tocaban los campos que individualmente aparecían en `saveError.fields` y
 * dejaban el resto del grupo mostrando un valor que jamás se guardó como si
 * fuera el vigente.
 */
export function buildAtomicConflictRecord(
  fields: QuotationItemCellField[],
  base: Record<string, unknown> | null,
  attemptedPatch: Record<string, unknown>,
  saveError: PatchConflictError
): Record<string, FieldConflictDetail> {
  const record: Record<string, FieldConflictDetail> = {}
  for (const field of fields) {
    record[field] = saveError.fields[field] ?? { base: base?.[field], current: base?.[field], attempted: attemptedPatch[field] }
  }
  return record
}

/**
 * Misma coerción que ya arma el `patch` de cada campo de partida (ver
 * `sendItemCellPatchRound`). `attempted`/`current` de la RPC pueden diferir de
 * lo que hay en el formulario por representación (`null` vs `''`, `"10"` vs
 * `10`), no solo por dato real -- comparar con esta normalización, no con
 * `===` crudo, para decidir si un conflicto es "idéntico" (se resuelve solo).
 */
export function normalizeItemFieldValue(field: QuotationItemCellField, value: unknown): unknown {
  switch (field) {
    case 'categoria':
    case 'descripcion':
    case 'responsable_id':
      return value || ''
    case 'cantidad':
      return Number(value) || 0
    case 'precio_unitario':
    case 'x_pagar':
      return value === '' || value === null || value === undefined ? 0 : Number(value) || 0
  }
}

/** Mismo principio que `normalizeItemFieldValue`, para los campos de General. */
export function normalizeGeneralFieldValue(value: unknown): string {
  return value ? String(value) : ''
}

/**
 * Mismo principio que `normalizeItemFieldValue`, para los campos de Totales --
 * misma coerción que ya aplican `getTotalsFieldValue`/`resolveTotalsFieldConflict`.
 */
export function normalizeTotalsFieldValue(field: QuotationTotalsField, value: unknown): unknown {
  switch (field) {
    case 'porcentaje_fee':
    case 'descuento_valor':
      return value === '' || value === null || value === undefined ? 0 : Number(value) || 0
    case 'iva_activo':
      return Boolean(value)
    case 'descuento_tipo':
      return value === 'porcentaje' ? 'porcentaje' : 'monto'
  }
}

export function mapItemToFormItem(item: ItemCotizacion): QuotationFormValues['items'][number] {
  return {
    id: item.id,
    categoria: item.categoria || '',
    descripcion: item.descripcion || '',
    cantidad: item.cantidad || 1,
    precio_unitario: item.precio_unitario || 0,
    responsable_id: item.responsable_id || '',
    responsable_nombre: item.responsable_nombre || '',
    x_pagar: item.x_pagar || 0,
  }
}
