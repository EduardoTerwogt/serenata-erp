import { requireSection } from '@/lib/api-auth'
import { getCuentasPagarPendientesEventosRealizados, createOrdenPago, updateCuentaPagar } from '@/lib/db'
import { uploadFileToDrive } from '@/lib/integrations/google/drive'
import { getGoogleEnv } from '@/lib/integrations/google/env'
import { triggerSheetsSync } from '@/lib/integrations/sheets/trigger'
import { generateOrdenPagoHTML } from '@/lib/server/pdf/orden-pago-generator'

export async function POST(request: Request) {
  const authResult = await requireSection('cuentas')
  if (authResult.response) return authResult.response

  try {
    // Obtener cuentas por pagar pendientes de eventos ya realizados
    const cuentasPendientes = await getCuentasPagarPendientesEventosRealizados()

    if (cuentasPendientes.length === 0) {
      return Response.json(
        { error: 'No hay cuentas por pagar pendientes con eventos ya realizados' },
        { status: 400 }
      )
    }

    // Agrupar por responsable → evento (cotización)
    interface ItemOrdenResponse {
      responsable: {
        id: string
        nombre: string
        correo: string | null
        telefono: string | null
        banco: string | null
        clabe: string | null
      }
      eventos: {
        cotizacion_folio: string
        proyecto: string
        items: {
          descripcion: string
          cantidad: number
          monto: number
        }[]
        subtotal: number
      }[]
      total_responsable: number
    }

    const groupedByResponsable = new Map<string, ItemOrdenResponse>()

    for (const cuenta of cuentasPendientes) {
      const responsableId = cuenta.responsable_id || 'sin_responsable'
      const key = `${responsableId}|${cuenta.responsable_nombre}`

      if (!groupedByResponsable.has(key)) {
        groupedByResponsable.set(key, {
          responsable: {
            id: responsableId,
            nombre: cuenta.responsable_nombre || 'Sin nombre',
            correo: cuenta.correo || null,
            telefono: cuenta.telefono || null,
            banco: cuenta.banco || null,
            clabe: cuenta.clabe || null,
          },
          eventos: [],
          total_responsable: 0,
        })
      }

      const item = groupedByResponsable.get(key)!

      // Buscar evento existente o crear uno
      let evento = item.eventos.find(e => e.cotizacion_folio === cuenta.cotizacion_id)
      if (!evento) {
        evento = {
          cotizacion_folio: cuenta.cotizacion_id,
          proyecto: cuenta.proyecto_nombre || 'Sin proyecto',
          items: [],
          subtotal: 0,
        }
        item.eventos.push(evento)
      }

      // Agregar item
      evento.items.push({
        descripcion: cuenta.item_descripcion || 'Item',
        cantidad: cuenta.cantidad || 1,
        monto: Number(cuenta.x_pagar) || 0,
      })

      evento.subtotal += Number(cuenta.x_pagar) || 0
      item.total_responsable += Number(cuenta.x_pagar) || 0
    }

    // Convertir map a array
    const ordenAgrupada = Array.from(groupedByResponsable.values())

    // Calcular total general
    const totalGeneral = ordenAgrupada.reduce((sum, item) => sum + item.total_responsable, 0)

    // Generar HTML
    const htmlContent = generateOrdenPagoHTML(ordenAgrupada, totalGeneral)

    // Convertir HTML a PDF usando html2pdf en el cliente NO FUNCIONA
    // Para Vercel, necesitamos un enfoque diferente
    // Opción 1: Usar jsPDF con html2canvas (requiere dependencia)
    // Opción 2: Llamar a servicio externo (html2pdf.cc API)
    // Opción 3: Generar PDF simplemente con estructura

    // Vamos a usar un approach simple: crear un PDF básico con jsPDF
    // Para esto, necesitaríamos instalar html2canvas o usar otro método

    // Por ahora, vamos a guardar el HTML como PDF usando una conversión simple
    // En producción, esto se haría con un servicio de conversión

    const googleEnv = getGoogleEnv()
    if (!googleEnv) {
      return Response.json(
        { error: 'Google Drive no configurado' },
        { status: 500 }
      )
    }

    // Crear blob de HTML como PDF
    // Nota: En una implementación real, se convertiría HTML a PDF aquí
    // Para MVP, guardamos el HTML y lo servimos como "PDF"

    const fechaFormato = new Date().toISOString().split('T')[0].replace(/-/g, '_')
    const fileName = `Orden_Pago_${fechaFormato}.html`

    // Crear un archivo HTML y subirlo a Drive
    // (En producción, esto sería un PDF real convertido desde HTML)
    const htmlFile = new File([htmlContent], fileName, { type: 'text/html' })

    const folderPath = '/Ordenes de Pago'
    const pdfUrl = await uploadFileToDrive(htmlFile, folderPath, fileName, googleEnv.driveFolderIdCuentas || undefined)

    // Crear registro de orden de pago
    const ordenPago = await createOrdenPago({
      fecha_generacion: new Date().toISOString().split('T')[0],
      pdf_url: pdfUrl,
      pdf_nombre: fileName,
      estado: 'GENERADA',
      total_monto: totalGeneral,
      created_by: authResult.session?.user?.email || 'sistema',
    })

    // Actualizar todas las cuentas a EN_PROCESO_PAGO
    const cuentasIds = cuentasPendientes.map(c => c.id)
    for (const id of cuentasIds) {
      await updateCuentaPagar(id, {
        estado: 'EN_PROCESO_PAGO',
        orden_pago_id: ordenPago.id,
      })
    }

    // Trigger sincronización
    triggerSheetsSync('cuentas_pagar')

    return Response.json({
      success: true,
      orden_pago: {
        id: ordenPago.id,
        fecha_generacion: ordenPago.fecha_generacion,
        pdf_url: ordenPago.pdf_url,
        total_monto: ordenPago.total_monto,
        cantidad_cuentas: cuentasIds.length,
      },
      resumen: {
        responsables: ordenAgrupada.length,
        eventos: ordenAgrupada.reduce((sum, r) => sum + r.eventos.length, 0),
        items_totales: cuentasIds.length,
        total_general: totalGeneral,
      },
    })
  } catch (error) {
    console.error('[cuentas-pagar/generar-orden-pago]', error)
    return Response.json(
      { error: 'Error generando orden de pago' },
      { status: 500 }
    )
  }
}
