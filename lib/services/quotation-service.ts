import { Cotizacion, Responsable } from '@/lib/types'
import { buildQuotationMutationPayload, buildQuotationPdfPayload } from '@/lib/quotations/mappers'
import {
  QuotationFormValues,
  SaveQuotationOptions,
  UpdateQuotationOptions,
} from '@/lib/quotations/types'

export async function fetchResponsables(): Promise<Responsable[]> {
  const res = await fetch('/api/responsables')
  if (!res.ok) throw new Error('Error cargando responsables')
  return res.json()
}

export async function fetchQuotationDetail(id: string): Promise<Cotizacion> {
  const res = await fetch(`/api/cotizaciones/${id}`)
  if (!res.ok) throw new Error('Cotización no encontrada')
  return res.json()
}

export async function fetchNextQuotationFolio(complementariaDe?: string): Promise<{ folio: string }> {
  const folioUrl = complementariaDe
    ? `/api/folio?complementaria_de=${encodeURIComponent(complementariaDe)}`
    : '/api/folio'

  const res = await fetch(folioUrl)
  if (!res.ok) throw new Error('Error obteniendo folio')
  const data = await res.json()
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
  const res = await fetch('/api/cotizaciones', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    let errMsg = 'Error al guardar'
    try {
      const err = await res.json()
      errMsg = err.error || errMsg
    } catch {
      // ignore
    }

    throw new Error(errMsg)
  }

  const savedQuotation = await res.json()
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

  const res = await fetch(`/api/cotizaciones/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...basePayload,
      items,
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Error al actualizar cotización' }))
    throw new Error(err.error || 'Error al actualizar cotización')
  }

  return fetchQuotationDetail(id)
}

export async function approveQuotation(id: string): Promise<Cotizacion> {
  const res = await fetch(`/api/cotizaciones/${id}/aprobar`, { method: 'POST' })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Error aprobando cotización' }))
    throw new Error(err.error || 'Error aprobando cotización')
  }
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

  // Fetch PDF from server-side API endpoint
  const pdfRes = await fetch(`/api/cotizaciones/${quotation.id}/generar-pdf`)
  if (!pdfRes.ok) {
    throw new Error('Error generando PDF')
  }

  const pdfArrayBuffer = await pdfRes.arrayBuffer()

  // Trigger download in browser if not skipped
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

  // Convert ArrayBuffer to base64 for Drive upload
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
  const res = await fetch('/api/integrations/drive/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cotizacionId, fileName, contentBase64 }),
  })
  const data = await res.json().catch(() => ({ error: 'Respuesta no JSON' }))
  if (!res.ok) {
    console.error('[Drive] API route retornó', res.status, '—', data?.error)
    throw new Error(data?.error || `HTTP ${res.status}`)
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
