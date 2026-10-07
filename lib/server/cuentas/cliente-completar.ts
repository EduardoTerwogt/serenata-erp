/**
 * #130: completar la ficha de un cliente al facturarle por primera vez. El cliente ya existe (nace con la cotización,
 * sin RFC); aquí se guardan el RFC del XML, los datos de contacto y la constancia fiscal que el cliente entrega antes
 * de facturar. Una sola ficha: no se crea un registro paralelo (principio 9). El RFC ya guardado no se cambia desde aquí.
 */
import { uploadFileToDrive } from '@/lib/integrations/google/drive'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { MAX_FILE_SIZE, MENSAJE_LIMITE } from '@/lib/server/uploads/factura-validation'
import type { Cliente } from '@/lib/types'

const TIPOS_CONSTANCIA = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']

export interface CompletarClienteParams {
  id: string
  datos: { rfc?: string | null; contacto?: string | null; telefono?: string | null; correo?: string | null }
  constancia: File | null
  uploadFolderId?: string
}

type Respuesta = { status: number; body: Record<string, unknown> }

export async function completarCliente(p: CompletarClienteParams): Promise<Respuesta> {
  const { data: cliente, error } = await supabaseAdmin
    .from('clientes')
    .select('id, nombre, rfc, constancia_url')
    .eq('id', p.id)
    .maybeSingle()
  if (error) throw error
  if (!cliente) return { status: 404, body: { error: 'Cliente no encontrado' } }
  const actual = cliente as Pick<Cliente, 'id' | 'nombre' | 'rfc' | 'constancia_url'>

  const rfc = p.datos.rfc ?? null
  if (rfc && actual.rfc && actual.rfc !== rfc) {
    return { status: 409, body: { error: 'rfc_distinto', message: `El cliente ya tiene el RFC ${actual.rfc}; no se cambia desde aquí.` } }
  }
  if (p.constancia) {
    if (!TIPOS_CONSTANCIA.includes(p.constancia.type)) return { status: 400, body: { error: 'La constancia debe ser un PDF o una imagen' } }
    if (p.constancia.size > MAX_FILE_SIZE) return { status: 400, body: { error: MENSAJE_LIMITE } }
  } else if (!actual.constancia_url) {
    return { status: 400, body: { error: 'constancia_requerida', message: 'Se pide la constancia de situación fiscal del cliente antes de facturarle.' } }
  }

  const cambios: Partial<Cliente> = {}
  if (rfc && !actual.rfc) cambios.rfc = rfc
  for (const campo of ['contacto', 'telefono', 'correo'] as const) {
    const valor = p.datos[campo]
    if (valor) cambios[campo] = valor
  }
  if (p.constancia) {
    cambios.constancia_url = await uploadFileToDrive(p.constancia, `Constancias de clientes/${actual.nombre}`, p.constancia.name, p.uploadFolderId)
    cambios.constancia_nombre = p.constancia.name
  }
  if (Object.keys(cambios).length === 0) return { status: 200, body: { cliente: actual, sin_cambios: true } }

  const { data, error: errorUpdate } = await supabaseAdmin.from('clientes').update(cambios).eq('id', p.id).select().single()
  if (errorUpdate) throw errorUpdate
  return { status: 200, body: { cliente: data } }
}
