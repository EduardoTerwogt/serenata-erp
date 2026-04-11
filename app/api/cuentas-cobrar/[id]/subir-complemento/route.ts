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

    const complementoXmlFile = formData.get('complemento_xml') as File | null
    const complementoPdfFile = formData.get('complemento_pdf') as File | null
    const notas = formData.get('notas') as string | null

    if (!complementoXmlFile) {
      return Response.json({ error: 'Se requiere archivo XML de complemento' }, { status: 400 })
    }

    if (!complementoPdfFile) {
      return Response.json({ error: 'Se requiere archivo PDF de complemento' }, { status: 400 })
    }

    const cuentas = await getCuentasCobrar()
    const cuenta = cuentas.find(c => c.id === id)
    if (!cuenta) {
      return Response.json({ error: 'Cuenta por cobrar no encontrada' }, { status: 404 })
    }

    const googleEnv = getGoogleEnv()
    if (!googleEnv) {
      return Response.json({ error: 'Google Drive no configurado' }, { status: 500 })
    }

    const folderPath = `/Por Cobrar/${cuenta.folio || cuenta.cotizacion_id}`
    const timestamp = new Date().getTime()
    const complementoXmlName = `complemento_pago_${timestamp}.xml`
    const complementoPdfName = `complemento_pago_${timestamp}.pdf`

    const complementoXmlUrl = await uploadFileToDrive(
      complementoXmlFile,
      folderPath,
      complementoXmlName,
      googleEnv.driveFolderIdCuentas || undefined
    )

    const complementoPdfUrl = await uploadFileToDrive(
      complementoPdfFile,
      folderPath,
      complementoPdfName,
      googleEnv.driveFolderIdCuentas || undefined
    )

    const documentoXml = await createDocumentoCuentaCobrar({
      cuentas_cobrar_id: id,
      tipo: 'COMPLEMENTO_PAGO',
      archivo_url: complementoXmlUrl,
      archivo_nombre: complementoXmlFile.name,
      archivo_size: complementoXmlFile.size,
    })

    const documentoPdf = await createDocumentoCuentaCobrar({
      cuentas_cobrar_id: id,
      tipo: 'COMPLEMENTO_PAGO_PDF',
      archivo_url: complementoPdfUrl,
      archivo_nombre: complementoPdfFile.name,
      archivo_size: complementoPdfFile.size,
    })

    triggerSheetsSync('cuentas_cobrar')

    return Response.json({
      success: true,
      documentos: [documentoXml, documentoPdf],
      notas: notas || null,
    })
  } catch (error) {
    console.error('[cuentas-cobrar/subir-complemento]', error)
    return Response.json({ error: 'Error al subir complemento' }, { status: 500 })
  }
}
