import { requireSection } from '@/lib/api-auth'
import { getCuentasPagar, createDocumentoCuentaPagar, getProyectoById } from '@/lib/db'
import { uploadFileToDrive } from '@/lib/integrations/google/drive'
import { getGoogleEnv } from '@/lib/integrations/google/env'
import { triggerSheetsSync } from '@/lib/integrations/sheets/trigger'

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const authResult = await requireSection('cuentas')
  if (authResult.response) return authResult.response

  try {
    const { id } = await props.params
    const formData = await request.formData()

    // Obtener archivo
    const facturaFile = formData.get('factura_proveedor') as File | null

    if (!facturaFile) {
      return Response.json(
        { error: 'Se requiere archivo de factura proveedor' },
        { status: 400 }
      )
    }

    // Obtener cuenta y proyecto
    const cuentas = await getCuentasPagar()
    const cuenta = cuentas.find(c => c.id === id)
    if (!cuenta) {
      return Response.json(
        { error: 'Cuenta por pagar no encontrada' },
        { status: 404 }
      )
    }

    const proyecto = await getProyectoById(cuenta.proyecto_id)

    // Subir factura a Drive
    const googleEnv = getGoogleEnv()
    if (!googleEnv) {
      return Response.json(
        { error: 'Google Drive no configurado' },
        { status: 500 }
      )
    }

    const folderPath = `/Por Pagar/${cuenta.cotizacion_id}-${proyecto.proyecto}`
    const fileName = facturaFile.name
    const facturaUrl = await uploadFileToDrive(facturaFile, folderPath, fileName, googleEnv.driveFolderIdCuentas || undefined)

    // Crear documento en BD
    const documento = await createDocumentoCuentaPagar({
      cuentas_pagar_id: id,
      tipo: 'FACTURA_PROVEEDOR',
      archivo_url: facturaUrl,
      archivo_nombre: facturaFile.name,
    })

    // Trigger sincronización con Sheets
    triggerSheetsSync('cuentas_pagar')

    return Response.json({
      success: true,
      documento,
      cuenta: {
        id: cuenta.id,
        folio: cuenta.folio,
        responsable_nombre: cuenta.responsable_nombre,
        x_pagar: cuenta.x_pagar,
      },
    })
  } catch (error) {
    console.error('[cuentas-pagar/subir-factura]', error)
    return Response.json(
      { error: 'Error al subir factura' },
      { status: 500 }
    )
  }
}
