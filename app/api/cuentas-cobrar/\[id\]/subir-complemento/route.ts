import { requireSection } from '@/lib/api-auth'
import { getCuentasCobrar, createDocumentoCuentaCobrar } from '@/lib/db'
import { uploadFileToDrive } from '@/lib/integrations/google/drive'
import { getGoogleEnv } from '@/lib/integrations/google/env'
import { triggerSheetsSync } from '@/lib/integrations/sheets/trigger'

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const authResult = await requireSection('cuentas')
  if (authResult.response) return authResult.response

  try {
    const { id } = await props.params
    const formData = await request.formData()

    const complementoFile = formData.get('complemento_xml') as File | null

    if (!complementoFile) {
      return Response.json(
        { error: 'Se requiere archivo de complemento de pago' },
        { status: 400 }
      )
    }

    // Obtener cuenta
    const cuentas = await getCuentasCobrar()
    const cuenta = cuentas.find(c => c.id === id)
    if (!cuenta) {
      return Response.json(
        { error: 'Cuenta por cobrar no encontrada' },
        { status: 404 }
      )
    }

    // Subir complemento a Drive
    const googleEnv = getGoogleEnv()
    if (!googleEnv) {
      return Response.json(
        { error: 'Google Drive no configurado' },
        { status: 500 }
      )
    }

    const folderPath = `/Por Cobrar/${cuenta.folio || id}`
    const fileName = `complemento_pago_${new Date().getTime()}.xml`
    const complementoUrl = await uploadFileToDrive(complementoFile, folderPath, fileName, googleEnv.driveFolderIdCuentas || undefined)

    // Crear documento en BD
    const documento = await createDocumentoCuentaCobrar({
      cuentas_cobrar_id: id,
      tipo: 'COMPLEMENTO_PAGO',
      archivo_url: complementoUrl,
      archivo_nombre: complementoFile.name,
    })

    // Trigger sincronización con Sheets
    triggerSheetsSync('cuentas_cobrar')

    return Response.json({
      success: true,
      documento,
      cuenta: {
        id: cuenta.id,
        folio: cuenta.folio,
        cliente: cuenta.cliente,
        proyecto: cuenta.proyecto,
      },
    })
  } catch (error) {
    console.error('[cuentas-cobrar/subir-complemento]', error)
    return Response.json(
      { error: 'Error al subir complemento' },
      { status: 500 }
    )
  }
}
