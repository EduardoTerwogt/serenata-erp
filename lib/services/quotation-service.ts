import { Cotizacion, Proveedor } from '@/lib/types'
import { buildQuotationMutationPayload } from '@/lib/quotations/mappers'
import {
  QuotationFormValues,
  SaveQuotationOptions,
  UpdateQuotationOptions,
} from '@/lib/quotations/types'
import { getArrayBuffer, getJson, sendJson } from '@/lib/client/api'

export async function fetchProveedores(): Promise<Proveedor[]> {
  try {
    return await getJson('/api/proveedores', 'Error cargando proveedores')
  } catch (error) {
    console.error('[quotation-service] Error cargando proveedores:', error)
    return []
  }
}

export async function fetchQuotationDetail(id: string): Promise<Cotizacion> {
  return getJson(`/api/cotizaciones/${id}`, 'Cotización no encontrada')
}

export interface QuotationsPageParams {
  search?: string
  estado?: string
  page?: number
  pageSize?: number
  signal?: AbortSignal
}

export interface QuotationsPageResult {
  rows: Cotizacion[]
  totalRows: number
  countsByEstado: Record<string, number>
}

interface BuscarCotizacionesRawRow extends Omit<Cotizacion, 'itemsCount'> {
  items_count: number
}

interface BuscarCotizacionesRawResponse {
  rows: BuscarCotizacionesRawRow[]
  total_rows: number
  counts_by_estado: Record<string, number>
}

// EF-3 3B-4: busqueda/paginacion/conteos server-side via RPC unica
// buscar_cotizaciones -- reemplaza fetchQuotationsList() (traía TODAS las
// cotizaciones completas, incluidos items, sin límite). Mapea
// items_count (snake_case, respuesta cruda de la API) a itemsCount
// (camelCase, convenio del lado cliente) -- esta es la única función que
// lee la respuesta cruda de GET /api/cotizaciones.
export async function fetchQuotationsPage(params: QuotationsPageParams = {}): Promise<QuotationsPageResult> {
  const searchParams = new URLSearchParams()
  if (params.search) searchParams.set('search', params.search)
  if (params.estado) searchParams.set('estado', params.estado)
  searchParams.set('page', String(params.page ?? 1))
  searchParams.set('pageSize', String(params.pageSize ?? 10))

  const data = await getJson<BuscarCotizacionesRawResponse>(
    `/api/cotizaciones?${searchParams.toString()}`,
    'Error cargando cotizaciones',
    params.signal ? { signal: params.signal } : undefined
  )

  return {
    rows: data.rows.map((row) => ({ ...row, itemsCount: row.items_count })),
    totalRows: data.total_rows,
    countsByEstado: data.counts_by_estado,
  }
}

export async function saveQuotationNotes(id: string, notasInternas: string | null, notasPdf: string | null): Promise<Cotizacion> {
  return sendJson(`/api/cotizaciones/${id}/notas`, {
    notas_internas: notasInternas,
    notas_pdf: notasPdf,
  }, 'Error guardando notas internas', { method: 'PATCH' })
}

export async function fetchNextQuotationFolio(complementariaDe?: string): Promise<{ folio: string }> {
  const folioUrl = complementariaDe
    ? `/api/folio?complementaria_de=${encodeURIComponent(complementariaDe)}`
    : '/api/folio'

  const data = await getJson<{ folio: string }>(folioUrl, 'Error obteniendo folio')
  return { folio: data.folio }
}

export async function saveNewQuotation(
  data: QuotationFormValues,
  options: SaveQuotationOptions
): Promise<Cotizacion> {
  const body: Record<string, unknown> = {
    ...buildQuotationMutationPayload(data, {
      estado: options.estado,
      porcentaje_fee: options.porcentaje_fee,
      iva_activo: options.iva_activo,
      descuento_tipo: options.descuento_tipo,
      descuento_valor: options.descuento_valor,
    }),
  }

  if (options.tipo) body.tipo = options.tipo
  if (options.es_complementaria_de) body.es_complementaria_de = options.es_complementaria_de
  if (options.notas_internas !== undefined) body.notas_internas = options.notas_internas
  if (options.notas_pdf !== undefined) body.notas_pdf = options.notas_pdf

  const expectedItemsCount = data.items.length
  const savedQuotation = await sendJson<Cotizacion>('/api/cotizaciones', body, 'Error al guardar')

  if ((savedQuotation?.items?.length ?? 0) === expectedItemsCount) return savedQuotation

  if (savedQuotation?.id) {
    const fullQuotation = await fetchQuotationDetail(savedQuotation.id)
    if ((fullQuotation?.items?.length ?? 0) === expectedItemsCount) return fullQuotation
  }

  throw new Error('La cotización no quedó persistida correctamente. Revisa las partidas e inténtalo de nuevo.')
}

export async function updateQuotation(
  id: string,
  data: QuotationFormValues,
  options: UpdateQuotationOptions
): Promise<Cotizacion> {
  const basePayload = buildQuotationMutationPayload(data, {
    porcentaje_fee: options.porcentaje_fee,
    iva_activo: options.iva_activo,
    descuento_tipo: options.descuento_tipo,
    descuento_valor: options.descuento_valor,
    ...(options.estado ? { estado: options.estado } : {}),
  })

  const items = basePayload.items.map((formItem, index) => {
    const dbItem = options.currentQuotation?.items?.[index]
    const responsableId = formItem.responsable_id || dbItem?.responsable_id || null
    const responsable = responsableId ? options.responsables.find(r => r.id === responsableId) : null

    return {
      ...formItem,
      responsable_id: responsableId,
      responsable_nombre: formItem.responsable_nombre || dbItem?.responsable_nombre || responsable?.nombre || null,
    }
  })

  await sendJson(`/api/cotizaciones/${id}`, {
    ...basePayload,
    items,
    ...(options.notas_internas !== undefined ? { notas_internas: options.notas_internas } : {}),
    ...(options.notas_pdf !== undefined ? { notas_pdf: options.notas_pdf } : {}),
  }, 'Error al actualizar cotización', { method: 'PUT' })

  return fetchQuotationDetail(id)
}

export async function approveQuotation(id: string): Promise<Cotizacion> {
  await getJson(`/api/cotizaciones/${id}/aprobar`, 'Error aprobando cotización', { method: 'POST' })
  return fetchQuotationDetail(id)
}

/**
 * BORRADOR -> EMITIDA vía `emitir_cotizacion` (RPC dedicada, solo toca
 * `estado`). Reemplaza el PUT completo que usaba `guardar('EMITIDA')` --
 * ver hallazgo de la auditoría de Fase 8 en
 * docs/archive/fases-colaboracion-0-8.md.
 */
export async function emitirCotizacion(id: string): Promise<Cotizacion> {
  await getJson(`/api/cotizaciones/${id}/emitir`, 'Error emitiendo cotización', { method: 'POST' })
  return fetchQuotationDetail(id)
}

export interface GeneratePdfResult {
  savedToDrive: boolean
  driveWebViewLink?: string
  driveError?: string
}

export async function generateQuotationPdf(
  quotation: Cotizacion,
  itemsOverride?: QuotationFormValues['items'],
  options?: { skipDownload?: boolean }
): Promise<GeneratePdfResult> {
  const skipDownload = options?.skipDownload === true

  const pdfArrayBuffer = await getArrayBuffer(`/api/cotizaciones/${quotation.id}/generar-pdf`, 'Error generando PDF')

  if (!skipDownload) {
    const blob = new Blob([pdfArrayBuffer], { type: 'application/pdf' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `Cotizacion_${quotation.id}.pdf`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  if (quotation.estado === 'BORRADOR') {
    return { savedToDrive: false }
  }

  const uint8Array = new Uint8Array(pdfArrayBuffer)
  let binaryString = ''
  for (let i = 0; i < uint8Array.length; i++) {
    binaryString += String.fromCharCode(uint8Array[i])
  }
  const pdfBase64 = btoa(binaryString)

  const fileName = `${quotation.id} - ${quotation.cliente} - ${quotation.proyecto}.pdf`
  try {
    const driveResult = await uploadPdfToDrive(quotation.id, fileName, pdfBase64)
    return {
      savedToDrive: true,
      driveWebViewLink: driveResult?.webViewLink,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[Drive] Upload FALLÓ —', msg)
    return { savedToDrive: false, driveError: msg }
  }
}

async function uploadPdfToDrive(cotizacionId: string, fileName: string, contentBase64: string) {
  const response = await fetch('/api/integrations/drive/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cotizacionId, fileName, contentBase64 }),
  })

  const data = await response.json().catch(() => ({ error: 'Respuesta no JSON' }))

  if (!response.ok) {
    console.error('[Drive] API route retornó', response.status, '—', data?.error)
    throw new Error(data?.error || `HTTP ${response.status}`)
  }

  return data
}

export function buildComplementariaUrl(id: string, cotizacion: Cotizacion) {
  const params = new URLSearchParams({
    complementaria_de: id,
    cliente: cotizacion.cliente,
    proyecto: cotizacion.proyecto,
    locacion: cotizacion.locacion || '',
    fecha_entrega: cotizacion.fecha_entrega || '',
  })

  return `/cotizaciones/nueva?${params.toString()}`
}
