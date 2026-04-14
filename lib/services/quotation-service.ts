import { Cotizacion, Responsable } from '@/lib/types'
import { buildQuotationMutationPayload } from '@/lib/quotations/mappers'
import {
  QuotationFormValues,
  SaveQuotationOptions,
  UpdateQuotationOptions,
} from '@/lib/quotations/types'
import { getArrayBuffer, getJson, sendJson } from '@/lib/client/api'

export async function fetchResponsables(): Promise<Responsable[]> {
  try {
    return await getJson('/api/responsables', 'Error cargando responsables')
  } catch (error) {
    console.error('[quotation-service] Error cargando responsables:', error)
    return []
  }
}

export async function fetchQuotationDetail(id: string): Promise<Cotizacion> {
  return getJson(`/api/cotizaciones/${id}`, 'Cotización no encontrada')
}

export async function saveQuotationNotes(id: string, notasInternas: string | null): Promise<Cotizacion> {
  return sendJson(`/api/cotizaciones/${id}/notas`, {
    notas_internas: notasInternas,
  }, 'Error guardando notas internas', { method: 'PATCH' })
}

export async function saveQuotationGeneral(
  id: string,
  payload: {
    cliente: string
    proyecto: string
    fecha_entrega: string | null
    locacion: string | null
  }
): Promise<Cotizacion> {
  return sendJson(`/api/cotizaciones/${id}/general`, payload, 'Error guardando información general', { method: 'PATCH' })
}

export async function saveQuotationTotals(
  id: string,
  payload: {
    porcentaje_fee: number
    iva_activo: boolean
    descuento_tipo: 'monto' | 'porcentaje'
    descuento_valor: number
  }
): Promise<Cotizacion> {
  return sendJson(`/api/cotizaciones/${id}/totales`, payload, 'Error guardando configuración de totales', { method: 'PATCH' })
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
  }, 'Error al actualizar cotización', { method: 'PUT' })

  return fetchQuotationDetail(id)
}

export async function approveQuotation(id: string): Promise<Cotizacion> {
  await getJson(`/api/cotizaciones/${id}/aprobar`, 'Error aprobando cotización', { method: 'POST' })
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
