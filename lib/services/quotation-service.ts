import { Cotizacion, Responsable } from '@/lib/types'
import { buildQuotationMutationPayload, buildQuotationPdfPayload } from '@/lib/quotations/mappers'
import { QuotationFormValues } from '@/lib/quotations/types'

interface SaveQuotationOptions {
  estado: 'BORRADOR' | 'ENVIADA'
  porcentaje_fee: number
  iva_activo: boolean
  descuento_tipo: 'monto' | 'porcentaje'
  descuento_valor: number
  id?: string
  tipo?: 'PRINCIPAL' | 'COMPLEMENTARIA'
  es_complementaria_de?: string
}

interface UpdateQuotationOptions {
  estado?: 'BORRADOR' | 'ENVIADA' | 'APROBADA'
  porcentaje_fee: number
  iva_activo: boolean
  descuento_tipo: 'monto' | 'porcentaje'
  descuento_valor: number
  responsables: Responsable[]
  currentQuotation: Cotizacion | null
}

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

export async function fetchNextQuotationFolio(complementariaDe?: string): Promise<string> {
  const folioUrl = complementariaDe
    ? `/api/folio?complementaria_de=${encodeURIComponent(complementariaDe)}`
    : '/api/folio'

  const res = await fetch(folioUrl)
  if (!res.ok) throw new Error('Error obteniendo folio')
  const data = await res.json()
  return data.folio
}

export async function saveNewQuotation(
  data: QuotationFormValues,
  options: SaveQuotationOptions
): Promise<Cotizacion> {
  const body: Record<string, unknown> = {
    ...(options.id ? { id: options.id } : {}),
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

    if (options.id) {
      try {
        const recovered = await fetchQuotationDetail(options.id)
        const persistedCount = recovered?.items?.length ?? 0
        if (persistedCount === expectedItemsCount) return recovered
      } catch {
        // ignore recovery failure
      }
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

export async function generateQuotationPdf(quotation: Cotizacion, itemsOverride?: QuotationFormValues['items']) {
  const { generarPDFCotizacion } = await import('@/lib/pdf')
  await generarPDFCotizacion(buildQuotationPdfPayload(quotation, itemsOverride || quotation.items || []))
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
