import { Cotizacion, ItemCotizacion } from '@/lib/types'
import { calculateQuotationTotals, normalizeQuotationItem } from './calculations'
import {
  PersistedQuotationItem,
  QuotationFormItem,
  QuotationFormValues,
  QuotationLikeForPdf,
  QuotationPdfPayload,
} from './types'

export const EMPTY_QUOTATION_ITEM: QuotationFormItem = {
  categoria: '',
  descripcion: '',
  cantidad: 1,
  precio_unitario: '',
  responsable_id: '',
  responsable_nombre: '',
  x_pagar: '',
}

// Una fila "en blanco" es la que se crea vacía al abrir el formulario o al pulsar
// "Agregar fila" y que nadie llenó todavía. Al importar partidas (plantilla o copia
// de otra cotización) se reusa en vez de dejarla colgando arriba de lo importado.
export function isBlankQuotationItem(item: Partial<QuotationFormItem> | undefined | null): boolean {
  if (!item) return false
  const isEmptyNumber = (value: number | '' | undefined) => value === '' || value === undefined || Number(value) === 0
  return (
    !String(item.categoria || '').trim() &&
    !String(item.descripcion || '').trim() &&
    !String(item.responsable_id || '').trim() &&
    !String(item.responsable_nombre || '').trim() &&
    isEmptyNumber(item.precio_unitario) &&
    isEmptyNumber(item.x_pagar)
  )
}

// Regla de negocio (confirmada 2026-09-08): una cotización nueva se guarda sola
// como BORRADOR en cuanto tiene nombre de proyecto y al menos una partida con
// descripción. Antes de eso no se guarda nada, para no consumir folios por
// pantallas abiertas y abandonadas.
export function canAutosaveQuotationDraft(values: Pick<QuotationFormValues, 'cliente' | 'proyecto' | 'items'>): boolean {
  // `cliente` y `proyecto` son obligatorios en CotizacionCreateSchema: sin ellos el
  // servidor devuelve 400 y el borrador no se guardaría nunca, en silencio.
  if (!String(values.cliente || '').trim()) return false
  if (!String(values.proyecto || '').trim()) return false
  return draftItemsForSave(values.items || []).length > 0
}

/**
 * Partidas que se mandan al guardar un borrador. El schema del servidor exige
 * descripción en CADA partida, así que las filas en blanco (las que deja "Agregar
 * fila") se omiten: si viajaran, el guardado entero se rechazaría con un 400.
 */
export function draftItemsForSave(items: QuotationFormItem[]): QuotationFormItem[] {
  return (items || []).filter((item) => String(item?.descripcion || '').trim() !== '')
}

/**
 * Fusiona las partidas del servidor sobre las locales para un cambio remoto.
 *
 * Regla acordada (modelo Google Sheets): gana el último en escribir, pero una celda que
 * el usuario local tiene sucia o bajo el cursor NUNCA se pisa. Antes, una señal remota
 * de "partidas guardadas" hacía un reset() completo del formulario y borraba montos y
 * descripciones que aún no habían salido en el autoguardado.
 *
 * Las filas locales que ya no existen en el servidor se descartan, salvo las que
 * `conservarLocal` marque (filas provisionales o con edición en curso).
 */
export function reconcileServerItems(
  locales: QuotationFormItem[],
  servidor: QuotationFormItem[],
  opciones: {
    celdaOcupada?: (rowId: string, campo: keyof QuotationFormItem) => boolean
    conservarLocal?: (rowId: string) => boolean
    /**
     * Una respuesta del servidor viaja con la foto del instante en que se pidió. Si
     * mientras viajaba hubo una escritura local en esa celda, la respuesta está vieja
     * y no debe aplicarse: la precedencia la decide CUÁNDO SE ESCRIBIÓ, no cuándo
     * llegó la respuesta. Sin esta regla, un guardado ajeno disparaba una relectura
     * que al volver borraba el monto que acababas de capturar.
     */
    escrituraLocalPosterior?: (rowId: string, campo: keyof QuotationFormItem) => boolean
  } = {}
): QuotationFormItem[] {
  const ocupadaOMasNueva = (rowId: string, campo: keyof QuotationFormItem) =>
    (opciones.celdaOcupada ?? (() => false))(rowId, campo) ||
    (opciones.escrituraLocalPosterior ?? (() => false))(rowId, campo)
  const celdaOcupada = ocupadaOMasNueva
  const conservarLocal = opciones.conservarLocal ?? (() => false)
  const porId = new Map(locales.filter((item) => item.id).map((item) => [item.id as string, item]))
  const idsServidor = new Set(servidor.map((item) => item.id).filter(Boolean) as string[])

  const CAMPOS = ['categoria', 'descripcion', 'cantidad', 'precio_unitario', 'x_pagar', 'responsable_id'] as const

  const fusionadas = servidor.map((remoto) => {
    const rowId = remoto.id as string
    const local = porId.get(rowId)
    if (!local) return remoto

    const resultado: QuotationFormItem = { ...remoto }
    for (const campo of CAMPOS) {
      if (!celdaOcupada(rowId, campo)) continue
      // La celda está ocupada localmente: se conserva tal cual la tiene el usuario.
      ;(resultado[campo] as QuotationFormItem[typeof campo]) = local[campo]
      if (campo === 'responsable_id') resultado.responsable_nombre = local.responsable_nombre
    }
    return resultado
  })

  // Filas locales que el servidor ya no tiene pero que siguen siendo del usuario.
  const supervivientes = locales.filter((item) => item.id && !idsServidor.has(item.id) && conservarLocal(item.id))

  return [...fusionadas, ...supervivientes]
}

export function mapQuotationItemsForSave(items: QuotationFormItem[]) {
  return items.map((item, index) => {
    const normalizedItem = normalizeQuotationItem(item)
    return {
      ...normalizedItem,
      orden: index,
    }
  })
}

interface BuildQuotationMutationPayloadOptions {
  estado?: 'BORRADOR' | 'EMITIDA' | 'APROBADA' | 'CANCELADA'
  porcentaje_fee: number
  iva_activo: boolean
  descuento_tipo: 'monto' | 'porcentaje'
  descuento_valor: number
}

export function buildQuotationMutationPayload(
  data: QuotationFormValues,
  options: BuildQuotationMutationPayloadOptions
) {
  return {
    ...data,
    items: mapQuotationItemsForSave(data.items),
    porcentaje_fee: options.porcentaje_fee,
    iva_activo: options.iva_activo,
    descuento_tipo: options.descuento_tipo,
    descuento_valor: options.descuento_valor,
    ...(options.estado ? { estado: options.estado } : {}),
  }
}

export function buildQuotationPdfPayload(
  quotation: QuotationLikeForPdf,
  items: QuotationFormItem[] | ItemCotizacion[]
): QuotationPdfPayload {
  const normalizedItems = items.map(item => normalizeQuotationItem(item as QuotationFormItem))

  return {
    id: quotation.id,
    cliente: quotation.cliente,
    proyecto: quotation.proyecto,
    fecha_entrega: quotation.fecha_entrega,
    locacion: quotation.locacion,
    fecha_cotizacion: quotation.fecha_cotizacion,
    items: normalizedItems.map(item => ({
      categoria: item.categoria,
      descripcion: item.descripcion,
      cantidad: item.cantidad,
      precio_unitario: item.precio_unitario,
      importe: item.importe,
    })),
    subtotal: quotation.subtotal,
    fee_agencia: quotation.fee_agencia,
    general: quotation.general,
    iva: quotation.iva,
    total: quotation.total,
    iva_activo: quotation.iva_activo ?? true,
    porcentaje_fee: quotation.porcentaje_fee ?? 0.15,
    descuento_tipo: quotation.descuento_tipo ?? 'monto',
    descuento_valor: quotation.descuento_valor ?? 0,
    notas: quotation.notas_pdf ?? null,
  }
}

interface BuildPersistedQuotationItemsOptions {
  previousItems?: ItemCotizacion[]
  preservePreviousResponsables?: boolean
  preservePreviousNotas?: boolean
}

export function buildPersistedQuotationItems(
  cotizacionId: string,
  items: Partial<ItemCotizacion>[],
  options: BuildPersistedQuotationItemsOptions = {}
): PersistedQuotationItem[] {
  const previousItems = options.previousItems || []
  const previousItemsById = new Map(previousItems.map(item => [item.id, item]))

  return items.map((item, index) => {
    const previousItem = (item.id && previousItemsById.get(item.id)) || previousItems[index]
    const normalizedItem = normalizeQuotationItem({
      id: item.id,
      categoria: item.categoria || '',
      descripcion: item.descripcion || '',
      cantidad: item.cantidad ?? 0,
      precio_unitario: item.precio_unitario ?? 0,
      responsable_id: item.responsable_id || '',
      responsable_nombre: item.responsable_nombre || '',
      x_pagar: item.x_pagar ?? 0,
    })

    return {
      // El id solo viaja para partidas que YA son de esta cotización: así el guardado
      // completo deja de cambiarles la identidad (lo que rompía a la otra pantalla),
      // y una partida copiada de otra cotización llega sin id y recibe uno nuevo en
      // vez de robarle la fila a su cotización de origen.
      ...(item.id && previousItemsById.has(item.id) ? { id: item.id } : {}),
      cotizacion_id: cotizacionId,
      categoria: normalizedItem.categoria,
      descripcion: normalizedItem.descripcion,
      cantidad: normalizedItem.cantidad,
      precio_unitario: normalizedItem.precio_unitario,
      responsable_id: options.preservePreviousResponsables
        ? item.responsable_id || previousItem?.responsable_id || null
        : item.responsable_id || null,
      responsable_nombre: options.preservePreviousResponsables
        ? item.responsable_nombre || previousItem?.responsable_nombre || null
        : item.responsable_nombre || null,
      x_pagar: normalizedItem.x_pagar,
      importe: normalizedItem.importe,
      margen: normalizedItem.margen,
      orden: item.orden ?? index,
      notas: options.preservePreviousNotas
        ? item.notas ?? previousItem?.notas ?? null
        : item.notas ?? null,
    }
  })
}

export function buildQuotationPersistenceData(
  items: Partial<ItemCotizacion>[],
  porcentaje_fee = 0.15,
  iva_activo = true,
  descuento_tipo: 'monto' | 'porcentaje' = 'monto',
  descuento_valor = 0
) {
  const totals = calculateQuotationTotals({
    items: items.map(item => ({
      categoria: item.categoria || '',
      descripcion: item.descripcion || '',
      cantidad: item.cantidad ?? 0,
      precio_unitario: item.precio_unitario ?? 0,
      responsable_id: String(item.responsable_id || ''),
      responsable_nombre: String(item.responsable_nombre || ''),
      x_pagar: item.x_pagar ?? 0,
    })),
    porcentaje_fee,
    iva_activo,
    descuento_tipo,
    descuento_valor,
  })

  return {
    subtotal: totals.subtotal,
    fee_agencia: totals.fee_agencia,
    general: totals.general,
    iva: totals.iva,
    total: totals.total,
    margen_total: totals.margen_total,
    utilidad_total: totals.utilidad_total,
    porcentaje_fee,
    iva_activo,
    descuento_tipo,
    descuento_valor,
  }
}

export function buildReadOnlyTotals(cotizacion: Cotizacion) {
  const general = cotizacion.general ?? 0
  const descuento = (cotizacion.descuento_tipo ?? 'monto') === 'porcentaje'
    ? general * ((cotizacion.descuento_valor ?? 0) / 100)
    : (cotizacion.descuento_valor ?? 0)

  return {
    subtotal: cotizacion.subtotal ?? 0,
    fee_agencia: cotizacion.fee_agencia ?? 0,
    general,
    descuento,
    iva: cotizacion.iva ?? 0,
    total: cotizacion.total ?? 0,
    margen_total: cotizacion.margen_total ?? 0,
    utilidad_total: cotizacion.utilidad_total ?? 0,
  }
}
